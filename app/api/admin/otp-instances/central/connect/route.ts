

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST - Connect central OTP instance to WhatsApp
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get central instance
    const centralInstance = await prisma.systemConfig.findUnique({
      where: { key: 'otp_central_instance' }
    })

    if (!centralInstance) {
      return NextResponse.json({ error: 'Sistema OTP Central não encontrado' }, { status: 404 })
    }

    // Get Evolution API configuration
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 400 })
    }

    const instanceData = centralInstance.value as any
    const evolutionData = evolutionConfig.value as any
    
    // Build Evolution API URL
    const baseUrl = evolutionData.apiUrl.endsWith('/') ? evolutionData.apiUrl.slice(0, -1) : evolutionData.apiUrl
    const createUrl = `${baseUrl}/instance/create`

    console.log(`Creating central instance: ${instanceData.instanceName}`)
    console.log(`Evolution API URL: ${createUrl}`)

    try {
      // Create instance in Evolution API
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionData.apiKey
        },
        body: JSON.stringify({
          instanceName: instanceData.instanceName,
          integration: 'WHATSAPP-BAILEYS'
        })
      })

      const createData = await createResponse.json()
      console.log('Evolution API create response:', createData)

      if (!createResponse.ok) {
        throw new Error(`Erro ao criar instância: ${createResponse.status} - ${JSON.stringify(createData)}`)
      }

      // Connect to WhatsApp
      const connectUrl = `${baseUrl}/instance/connect/${instanceData.instanceName}`
      
      const connectResponse = await fetch(connectUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionData.apiKey
        }
      })

      const connectData = await connectResponse.json()
      console.log('Evolution API connect response:', connectData)

      if (!connectResponse.ok) {
        throw new Error(`Erro ao conectar instância: ${connectResponse.status} - ${JSON.stringify(connectData)}`)
      }

      // Update instance status
      let newStatus = 'connecting'
      let qrCode = null

      if (connectData.base64 || connectData.qrcode) {
        newStatus = 'qr_waiting'
        qrCode = connectData.base64 || connectData.qrcode
      }

      const updatedData = {
        ...instanceData,
        status: newStatus,
        qrCode: qrCode,
        lastQrUpdate: new Date(),
        connectionAttempt: new Date()
      }

      await prisma.systemConfig.update({
        where: { key: 'otp_central_instance' },
        data: { value: updatedData }
      })

      console.log(`Central instance connection initiated. Status: ${newStatus}`)

      return NextResponse.json({
        id: 'central',
        instanceName: instanceData.instanceName,
        status: newStatus,
        qrCode: qrCode,
        message: qrCode ? 'QR Code gerado. Escaneie com WhatsApp.' : 'Conectando...'
      })

    } catch (apiError: any) {
      console.error('Evolution API error:', apiError)
      
      // Update instance with error status
      const errorData = {
        ...instanceData,
        status: 'disconnected',
        error: apiError.message || 'Unknown error',
        lastError: new Date()
      }

      await prisma.systemConfig.update({
        where: { key: 'otp_central_instance' },
        data: { value: errorData }
      })

      return NextResponse.json({ 
        error: `Erro na Evolution API: ${apiError.message || 'Unknown error'}` 
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error connecting central OTP instance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

