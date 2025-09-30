
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const buildEvolutionUrl = (base: string, path: string) => {
  if (!base) return path
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
  return path.startsWith('/') ? `${trimmed}${path}` : `${trimmed}/${path}`
}

const extractQrResponse = (qrData: any) => {
  if (!qrData) {
    return { qrCode: null, status: 'connecting' as const }
  }

  if (qrData.base64) {
    return { qrCode: qrData.base64, status: 'waiting_qr' as const }
  }

  if (qrData.qrcode) {
    if (typeof qrData.qrcode === 'string') {
      return { qrCode: qrData.qrcode, status: 'waiting_qr' as const }
    }

    if (qrData.qrcode.base64) {
      return { qrCode: qrData.qrcode.base64, status: 'waiting_qr' as const }
    }
  }

  if (qrData.instance?.status === 'open') {
    return { qrCode: null, status: 'connected' as const }
  }

  if (qrData.instance?.status === 'connecting') {
    return { qrCode: null, status: 'connecting' as const }
  }

  return { qrCode: null, status: 'disconnected' as const }
}

const fetchQrCode = async (
  instanceName: string,
  evolutionData: any
) => {
  const qrUrl = buildEvolutionUrl(evolutionData.apiUrl, `/instance/connect/${instanceName}`)

  const qrResponse = await fetch(qrUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': evolutionData.apiKey
    }
  })

  const qrData = await qrResponse.json().catch(() => null)

  if (!qrResponse.ok) {
    throw new Error(qrData?.error || 'Erro ao gerar QR code na Evolution API')
  }

  return extractQrResponse(qrData)
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

    // Get Evolution API configuration
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      return NextResponse.json({ 
        error: 'Evolution API não configurada pelo administrador' 
      }, { status: 400 })
    }

    // Verify agent belongs to user
    const agent = await prisma.agent.findFirst({
      where: { 
        id: agentId,
        userId: session.user.id 
      }
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Get WhatsApp integration
    const integration = await prisma.whatsAppIntegration.findUnique({
      where: { agentId }
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integração não configurada' }, { status: 400 })
    }

    const evolutionData = evolutionConfig.value as any

    try {
      // Ensure instance exists before requesting QR
      const createUrl = buildEvolutionUrl(evolutionData.apiUrl, '/instance/create')

      await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionData.apiKey
        },
        body: JSON.stringify({
          instanceName: integration.instanceName,
          integration: 'WHATSAPP-BAILEYS',
        })
      })

      const { qrCode, status } = await fetchQrCode(integration.instanceName, evolutionData)

      await prisma.whatsAppIntegration.update({
        where: { id: integration.id },
        data: {
          status,
          updatedAt: new Date()
        }
      })

      return NextResponse.json({
        qrCode,
        status
      })

    } catch (error) {
      console.error('Error generating QR code:', error)
      return NextResponse.json({ 
        error: 'Erro ao comunicar com Evolution API' 
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error generating QR code:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')

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

    if (!integration.instanceName) {
      return NextResponse.json({ error: 'Instância não configurada' }, { status: 400 })
    }

    try {
      const evolutionData = evolutionConfig.value as any
      const { qrCode, status } = await fetchQrCode(integration.instanceName, evolutionData)

      await prisma.whatsAppIntegration.update({
        where: { id: integration.id },
        data: {
          status,
          updatedAt: new Date()
        }
      })

      return NextResponse.json({
        qrCode,
        status
      })
    } catch (error) {
      console.error('Error refreshing QR code:', error)
      return NextResponse.json({
        error: 'Erro ao atualizar QR code'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error refreshing QR code:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
