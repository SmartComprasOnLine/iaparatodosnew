import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET - Get current QR code for OTP instance
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const instanceId = params.id

    // Get Evolution API configuration
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      return NextResponse.json({ 
        error: 'Evolution API não configurada' 
      }, { status: 400 })
    }

    // Get instance configuration
    const instanceConfig = await prisma.systemConfig.findUnique({
      where: { key: `otp_instance_${instanceId}` }
    })

    if (!instanceConfig) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 })
    }

    const evolutionData = evolutionConfig.value as any
    const instanceData = instanceConfig.value as any

    // Only fetch QR code if instance is waiting for QR or connecting
    if (instanceData.status !== 'qr_waiting' && instanceData.status !== 'connecting') {
      return NextResponse.json({
        id: instanceId,
        instanceName: instanceData.instanceName,
        status: instanceData.status,
        qrCode: instanceData.qrCode,
        message: 'Instance is not waiting for QR code'
      })
    }

    let qrCode = null
    let status = instanceData.status

    try {
      // Try multiple methods to get updated QR code

      // Method 1: Try connect endpoint  
      const qrUrl = evolutionData.apiUrl.endsWith('/') 
        ? `${evolutionData.apiUrl}instance/connect/${instanceData.instanceName}`
        : `${evolutionData.apiUrl}/instance/connect/${instanceData.instanceName}`
      
      const qrResponse = await fetch(qrUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionData.apiKey
        }
      })

      if (qrResponse.ok) {
        const qrData = await qrResponse.json()
        console.log('QR refresh - Evolution API connect response:', qrData)
        
        // Try different possible response structures
        if (qrData?.qrcode?.base64) {
          qrCode = qrData.qrcode.base64
          console.log('QR refresh - found in connect response (qrcode.base64)')
        } else if (qrData?.qrcode) {
          qrCode = qrData.qrcode
          console.log('QR refresh - found in connect response (qrcode)')
        } else if (qrData?.base64) {
          qrCode = qrData.base64
          console.log('QR refresh - found in connect response (base64)')
        }
        
        // Check if instance became connected
        if (qrData?.instance?.status === 'open' || qrData?.status === 'open' || qrData?.state === 'open') {
          status = 'connected'
          qrCode = null
          console.log('QR refresh - Instance became connected via connect endpoint')
        } else if (qrData?.instance?.status === 'close' || qrData?.status === 'close' || qrData?.state === 'close') {
          status = 'disconnected'
          qrCode = null
          console.log('QR refresh - Instance became disconnected via connect endpoint')
        }
      } else if (qrResponse.status === 404) {
        // Instance doesn't exist in Evolution API
        console.log('QR refresh - Instance not found in Evolution API via connect endpoint')
        status = 'disconnected'
        qrCode = null
      }

      // Method 2: If no QR from connect, try status endpoint
      if (!qrCode && status === 'qr_waiting') {
        const statusUrl = evolutionData.apiUrl.endsWith('/') 
          ? `${evolutionData.apiUrl}instance/status/${instanceData.instanceName}`
          : `${evolutionData.apiUrl}/instance/status/${instanceData.instanceName}`
        
        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionData.apiKey
          }
        })

        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          console.log('QR refresh - Evolution API status response:', statusData)
          
          if (statusData?.qrcode) {
            qrCode = statusData.qrcode
            console.log('QR refresh - found in status response')
          }
          
          // Check if instance became connected
          if (statusData?.instance?.status === 'open' || statusData?.status === 'open' || statusData?.state === 'open') {
            status = 'connected'
            qrCode = null
            console.log('QR refresh - Instance became connected via status endpoint')
          } else if (statusData?.instance?.status === 'close' || statusData?.status === 'close' || statusData?.state === 'close') {
            status = 'disconnected'
            qrCode = null
            console.log('QR refresh - Instance became disconnected via status endpoint')
          } else if (statusData?.instance?.status === 'connecting' || statusData?.status === 'connecting' || statusData?.state === 'connecting') {
            status = 'connecting'
            console.log('QR refresh - Instance is connecting via status endpoint')
          }
        } else if (statusResponse.status === 404) {
          // Instance doesn't exist in Evolution API
          console.log('QR refresh - Instance not found in Evolution API via status endpoint')
          status = 'disconnected'
          qrCode = null
        }
      }

      // Method 3: Try QR code specific endpoint if available
      if (!qrCode && status === 'qr_waiting') {
        const qrCodeUrl = evolutionData.apiUrl.endsWith('/') 
          ? `${evolutionData.apiUrl}instance/qrcode/${instanceData.instanceName}`
          : `${evolutionData.apiUrl}/instance/qrcode/${instanceData.instanceName}`
        
        const qrCodeResponse = await fetch(qrCodeUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionData.apiKey
          }
        })

        if (qrCodeResponse.ok) {
          const qrCodeData = await qrCodeResponse.json()
          console.log('QR refresh - Evolution API qrcode response:', qrCodeData)
          
          if (qrCodeData?.qrcode) {
            qrCode = qrCodeData.qrcode
            console.log('QR refresh - found in qrcode response')
          } else if (qrCodeData?.base64) {
            qrCode = qrCodeData.base64
            console.log('QR refresh - found base64 in qrcode response')
          }
        } else if (qrCodeResponse.status === 404) {
          // Instance doesn't exist in Evolution API
          console.log('QR refresh - Instance not found in Evolution API via qrcode endpoint')
          status = 'disconnected'
          qrCode = null
        }
      }

    } catch (qrError) {
      console.error('Error refreshing QR code:', qrError)
    }

    // Update instance data if we have a new QR code or status changed
    if (qrCode !== instanceData.qrCode || status !== instanceData.status) {
      const updatedInstanceData = {
        ...instanceData,
        status,
        qrCode,
        lastQrUpdate: new Date()
      }

      console.log('QR refresh - Updating database with new QR code:', typeof qrCode, qrCode)

      await prisma.systemConfig.update({
        where: { key: `otp_instance_${instanceId}` },
        data: { value: updatedInstanceData }
      })
    }

    return NextResponse.json({
      id: instanceId,
      instanceName: instanceData.instanceName,
      status,
      qrCode,
      lastQrUpdate: new Date()
    })

  } catch (error: any) {
    console.error('Error refreshing QR code:', error)
    
    return NextResponse.json({ 
      error: 'Erro ao buscar QR code atualizado' 
    }, { status: 500 })
  }
}