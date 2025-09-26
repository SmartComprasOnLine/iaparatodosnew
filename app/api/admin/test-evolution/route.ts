
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { testPhone } = await request.json()

    console.log(`🧪 Testing Evolution API configuration...`)

    // Get Evolution API configuration
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      return NextResponse.json({
        success: false,
        error: 'Evolution API not configured',
        details: 'No evolution_api_config found in SystemConfig'
      }, { status: 400 })
    }

    // Get OTP instances
    const otpInstances = await prisma.systemConfig.findMany({
      where: {
        key: {
          startsWith: 'otp_instance_'
        }
      }
    })

    if (otpInstances.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No OTP instances found',
        details: 'No otp_instance_* found in SystemConfig'
      }, { status: 400 })
    }

    const activeInstance = otpInstances.find(instance => {
      const value = instance.value as any
      return value.status === 'connected'
    })

    if (!activeInstance) {
      return NextResponse.json({
        success: false,
        error: 'No active OTP instance found',
        details: {
          totalInstances: otpInstances.length,
          instanceStatuses: otpInstances.map(inst => ({
            key: inst.key,
            status: (inst.value as any)?.status || 'unknown'
          }))
        }
      }, { status: 400 })
    }

    const evolutionData = evolutionConfig.value as any
    const instanceData = activeInstance.value as any

    console.log(`🔧 Evolution API URL: ${evolutionData.apiUrl}`)
    console.log(`🔧 Instance Name: ${instanceData.instanceName}`)
    console.log(`🔧 Instance Status: ${instanceData.status}`)

    // Test instance status first
    const baseUrl = evolutionData.apiUrl.endsWith('/') ? evolutionData.apiUrl.slice(0, -1) : evolutionData.apiUrl
    const statusUrl = `${baseUrl}/instance/connectionState/${instanceData.instanceName}`

    let connectionTest = null
    try {
      const statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionData.apiKey
        }
      })

      const statusData = await statusResponse.text()
      connectionTest = {
        status: statusResponse.status,
        response: statusData,
        success: statusResponse.ok
      }
      
      console.log(`📡 Connection Status Response:`, statusData)
    } catch (error) {
      connectionTest = {
        error: (error as Error).message,
        success: false
      }
    }

    // If a test phone is provided, try sending a test message
    let messageTest = null
    if (testPhone) {
      const cleanNumber = testPhone.replace(/[^\d]/g, '')
      const testMessage = `🧪 Teste de conexão Evolution API - ${new Date().toLocaleTimeString()}`
      
      const sendUrl = `${baseUrl}/message/sendText/${instanceData.instanceName}`

      try {
        console.log(`🧪 Testing message send to: ${testPhone} (${cleanNumber})`)
        
        const messageResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionData.apiKey
          },
          body: JSON.stringify({
            number: cleanNumber,
            text: testMessage,
            delay: 1000
          })
        })

        const messageData = await messageResponse.text()
        messageTest = {
          status: messageResponse.status,
          response: messageData,
          success: messageResponse.ok,
          phone: testPhone,
          cleanNumber: cleanNumber
        }

        console.log(`📡 Message Test Response:`, messageData)
      } catch (error) {
        messageTest = {
          error: (error as Error).message,
          success: false,
          phone: testPhone,
          cleanNumber: cleanNumber
        }
      }
    }

    return NextResponse.json({
      success: true,
      configuration: {
        evolutionApiUrl: evolutionData.apiUrl,
        instanceName: instanceData.instanceName,
        instanceStatus: instanceData.status,
        hasApiKey: !!evolutionData.apiKey
      },
      instances: {
        total: otpInstances.length,
        connected: otpInstances.filter(inst => (inst.value as any)?.status === 'connected').length,
        details: otpInstances.map(inst => ({
          key: inst.key,
          status: (inst.value as any)?.status || 'unknown',
          instanceName: (inst.value as any)?.instanceName || 'N/A'
        }))
      },
      tests: {
        connection: connectionTest,
        ...(messageTest && { message: messageTest })
      }
    })

  } catch (error) {
    console.error('Error testing Evolution API:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: (error as Error).message
    }, { status: 500 })
  }
}
