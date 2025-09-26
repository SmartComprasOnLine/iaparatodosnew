
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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
      // First, try to create/connect the instance
      const createUrl = evolutionData.apiUrl.endsWith('/') 
        ? `${evolutionData.apiUrl}instance/create`
        : `${evolutionData.apiUrl}/instance/create`

      const createResponse = await fetch(createUrl, {
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

      // Generate QR code
      const qrUrl = evolutionData.apiUrl.endsWith('/') 
        ? `${evolutionData.apiUrl}instance/connect/${integration.instanceName}`
        : `${evolutionData.apiUrl}/instance/connect/${integration.instanceName}`

      const qrResponse = await fetch(qrUrl, {
        method: 'GET',
        headers: { 'apikey': evolutionData.apiKey }
      })

      if (qrResponse.ok) {
        const qrData = await qrResponse.json()
        
        // Update integration status
        await prisma.whatsAppIntegration.update({
          where: { id: integration.id },
          data: { 
            status: 'waiting_qr',
            updatedAt: new Date()
          }
        })

        return NextResponse.json({
          qrCode: qrData.base64 || qrData.qrcode?.base64 || qrData
        })
      } else {
        const errorData = await qrResponse.text()
        console.error('Evolution API QR error:', errorData)
        return NextResponse.json({ 
          error: 'Erro ao gerar QR code na Evolution API' 
        }, { status: 500 })
      }

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
