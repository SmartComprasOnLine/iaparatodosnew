
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET - Load OTP instances with real-time status verification
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Evolution API configuration
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    const instances = await prisma.systemConfig.findMany({
      where: {
        key: {
          startsWith: 'otp_instance_'
        }
      }
    })

    const formattedInstances = await Promise.all(instances.map(async (config) => {
      const value = config.value as any
      let currentStatus = value.status || 'disconnected'
      let currentQrCode = value.qrCode
      let phoneNumber = value.phoneNumber
      
      // Debug: log the QR code data from database
      if (value.qrCode) {
        console.log('QR Code from DB:', typeof value.qrCode, value.qrCode)
      }

      // If Evolution API is configured and instance isn't disconnected, verify real status
      if (evolutionConfig && currentStatus !== 'disconnected') {
        try {
          const evolutionData = evolutionConfig.value as any
          const instanceId = config.key.replace('otp_instance_', '')
          
          // Check real status from Evolution API (using correct endpoint)
          const statusUrl = evolutionData.apiUrl.endsWith('/') 
            ? `${evolutionData.apiUrl}instance/connectionState/${value.instanceName}`
            : `${evolutionData.apiUrl}/instance/connectionState/${value.instanceName}`
          
          const statusResponse = await fetch(statusUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evolutionData.apiKey
            }
          })

          if (statusResponse.ok) {
            const statusData = await statusResponse.json()
            console.log(`Status check for ${value.instanceName}:`, statusData)
            
            // Update status based on Evolution API response (connectionState endpoint returns 'state')
            const evolutionState = statusData?.instance?.state || statusData?.state
            
            if (evolutionState === 'open') {
              currentStatus = 'connected'
              currentQrCode = null // Clear QR code when connected
              phoneNumber = statusData?.instance?.ownerJid || statusData?.instance?.phoneNumber || statusData?.phoneNumber || phoneNumber
            } else if (evolutionState === 'close' || evolutionState === 'closed') {
              currentStatus = 'disconnected'
              currentQrCode = null
            } else if (evolutionState === 'connecting') {
              currentStatus = 'connecting'
            } else if (statusData?.qrcode || (evolutionState === 'qr')) {
              currentStatus = 'qr_waiting'
              // Update QR code if available
              if (statusData.qrcode) {
                currentQrCode = statusData.qrcode
              }
            }
            
            // Update database if status changed
            if (currentStatus !== value.status || currentQrCode !== value.qrCode || phoneNumber !== value.phoneNumber) {
              const updatedData = {
                ...value,
                status: currentStatus,
                qrCode: currentQrCode,
                phoneNumber: phoneNumber,
                lastStatusCheck: new Date()
              }

              await prisma.systemConfig.update({
                where: { key: config.key },
                data: { value: updatedData }
              })

              console.log(`Updated ${value.instanceName} status: ${value.status} -> ${currentStatus}`)
            }
            
          } else if (statusResponse.status === 404) {
            // Instance doesn't exist in Evolution API - mark as disconnected
            console.log(`Instance ${value.instanceName} not found in Evolution API, marking as disconnected`)
            currentStatus = 'disconnected'
            currentQrCode = null
            
            // Update database
            const updatedData = {
              ...value,
              status: currentStatus,
              qrCode: currentQrCode,
              lastStatusCheck: new Date()
            }

            await prisma.systemConfig.update({
              where: { key: config.key },
              data: { value: updatedData }
            })
          } else {
            // If Evolution API call fails with other errors, keep current status but log error
            console.error(`Failed to check status for ${value.instanceName}: ${statusResponse.status}`)
          }
          
        } catch (statusError) {
          console.error(`Error checking status for ${value.instanceName}:`, statusError)
          // Keep current status on error
        }
      }
      
      return {
        id: config.key.replace('otp_instance_', ''),
        instanceName: value.instanceName,
        status: currentStatus,
        qrCode: currentQrCode,
        phoneNumber: phoneNumber,
        createdAt: new Date(config.updatedAt),
        lastConnection: value.lastConnection ? new Date(value.lastConnection) : undefined
      }
    }))

    return NextResponse.json(formattedInstances)

  } catch (error) {
    console.error('Error loading OTP instances:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new OTP instance
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { instanceName } = await request.json()

    if (!instanceName || !instanceName.trim()) {
      return NextResponse.json({ error: 'Nome da instância é obrigatório' }, { status: 400 })
    }

    // Check if Evolution API is configured
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      return NextResponse.json({ 
        error: 'Configure primeiro a Evolution API antes de criar instâncias' 
      }, { status: 400 })
    }

    const instanceId = `otp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const instanceData = {
      instanceName: instanceName.trim(),
      status: 'disconnected',
      createdAt: new Date()
    }

    await prisma.systemConfig.create({
      data: {
        key: `otp_instance_${instanceId}`,
        value: instanceData
      }
    })

    return NextResponse.json({
      id: instanceId,
      ...instanceData
    })

  } catch (error) {
    console.error('Error creating OTP instance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
