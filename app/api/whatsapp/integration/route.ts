
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

    const { agentId, instanceName } = await request.json()

    if (!agentId || !instanceName) {
      return NextResponse.json({ error: 'Agent ID e nome da instância são obrigatórios' }, { status: 400 })
    }

    // Verify Evolution API is configured by admin
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

    // Check if instance name is already taken by this user
    const existingIntegration = await prisma.whatsAppIntegration.findFirst({
      where: {
        instanceName,
        userId: session.user.id,
        id: { not: agent.id }
      }
    })

    if (existingIntegration) {
      return NextResponse.json({ 
        error: 'Nome da instância já está em uso' 
      }, { status: 400 })
    }

    // Create or update WhatsApp integration
    const integration = await prisma.whatsAppIntegration.upsert({
      where: { agentId },
      update: {
        instanceName,
        updatedAt: new Date()
      },
      create: {
        agentId,
        userId: session.user.id,
        instanceName,
        status: 'disconnected'
      }
    })

    return NextResponse.json({
      id: integration.id,
      instanceName: integration.instanceName,
      status: integration.status,
      evolutionConfigured: true
    })

  } catch (error) {
    console.error('Error saving WhatsApp integration:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
