import { NextRequest, NextResponse } from 'next/server'

import {
  AutomationFunnelWithRelations,
  parseConditionFromJson,
  SerializedBranchAction
} from '@/app/api/funnels/utils'
import { prisma } from '@/lib/db'
import { fetchObject } from '@/lib/storage'
import { buildPublicUrl } from '@/lib/storage'
import { delayedJobScheduler } from '@/lib/delayed-job-scheduler'
import { appendMentorContextEntry } from '@/lib/mentor-context'
import { followUpJobKey } from '@/lib/follow-up-jobs'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface EvolutionWebhookEvent {
  event?: string
  instance?: string
  data?: any
}

type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string }

const WEBHOOK_PATH = '/api/whatsapp/webhook'

const buildEvolutionUrl = (baseUrl: string, path: string) => {
  if (!baseUrl) return path
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return path.startsWith('/') ? `${trimmed}${path}` : `${trimmed}/${path}`
}

const resolveEvolutionConfig = async () => {
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'evolution_api_config' }
  })

  if (!config) {
    return null
  }

  const value = config.value as any
  if (!value?.apiUrl || !value?.apiKey) {
    return null
  }

  return {
    apiUrl: value.apiUrl as string,
    apiKey: value.apiKey as string
  }
}

const extractMessageText = (message: any): string | null => {
  if (!message) return null

  const candidates = [
    message.conversation,
    message.extendedTextMessage?.text,
    message.message?.conversation,
    message.message?.extendedTextMessage?.text
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return null
}

const sanitizePhone = (jid: string | null | undefined) => {
  if (!jid) return null
  const [number] = jid.split('@')
  if (!number) return null
  const digits = number.replace(/\D/g, '')
  return digits || null
}

const normalizePhone = (value: string | null | undefined) => {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  return digits || null
}

const mentorTimeoutJobKey = (escalationId: string) => `mentor-timeout:${escalationId}`

const followUpSchedulerState = globalThis as typeof globalThis & {
  __followUpSchedulerInitialized?: boolean
}

const initializeFollowUpScheduler = () => {
  if (followUpSchedulerState.__followUpSchedulerInitialized) {
    return
  }

  followUpSchedulerState.__followUpSchedulerInitialized = true

  Promise.resolve()
    .then(async () => {
      const pendingExecutions = await prisma.followUpExecution.findMany({
        where: { status: 'scheduled' },
        select: {
          id: true,
          scheduledFor: true
        }
      })

      const now = Date.now()

      for (const execution of pendingExecutions) {
        const waitMs = execution.scheduledFor
          ? Math.max(new Date(execution.scheduledFor).getTime() - now, 0)
          : 0
        scheduleFollowUpExecutionJob(execution.id, waitMs)
      }
    })
    .catch((error) => {
      logger.error('Failed to initialize follow-up scheduler', { error: error instanceof Error ? error.message : String(error) })
    })
}

initializeFollowUpScheduler()

const getConversation = async (agentId: string, phone: string, contactName?: string) => {
  const existing = await prisma.conversation.findFirst({
    where: { agentId, contactPhone: phone }
  })

  if (existing) {
    return existing
  }

  return prisma.conversation.create({
    data: {
      agentId,
      contactPhone: phone,
      contactName: contactName?.slice(0, 120) || null,
      status: 'active'
    }
  })
}

const ensureFollowUpConversation = async (conversationId: string) =>
  prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      agentId: true,
      contactPhone: true
    }
  })

async function stopScheduledFollowUpsForConversation(
  conversation: { id: string },
  options?: { cancelAll?: boolean }
) {
  const executions = await prisma.followUpExecution.findMany({
    where: {
      conversationId: conversation.id,
      status: 'scheduled'
    },
    include: {
      rule: {
        select: {
          stopOnReply: true
        }
      }
    }
  })

  if (!executions.length) {
    return
  }

  const timestamp = new Date()

  for (const execution of executions) {
    if (!options?.cancelAll && execution.rule?.stopOnReply === false) {
      continue
    }

    try {
      await prisma.followUpExecution.update({
        where: { id: execution.id },
        data: {
          status: 'stopped',
          updatedAt: timestamp
        }
      })
    } catch (error) {
      logger.error('Failed to stop follow-up execution', { error: error instanceof Error ? error.message : String(error) })
    }

    delayedJobScheduler.cancel(followUpJobKey(execution.id))
  }
}

function scheduleFollowUpExecutionJob(executionId: string, waitMs: number) {
  const jobKey = followUpJobKey(executionId)
  const delay = Math.max(Math.floor(waitMs), 0)

  delayedJobScheduler.schedule(jobKey, delay, async () => {
    try {
      await runFollowUpExecution(executionId)
    } catch (error) {
      console.error(`Follow-up execution handler error (${executionId}):`, error)
    }
  })
}

async function scheduleFollowUpsForConversation(
  conversation: { id: string; agentId: string; contactPhone: string | null }
) {
  if (!conversation.contactPhone) {
    return
  }

  const rules = await prisma.followUpRule.findMany({
    where: {
      agentId: conversation.agentId,
      isActive: true
    },
    select: {
      id: true,
      triggerAfterMinutes: true,
      message: true,
      steps: {
        select: { id: true },
        take: 1
      }
    },
    orderBy: { triggerAfterMinutes: 'asc' }
  })

  if (!rules.length) {
    return
  }

  for (const rule of rules) {
    const trimmedMessage = (rule.message || '').trim()
    const hasSteps = Array.isArray(rule.steps) && rule.steps.length > 0
    if (!trimmedMessage && !hasSteps) {
      continue
    }

    const waitMinutes = Math.max(rule.triggerAfterMinutes || 0, 1)
    const scheduledFor = new Date(Date.now() + waitMinutes * 60000)

    const existing = await prisma.followUpExecution.findFirst({
      where: {
        ruleId: rule.id,
        conversationId: conversation.id
      },
      select: {
        id: true
      }
    })

    if (existing) {
      delayedJobScheduler.cancel(followUpJobKey(existing.id))

      await prisma.followUpExecution.update({
        where: { id: existing.id },
        data: {
          status: 'scheduled',
          currentAttempt: 0,
          scheduledFor,
          executedAt: null,
          lastAttemptAt: null
        }
      })

      scheduleFollowUpExecutionJob(existing.id, scheduledFor.getTime() - Date.now())
      continue
    }

    const created = await prisma.followUpExecution.create({
      data: {
        ruleId: rule.id,
        conversationId: conversation.id,
        contactPhone: conversation.contactPhone,
        status: 'scheduled',
        currentAttempt: 0,
        scheduledFor
      },
      select: { id: true }
    })

    scheduleFollowUpExecutionJob(created.id, scheduledFor.getTime() - Date.now())
  }
}

async function handleFollowUpAfterMessage({
  conversationId,
  isFromUser
}: {
  conversationId: string
  isFromUser: boolean
}) {
  try {
    const conversation = await ensureFollowUpConversation(conversationId)

    if (!conversation) {
      return
    }

    if (isFromUser) {
      await stopScheduledFollowUpsForConversation(conversation)
      return
    }

    await scheduleFollowUpsForConversation(conversation)
  } catch (error) {
    console.error('Follow-up scheduling error:', error)
  }
}

const registerMessage = async (
  conversationId: string,
  {
    content,
    whatsappMessageId,
    isFromUser,
    processedBy,
    confidence,
    messageType,
    mediaUrl,
    skipFollowUpTracking
  }: {
    content: string
    whatsappMessageId?: string | null
    isFromUser: boolean
    processedBy?: 'agent' | 'user' | 'mentor' | 'system'
    confidence?: number | null
    messageType?: string
    mediaUrl?: string | null
    skipFollowUpTracking?: boolean
  }
) => {
  if (whatsappMessageId) {
    const existingMessage = await prisma.message.findFirst({
      where: { whatsappMessageId }
    })

    if (existingMessage) {
      return existingMessage
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      messageType: messageType || 'text',
      content,
      isFromUser,
      isFromAgent: !isFromUser,
      processedBy: processedBy || (isFromUser ? 'user' : 'agent'),
      whatsappMessageId: whatsappMessageId || undefined,
      confidence: typeof confidence === 'number' ? confidence : undefined,
      mediaUrl: mediaUrl || undefined
    }
  })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      messageCount: { increment: 1 },
      lastMessageAt: new Date()
    }
  })

  if (!skipFollowUpTracking) {
    await handleFollowUpAfterMessage({
      conversationId,
      isFromUser
    })
  }

  return message
}

const FOLLOW_UP_VARIABLE_REGEX = /{{\s*(\w+)\s*}}/g

const formatInTimeZone = (
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
) => new Intl.DateTimeFormat('pt-BR', { ...options, timeZone }).format(date)

const buildFollowUpVariableMap = ({
  conversation,
  timeZone,
  now
}: {
  conversation: { contactName: string | null; contactPhone: string | null }
  timeZone: string
  now: Date
}) => {
  const rawName = conversation.contactName?.trim() || conversation.contactPhone || ''
  const tz = timeZone || 'America/Sao_Paulo'
  const weekdayRaw = formatInTimeZone(now, tz, { weekday: 'long' })
  const weekdayCapitalized = weekdayRaw
    ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}`
    : weekdayRaw

  return {
    nome: rawName,
    data: formatInTimeZone(now, tz, { dateStyle: 'short' }),
    hora: formatInTimeZone(now, tz, { timeStyle: 'short' }),
    dataHora: formatInTimeZone(now, tz, { dateStyle: 'short', timeStyle: 'short' }),
    diaSemana: weekdayCapitalized
  }
}

const applyFollowUpVariables = (text: string, variables: Record<string, string>) =>
  text.replace(FOLLOW_UP_VARIABLE_REGEX, (_match, key) => variables[key] ?? '')

const waitFor = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(ms, 0))
  })

async function runFollowUpExecution(executionId: string) {
  const execution = await prisma.followUpExecution.findUnique({
    where: { id: executionId },
    include: {
      rule: {
        include: {
          steps: {
            orderBy: { stepNumber: 'asc' },
            include: { mediaFile: true }
          }
        }
      },
      conversation: {
        include: {
          agent: true
        }
      }
    }
  })

  if (!execution || execution.status !== 'scheduled') {
    return
  }

  const rule = execution.rule
  const conversation = execution.conversation

  if (!rule || !conversation) {
    await prisma.followUpExecution.update({
      where: { id: executionId },
      data: { status: 'stopped' }
    })
    return
  }

  if (!rule.isActive) {
    await prisma.followUpExecution.update({
      where: { id: executionId },
      data: { status: 'stopped' }
    })
    return
  }

  if (!conversation.contactPhone) {
    await prisma.followUpExecution.update({
      where: { id: executionId },
      data: { status: 'failed' }
    })
    return
  }

  if (conversation.status && conversation.status !== 'active') {
    await prisma.followUpExecution.update({
      where: { id: executionId },
      data: { status: 'stopped' }
    })
    return
  }

  const integration = await prisma.whatsAppIntegration.findFirst({
    where: { agentId: conversation.agentId },
    include: {
      agent: true
    }
  })

  if (!integration?.agent || integration.agent.isActive === false) {
    await prisma.followUpExecution.update({
      where: { id: executionId },
      data: { status: 'failed' }
    })
    return
  }

  const evolutionConfig = await resolveEvolutionConfig()

  if (!evolutionConfig) {
    console.error('Evolution API configuration missing for follow-up execution.')
    await prisma.followUpExecution.update({
      where: { id: executionId },
      data: { status: 'failed' }
    })
    return
  }

  const typingDelay = integration.agent.typingSimulation
    ? integration.agent.responseDelay ?? 2000
    : 0

  try {
    const steps = [...(rule.steps ?? [])]
    const templateNow = new Date()
    const timeZone = conversation.agent?.timezone || 'America/Sao_Paulo'
    const variables = buildFollowUpVariableMap({
      conversation,
      timeZone,
      now: templateNow
    })

    const sendTextMessage = async (text: string) => {
      const finalText = text.trim()
      if (!finalText) {
        return
      }

      await sendWhatsappMessage(
        evolutionConfig,
        integration.instanceName,
        conversation.contactPhone,
        finalText,
        typingDelay
      )

      await registerMessage(conversation.id, {
        content: finalText,
        isFromUser: false,
        processedBy: 'system',
        messageType: 'text',
        skipFollowUpTracking: true
      })
    }

    if (steps.length > 0) {
      for (const step of steps) {
        if (step.delaySeconds && step.delaySeconds > 0) {
          await waitFor(step.delaySeconds * 1000)
        }

        switch (step.stepType) {
          case 'text': {
            const templated = applyFollowUpVariables(step.textContent ?? '', variables)
            await sendTextMessage(templated)
            break
          }
          case 'image':
          case 'video':
          case 'audio':
          case 'document': {
            const caption = applyFollowUpVariables(step.caption ?? '', variables)
            const mediaFile = step.mediaFile

            if (!mediaFile) {
              await sendTextMessage(caption || 'Conteúdo indisponível.')
              break
            }

            const fileName = mediaFile.originalName || `conteudo-${step.stepType}`
            const storageKey = mediaFile.cloudStoragePath
            const mediaUrl = buildPublicUrl(mediaFile.cloudStoragePath)

            try {
              await sendWhatsappMedia(
                evolutionConfig,
                integration.instanceName,
                conversation.contactPhone,
                {
                  type: step.stepType as 'image' | 'audio' | 'video' | 'document',
                  fileName,
                  caption,
                  mimeType: mediaFile.mimeType,
                  url: mediaUrl,
                  delayMs: typingDelay,
                  storageKey
                }
              )

              await registerMessage(conversation.id, {
                content: caption || `[${step.stepType}] ${fileName}`,
                isFromUser: false,
                processedBy: 'system',
                messageType: step.stepType,
                mediaUrl,
                skipFollowUpTracking: true
              })
            } catch (error) {
              console.error('Failed to send follow-up media, falling back to text:', error)
              const fallbackText = caption ? `${caption}\n${mediaUrl}` : mediaUrl
              await sendTextMessage(fallbackText)
            }

            break
          }
          default:
            break
        }
      }
    } else {
      const templated = applyFollowUpVariables(rule.message || '', variables)
      const trimmed = templated.trim()

      if (!trimmed) {
        await prisma.followUpExecution.update({
          where: { id: executionId },
          data: { status: 'failed' }
        })
        return
      }

      await sendTextMessage(trimmed)
    }

    const attempt = (execution.currentAttempt ?? 0) + 1
    const now = new Date()
    const hasMoreAttempts = attempt < (rule.maxAttempts || 1)
    const nextSchedule = hasMoreAttempts
      ? new Date(now.getTime() + Math.max(rule.triggerAfterMinutes || 0, 1) * 60000)
      : null

    await prisma.followUpExecution.update({
      where: { id: executionId },
      data: {
        status: hasMoreAttempts ? 'scheduled' : 'sent',
        currentAttempt: attempt,
        lastAttemptAt: now,
        executedAt: now,
        scheduledFor: nextSchedule
      }
    })

    if (hasMoreAttempts && nextSchedule) {
      scheduleFollowUpExecutionJob(executionId, nextSchedule.getTime() - Date.now())
    }

    logRoutingTelemetry({
      route: 'FOLLOWUP',
      agentId: conversation.agentId,
      phone: conversation.contactPhone,
      motivo: `follow-up:${rule.name}`,
      similaridade: null,
      gatilho: `inatividade-${rule.triggerAfterMinutes}`
    })
  } catch (error) {
    console.error('Failed to send follow-up message:', error)

    await prisma.followUpExecution.update({
      where: { id: executionId },
      data: { status: 'failed' }
    })
  }
}

const buildChatHistory = async (
  conversationId: string,
  limit: number
): Promise<ChatHistoryMessage[]> => {
  const take = Math.max(limit * 2, 10)
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: 'desc' },
    take
  })

  return messages
    .reverse()
    .map<ChatHistoryMessage>((message) => ({
      role: message.isFromUser ? 'user' : 'assistant',
      content: message.content
    }))
}

const buildAutomationContextText = async (
  conversationId: string,
  limit: number
) => {
  const take = Math.max(limit, 1)
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: 'desc' },
    take
  })

  if (!messages.length) {
    return ''
  }

  return messages
    .reverse()
    .map((message) => {
      const roleLabel = message.isFromUser
        ? 'Cliente'
        : message.isFromAgent
        ? 'Agente'
        : 'Sistema'
      return `${roleLabel}: ${message.content}`
    })
    .join('\n')
}

const maybeAppendMemorySnapshot = (
  history: ChatHistoryMessage[],
  snapshot: any
): ChatHistoryMessage[] => {
  if (!Array.isArray(snapshot)) {
    return history
  }

  const serialized = new Set(history.map((item) => `${item.role}:${item.content}`))

  const prepended = snapshot
    .filter((item) => item && typeof item.content === 'string')
    .map<ChatHistoryMessage>((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content
    }))
    .filter((item) => {
      const key = `${item.role}:${item.content}`
      if (serialized.has(key)) {
        return false
      }
      serialized.add(key)
      return true
    })

  return [...prepended, ...history]
}

const toGeminiPayload = (
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  model: string,
  temperature: number,
  maxTokens: number
) => {
  const contents = history.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }]
  }))

  return {
    contents,
    systemInstruction: systemPrompt
      ? {
          role: 'system',
          parts: [{ text: systemPrompt }]
        }
      : undefined,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    }
  }
}

type AgentProviderConfig = {
  provider: string
  apiKey: string
}

const resolveAgentProviderConfig = (agent: any): AgentProviderConfig => {
  const provider = (agent.aiProvider || 'openai').toLowerCase()
  const apiKey = (agent.apiKey || '').trim()

  if (!apiKey) {
    throw new Error('Missing API key for AI provider')
  }

  return { provider, apiKey }
}

const generateAgentReply = async (
  agent: any,
  history: { role: 'user' | 'assistant'; content: string }[],
  mentorKnowledge: string
) => {
  const basePrompt = agent.systemPrompt || 'Você é um agente virtual do WhatsApp.'
  const systemPrompt = [basePrompt, mentorKnowledge].filter(Boolean).join('\n\n')
  const { provider, apiKey } = resolveAgentProviderConfig(agent)

  switch (provider) {
    case 'openai': {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ]

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: agent.model || 'gpt-4o-mini',
          messages,
          max_tokens: agent.maxTokens || 1500,
          temperature: agent.temperature ?? 0.7
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI error: ${error}`)
      }

      const data = await response.json()
      const reply = data?.choices?.[0]?.message?.content?.trim()
      if (!reply) {
        throw new Error('Empty response from OpenAI')
      }
      return reply
    }

    case 'groq': {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ]

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: agent.model || 'llama-3.1-70b-versatile',
          messages,
          max_tokens: agent.maxTokens || 1500,
          temperature: agent.temperature ?? 0.7
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Groq error: ${error}`)
      }

      const data = await response.json()
      const reply = data?.choices?.[0]?.message?.content?.trim()
      if (!reply) {
        throw new Error('Empty response from Groq')
      }
      return reply
    }

    case 'gemini': {
      const payload = toGeminiPayload(
        systemPrompt,
        history,
        agent.model || 'gemini-1.5-pro-latest',
        agent.temperature ?? 0.7,
        agent.maxTokens || 1500
      )

      const model = agent.model || 'gemini-1.5-pro-latest'
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Gemini error: ${error}`)
      }

      const data = await response.json()
      const reply = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text)?.join('').trim()
      if (!reply) {
        throw new Error('Empty response from Gemini')
      }
      return reply
    }

    case 'abacus':
    default: {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ]

      const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: agent.model || 'gpt-4o-mini',
          messages,
          max_tokens: agent.maxTokens || 1500,
          temperature: agent.temperature ?? 0.7
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Fallback provider error: ${error}`)
      }

      const data = await response.json()
      const reply = data?.choices?.[0]?.message?.content?.trim()
      if (!reply) {
        throw new Error('Empty response from fallback provider')
      }
      return reply
    }
  }
}

type AutomationClassifierResult = {
  route: 'FUNIL' | 'IGNORAR'
  funnelId: string | null
  confidence: number | null
  reason: string
}

type AutomationClassifierFunnelSummary = {
  id: string
  name: string
  description: string
  minSimilarity: number | null
  lexicalScore: number | null
  lexicalReason: string | null
}

const classifyAutomationIntent = async ({
  agent,
  funnels,
  latestMessage,
  contextText,
  summaries
}: {
  agent: any
  funnels: AutomationFunnelWithRelations[]
  latestMessage: string
  contextText: string
  summaries: AutomationClassifierFunnelSummary[]
}): Promise<AutomationClassifierResult> => {
  if (!funnels.length) {
    return {
      route: 'IGNORAR',
      funnelId: null,
      confidence: null,
      reason: 'sem funis ativos'
    }
  }

  const { provider, apiKey } = resolveAgentProviderConfig(agent)

  const promptFunnels = summaries.map((summary) => ({
    id: summary.id,
    nome: summary.name,
    contexto: summary.description,
    similaridadeMinima: summary.minSimilarity,
    similaridadeLexica: summary.lexicalScore,
    justificativaLexica: summary.lexicalReason
  }))

  const trimmedContext = contextText.length > 2000 ? contextText.slice(-2000) : contextText
  const trimmedMessage = latestMessage.length > 500 ? latestMessage.slice(-500) : latestMessage

  const systemPrompt = `Você é um roteador de automações. Sua tarefa é analisar a conversa recente e decidir se deve acionar um funil específico de automação. Regras:\n- Avalie a intenção do cliente com base no histórico e na mensagem mais recente.\n- Se nenhum funil corresponder claramente, responda com route = \"IGNORAR\".\n- Se houver correspondência, escolha apenas um funil e forneça a justificativa.\n- Sempre responda usando JSON válido.`

  const userPrompt = `Funis disponíveis:\n${JSON.stringify(promptFunnels, null, 2)}\n\nHistórico recente:\n${trimmedContext || '[vazio]'}\n\nMensagem mais recente:\n${trimmedMessage || '[vazio]'}\n\nResponda APENAS com JSON no formato:\n{\n  \"route\": \"FUNIL\" ou \"IGNORAR\",\n  \"funnelId\": \"id do funil\" ou null,\n  \"confidence\": número entre 0 e 1 (ou null se não souber),\n  \"reason\": \"explicação curta\"\n}`

  const parseResult = (raw: string): AutomationClassifierResult => {
    try {
      const parsed = JSON.parse(raw)
      const route = parsed?.route === 'FUNIL' ? 'FUNIL' : 'IGNORAR'
      const funnelId = typeof parsed?.funnelId === 'string' ? parsed.funnelId : null
      const confidence = typeof parsed?.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : null
      const reason = typeof parsed?.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim()
        : 'classificador: sem justificativa'

      return { route, funnelId, confidence, reason }
    } catch (error) {
      console.error('Failed to parse automation classifier response:', error, raw)
      return {
        route: 'IGNORAR',
        funnelId: null,
        confidence: null,
        reason: 'erro ao interpretar resposta do classificador'
      }
    }
  }

  try {
    switch (provider) {
      case 'openai': {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: agent.model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0,
            max_tokens: 600,
            response_format: { type: 'json_object' }
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`OpenAI classifier error: ${errorText}`)
        }

        const data = await response.json()
        const reply = data?.choices?.[0]?.message?.content?.trim() || '{}'
        return parseResult(reply)
      }

      case 'groq': {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: agent.model || 'llama-3.1-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0,
            max_tokens: 600
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Groq classifier error: ${errorText}`)
        }

        const data = await response.json()
        const reply = data?.choices?.[0]?.message?.content?.trim() || '{}'
        return parseResult(reply)
      }

      case 'gemini': {
        const geminiModel = agent.model || 'gemini-1.5-pro-latest'
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: `${systemPrompt}\n\n${userPrompt}` }
                ]
              }
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 600
            }
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Gemini classifier error: ${errorText}`)
        }

        const data = await response.json()
        const reply = data?.candidates?.[0]?.content?.parts
          ?.map((part: any) => part?.text)
          ?.join('')
          ?.trim() || '{}'
        return parseResult(reply)
      }

      case 'abacus':
      default: {
        const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: agent.model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0,
            max_tokens: 600
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Abacus classifier error: ${errorText}`)
        }

        const data = await response.json()
        const reply = data?.choices?.[0]?.message?.content?.trim() || '{}'
        return parseResult(reply)
      }
    }
  } catch (error) {
    console.error('Automation classifier failure:', error)
    return {
      route: 'IGNORAR',
      funnelId: null,
      confidence: null,
      reason: 'erro no classificador de automação'
    }
  }
}

const sendWhatsappMessage = async (
  evolution: { apiUrl: string; apiKey: string },
  instanceName: string,
  phone: string,
  text: string,
  delayMs: number
) => {
  const url = buildEvolutionUrl(evolution.apiUrl, `/message/sendText/${instanceName}`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: evolution.apiKey
    },
    body: JSON.stringify({
      number: phone,
      text,
      delay: Math.max(delayMs, 0)
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Evolution API send error: ${error}`)
  }
}

const guessMimeType = (
  fileName: string,
  fallback: string | null | undefined,
  type: 'image' | 'audio' | 'video' | 'document'
) => {
  if (fallback && fallback.trim()) {
    return fallback
  }

  const extension = fileName.split('.').pop()?.toLowerCase() || ''

  const extensionMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
    txt: 'text/plain',
    zip: 'application/zip'
  }

  if (extensionMap[extension]) {
    return extensionMap[extension]
  }

  switch (type) {
    case 'image':
      return 'image/jpeg'
    case 'audio':
      return 'audio/mpeg'
    case 'video':
      return 'video/mp4'
    default:
      return 'application/octet-stream'
  }
}

const downloadMediaBuffer = async (options: { storageKey?: string | null; url: string }) => {
  if (options.storageKey) {
    try {
      const response = await fetchObject({ key: options.storageKey })
      if (response.ok && response.body) {
        const arrayBuffer = await response.arrayBuffer()
        return {
          buffer: Buffer.from(arrayBuffer),
          mimeType: response.headers.get('content-type') || null
        }
      }
    } catch (error) {
      console.warn('[evolution-media] failed to fetch object via storage', error)
    }
  }

  const response = await fetch(options.url)
  if (!response.ok) {
    throw new Error(`Failed to download media for Evolution API: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: response.headers.get('content-type') || null
  }
}

const sendWhatsappMedia = async (
  evolution: { apiUrl: string; apiKey: string },
  instanceName: string,
  phone: string,
  media: {
    type: 'image' | 'audio' | 'video' | 'document'
    fileName: string
    url: string
    caption?: string
    mimeType?: string | null
    delayMs?: number
    storageKey?: string | null
  }
) => {
  const cleanNumber = phone.replace(/\D/g, '')
  const fileName = media.fileName || `arquivo-${Date.now()}`
  const delay = Math.max(media.delayMs ?? 0, 0)
  const guessedMime = guessMimeType(fileName, media.mimeType, media.type)
  try {
    const downloaded = await downloadMediaBuffer({
      storageKey: media.storageKey,
      url: media.url
    })

    const mimeType = downloaded.mimeType || guessedMime
    const base64 = downloaded.buffer.toString('base64')

    if (media.type === 'audio') {
      const audioResponse = await fetch(
        buildEvolutionUrl(evolution.apiUrl, `/message/sendWhatsAppAudio/${instanceName}`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: evolution.apiKey
          },
          body: JSON.stringify({
            number: cleanNumber,
            audio: base64,
            delay
          })
        }
      )

      if (!audioResponse.ok) {
        const text = await audioResponse.text().catch(() => '')
        throw new Error(`sendWhatsAppAudio failed (${audioResponse.status}): ${text}`)
      }

      return
    }

    const mediaResponse = await fetch(
      buildEvolutionUrl(evolution.apiUrl, `/message/sendMedia/${instanceName}`),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evolution.apiKey
        },
        body: JSON.stringify({
          number: cleanNumber,
          mediatype: media.type,
          mimetype: mimeType,
          caption: media.caption || undefined,
          media: base64,
          fileName,
          delay,
          linkPreview: false
        })
      }
    )

    if (!mediaResponse.ok) {
      const text = await mediaResponse.text().catch(() => '')
      throw new Error(`sendMedia failed (${mediaResponse.status}): ${text}`)
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}

type MentorConfigResolved = {
  isEnabled: boolean
  mentorPhone: string | null
  timeoutMinutes: number
  topics: string[]
  uncertainty: string[]
  timeoutMessage: string
}

const toStringList = (value: any): string[] => {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : String(item || '')).trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

const normalizeTextForMatch = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

type NormalizedPhrase = {
  raw: string
  normalized: string
}

const buildNormalizedPhraseList = (phrases: string[]): NormalizedPhrase[] =>
  phrases
    .map((raw) => ({ raw, normalized: normalizeTextForMatch(raw) }))
    .filter((item) => Boolean(item.normalized))

const includesNormalizedPhrase = (normalizedSource: string, normalizedPhrase: string) => {
  if (!normalizedSource || !normalizedPhrase) {
    return false
  }

  return (` ${normalizedSource} `).includes(` ${normalizedPhrase} `)
}

const findFirstPhraseMatch = (
  normalizedSource: string,
  phrases: NormalizedPhrase[]
): NormalizedPhrase | null => {
  for (const phrase of phrases) {
    if (includesNormalizedPhrase(normalizedSource, phrase.normalized)) {
      return phrase
    }
  }

  return null
}

const collectPhraseMatches = (
  normalizedSource: string,
  phrases: NormalizedPhrase[]
) =>
  phrases.filter((phrase) => includesNormalizedPhrase(normalizedSource, phrase.normalized))

const SENSITIVE_KEYWORDS: NormalizedPhrase[] = []

const DOUBT_PATTERNS: NormalizedPhrase[] = []

const CURRENCY_REGEX = /$^/

const LOW_CONFIDENCE_THRESHOLD = 0.5

const FUNNEL_DIRECT_THRESHOLD = 78

type MentorRoutingDecision = {
  shouldEscalate: boolean
  reason: string
  triggerLabel: string | null
  confidence?: number | null
}

const STOP_WORDS = new Set([
  'a',
  'as',
  'ao',
  'aos',
  'o',
  'os',
  'e',
  'ou',
  'do',
  'dos',
  'da',
  'das',
  'de',
  'no',
  'nos',
  'na',
  'nas',
  'em',
  'por',
  'pra',
  'para',
  'com',
  'se',
  'que',
  'quem',
  'quando',
  'onde',
  'como',
  'qual',
  'quais',
  'porque',
  'sobre',
  'um',
  'uma',
  'uns',
  'umas',
  'depois',
  'antes'
])

const splitTokens = (text: string) => text.split(' ').filter(Boolean)

const countSignificantTokens = (tokens: string[]) =>
  tokens.filter((token) => token.length > 2 && !STOP_WORDS.has(token)).length

const countSharedSignificantTokens = (
  normalizedMessage: string,
  normalizedPrompt: string
) => {
  if (!normalizedMessage || !normalizedPrompt) {
    return 0
  }

  const messageTokens = splitTokens(normalizedMessage).filter(
    (token) => token.length > 2 && !STOP_WORDS.has(token)
  )
  const promptTokens = splitTokens(normalizedPrompt).filter(
    (token) => token.length > 2 && !STOP_WORDS.has(token)
  )

  if (!messageTokens.length || !promptTokens.length) {
    return 0
  }

  const messageSet = new Set(messageTokens)
  let count = 0

  for (const token of promptTokens) {
    if (messageSet.has(token)) {
      count += 1
    }
  }

  return count
}

type FunnelCandidate = {
  funnel: AutomationFunnelWithRelations
  score: number
  triggerMatches: string[]
  sharedSignificantTokens: number
  shouldTrigger: boolean
  triggerType: 'keyword' | 'similarity' | 'gray-zone' | 'classifier' | null
  reason: string
}

type FunnelRoutingDecision = {
  bestCandidate: FunnelCandidate | null
  selectedCandidate: FunnelCandidate | null
}

const logRoutingTelemetry = ({
  route,
  agentId,
  phone,
  motivo,
  similaridade,
  gatilho
}: {
  route: 'MENTOR' | 'FUNIL' | 'IA' | 'INATIVO' | 'FOLLOWUP'
  agentId: string
  phone: string
  motivo: string
  similaridade?: number | null
  gatilho?: string | null
}) => {
  const parts = [`rota=${route}`, `agente=${agentId}`, `contato=${phone}`]

  if (typeof similaridade === 'number' && !Number.isNaN(similaridade)) {
    parts.push(`similaridade=${similaridade.toFixed(2)}`)
  }

  if (gatilho) {
    parts.push(`gatilho=${gatilho}`)
  }

  parts.push(`motivo=${motivo}`)
  console.info(parts.join(' '))
}

const getCandidateSpecificity = (candidate: FunnelCandidate) =>
  candidate.sharedSignificantTokens + candidate.triggerMatches.length

const isPreferredFunnelCandidate = (
  current: FunnelCandidate | null,
  challenger: FunnelCandidate
) => {
  if (!current) {
    return true
  }

  if (challenger.score > current.score) {
    return true
  }

  if (challenger.score < current.score) {
    return false
  }

  const challengerSpecificity = getCandidateSpecificity(challenger)
  const currentSpecificity = getCandidateSpecificity(current)

  if (challengerSpecificity > currentSpecificity) {
    return true
  }

  if (challengerSpecificity < currentSpecificity) {
    return false
  }

  const challengerCreatedAt = challenger.funnel.createdAt
    ? new Date(challenger.funnel.createdAt).getTime()
    : 0
  const currentCreatedAt = current.funnel.createdAt
    ? new Date(current.funnel.createdAt).getTime()
    : 0

  if (challengerCreatedAt < currentCreatedAt) {
    return true
  }

  if (challengerCreatedAt > currentCreatedAt) {
    return false
  }

  return challenger.funnel.id < current.funnel.id
}

const evaluateMentorDecision = ({
  messageText,
  mentorConfig,
  classifierConfidence
}: {
  messageText: string
  mentorConfig: MentorConfigResolved | null
  classifierConfidence?: number | null
}): MentorRoutingDecision => {
  const normalizedMessage = normalizeTextForMatch(messageText)
  const decision: MentorRoutingDecision = {
    shouldEscalate: false,
    reason: 'rotina: sem gatilho',
    triggerLabel: null,
    confidence: typeof classifierConfidence === 'number' ? classifierConfidence : null
  }

  if (!mentorConfig?.isEnabled || !mentorConfig.mentorPhone) {
    decision.reason = 'mentor desativado'
    return decision
  }

  const reasons: Array<{
    label: string
    trigger: string | null
    priority: number
  }> = []

  if (normalizedMessage) {
    const topicList = buildNormalizedPhraseList(mentorConfig.topics ?? [])
    const uncertaintyList = buildNormalizedPhraseList(mentorConfig.uncertainty ?? [])
    const shouldApplyDefaults = topicList.length > 0 || uncertaintyList.length > 0

    if (shouldApplyDefaults) {
      const sensitiveMatch = findFirstPhraseMatch(normalizedMessage, SENSITIVE_KEYWORDS)

      if (sensitiveMatch) {
        reasons.push({
          label: `sensivel: ${sensitiveMatch.raw}`,
          trigger: sensitiveMatch.raw,
          priority: 1
        })
      }

      if (CURRENCY_REGEX.test(messageText)) {
        reasons.push({
          label: 'sensivel: moeda',
          trigger: 'moeda',
          priority: 1
        })
      }

      const doubtMatches = collectPhraseMatches(normalizedMessage, DOUBT_PATTERNS)
      if (doubtMatches.length) {
        reasons.push({
          label: `incerteza: ${doubtMatches[0].raw}`,
          trigger: doubtMatches[0].raw,
          priority: 3
        })
      }
    }

    const topicMatches = collectPhraseMatches(normalizedMessage, topicList)
    if (topicMatches.length) {
      reasons.push({
        label: `sensivel-config: ${topicMatches[0].raw}`,
        trigger: topicMatches[0].raw,
        priority: 2
      })
    }

    const uncertaintyMatches = collectPhraseMatches(normalizedMessage, uncertaintyList)
    if (uncertaintyMatches.length) {
      reasons.push({
        label: `incerteza-config: ${uncertaintyMatches[0].raw}`,
        trigger: uncertaintyMatches[0].raw,
        priority: 3
      })
    }
  }

  if (
    typeof classifierConfidence === 'number' &&
    classifierConfidence < LOW_CONFIDENCE_THRESHOLD
  ) {
    reasons.push({
      label: `confiança baixa: ${classifierConfidence.toFixed(2)}`,
      trigger: 'low-confidence',
      priority: 4
    })
  }

  if (!reasons.length) {
    return decision
  }

  reasons.sort((a, b) => a.priority - b.priority)
  const best = reasons[0]

  decision.shouldEscalate = true
  decision.reason = best.label
  decision.triggerLabel = best.trigger

  return decision
}

const computeContextSimilarity = (message: string, prompt: string) => {
  const normalizedPrompt = normalizeTextForMatch(prompt)
  const normalizedMessage = normalizeTextForMatch(message)

  if (!normalizedPrompt || !normalizedMessage) {
    return 0
  }

  if (normalizedMessage.includes(normalizedPrompt)) {
    return 100
  }

  const messageTokens = splitTokens(normalizedMessage)
  const promptTokens = splitTokens(normalizedPrompt)

  if (!promptTokens.length || !messageTokens.length) {
    return 0
  }

  const messageTokenSet = new Set(messageTokens)
  const promptTokenSet = new Set(promptTokens)

  let intersectionCount = 0
  promptTokenSet.forEach((token) => {
    if (messageTokenSet.has(token)) {
      intersectionCount += 1
    }
  })

  let baseScore = 0
  if (intersectionCount > 0) {
    const coverage = intersectionCount / promptTokenSet.size
    const unionSize = new Set([...messageTokenSet, ...promptTokenSet]).size
    const jaccard = unionSize === 0 ? 0 : intersectionCount / unionSize
    const ratio = intersectionCount / Math.max(messageTokenSet.size, promptTokenSet.size)
    baseScore = Math.round(Math.min(Math.max(coverage, jaccard, ratio) * 100, 100))
  }

  const promptSignificantTokens = promptTokens.filter(
    (token) => token.length > 2 && !STOP_WORDS.has(token)
  )
  const messageSignificantSet = new Set(
    messageTokens.filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  )

  if (promptSignificantTokens.length) {
    const matchedSignificant = promptSignificantTokens.filter((token) =>
      messageSignificantSet.has(token)
    ).length

    if (matchedSignificant > 0) {
      const significantScore = Math.round(
        Math.min((matchedSignificant / promptSignificantTokens.length) * 100, 100)
      )
      baseScore = Math.max(baseScore, significantScore)
    }
  }

  const maxNgram = Math.min(4, promptTokens.length)
  for (let size = 2; size <= maxNgram; size += 1) {
    for (let index = 0; index <= promptTokens.length - size; index += 1) {
      const phraseTokens = promptTokens.slice(index, index + size)
      const strongCount = countSignificantTokens(phraseTokens)
      if (strongCount < 2) {
        continue
      }

      const phrase = phraseTokens.join(' ')
      if (!normalizedMessage.includes(phrase)) {
        continue
      }

      const phraseScore = Math.min(100, 55 + strongCount * 15 + (phraseTokens.length - strongCount) * 5)
      baseScore = Math.max(baseScore, phraseScore)
    }
  }

  if (baseScore === 0) {
    const strongMatch = promptSignificantTokens.find((token) =>
      normalizedMessage.includes(token)
    )

    if (strongMatch) {
      baseScore = Math.min(100, strongMatch.length * 10)
    }
  }

  return baseScore
}

const automationExecutionJobKey = (executionId: string, stepId: string) =>
  `automation:${executionId}:${stepId}`

type AutomationTriggerContext = {
  integration: any
  conversationId: string
  phone: string
  messageText: string
  triggerMessageId: string | null
  contextText: string
  visitedAutomations: Set<string>
}

type AutomationRuntimeContext = AutomationTriggerContext & {
  evolutionConfig: { apiUrl: string; apiKey: string }
  stepVisitCount: Record<string, number>
}

const getStepDelaySeconds = (
  funnel: AutomationFunnelWithRelations,
  step: AutomationFunnelWithRelations['steps'][number]
) =>
  typeof step.delaySeconds === 'number'
    ? step.delaySeconds
    : funnel.defaultDelaySeconds ?? 0

const findStepById = (
  funnel: AutomationFunnelWithRelations,
  stepId: string | undefined
) => funnel.steps.find((item) => item.id === stepId) ?? null

const getNextSequentialStep = (
  funnel: AutomationFunnelWithRelations,
  currentStep: AutomationFunnelWithRelations['steps'][number]
) => {
  const currentIndex = funnel.steps.findIndex((item) => item.id === currentStep.id)
  if (currentIndex === -1) {
    return null
  }
  return funnel.steps[currentIndex + 1] ?? null
}

const canTriggerFunnelForContact = async (
  funnel: AutomationFunnelWithRelations,
  contactPhone: string
) => {
  const lastExecution = await prisma.funnelExecution.findFirst({
    where: { funnelId: funnel.id, contactPhone },
    orderBy: { startedAt: 'desc' }
  })

  if (!lastExecution) {
    return true
  }

  const status = (lastExecution.status || '').toLowerCase()

  if (status === 'active' || status === 'paused') {
    return false
  }

  if (status === 'failed' || status === 'cancelled') {
    return true
  }

  if (!funnel.preventRepeat) {
    return true
  }

  const cooldownDays = funnel.repeatCooldownDays ?? 0
  if (cooldownDays <= 0) {
    return false
  }

  const referenceDate = lastExecution.completedAt ?? lastExecution.startedAt
  if (!referenceDate) {
    return true
  }

  const diffMs = Date.now() - referenceDate.getTime()
  return diffMs >= cooldownDays * 24 * 60 * 60 * 1000
}

const finalizeAutomationExecution = async (
  executionId: string,
  conversationId: string,
  status: 'completed' | 'failed' | 'cancelled'
) => {
  try {
    await prisma.funnelExecution.update({
      where: { id: executionId },
      data: {
        status,
        currentStepId: null,
        lastStepAt: new Date(),
        completedAt: status === 'completed' ? new Date() : undefined
      }
    })
  } catch (error) {
    console.error('Failed to update funnel execution status:', error)
  }

  try {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'active' }
    })
  } catch (error) {
    console.error('Failed to reset conversation status after automation:', error)
  }
}

async function triggerAutomationByName(
  automationName: string | undefined,
  context: AutomationRuntimeContext
) {
  if (!automationName) {
    return
  }

  const trimmedName = automationName.trim()
  if (!trimmedName) {
    return
  }

  const nextFunnel = (await prisma.automationFunnel.findFirst({
    where: {
      agentId: context.integration.agentId,
      isActive: true,
      name: {
        equals: trimmedName,
        mode: 'insensitive'
      }
    },
    include: {
      steps: {
        orderBy: { stepNumber: 'asc' },
        include: { mediaFile: true }
      },
      executions: {
        orderBy: { lastStepAt: 'desc' },
        take: 1
      }
    }
  })) as AutomationFunnelWithRelations | null

  if (!nextFunnel) {
    console.warn(`Automation '${trimmedName}' not found for agent ${context.integration.agentId}`)
    return
  }

  if (context.visitedAutomations.has(nextFunnel.id)) {
    console.warn('Detected potential automation loop. Skipping additional trigger.')
    return
  }

  await startAutomationExecution(nextFunnel, {
    integration: context.integration,
    conversationId: context.conversationId,
    phone: context.phone,
    messageText: context.messageText,
    triggerMessageId: context.triggerMessageId,
    contextText: context.contextText,
    visitedAutomations: context.visitedAutomations
  })
}

function scheduleAutomationStep(
  funnel: AutomationFunnelWithRelations,
  executionId: string,
  step: AutomationFunnelWithRelations['steps'][number],
  context: AutomationRuntimeContext,
  delaySeconds: number
) {
  const waitMs = Math.max(Math.round((delaySeconds ?? 0) * 1000), 0)
  const jobKey = automationExecutionJobKey(executionId, step.id)

  delayedJobScheduler.schedule(jobKey, waitMs, async () => {
    await processAutomationStep(funnel, executionId, step, context)
  })
}

async function processAutomationStep(
  funnel: AutomationFunnelWithRelations,
  executionId: string,
  step: AutomationFunnelWithRelations['steps'][number],
  context: AutomationRuntimeContext
) {
  try {
    context.stepVisitCount[step.id] = (context.stepVisitCount[step.id] ?? 0) + 1
    if (context.stepVisitCount[step.id] > 5) {
      console.warn('Aborting automation due to excessive step repetitions.')
      await finalizeAutomationExecution(executionId, context.conversationId, 'failed')
      return
    }

    await prisma.funnelExecution.update({
      where: { id: executionId },
      data: {
        currentStepId: step.id,
        lastStepAt: new Date()
      }
    })

    let nextStep: AutomationFunnelWithRelations['steps'][number] | null = getNextSequentialStep(
      funnel,
      step
    )

    switch (step.stepType) {
      case 'text': {
        const text = (step.textContent || '').trim()
        if (text) {
          await sendWhatsappMessage(
            context.evolutionConfig,
            context.integration.instanceName,
            context.phone,
            text,
            0
          )

          await registerMessage(context.conversationId, {
            content: text,
            isFromUser: false,
            processedBy: 'system'
          })
        }
        break
      }
      case 'image':
      case 'audio':
      case 'video':
      case 'document': {
        const label = (step.assetLabel || step.caption || step.mediaFile?.originalName || `Conteúdo ${step.stepType}`).trim()
        const assetUrl = (step.mediaFile
          ? buildPublicUrl(step.mediaFile.cloudStoragePath)
          : step.assetUrl || '').trim()

        if (!assetUrl) {
          const missingMessage = `Falha: ${label} (arquivo não encontrado)`
          await registerMessage(context.conversationId, {
            content: missingMessage,
            isFromUser: false,
            processedBy: 'system'
          })
          break
        }

        try {
          await sendWhatsappMedia(
            context.evolutionConfig,
            context.integration.instanceName,
            context.phone,
            {
              type: step.stepType as 'image' | 'audio' | 'video' | 'document',
              fileName: step.mediaFile?.originalName || label || `arquivo-${Date.now()}`,
              url: assetUrl,
              caption: label,
              mimeType: step.mediaFile?.mimeType || null,
              delayMs: 0,
              storageKey: step.mediaFile?.cloudStoragePath || null
            }
          )

          await registerMessage(context.conversationId, {
            content: `[${step.stepType}] ${label}`,
            isFromUser: false,
            processedBy: 'system',
            messageType: step.stepType,
            mediaUrl: assetUrl
          })
        } catch (error) {
          console.error('Failed to send media via Evolution API, falling back to link', error)
          const fallbackMessage = assetUrl ? `${label}: ${assetUrl}` : label
          await sendWhatsappMessage(
            context.evolutionConfig,
            context.integration.instanceName,
            context.phone,
            fallbackMessage,
            0
          )

          await registerMessage(context.conversationId, {
            content: fallbackMessage,
            isFromUser: false,
            processedBy: 'system'
          })
        }
        break
      }
      case 'pause': {
        // Pause handled by scheduled delay; nothing to send.
        break
      }
      case 'condition': {
        const condition = parseConditionFromJson(step.conditions)
        if (condition) {
          const phraseNormalized = normalizeTextForMatch(condition.phrase || '')
          const messageNormalized = normalizeTextForMatch(context.messageText)
          const matched = phraseNormalized
            ? messageNormalized.includes(phraseNormalized)
            : false

          const action: SerializedBranchAction = matched
            ? condition.actionTrue
            : condition.actionFalse

          switch (action.strategy) {
            case 'jump-step': {
              const target = findStepById(funnel, action.stepId)
              if (target) {
                nextStep = target
              }
              break
            }
            case 'jump-automation': {
              await finalizeAutomationExecution(executionId, context.conversationId, 'completed')
              await triggerAutomationByName(action.automationName, context)
              return
            }
            case 'end': {
              await finalizeAutomationExecution(executionId, context.conversationId, 'completed')
              return
            }
            default:
              break
          }
        }
        break
      }
      default:
        break
    }

    if (!nextStep) {
      await finalizeAutomationExecution(executionId, context.conversationId, 'completed')
      return
    }

    const nextDelay = getStepDelaySeconds(funnel, nextStep)
    scheduleAutomationStep(funnel, executionId, nextStep, context, nextDelay)
  } catch (error) {
    console.error('Automation step processing error:', error)
    await finalizeAutomationExecution(executionId, context.conversationId, 'failed')
  }
}

async function startAutomationExecution(
  funnel: AutomationFunnelWithRelations,
  context: AutomationTriggerContext
) {
  if (context.integration?.agent?.isActive === false) {
    console.info('Skipping automation execution for inactive agent', context.integration.agentId)
    return false
  }

  if (context.visitedAutomations.has(funnel.id)) {
    console.warn('Automation already executed in this chain. Skipping to avoid loops.')
    return false
  }

  const evolutionConfig = await resolveEvolutionConfig()
  if (!evolutionConfig) {
    console.error('Evolution API configuration missing for automation execution.')
    return false
  }

  context.visitedAutomations.add(funnel.id)

  if (!funnel.steps.length) {
    await prisma.funnelExecution.create({
      data: {
        funnelId: funnel.id,
        contactPhone: context.phone,
        status: 'completed',
        currentStepId: null,
        executionData: {
          triggerMessageId: context.triggerMessageId,
          triggerMessage: context.messageText,
          completedWithoutSteps: true
        }
      }
    })

    await finalizeAutomationExecution(
      (await prisma.funnelExecution.findFirst({
        where: { funnelId: funnel.id, contactPhone: context.phone },
        orderBy: { startedAt: 'desc' },
        select: { id: true }
      }))?.id || '',
      context.conversationId,
      'completed'
    ).catch(() => undefined)

    return true
  }

  const execution = await prisma.funnelExecution.create({
    data: {
      funnelId: funnel.id,
      contactPhone: context.phone,
      status: 'active',
      currentStepId: funnel.steps[0]?.id ?? null,
      executionData: {
        triggerMessageId: context.triggerMessageId,
        triggerMessage: context.messageText,
        contextSnapshot: context.contextText
      }
    }
  })

  const runtimeContext: AutomationRuntimeContext = {
    ...context,
    evolutionConfig,
    stepVisitCount: {}
  }

  const firstStep = funnel.steps[0]
  if (!firstStep) {
    await finalizeAutomationExecution(execution.id, context.conversationId, 'completed')
    return true
  }

  scheduleAutomationStep(
    funnel,
    execution.id,
    firstStep,
    runtimeContext,
    getStepDelaySeconds(funnel, firstStep)
  )

  return true
}

async function evaluateAutomationFunnels({
  integration,
  phone,
  messageText,
  contextText
}: {
  integration: any
  phone: string
  messageText: string
  contextText: string
}): Promise<FunnelRoutingDecision> {
  const funnels = (await prisma.automationFunnel.findMany({
    where: {
      agentId: integration.agentId,
      isActive: true
    },
    orderBy: { createdAt: 'asc' },
    include: {
      steps: {
        orderBy: { stepNumber: 'asc' },
        include: { mediaFile: true }
      },
      executions: {
        orderBy: { lastStepAt: 'desc' },
        take: 1
      }
    }
  })) as AutomationFunnelWithRelations[]

  if (!funnels.length) {
    return { bestCandidate: null, selectedCandidate: null }
  }

  const normalizedMessage = normalizeTextForMatch(messageText || '')
  const normalizedContext = normalizeTextForMatch(contextText || '')
  const decision: FunnelRoutingDecision = { bestCandidate: null, selectedCandidate: null }
  const candidateMap = new Map<string, FunnelCandidate>()
  const classifierSummaries: AutomationClassifierFunnelSummary[] = []
  const eligibleFunnels: AutomationFunnelWithRelations[] = []

  for (const funnel of funnels) {
    if (!funnel.steps.length || !funnel.contextPrompt) {
      continue
    }

    const allowed = await canTriggerFunnelForContact(funnel, phone)
    if (!allowed) {
      continue
    }

    const normalizedPrompt = normalizeTextForMatch(funnel.contextPrompt)

    const messageScore = computeContextSimilarity(messageText, funnel.contextPrompt)
    const contextScore = normalizedContext
      ? computeContextSimilarity(contextText, funnel.contextPrompt)
      : 0

    let score = messageScore
    let scoreSource: 'latest' | 'context' = 'latest'
    if (contextScore > score) {
      score = contextScore
      scoreSource = 'context'
    }

    const messageSharedTokens = countSharedSignificantTokens(normalizedMessage, normalizedPrompt)
    const contextSharedTokens = normalizedContext
      ? countSharedSignificantTokens(normalizedContext, normalizedPrompt)
      : 0
    const sharedTokens = scoreSource === 'context' ? contextSharedTokens : messageSharedTokens

    const candidate: FunnelCandidate = {
      funnel,
      score,
      triggerMatches: [],
      sharedSignificantTokens: sharedTokens,
      shouldTrigger: false,
      triggerType: null,
      reason: `${scoreSource === 'context' ? 'score contexto' : 'score'} ${(score / 100).toFixed(2)}`
    }

    candidateMap.set(funnel.id, candidate)
    eligibleFunnels.push(funnel)
    classifierSummaries.push({
      id: funnel.id,
      name: funnel.name,
      description: funnel.contextPrompt,
      minSimilarity: funnel.minSimilarity,
      lexicalScore: candidate.score,
      lexicalReason: candidate.reason
    })

    if (isPreferredFunnelCandidate(decision.bestCandidate, candidate)) {
      decision.bestCandidate = candidate
    }
  }

  if (!eligibleFunnels.length) {
    return decision
  }

  let classifierResult: AutomationClassifierResult | null = null

  try {
    classifierResult = await classifyAutomationIntent({
      agent: integration.agent,
      funnels: eligibleFunnels,
      latestMessage: messageText,
      contextText,
      summaries: classifierSummaries
    })
  } catch (error) {
    console.error('Automation classifier invocation failed:', error)
  }

  if (
    classifierResult &&
    classifierResult.route === 'FUNIL' &&
    classifierResult.funnelId
  ) {
    console.info(
      `automation-classifier route=${classifierResult.route} funnel=${classifierResult.funnelId} confidence=${
        classifierResult.confidence ?? 'null'
      } motivo=${classifierResult.reason}`
    )
    const candidate = candidateMap.get(classifierResult.funnelId)
    if (candidate) {
      const rawConfidence =
        typeof classifierResult.confidence === 'number'
          ? Math.max(0, Math.min(1, classifierResult.confidence))
          : null
      const confidenceScore = rawConfidence !== null ? Math.round(rawConfidence * 100) : null
      const threshold = candidate.funnel.minSimilarity ?? FUNNEL_DIRECT_THRESHOLD

      if (confidenceScore === null || confidenceScore >= threshold) {
        candidate.shouldTrigger = true
        candidate.triggerType = 'classifier'
        candidate.score = confidenceScore ?? candidate.score
        candidate.reason =
          confidenceScore !== null
            ? `classificador ${(confidenceScore / 100).toFixed(2)}: ${classifierResult.reason}`
            : `classificador: ${classifierResult.reason}`

        decision.selectedCandidate = candidate
      } else {
        candidate.reason = `classificador ${(confidenceScore / 100).toFixed(2)} abaixo do limiar ${(threshold / 100).toFixed(2)}`
      }
    }
  } else if (classifierResult) {
    console.info(
      `automation-classifier route=${classifierResult.route} funnel=${classifierResult.funnelId} confidence=${
        classifierResult.confidence ?? 'null'
      } motivo=${classifierResult.reason}`
    )
  }

  return decision
}

const getMentorConfigForAgent = async (agentId: string): Promise<MentorConfigResolved | null> => {
  const config = await prisma.mentorConfig.findUnique({
    where: { agentId }
  })

  if (!config) {
    return null
  }

  return {
    isEnabled: Boolean(config.isEnabled),
    mentorPhone: normalizePhone(config.mentorPhone),
    timeoutMinutes: config.timeoutMinutes ?? 5,
    topics: toStringList(config.alwaysConsultTopics),
    uncertainty: toStringList(config.uncertaintyWords),
    timeoutMessage: (config.timeoutMessage || '').trim()
  }
}

const shouldConsultSpecialist = (
  messageText: string,
  config: MentorConfigResolved,
  classifierConfidence?: number | null
) =>
  evaluateMentorDecision({
    messageText,
    mentorConfig: config,
    classifierConfidence
  }).shouldEscalate

const buildMentorKnowledgeSection = async (agentId: string) => {
  const escalations = await prisma.mentorEscalation.findMany({
    where: {
      agentId,
      status: 'responded',
      mentorAnswer: { not: null }
    },
    orderBy: { respondedAt: 'desc' },
    take: 5
  })

  const entries = escalations
    .map((entry) => (entry.mentorAnswer || '').trim())
    .filter(Boolean)

  if (!entries.length) {
    return ''
  }

  return `Informações fornecidas por especialistas confiáveis:\n${entries
    .map((item) => `- ${item}`)
    .join('\n')}\nPriorize essas orientações quando pertinente.`
}

const processMentorTimeouts = async (
  mentorConfig: MentorConfigResolved,
  integration: any
) => {
  const overdue = await prisma.mentorEscalation.findMany({
    where: {
      agentId: integration.agentId,
      status: 'pending',
      timeoutAt: { lte: new Date() }
    }
  })

  if (!overdue.length) {
    return
  }

  const shouldSendMessage = Boolean(mentorConfig.timeoutMessage)
  const evolutionConfig = shouldSendMessage ? await resolveEvolutionConfig() : null

  if (shouldSendMessage && !evolutionConfig) {
    console.error('Evolution API configuration missing for mentor timeout handling.')
  }

  for (const escalation of overdue) {
    try {
      if (shouldSendMessage && evolutionConfig) {
        await sendWhatsappMessage(
          evolutionConfig,
          integration.instanceName,
          escalation.customerPhone,
          mentorConfig.timeoutMessage!,
          integration.agent.typingSimulation ? integration.agent.responseDelay ?? 2000 : 0
        )

        await registerMessage(escalation.conversationId, {
          content: mentorConfig.timeoutMessage!,
          isFromUser: false,
          processedBy: 'mentor'
        })
      }

      await prisma.mentorEscalation.update({
        where: { id: escalation.id },
        data: {
          status: 'timed_out',
          respondedAt: new Date(),
          updatedAt: new Date()
        }
      })

      delayedJobScheduler.cancel(mentorTimeoutJobKey(escalation.id))

      await prisma.conversation.update({
        where: { id: escalation.conversationId },
        data: { status: 'active' }
      })
    } catch (error) {
      console.error('Failed to process mentor timeout:', error)
    }
  }
}

type MentorTimeoutScheduleInput = {
  id: string
  timeoutAt: Date | null
}

const scheduleMentorTimeoutCheck = ({ id, timeoutAt }: MentorTimeoutScheduleInput) => {
  const jobKey = mentorTimeoutJobKey(id)

  if (!timeoutAt) {
    delayedJobScheduler.cancel(jobKey)
    return
  }

  const waitMs = timeoutAt.getTime() - Date.now()

  delayedJobScheduler.schedule(jobKey, Math.max(waitMs, 0), async () => {
    try {
      const escalation = await prisma.mentorEscalation.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          agentId: true,
          conversationId: true,
          customerPhone: true
        }
      })

      if (!escalation || escalation.status !== 'pending') {
        return
      }

      const [mentorConfig, integration] = await Promise.all([
        getMentorConfigForAgent(escalation.agentId),
        prisma.whatsAppIntegration.findFirst({
          where: { agentId: escalation.agentId },
          include: { agent: true }
        })
      ])

      if (!mentorConfig || !integration?.agent) {
        console.warn(
          `Skipping mentor timeout messaging; missing configuration or integration for agent ${escalation.agentId}.`
        )

        await prisma.mentorEscalation.update({
          where: { id: escalation.id },
          data: {
            status: 'timed_out',
            respondedAt: new Date(),
            updatedAt: new Date()
          }
        })

        if (escalation.conversationId) {
          await prisma.conversation.update({
            where: { id: escalation.conversationId },
            data: { status: 'active' }
          })
        }

        delayedJobScheduler.cancel(jobKey)
        return
      }

      await processMentorTimeouts(mentorConfig, integration)
    } catch (error) {
      console.error(`Scheduled mentor timeout handler failed for escalation ${id}:`, error)
    }
  })
}

const mentorTimeoutSchedulerState = globalThis as typeof globalThis & {
  __mentorTimeoutsInitialized?: boolean
}

const initializeMentorTimeoutScheduler = () => {
  if (mentorTimeoutSchedulerState.__mentorTimeoutsInitialized) {
    return
  }

  mentorTimeoutSchedulerState.__mentorTimeoutsInitialized = true

  Promise.resolve()
    .then(async () => {
      const pendingEscalations = await prisma.mentorEscalation.findMany({
        where: {
          status: 'pending',
          timeoutAt: { not: null }
        },
        select: {
          id: true,
          agentId: true,
          timeoutAt: true
        }
      })

      for (const escalation of pendingEscalations) {
        scheduleMentorTimeoutCheck(escalation)
      }
    })
    .catch((error) => {
      console.error('Failed to initialize mentor timeout scheduler:', error)
    })
}

initializeMentorTimeoutScheduler()

const handleMentorResponse = async (
  integration: any,
  mentorConfig: MentorConfigResolved | null,
  messageText: string,
  senderPhone: string | null
) => {
  if (!mentorConfig?.mentorPhone) {
    return false
  }

  if (!senderPhone || senderPhone !== mentorConfig.mentorPhone) {
    return false
  }

  const escalation = await prisma.mentorEscalation.findFirst({
    where: {
      agentId: integration.agentId,
      mentorPhone: senderPhone,
      status: 'pending'
    },
    orderBy: { requestedAt: 'desc' }
  })

  if (!escalation) {
    return false
  }

  const evolutionConfig = await resolveEvolutionConfig()

  if (!evolutionConfig) {
    console.error('Evolution API configuration missing for mentor response handling.')
    return true
  }

  const trimmedAnswer = messageText.trim()

  if (!trimmedAnswer) {
    return true
  }

  try {
    await sendWhatsappMessage(
      evolutionConfig,
      integration.instanceName,
      escalation.customerPhone,
      trimmedAnswer,
      integration.agent.typingSimulation ? integration.agent.responseDelay ?? 2000 : 0
    )

    const savedMessage = await registerMessage(escalation.conversationId, {
      content: trimmedAnswer,
      isFromUser: false,
      processedBy: 'mentor'
    })

    const lastUserMessage = escalation.lastUserMessageId
      ? await prisma.message.findUnique({
          where: { id: escalation.lastUserMessageId },
          select: { content: true }
        })
      : null

    const responseTime = new Date()
    const question = lastUserMessage?.content?.trim() || 'Pergunta não registrada'

    await prisma.mentorEscalation.update({
      where: { id: escalation.id },
      data: {
        status: 'responded',
        mentorReplyMessageId: savedMessage.id,
        mentorAnswer: trimmedAnswer,
        respondedAt: responseTime,
        knowledgeApplied: true,
        updatedAt: responseTime
      }
    })

    try {
      await appendMentorContextEntry(integration.agentId, {
        question,
        answer: trimmedAnswer,
        respondedAt: responseTime.toISOString(),
        escalationId: escalation.id,
        conversationId: escalation.conversationId,
        customerPhone: escalation.customerPhone
      })
    } catch (error) {
      console.error('Failed to persist mentor context entry:', error)
    }

    delayedJobScheduler.cancel(mentorTimeoutJobKey(escalation.id))

    await prisma.conversation.update({
      where: { id: escalation.conversationId },
      data: { status: 'active' }
    })
  } catch (error) {
    console.error('Failed to forward mentor response:', error)
  }

  return true
}

type MentorEscalationResult =
  | { handled: true; outcome: 'update' | 'escalated'; reason: string }
  | { handled: false }

const handleMentorEscalation = async (
  mentorConfig: MentorConfigResolved | null,
  integration: any,
  conversation: any,
  messageText: string,
  storedUserMessage: any,
  phone: string,
  options?: { precomputedDecision?: MentorRoutingDecision }
): Promise<MentorEscalationResult> => {
  if (!mentorConfig) {
    return { handled: false }
  }

  await processMentorTimeouts(mentorConfig, integration)

  if (!mentorConfig.isEnabled || !mentorConfig.mentorPhone) {
    return { handled: false }
  }

  const pendingEscalation = await prisma.mentorEscalation.findFirst({
    where: {
      conversationId: conversation.id,
      status: 'pending'
    },
    orderBy: { requestedAt: 'desc' }
  })

  if (pendingEscalation) {
    try {
      const evolutionConfig = await resolveEvolutionConfig()

      if (!evolutionConfig) {
        console.error('Evolution API configuration missing for mentor update.')
        return { handled: true, outcome: 'update', reason: 'mentor-update:missing-config' }
      }

      const updateMessage = `🔄 Atualização do contato ${phone}:\n${messageText}`
      await sendWhatsappMessage(
        evolutionConfig,
        integration.instanceName,
        mentorConfig.mentorPhone,
        updateMessage,
        0
      )

      const updatedEscalation = await prisma.mentorEscalation.update({
        where: { id: pendingEscalation.id },
        data: {
          lastUserMessageId: storedUserMessage.id,
          timeoutAt: new Date(Date.now() + mentorConfig.timeoutMinutes * 60000),
          updatedAt: new Date()
        },
        select: {
          id: true,
          agentId: true,
          timeoutAt: true
        }
      })

      scheduleMentorTimeoutCheck(updatedEscalation)
    } catch (error) {
      console.error('Failed to send mentor update:', error)
    }

    return { handled: true, outcome: 'update', reason: 'mentor-update:pending-escalation' }
  }

  const decision = options?.precomputedDecision
  const shouldEscalate = decision
    ? decision.shouldEscalate
    : shouldConsultSpecialist(messageText, mentorConfig, decision?.confidence)

  if (!shouldEscalate) {
    return { handled: false }
  }

  try {
    const evolutionConfig = await resolveEvolutionConfig()

    if (!evolutionConfig) {
      console.error('Evolution API configuration missing for mentor escalation.')
      return { handled: false }
    }

    const consultReason = decision?.reason ? `\nMotivo: ${decision.reason}` : ''
    const consultMessage = `🧠 Consulta especializada - ${integration.agent.name}\nCliente: +${phone}\nMensagem: ${messageText}${consultReason}\n\nResponda com a orientação a ser enviada ao cliente.`

    await sendWhatsappMessage(
      evolutionConfig,
      integration.instanceName,
      mentorConfig.mentorPhone,
      consultMessage,
      0
    )

    const escalation = await prisma.mentorEscalation.create({
      data: {
        agentId: integration.agentId,
        conversationId: conversation.id,
        customerPhone: phone,
        mentorPhone: mentorConfig.mentorPhone,
        status: 'pending',
        lastUserMessageId: storedUserMessage.id,
        timeoutAt: new Date(Date.now() + mentorConfig.timeoutMinutes * 60000)
      },
      select: {
        id: true,
        agentId: true,
        timeoutAt: true
      }
    })

    scheduleMentorTimeoutCheck(escalation)

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'handoff' }
    })

    return {
      handled: true,
      outcome: 'escalated',
      reason: decision?.reason || 'mentor:escalation'
    }
  } catch (error) {
    console.error('Failed to escalate conversation to mentor:', error)
  }

  return { handled: true, outcome: 'escalated', reason: 'mentor:escalation-error' }
}

const findBreakIndex = (text: string, limit: number) => {
  const clampLimit = Math.min(limit, text.length)
  const windowSize = Math.min(80, clampLimit)
  const windowStart = Math.max(0, clampLimit - windowSize)
  const slice = text.slice(0, clampLimit)

  // Prefer explicit line breaks
  const newlineIdx = slice.lastIndexOf('\n')
  if (newlineIdx >= windowStart) {
    return newlineIdx + 1
  }

  const punctuationMarks = ['.', '!', '?', ';', '…']
  for (let i = clampLimit - 1; i >= windowStart; i -= 1) {
    const char = slice[i]
    if (punctuationMarks.includes(char)) {
      const nextChar = text[i + 1]
      if (!nextChar || nextChar === ' ' || nextChar === '\n') {
        return i + 1
      }
    }
  }

  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace >= windowStart) {
    return lastSpace + 1
  }

  const lastHyphen = slice.lastIndexOf('-')
  if (lastHyphen >= windowStart) {
    return lastHyphen + 1
  }

  return clampLimit
}

const splitReplyIntoBlocks = (
  reply: string,
  blockSize: number,
  maxBlocks: number
) => {
  if (blockSize <= 0) {
    return [reply.trim()]
  }

  const chunks: string[] = []
  let remaining = reply.trim()

  while (remaining.length > 0 && chunks.length < maxBlocks) {
    if (remaining.length <= blockSize) {
      chunks.push(remaining.trimEnd())
      remaining = ''
      break
    }

    let breakIndex = findBreakIndex(remaining, blockSize)
    if (breakIndex <= 0) {
      breakIndex = blockSize
    }

    let chunk = remaining.slice(0, breakIndex)
    if (!chunk.trim()) {
      chunk = remaining.slice(0, blockSize)
    }

    chunks.push(chunk.trimEnd())
    remaining = remaining.slice(chunk.length).trimStart()
  }

  if (remaining.length > 0) {
    if (chunks.length < maxBlocks) {
      chunks.push(remaining.trim())
    } else if (chunks.length > 0) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${remaining}`.trim()
    }
  }

  return chunks.filter((chunk) => chunk.length > 0)
}

const handleMessageUpsert = async (event: EvolutionWebhookEvent) => {
  if (!event?.instance || !event?.data) {
    console.warn('Webhook event missing instance or data')
    return
  }

  const integration = await prisma.whatsAppIntegration.findFirst({
    where: { instanceName: event.instance },
    include: {
      agent: true
    }
  })

  if (!integration?.agent) {
    console.warn(`No integration found for instance ${event.instance}`)
    return
  }

  const agentIsActive = integration.agent.isActive !== false

  const { data } = event

  if (data?.key?.fromMe) {
    return
  }

  if (data?.key?.id) {
    const existing = await prisma.message.findFirst({
      where: { whatsappMessageId: data.key.id }
    })

    if (existing) {
      console.info('Ignoring duplicate message', data.key.id)
      return
    }
  }

  const mentorConfig = await getMentorConfigForAgent(integration.agentId)

  const phone = sanitizePhone(data?.key?.remoteJid)
  if (!phone) {
    console.warn('Unable to derive phone number from JID', data?.key?.remoteJid)
    return
  }

  const messageText = extractMessageText(data?.message)
  if (!messageText) {
    console.warn('No text content found in message payload')
    return
  }

  if (await handleMentorResponse(integration, mentorConfig, messageText, phone)) {
    return
  }

  const conversation = await getConversation(integration.agentId, phone, data?.pushName)

  const storedUserMessage = await registerMessage(conversation.id, {
    content: messageText,
    whatsappMessageId: data?.key?.id || null,
    isFromUser: true,
    processedBy: 'user'
  })

  if (!agentIsActive) {
    logRoutingTelemetry({
      route: 'INATIVO',
      agentId: integration.agentId,
      phone,
      motivo: 'agente desativado',
      similaridade: null,
      gatilho: null
    })
    return
  }

  const mentorDecision: MentorRoutingDecision = mentorConfig
    ? evaluateMentorDecision({
        messageText,
        mentorConfig,
        classifierConfidence: storedUserMessage.confidence ?? null
      })
    : {
        shouldEscalate: false,
        reason: 'mentor indisponível',
        triggerLabel: null,
        confidence: null
      }

  const mentorResult = await handleMentorEscalation(
    mentorConfig,
    integration,
    conversation,
    messageText,
    storedUserMessage,
    phone,
    { precomputedDecision: mentorDecision }
  )

  if (mentorResult.handled) {
    logRoutingTelemetry({
      route: 'MENTOR',
      agentId: integration.agentId,
      phone,
      motivo: mentorResult.reason,
      similaridade: mentorDecision.confidence ?? null,
      gatilho: mentorDecision.triggerLabel
    })
    return
  }

  const automationContextWindow = Math.max(integration.agent.conversationMemory ?? 10, 5)
  const automationContextText = await buildAutomationContextText(
    conversation.id,
    automationContextWindow
  )

  const funnelDecision = await evaluateAutomationFunnels({
    integration,
    phone,
    messageText,
    contextText: automationContextText
  })

  const funnelCandidate = funnelDecision.selectedCandidate
  let funnelTriggerAttempted = false
  if (funnelCandidate) {
    funnelTriggerAttempted = true
    const triggered = await startAutomationExecution(funnelCandidate.funnel, {
      integration,
      conversationId: conversation.id,
      phone,
      messageText,
      triggerMessageId: storedUserMessage.id || null,
      contextText: automationContextText,
      visitedAutomations: new Set<string>()
    })

    if (triggered) {
      logRoutingTelemetry({
        route: 'FUNIL',
        agentId: integration.agentId,
        phone,
        motivo: funnelCandidate.reason,
        similaridade: funnelCandidate.score / 100,
        gatilho: funnelCandidate.triggerMatches[0] || funnelCandidate.triggerType || null
      })
      return
    }
  }

  const waitMs = integration.agent.sequentialWait ?? 0
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))

    const latestUserMessage = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        isFromUser: true
      },
      orderBy: { timestamp: 'desc' }
    })

    if (latestUserMessage && latestUserMessage.id !== storedUserMessage.id) {
      console.info('Sequential wait not elapsed; newer message detected. Skipping reply for now.')
      return
    }
  }

  const bestFunnelCandidate = funnelDecision.bestCandidate
  const aiMotivo = !bestFunnelCandidate
    ? 'resposta livre: sem correspondência'
    : funnelCandidate && funnelTriggerAttempted
    ? 'fallback: falha ao iniciar funil'
    : `resposta livre: ${bestFunnelCandidate.reason}`

  logRoutingTelemetry({
    route: 'IA',
    agentId: integration.agentId,
    phone,
    motivo: aiMotivo,
    similaridade: bestFunnelCandidate ? bestFunnelCandidate.score / 100 : null,
    gatilho: bestFunnelCandidate?.triggerMatches[0] || null
  })

  const memoryWindow = integration.agent.conversationMemory ?? 10
  let history: ChatHistoryMessage[] = await buildChatHistory(conversation.id, memoryWindow)

  if (conversation.memorySnapshot) {
    history = maybeAppendMemorySnapshot(history, conversation.memorySnapshot)
  }

  const mentorKnowledge = await buildMentorKnowledgeSection(integration.agentId)

  const reply = await generateAgentReply(integration.agent, history, mentorKnowledge)

  const evolutionConfig = await resolveEvolutionConfig()

  if (!evolutionConfig) {
    console.error('Evolution API configuration missing when trying to respond.')
    return
  }

  const blocks = splitReplyIntoBlocks(
    reply,
    integration.agent.blockSize ?? 200,
    integration.agent.maxBlocks ?? 3
  )

  const baseDelay = integration.agent.typingSimulation
    ? integration.agent.responseDelay ?? 2000
    : 0

  const pauseBetween = integration.agent.pauseBetweenBlocks ?? 1000

  const historyWithReply = [...history]

  for (let index = 0; index < blocks.length; index += 1) {
    const chunk = blocks[index]
    const delay = baseDelay + index * pauseBetween

    await sendWhatsappMessage(
      evolutionConfig,
      integration.instanceName,
      phone,
      chunk,
      delay
    )

    await registerMessage(conversation.id, {
      content: chunk,
      isFromUser: false,
      processedBy: 'agent'
    })

    historyWithReply.push({ role: 'assistant', content: chunk })
  }

  const snapshotWindow = Math.max(memoryWindow, 10)
  const snapshot = historyWithReply.slice(-snapshotWindow)

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      memorySnapshot: snapshot,
      conversationContext: {
        lastContactName: data?.pushName || null,
        lastInteractionAt: new Date().toISOString()
      },
      status: 'active'
    }
  })
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const base = url.origin
  return NextResponse.json({ status: 'ok', webhook: `${base}${WEBHOOK_PATH}` })
}

export async function POST(request: NextRequest) {
  try {
    const event: EvolutionWebhookEvent | EvolutionWebhookEvent[] = await request.json().catch(() => ({} as EvolutionWebhookEvent))

    const events = Array.isArray(event) ? event : [event]

    for (const singleEvent of events) {
      if (singleEvent?.event === 'messages.upsert') {
        try {
          await handleMessageUpsert(singleEvent)
        } catch (error) {
          console.error('messages.upsert handler error:', error)
        }
      } else {
        console.log('Unhandled Evolution event', singleEvent?.event)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing Evolution webhook:', error)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
}
