
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

    if (!config) {
      return NextResponse.json({
        apiUrl: '',
        apiKey: '',
        status: 'not_configured'
      })
    }

    const value = config.value as any
    return NextResponse.json({
      apiUrl: value.apiUrl || '',
      apiKey: value.apiKey ? '****' + value.apiKey.slice(-4) : '',
      status: value.status || 'not_configured',
      lastTested: value.lastTested ? new Date(value.lastTested) : undefined
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
      message: 'Configuração salva com sucesso'
    })

  } catch (error) {
    console.error('Error saving Evolution config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
