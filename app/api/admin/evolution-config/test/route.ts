
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// POST - Test Evolution API connection
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

    // Test connection to Evolution API
    const testUrl = apiUrl.endsWith('/') ? `${apiUrl}instance/fetchInstances` : `${apiUrl}/instance/fetchInstances`
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      timeout: 10000 // 10 seconds timeout
    } as any)

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('API Key inválida ou sem permissões')
      }
      if (response.status === 404) {
        throw new Error('Endpoint não encontrado. Verifique a URL da API')
      }
      throw new Error(`Erro na conexão: ${response.status} ${response.statusText}`)
    }

    // If we get here, the connection is successful
    return NextResponse.json({ 
      success: true,
      message: 'Conexão com Evolution API estabelecida com sucesso'
    })

  } catch (error: any) {
    console.error('Error testing Evolution API:', error)
    
    let errorMessage = 'Erro desconhecido na conexão'
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Conexão recusada. Verifique se a URL está correta e o servidor está ativo'
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Servidor não encontrado. Verifique a URL'
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Timeout na conexão. Servidor pode estar lento ou indisponível'
    } else if (error.message) {
      errorMessage = error.message
    }

    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
