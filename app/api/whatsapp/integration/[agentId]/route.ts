
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { agentId } = params

    // Verify Evolution API is configured by admin
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

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

    // Get WhatsApp integration if exists
    const integration = await prisma.whatsAppIntegration.findUnique({
      where: { agentId }
    })

    if (!integration) {
      return NextResponse.json({
        instanceName: '',
        status: 'disconnected',
        qrCode: '',
        phoneNumber: '',
        profileName: '',
        evolutionConfigured: !!evolutionConfig
      })
    }

    // If Evolution API is configured and integration exists, check status with Evolution API
    let currentStatus = integration.status
    let phoneNumber = integration.phoneNumber || ''
    let profileName = integration.profileName || ''

    if (evolutionConfig && integration.instanceName) {
      try {
        const evolutionData = evolutionConfig.value as any
        const statusUrl = evolutionData.apiUrl.endsWith('/') 
          ? `${evolutionData.apiUrl}instance/connectionState/${integration.instanceName}`
          : `${evolutionData.apiUrl}/instance/connectionState/${integration.instanceName}`

        const response = await fetch(statusUrl, {
          headers: { 'apikey': evolutionData.apiKey }
        })

        if (response.ok) {
          const statusData = await response.json()
          currentStatus = statusData.instance?.state === 'open' ? 'connected' : 'disconnected'
          
          // Update status in database if different
          if (currentStatus !== integration.status) {
            await prisma.whatsAppIntegration.update({
              where: { id: integration.id },
              data: { 
                status: currentStatus,
                updatedAt: new Date()
              }
            })
          }

          // Get profile info if connected
          if (currentStatus === 'connected') {
            try {
              const profileUrl = evolutionData.apiUrl.endsWith('/') 
                ? `${evolutionData.apiUrl}instance/fetchInstances?instanceName=${integration.instanceName}`
                : `${evolutionData.apiUrl}/instance/fetchInstances?instanceName=${integration.instanceName}`

              const profileResponse = await fetch(profileUrl, {
                headers: { 'apikey': evolutionData.apiKey }
              })

              if (profileResponse.ok) {
                const profileData = await profileResponse.json()
                const instance = profileData.find((inst: any) => inst.name === integration.instanceName)
                if (instance) {
                  phoneNumber = instance.owner || phoneNumber
                  profileName = instance.profileName || profileName

                  // Update profile info in database
                  await prisma.whatsAppIntegration.update({
                    where: { id: integration.id },
                    data: { 
                      phoneNumber,
                      profileName,
                      updatedAt: new Date()
                    }
                  })
                }
              }
            } catch (error) {
              console.error('Error getting profile info:', error)
            }
          }
        }
      } catch (error) {
        console.error('Error checking Evolution API status:', error)
      }
    }

    return NextResponse.json({
      instanceName: integration.instanceName,
      status: currentStatus,
      qrCode: '',
      phoneNumber,
      profileName,
      evolutionConfigured: !!evolutionConfig
    })

  } catch (error) {
    console.error('Error loading WhatsApp integration:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
