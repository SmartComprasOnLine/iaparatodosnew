
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json()

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const messages = [
      {
        role: 'system',
        content: `Você é um especialista em criação de prompts para agentes de IA do WhatsApp. Seu trabalho é aprimorar prompts para torná-los mais eficazes, claros e profissionais.

Critérios para um bom prompt:
- Definir claramente o papel e personalidade do agente
- Especificar o tom de voz e estilo de comunicação
- Incluir diretrizes de comportamento específicas
- Ser conciso mas completo
- Incluir instruções sobre como lidar com situações comuns
- Definir limites e restrições quando necessário

Responda em JSON no seguinte formato:
{
  "improvedPrompt": "Prompt melhorado aqui",
  "improvements": ["Lista de melhorias feitas"],
  "suggestions": ["Sugestões adicionais opcionais"]
}

Responda apenas com JSON puro, sem formatação markdown.`
      },
      {
        role: 'user',
        content: `Aprimore este prompt para um agente de WhatsApp: "${prompt}"`
      }
    ]

    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        stream: true,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error('Failed to improve prompt')
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()
        let buffer = ''
        let partialRead = ''

        try {
          while (true) {
            const { done, value } = await reader?.read() ?? { done: true, value: undefined }
            if (done) break

            partialRead += decoder.decode(value, { stream: true })
            let lines = partialRead.split('\n')
            partialRead = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') {
                  try {
                    const finalResult = JSON.parse(buffer)
                    const finalData = JSON.stringify({
                      status: 'completed',
                      result: finalResult
                    })
                    controller.enqueue(encoder.encode(`data: ${finalData}\n\n`))
                    return
                  } catch (e) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      status: 'error',
                      message: 'Invalid response format'
                    })}\n\n`))
                    return
                  }
                }
                
                try {
                  const parsed = JSON.parse(data)
                  buffer += parsed.choices?.[0]?.delta?.content || ''
                  
                  const progressData = JSON.stringify({
                    status: 'processing',
                    message: 'Aprimorando prompt...'
                  })
                  controller.enqueue(encoder.encode(`data: ${progressData}\n\n`))
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream error:', error)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            status: 'error',
            message: 'Erro ao aprimorar prompt'
          })}\n\n`))
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })
  } catch (error) {
    console.error('Improve prompt error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
