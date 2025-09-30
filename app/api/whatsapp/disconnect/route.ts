import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

async function callEvolution(
  url: string,
  apiKey: string,
  method: 'POST' | 'DELETE' | 'PUT' | 'GET' = 'POST'
) {
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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { agentId } = await request.json()

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID é obrigatório' }, { status: 400 })
    }

    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      return NextResponse.json({
        error: 'Evolution API não configurada pelo administrador'
      }, { status: 400 })
    }

    const agent = await prisma.agent.findFirst({
      where: {
        id: agentId,
        userId: session.user.id
      }
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    const integration = await prisma.whatsAppIntegration.findUnique({
      where: { agentId }
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integração não configurada' }, { status: 400 })
    }

    const evolutionData = evolutionConfig.value as any
    const baseUrl = evolutionData.apiUrl.endsWith('/')
      ? evolutionData.apiUrl.slice(0, -1)
      : evolutionData.apiUrl

    const logoutUrl = `${baseUrl}/instance/logout/${integration.instanceName}`
    const deleteUrl = `${baseUrl}/instance/delete/${integration.instanceName}`

    let success = false
    let lastError: { status: number; body: any } | null = null

    try {
      const { response, json, text } = await callEvolution(logoutUrl, evolutionData.apiKey, 'DELETE')
      if (response.ok || response.status === 404) {
        success = true
      } else {
        lastError = { status: response.status, body: json ?? text }
      }
    } catch (error) {
      console.error('Evolution API logout error:', error)
    }

    if (!success) {
      try {
        const { response, json, text } = await callEvolution(deleteUrl, evolutionData.apiKey, 'DELETE')
        if (response.ok || response.status === 404) {
          success = true
          lastError = null
        } else {
          lastError = { status: response.status, body: json ?? text }
        }
      } catch (error) {
        console.error('Evolution API delete error:', error)
        lastError = { status: 500, body: (error as Error).message }
      }
    }

    if (!success) {
      return NextResponse.json({
        error: 'Erro ao desconectar na Evolution API',
        details: lastError
      }, { status: 500 })
    }

    await prisma.whatsAppIntegration.update({
      where: { id: integration.id },
      data: {
        status: 'disconnected',
        phoneNumber: null,
        profileName: null,
        sessionData: null,
        updatedAt: new Date()
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting WhatsApp instance:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
