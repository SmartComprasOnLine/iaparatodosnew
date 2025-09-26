
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Send WhatsApp OTP using Evolution API instance
async function sendWhatsAppOTP(phone: string, code: string) {
  // Prepare message content first
  const message = `🔐 Seu código de verificação WhatsApp AI Dashboard é: *${code}*\n\nEste código expira em 5 minutos.\n\n⚠️ Não compartilhe este código com ninguém.`
  
  try {
    // Get Evolution API configuration
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      console.log(`\n🚨 [DEVELOPMENT MODE] Evolution API not configured`)
      console.log(`📱 Phone: ${phone}`)
      console.log(`🔢 OTP Code: ${code}`)
      console.log(`⏰ Expires: 5 minutes`)
      console.log(`\n===== DEVELOPMENT OTP DETAILS =====`)
      console.log(`TO: ${phone}`)
      console.log(`CODE: ${code}`)
      console.log(`MESSAGE: ${message}`)
      console.log(`===================================\n`)
      return true
    }

    // Get the central OTP instance
    const centralInstance = await prisma.systemConfig.findUnique({
      where: { key: 'otp_central_instance' }
    })

    if (!centralInstance) {
      console.log(`\n🚨 [DEVELOPMENT MODE] Central OTP instance not found`)
      console.log(`📱 Phone: ${phone}`)
      console.log(`🔢 OTP Code: ${code}`)
      console.log(`⏰ Expires: 5 minutes`)
      console.log(`\n===== DEVELOPMENT OTP DETAILS =====`)
      console.log(`TO: ${phone}`)
      console.log(`CODE: ${code}`)
      console.log(`MESSAGE: ${message}`)
      console.log(`===================================\n`)
      return true
    }

    const instanceData = centralInstance.value as any

    if (instanceData.status !== 'connected') {
      console.log(`\n🚨 [DEVELOPMENT MODE] Central OTP instance not connected`)
      console.log(`📊 Instance status: ${instanceData.status || 'unknown'}`)
      console.log(`📱 Phone: ${phone}`)
      console.log(`🔢 OTP Code: ${code}`)
      console.log(`⏰ Expires: 5 minutes`)
      console.log(`\n===== DEVELOPMENT OTP DETAILS =====`)
      console.log(`TO: ${phone}`)
      console.log(`CODE: ${code}`)
      console.log(`MESSAGE: ${message}`)
      console.log(`===================================\n`)
      return true
    }

    const evolutionData = evolutionConfig.value as any

    // Clean phone number (remove + and any non-numeric characters, keep only digits)
    const cleanNumber = phone.replace(/[^\d]/g, '')
    
    // Build URL - ensure proper formatting
    const baseUrl = evolutionData.apiUrl.endsWith('/') ? evolutionData.apiUrl.slice(0, -1) : evolutionData.apiUrl
    const sendUrl = `${baseUrl}/message/sendText/${instanceData.instanceName}`

    console.log(`📞 Attempting to send OTP to: ${phone} (cleaned: ${cleanNumber})`)
    console.log(`🌐 Evolution API URL: ${sendUrl}`)
    console.log(`🔑 Using instance: ${instanceData.instanceName}`)

    // Try multiple API versions for better compatibility
    const apiVersions = [
      // Version 2 (current/recommended)
      {
        version: 'v2',
        payload: {
          number: cleanNumber,
          text: message,
          delay: 1000,
          linkPreview: false
        }
      },
      // Version 1 (legacy fallback)
      {
        version: 'v1',
        payload: {
          number: cleanNumber,
          textMessage: {
            text: message
          },
          options: {
            delay: 1000,
            presence: "composing",
            linkPreview: false
          }
        }
      }
    ]

    let lastError = null
    
    for (const apiVersion of apiVersions) {
      try {
        console.log(`🔄 Trying Evolution API ${apiVersion.version}...`)
        
        const response = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionData.apiKey
          },
          body: JSON.stringify(apiVersion.payload)
        })

        const responseText = await response.text()
        console.log(`📡 Evolution API Response (${response.status}):`, responseText)

        if (response.ok) {
          let responseData
          try {
            responseData = JSON.parse(responseText)
            console.log(`✅ OTP ${code} sent to ${phone} via Evolution API ${apiVersion.version}`)
            console.log(`📋 Message ID:`, responseData.key?.id || 'N/A')
            return true
          } catch (parseError) {
            console.log(`✅ OTP ${code} sent to ${phone} via Evolution API ${apiVersion.version} (non-JSON response)`)
            return true
          }
        } else {
          lastError = new Error(`Evolution API ${apiVersion.version} Error: ${response.status} - ${responseText}`)
          console.log(`❌ Evolution API ${apiVersion.version} failed:`, lastError.message)
        }
      } catch (error) {
        lastError = error
        console.log(`❌ Evolution API ${apiVersion.version} exception:`, error)
      }
    }

    // If all versions failed, throw the last error
    throw lastError || new Error('All Evolution API versions failed')

  } catch (error) {
    console.error('Error sending OTP via Evolution API:', error)
    
    // Fallback to development mode with detailed logs
    console.log(`\n🚨 [FALLBACK MODE] Evolution API failed, using development mode`)
    console.log(`📱 Phone: ${phone}`)
    console.log(`🔢 OTP Code: ${code}`)
    console.log(`⏰ Expires: 5 minutes`)
    console.log(`📝 Message: ${message}`)
    console.log(`\n===== DEVELOPMENT OTP DETAILS =====`)
    console.log(`TO: ${phone}`)
    console.log(`CODE: ${code}`)
    console.log(`MESSAGE: ${message}`)
    console.log(`===================================\n`)
    
    return true
  }
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json()

    if (!phone) {
      return NextResponse.json(
        { error: 'Número de telefone é obrigatório' },
        { status: 400 }
      )
    }

    // Clean phone number (remove spaces, dashes, etc)
    const cleanPhone = phone.replace(/[^+\d]/g, '')

    // Check if user exists with this phone (but allow new users to continue)
    const user = await prisma.user.findUnique({
      where: { phone: cleanPhone }
    })

    console.log(`📱 Phone login attempt for: ${cleanPhone} - User exists: ${!!user}`)

    // Generate OTP
    const otpCode = generateOTP()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now

    // Delete any existing OTP for this phone
    await prisma.otpCode.deleteMany({
      where: { phone: cleanPhone }
    })

    // Create new OTP (userId can be null for new users)
    await prisma.otpCode.create({
      data: {
        phone: cleanPhone,
        code: otpCode,
        expires: expiresAt,
        verified: false,
        userId: user?.id || null  // Allow null for new users
      }
    })

    // Send OTP via WhatsApp (mock for now)
    await sendWhatsAppOTP(cleanPhone, otpCode)

    return NextResponse.json({
      message: 'Código OTP enviado via WhatsApp',
      phone: cleanPhone,
      expires: expiresAt.toISOString()
    })

  } catch (error) {
    console.error('Error sending OTP:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
