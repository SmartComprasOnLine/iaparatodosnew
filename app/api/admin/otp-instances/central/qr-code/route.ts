

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

// GET - Get QR Code for central OTP instance
export async function GET() {
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
    
    // Build Evolution API URL for QR code
    const baseUrl = evolutionData.apiUrl.endsWith('/') ? evolutionData.apiUrl.slice(0, -1) : evolutionData.apiUrl
    const qrUrl = `${baseUrl}/instance/connect/${instanceData.instanceName}`

    console.log(`Refreshing QR code for central instance: ${instanceData.instanceName}`)

    try {
      const qrResponse = await fetch(qrUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionData.apiKey
        }
      })

      const qrData = await qrResponse.json()
      console.log('QR refresh response:', qrData)

      if (!qrResponse.ok) {
        throw new Error(`Erro ao obter QR Code: ${qrResponse.status} - ${JSON.stringify(qrData)}`)
      }

      // Update instance with new QR code
      let newStatus = instanceData.status
      let qrCode = instanceData.qrCode

      if (qrData.base64 || qrData.qrcode) {
        newStatus = 'qr_waiting'
        qrCode = qrData.base64 || qrData.qrcode
      } else if (qrData.instance?.status === 'open') {
        newStatus = 'connected'
        qrCode = null
      } else if (qrData.instance?.status === 'connecting') {
        newStatus = 'connecting'
      }

      const updatedData = {
        ...instanceData,
        status: newStatus,
        qrCode: qrCode,
        lastQrUpdate: new Date()
      }

      await prisma.systemConfig.update({
        where: { key: 'otp_central_instance' },
        data: { value: updatedData }
      })

      return NextResponse.json({
        id: 'central',
        status: newStatus,
        qrCode: qrCode,
        lastQrUpdate: new Date()
      })

    } catch (apiError: any) {
      console.error('Evolution API QR error:', apiError)
      return NextResponse.json({ 
        error: `Erro ao obter QR Code: ${apiError.message || 'Unknown error'}` 
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error getting QR code for central instance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

