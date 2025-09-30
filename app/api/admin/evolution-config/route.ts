
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const WEBHOOK_PATH = '/api/whatsapp/webhook'

const resolveBaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || process.env.VERCEL_URL

  if (!envUrl) {
    return null
  }

  const trimmed = envUrl.trim()

  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('http')) {
    return trimmed.replace(/\/$/, '')
  }

  return `https://${trimmed.replace(/\/$/, '')}`
}

const buildWebhookUrl = () => {
  const base = resolveBaseUrl()
  if (!base) {
    return ''
  }
  return `${base}${WEBHOOK_PATH}`
}

// GET - Load Evolution API configuration
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    const webhookUrl = buildWebhookUrl()

    if (!config) {
      return NextResponse.json({
        apiUrl: '',
        apiKey: '',
        status: 'not_configured',
        webhookUrl
      })
    }

    const value = config.value as any
    return NextResponse.json({
      apiUrl: value.apiUrl || '',
      apiKey: value.apiKey ? '****' + value.apiKey.slice(-4) : '',
      status: value.status || 'not_configured',
      lastTested: value.lastTested ? new Date(value.lastTested) : undefined,
      webhookUrl
    })

  } catch (error) {
    console.error('Error loading Evolution config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Save Evolution API configuration
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { apiUrl, apiKey } = await request.json()

    if (!apiUrl || !apiKey) {
      return NextResponse.json({ error: 'URL e API Key são obrigatórios' }, { status: 400 })
    }

    // Basic URL validation
    try {
      new URL(apiUrl)
    } catch {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
    }

    const configData = {
      apiUrl: apiUrl.trim(),
      apiKey: apiKey.trim(),
      status: 'connected',
      lastTested: new Date()
    }

    await prisma.systemConfig.upsert({
      where: { key: 'evolution_api_config' },
      update: { value: configData },
      create: {
        key: 'evolution_api_config',
        value: configData
      }
    })

    return NextResponse.json({ 
      success: true,
      message: 'Configuração salva com sucesso',
      webhookUrl: buildWebhookUrl()
    })

  } catch (error) {
    console.error('Error saving Evolution config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
