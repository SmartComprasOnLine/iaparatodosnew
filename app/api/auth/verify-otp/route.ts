
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sign } from 'jsonwebtoken'

// Get user info from WhatsApp (pushname) via Evolution API
async function getWhatsAppUserInfo(phone: string) {
  try {
    // Get Evolution API configuration
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      console.log(`📱 [DEVELOPMENT] Cannot get user info for ${phone} (Evolution API not configured)`)
      return null
    }

    // Get an active OTP instance
    const otpInstances = await prisma.systemConfig.findMany({
      where: {
        key: {
          startsWith: 'otp_instance_'
        }
      }
    })

    const activeInstance = otpInstances.find(instance => {
      const value = instance.value as any
      return value.status === 'connected'
    })

    if (!activeInstance) {
      console.log(`📱 [DEVELOPMENT] Cannot get user info for ${phone} (No active OTP instance)`)
      return null
    }

    const evolutionData = evolutionConfig.value as any
    const instanceData = activeInstance.value as any

    // Get contact info from Evolution API
    const contactUrl = evolutionData.apiUrl.endsWith('/') 
      ? `${evolutionData.apiUrl}chat/findContact/${instanceData.instanceName}`
      : `${evolutionData.apiUrl}/chat/findContact/${instanceData.instanceName}`

    const response = await fetch(contactUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionData.apiKey
      },
      body: JSON.stringify({
        number: phone.replace('+', '')
      })
    })

    if (!response.ok) {
      console.log(`❌ Error getting contact info for ${phone}: ${response.status}`)
      return null
    }

    const contactData = await response.json()
    console.log(`✅ Got contact info for ${phone}:`, contactData)

    return {
      pushname: contactData?.pushname || contactData?.name || null,
      profilePicture: contactData?.profilePictureUrl || null
    }

  } catch (error) {
    console.error('Error getting WhatsApp user info:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json()

    if (!phone || !code) {
      return NextResponse.json(
        { error: 'Telefone e código são obrigatórios' },
        { status: 400 }
      )
    }

    // Clean phone number
    const cleanPhone = phone.replace(/[^+\d]/g, '')

    // Find OTP code
    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        phone: cleanPhone,
        code: code,
        verified: false,
        expires: {
          gt: new Date()
        }
      },
      include: {
        user: true
      }
    })

    if (!otpRecord) {
      return NextResponse.json(
        { error: 'Código OTP inválido ou expirado' },
        { status: 400 }
      )
    }

    // Mark OTP as verified
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { verified: true }
    })

    // Delete other OTP codes for this phone
    await prisma.otpCode.deleteMany({
      where: {
        phone: cleanPhone,
        id: { not: otpRecord.id }
      }
    })

    // If user doesn't exist, create one automatically (first-time login)
    let user = otpRecord.user
    
    if (!user) {
      console.log(`🆕 Creating new user for first-time login: ${cleanPhone}`)
      
      // Get user info from WhatsApp (pushname)
      const whatsappInfo = await getWhatsAppUserInfo(cleanPhone)
      
      // Create new user with WhatsApp number as unique ID and pushname as secondary identifier
      const userName = whatsappInfo?.pushname || `User ${cleanPhone.replace('+', '').slice(-4)}`
      const userEmail = `${cleanPhone.replace(/[^\d]/g, '')}@whatsapp.auto` // Auto-generated email
      
      try {
        user = await prisma.user.create({
          data: {
            phone: cleanPhone,           // WhatsApp number as unique ID
            name: userName,              // Pushname as secondary identifier
            email: userEmail,            // Auto-generated unique email
            image: whatsappInfo?.profilePicture || null,
            role: 'user'                 // Default role
          }
        })
        
        // Link the OTP to the newly created user
        await prisma.otpCode.update({
          where: { id: otpRecord.id },
          data: { userId: user.id }
        })
        
        console.log(`✅ New user created: ${user.id} - ${userName} (${cleanPhone})`)
        
      } catch (error) {
        console.error('Error creating new user:', error)
        return NextResponse.json(
          { error: 'Erro ao criar usuário automaticamente' },
          { status: 500 }
        )
      }
    }

    // Create JWT token for NextAuth
    const token = sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone
      },
      process.env.NEXTAUTH_SECRET!,
      { expiresIn: '7d' }
    )

    return NextResponse.json({
      message: 'OTP verificado com sucesso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone
      },
      token,
      isNewUser: !otpRecord.user  // Indicate if this was a new user registration
    })

  } catch (error) {
    console.error('Error verifying OTP:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
