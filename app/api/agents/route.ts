
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const toNumber = (value: unknown, fallback: number) => {
  if (value === null || value === undefined) {
    return fallback
  }

  const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const secondsToMilliseconds = (value: number) => Math.max(0, Math.round(value * 1000))

const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

const normalizeTimezone = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed })
    return trimmed
  } catch (error) {
    return null
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agents = await prisma.agent.findMany({
      where: {
        userId: session.user.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    logger.info('Agents fetched successfully', { userId: session.user.id, count: agents.length })

    return NextResponse.json(agents)
  } catch (error) {
    logger.error('Error fetching agents', { error: error instanceof Error ? error.message : String(error), userId: session?.user?.id })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    // Detailed session validation
    if (!session) {
      return NextResponse.json({ 
        error: 'No active session. Please log in again.',
        code: 'NO_SESSION'
      }, { status: 401 })
    }

    if (!session.user) {
      return NextResponse.json({ 
        error: 'Invalid session data. Please log in again.',
        code: 'INVALID_SESSION'
      }, { status: 401 })
    }

    if (!session.user.id) {
      return NextResponse.json({ 
        error: 'Session missing user ID. Please log out and log in again.',
        code: 'MISSING_USER_ID'
      }, { status: 401 })
    }

    // Verify user exists in database
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!dbUser) {
      return NextResponse.json({ 
        error: 'User account not found. Please contact support.',
        code: 'USER_NOT_FOUND',
        sessionUserId: session.user.id
      }, { status: 404 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Agent name is required and must be a non-empty string',
        code: 'INVALID_NAME'
      }, { status: 400 })
    }

    const timezoneValue = normalizeTimezone(data.timezone ?? DEFAULT_TIMEZONE)

    if (!timezoneValue) {
      return NextResponse.json({
        error: 'Invalid timezone. Provide a valid IANA timezone like America/Sao_Paulo',
        code: 'INVALID_TIMEZONE'
      }, { status: 400 })
    }

    const isActive = data.isActive === undefined ? true : Boolean(data.isActive)

    const agent = await prisma.agent.create({
      data: {
        name: data.name.trim(),
        systemPrompt: data.systemPrompt || '',
        aiProvider: data.aiProvider || 'openai',
        apiKey: data.apiKey ? String(data.apiKey) : null,
        model: data.model || 'gpt-4o-mini',
        timezone: timezoneValue,
        temperature: toNumber(data.temperature, 0.7),
        maxTokens: Math.max(1, Math.round(toNumber(data.maxTokens, 1500))),
        conversationMemory: Math.max(1, Math.round(toNumber(data.conversationMemory, 10))),
        typingSimulation: data.typingSimulation === undefined ? true : Boolean(data.typingSimulation),
        responseDelay: secondsToMilliseconds(toNumber(data.responseDelay, 2)),
        sequentialWait: secondsToMilliseconds(toNumber(data.sequentialWait, 1)),
        blockSize: Math.max(50, Math.round(toNumber(data.blockSize, 200))),
        pauseBetweenBlocks: secondsToMilliseconds(toNumber(data.pauseBetweenBlocks, 1)),
        maxBlocks: Math.max(1, Math.round(toNumber(data.maxBlocks, 3))),
        isActive,
        userId: session.user.id,
      }
    })

    logger.info('Agent created successfully', { agentId: agent.id, userId: session.user.id, name: agent.name })

    return NextResponse.json(agent)
  } catch (error) {
    logger.error('Error creating agent', { error: error instanceof Error ? error.message : String(error), userId: session?.user?.id })
    
    // Handle specific Prisma errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2003') {
      return NextResponse.json({ 
        error: 'Database constraint violation. Your session may be invalid. Please log out and log in again.',
        code: 'FOREIGN_KEY_CONSTRAINT',
        details: 'User ID from session does not exist in database'
      }, { status: 400 })
    }

    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ 
        error: 'An agent with this configuration already exists.',
        code: 'UNIQUE_CONSTRAINT'
      }, { status: 409 })
    }

    return NextResponse.json({ 
      error: 'Failed to create agent. Please try again.',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    let timezoneToApply: string | undefined
    if (data.timezone !== undefined) {
      const normalized = normalizeTimezone(data.timezone)
      if (!normalized) {
        return NextResponse.json({
          error: 'Invalid timezone. Provide a valid IANA timezone like America/Sao_Paulo',
          code: 'INVALID_TIMEZONE'
        }, { status: 400 })
      }

      timezoneToApply = normalized
    }

    const updateData: any = {
      name: data.name,
      systemPrompt: data.systemPrompt,
      aiProvider: data.aiProvider,
      apiKey: data.apiKey ? String(data.apiKey) : null,
      model: data.model,
      temperature: toNumber(data.temperature, 0.7),
      maxTokens: Math.max(1, Math.round(toNumber(data.maxTokens, 1500))),
      conversationMemory: Math.max(1, Math.round(toNumber(data.conversationMemory, 10))),
      typingSimulation: data.typingSimulation === undefined ? true : Boolean(data.typingSimulation),
      responseDelay: secondsToMilliseconds(toNumber(data.responseDelay, 2)),
      sequentialWait: secondsToMilliseconds(toNumber(data.sequentialWait, 1)),
      blockSize: Math.max(50, Math.round(toNumber(data.blockSize, 200))),
      pauseBetweenBlocks: secondsToMilliseconds(toNumber(data.pauseBetweenBlocks, 1)),
      maxBlocks: Math.max(1, Math.round(toNumber(data.maxBlocks, 3))),
    }

    if (timezoneToApply) {
      updateData.timezone = timezoneToApply
    }

    if ('isActive' in data) {
      updateData.isActive = Boolean(data.isActive)
    }

    const agent = await prisma.agent.update({
      where: {
        id: data.id,
        userId: session.user.id
      },
      data: updateData
    })

    logger.info('Agent updated successfully', { agentId: agent.id, userId: session.user.id, name: agent.name })

    return NextResponse.json(agent)
  } catch (error) {
    logger.error('Error updating agent', { error: error instanceof Error ? error.message : String(error), userId: session?.user?.id })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
