
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

    // Create or update WhatsApp integration
    const existingIntegration = await prisma.whatsAppIntegration.findUnique({
      where: { agentId }
    })

    // Auto-generate a sanitized instance name unique across all users
    const generateInstanceName = async () => {
      if (existingIntegration?.instanceName) {
        return existingIntegration.instanceName
      }

      const sanitize = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')

      const userPart = sanitize(session.user.id).slice(-6) || 'user'
      const agentPart = sanitize(agent.id).slice(-6) || 'agent'
      const base = sanitize(`ia-${userPart}-${agentPart}`) || `ia-${Math.random().toString(36).slice(2, 8)}`

      let instanceName = base
      let counter = 1

      while (true) {
        const conflict = await prisma.whatsAppIntegration.findFirst({
          where: { instanceName }
        })

        if (!conflict) {
          return instanceName
        }

        instanceName = `${base}-${counter}`
        counter += 1
      }
    }

    const instanceName = await generateInstanceName()

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
