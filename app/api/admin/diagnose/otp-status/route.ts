

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET - Diagnóstico completo do status da instância OTP
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const diagnostics = {
      timestamp: new Date().toISOString(),
      evolutionApiConfig: null as any,
      centralInstance: null as any,
      directApiStatus: null as any,
      urls: {
        constructedStatusUrl: null as string | null,
        actualUrl: null as string[] | null
      },
      errors: [] as string[]
    }

    // 1. Verificar configuração da Evolution API
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      diagnostics.errors.push('Evolution API não está configurada')
      return NextResponse.json(diagnostics)
    }

    diagnostics.evolutionApiConfig = {
      configured: true,
      apiUrl: (evolutionConfig.value as any).apiUrl,
      hasApiKey: !!(evolutionConfig.value as any).apiKey
    }

    // 2. Verificar instância central
    const centralInstance = await prisma.systemConfig.findUnique({
      where: { key: 'otp_central_instance' }
    })

    if (!centralInstance) {
      diagnostics.errors.push('Instância central OTP não existe')
      return NextResponse.json(diagnostics)
    }

    const instanceData = centralInstance.value as any
    diagnostics.centralInstance = {
      exists: true,
      instanceName: instanceData.instanceName,
      statusInDb: instanceData.status,
      lastStatusCheck: instanceData.lastStatusCheck,
      lastConnection: instanceData.lastConnection,
      phoneNumber: instanceData.phoneNumber
    }

    // 3. Construir URL e testar chamada direta para Evolution API
    const evolutionData = evolutionConfig.value as any
    const statusUrl = evolutionData.apiUrl.endsWith('/') 
      ? `${evolutionData.apiUrl}instance/status/${instanceData.instanceName}`
      : `${evolutionData.apiUrl}/instance/status/${instanceData.instanceName}`
    
    diagnostics.urls.constructedStatusUrl = statusUrl

    try {
      console.log(`[DIAGNOSE] Fazendo chamada para: ${statusUrl}`)
      
      const statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionData.apiKey
        }
      })

      diagnostics.directApiStatus = {
        httpStatus: statusResponse.status,
        httpStatusText: statusResponse.statusText,
        ok: statusResponse.ok,
        headers: Object.fromEntries(statusResponse.headers.entries()),
        rawResponse: null as any,
        parsedStatus: null as any
      }

      if (statusResponse.ok) {
        const responseData = await statusResponse.json()
        diagnostics.directApiStatus.rawResponse = responseData
        
        // Tentar interpretar o status
        let interpretedStatus = 'unknown'
        
        if (responseData?.instance?.status === 'open' || responseData?.status === 'open' || responseData?.state === 'open') {
          interpretedStatus = 'connected'
        } else if (responseData?.instance?.status === 'close' || responseData?.status === 'close' || responseData?.state === 'close') {
          interpretedStatus = 'disconnected'
        } else if (responseData?.instance?.status === 'connecting' || responseData?.status === 'connecting' || responseData?.state === 'connecting') {
          interpretedStatus = 'connecting'
        } else if (responseData?.qrcode && (responseData?.instance?.status === 'qr' || responseData?.status === 'qr')) {
          interpretedStatus = 'qr_waiting'
        }

        diagnostics.directApiStatus.parsedStatus = {
          interpreted: interpretedStatus,
          evolutionStatus: responseData?.instance?.status || responseData?.status || responseData?.state,
          hasQrCode: !!responseData?.qrcode,
          phoneNumber: responseData?.instance?.phoneNumber || responseData?.phoneNumber
        }

      } else {
        const errorText = await statusResponse.text()
        diagnostics.directApiStatus.rawResponse = errorText
        diagnostics.errors.push(`Evolution API retornou ${statusResponse.status}: ${errorText}`)
      }

    } catch (apiError: any) {
      diagnostics.errors.push(`Erro ao chamar Evolution API: ${apiError.message}`)
      diagnostics.directApiStatus = {
        error: apiError.message,
        httpStatus: null,
        ok: false
      }
    }

    // 4. Verificar diferentes variações da URL (caso haja problemas)
    const urlVariations = [
      `${evolutionData.apiUrl}/instance/status/${instanceData.instanceName}`,
      `${evolutionData.apiUrl.replace(/\/$/, '')}/instance/status/${instanceData.instanceName}`,
      `${evolutionData.apiUrl}/instance/connectionState/${instanceData.instanceName}`,
      `${evolutionData.apiUrl}/instance/connect/${instanceData.instanceName}`,
    ]

    diagnostics.urls.actualUrl = urlVariations

    return NextResponse.json(diagnostics, { status: 200 })

  } catch (error: any) {
    console.error('Erro no diagnóstico:', error)
    return NextResponse.json({ 
      error: 'Erro interno no diagnóstico',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

