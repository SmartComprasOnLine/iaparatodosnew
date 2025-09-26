

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET - Load central OTP instance
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

    // Get the central OTP instance
    const centralInstance = await prisma.systemConfig.findUnique({
      where: { key: 'otp_central_instance' }
    })

    if (!centralInstance) {
      return NextResponse.json({ instance: null })
    }

    const value = centralInstance.value as any
    let currentStatus = value.status || 'disconnected'
    let currentQrCode = value.qrCode
    let phoneNumber = value.phoneNumber
    
    // If Evolution API is configured and instance isn't disconnected, verify real status
    if (evolutionConfig && currentStatus !== 'disconnected') {
      try {
        const evolutionData = evolutionConfig.value as any
        
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
          console.log(`Status check for central instance ${value.instanceName}:`, statusData)
          
          // Update status based on Evolution API response (connectionState endpoint returns 'state')
          const evolutionState = statusData?.instance?.state || statusData?.state
          
          if (evolutionState === 'open') {
            currentStatus = 'connected'
            currentQrCode = null
            phoneNumber = statusData?.instance?.ownerJid || statusData?.instance?.phoneNumber || statusData?.phoneNumber || phoneNumber
          } else if (evolutionState === 'close' || evolutionState === 'closed') {
            currentStatus = 'disconnected'
            currentQrCode = null
          } else if (evolutionState === 'connecting') {
            currentStatus = 'connecting'
          } else if (statusData?.qrcode || (evolutionState === 'qr')) {
            currentStatus = 'qr_waiting'
            if (statusData.qrcode) {
              currentQrCode = statusData.qrcode
            }
          }
          
          // Always update lastStatusCheck, but only update other fields if they changed
          const updatedData = {
            ...value,
            status: currentStatus,
            qrCode: currentQrCode,
            phoneNumber: phoneNumber,
            lastStatusCheck: new Date(),
            lastQrUpdate: currentQrCode ? new Date() : value.lastQrUpdate
          }

          await prisma.systemConfig.update({
            where: { key: 'otp_central_instance' },
            data: { value: updatedData }
          })

          if (currentStatus !== value.status) {
            console.log(`Updated central instance status: ${value.status} -> ${currentStatus}`)
          }
          
        } else if (statusResponse.status === 404) {
          // Instance doesn't exist in Evolution API - mark as disconnected
          console.log(`Central instance ${value.instanceName} not found in Evolution API, marking as disconnected`)
          currentStatus = 'disconnected'
          currentQrCode = null
          
          const updatedData = {
            ...value,
            status: currentStatus,
            qrCode: currentQrCode,
            lastStatusCheck: new Date()
          }

          await prisma.systemConfig.update({
            where: { key: 'otp_central_instance' },
            data: { value: updatedData }
          })
        }
        
      } catch (statusError) {
        console.error(`Error checking central instance status:`, statusError)
      }
    }
    
    const instanceData = {
      id: 'central',
      instanceName: value.instanceName,
      status: currentStatus,
      qrCode: currentQrCode,
      phoneNumber: phoneNumber,
      createdAt: new Date(centralInstance.updatedAt),
      lastConnection: value.lastConnection ? new Date(value.lastConnection) : undefined,
      lastStatusCheck: value.lastStatusCheck ? new Date(value.lastStatusCheck) : undefined,
      lastQrUpdate: value.lastQrUpdate ? new Date(value.lastQrUpdate) : undefined
    }

    return NextResponse.json({ instance: instanceData })

  } catch (error) {
    console.error('Error loading central OTP instance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create central OTP instance (only one allowed)
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

    // Check if central instance already exists
    const existingInstance = await prisma.systemConfig.findUnique({
      where: { key: 'otp_central_instance' }
    })

    if (existingInstance) {
      return NextResponse.json({ 
        error: 'Sistema OTP Central já existe. Delete o atual antes de criar um novo.' 
      }, { status: 400 })
    }

    // Check if Evolution API is configured
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      return NextResponse.json({ 
        error: 'Configure primeiro a Evolution API antes de criar a instância central' 
      }, { status: 400 })
    }
    
    const instanceData = {
      instanceName: instanceName.trim(),
      status: 'disconnected',
      createdAt: new Date()
    }

    await prisma.systemConfig.create({
      data: {
        key: 'otp_central_instance',
        value: instanceData
      }
    })

    return NextResponse.json({
      instance: {
        id: 'central',
        ...instanceData
      }
    })

  } catch (error) {
    console.error('Error creating central OTP instance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete central OTP instance
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete the central instance
    await prisma.systemConfig.delete({
      where: { key: 'otp_central_instance' }
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error deleting central OTP instance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

