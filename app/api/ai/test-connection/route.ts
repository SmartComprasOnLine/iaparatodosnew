
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { provider, apiKey, model } = await request.json()

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API key is required' })
    }

    // Test connection based on provider
    let testUrl = ''
    let headers = {}
    let body = {}

    switch (provider) {
      case 'openai':
        testUrl = 'https://apps.abacus.ai/v1/chat/completions'
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`
        }
        body = {
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Test connection' }],
          max_tokens: 10
        }
        break
      
      case 'gemini':
      case 'groq':
        // Use the same endpoint for now, as we're using Abacus AI
        testUrl = 'https://apps.abacus.ai/v1/chat/completions'
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`
        }
        body = {
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Test connection' }],
          max_tokens: 10
        }
        break

      default:
        return NextResponse.json({ success: false, error: 'Unsupported provider' })
    }

    const response = await fetch(testUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (response.ok) {
      return NextResponse.json({ success: true })
    } else {
      const errorData = await response.json()
      return NextResponse.json({ success: false, error: errorData.error?.message || 'Connection failed' })
    }
  } catch (error) {
    console.error('Connection test error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' })
  }
}
