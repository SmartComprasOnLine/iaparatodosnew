
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST - Connect OTP instance
export async function POST(
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

    // Create instance in Evolution API
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
        instanceName: instanceData.instanceName,
        token: evolutionData.apiKey,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
      })
    })

    // Get QR Code - try multiple methods to get the QR code
    let qrCode = null
    let status = 'connecting'
    let createData = null

    try {
      if (createResponse.ok) {
        // Method 1: Get QR code from create response
        createData = await createResponse.json()
        console.log('Evolution API create response:', createData)
        
        if (createData?.qrcode) {
          qrCode = createData.qrcode
          status = 'qr_waiting'
          console.log('QR Code found in create response:', typeof qrCode, qrCode)
        }
      } else {
        const error = await createResponse.text()
        throw new Error(`Erro ao criar instância: ${error}`)
      }

      // Method 2: If no QR in create response, try connect endpoint  
      if (!qrCode) {
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
          console.log('Evolution API connect response:', qrData)
          
          // Try different possible response structures
          if (qrData?.qrcode?.base64) {
            qrCode = qrData.qrcode.base64
            status = 'qr_waiting'
            console.log('QR Code found in connect response (qrcode.base64):', typeof qrCode, qrCode)
          } else if (qrData?.qrcode) {
            qrCode = qrData.qrcode
            status = 'qr_waiting'
            console.log('QR Code found in connect response (qrcode):', typeof qrCode, qrCode)
          } else if (qrData?.base64) {
            qrCode = qrData.base64
            status = 'qr_waiting'
            console.log('QR Code found in connect response (base64):', typeof qrCode, qrCode)
          }
        }
      }

      // Method 3: If still no QR, try instance status endpoint
      if (!qrCode) {
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
          console.log('Evolution API status response:', statusData)
          
          if (statusData?.qrcode) {
            qrCode = statusData.qrcode
            status = 'qr_waiting'
            console.log('QR Code found in status response:', typeof qrCode, qrCode)
          }
        }
      }

    } catch (qrError) {
      console.error('Error getting QR code:', qrError)
    }

    // Update instance status
    const updatedInstanceData = {
      ...instanceData,
      status,
      qrCode,
      lastConnection: new Date()
    }

    console.log('Saving to database - Final QR code:', typeof qrCode, qrCode)

    await prisma.systemConfig.update({
      where: { key: `otp_instance_${instanceId}` },
      data: { value: updatedInstanceData }
    })

    return NextResponse.json({
      id: instanceId,
      instanceName: instanceData.instanceName,
      status,
      qrCode,
      lastConnection: new Date()
    })

  } catch (error: any) {
    console.error('Error connecting OTP instance:', error)
    
    let errorMessage = 'Erro interno do servidor'
    if (error.message) {
      errorMessage = error.message
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
