
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const callEvolution = async (
  url: string,
  apiKey: string,
  method: 'POST' | 'DELETE' | 'PUT' | 'GET' = 'POST'
) => {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: apiKey,
    },
  })

  const text = await response.text()
  let json: any = null

  try {
    json = text ? JSON.parse(text) : null
  } catch (error) {
    json = text
  }

  return { response, json, text }
}

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agent = await prisma.agent.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error fetching agent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!params.id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const agent = await prisma.agent.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      select: { id: true, name: true },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const integration = await prisma.whatsAppIntegration.findUnique({
      where: { agentId: agent.id }
    })

    if (integration) {
      const evolutionConfig = await prisma.systemConfig.findUnique({
        where: { key: 'evolution_api_config' }
      })

      if (!evolutionConfig) {
        return NextResponse.json({
          error: 'Evolution API não configurada pelo administrador'
        }, { status: 400 })
      }

      const evolutionData = evolutionConfig.value as any
      const baseUrl = evolutionData.apiUrl.endsWith('/')
        ? evolutionData.apiUrl.slice(0, -1)
        : evolutionData.apiUrl

      const deleteUrl = `${baseUrl}/instance/delete/${integration.instanceName}`

      let success = false
      let lastError: { status: number; body: any } | null = null

      try {
        const { response, json, text } = await callEvolution(deleteUrl, evolutionData.apiKey, 'DELETE')
        if (response.ok || response.status === 404) {
          success = true
        } else {
          lastError = { status: response.status, body: json ?? text }
        }
      } catch (error) {
        console.error('Evolution API delete error:', error)
        lastError = { status: 500, body: (error as Error).message }
      }

      if (lastError) {
        console.warn('Instance delete reported error, verifying existence', lastError)
      }

      try {
        const statusUrl = `${baseUrl}/instance/connectionState/${integration.instanceName}`
        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            apikey: evolutionData.apiKey,
          },
        })

        if (statusResponse.ok) {
          return NextResponse.json({
            error: 'A instância ainda está ativa na Evolution API. Tente novamente em instantes.',
            details: lastError,
          }, { status: 500 })
        }
      } catch (statusError: any) {
        if (statusError?.status !== 404) {
          console.log('Status check after delete:', statusError)
        }
      }
    }

    await prisma.agent.delete({
      where: { id: agent.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting agent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
