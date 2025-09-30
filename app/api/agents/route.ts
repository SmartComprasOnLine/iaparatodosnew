
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { createAgentSchema, updateAgentSchema } from '@/lib/schemas'
import { validateRequest } from '@/lib/validation'
import { getOrSetCache, invalidateCacheKey } from '@/lib/cache'

export const dynamic = 'force-dynamic'

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
  let session: any = null
  try {
    session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cacheKey = `agents:user:${session.user.id}`

    const agents = await getOrSetCache(
      cacheKey,
      5 * 60 * 1000, // 5 minutes TTL
      async () => {
        return await prisma.agent.findMany({
          where: {
            userId: session.user.id
          },
          include: {
            whatsappIntegrations: {
              select: {
                id: true,
                status: true,
                phoneNumber: true,
                lastConnection: true,
              }
            },
            _count: {
              select: {
                conversations: true,
                followUpRules: true,
                automationFunnels: true,
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
      }
    )

    logger.info('Agents fetched successfully', { userId: session.user.id, count: agents.length })

    return NextResponse.json(agents)
  } catch (error) {
    logger.error('Error fetching agents', { error: error instanceof Error ? error.message : String(error), userId: session?.user?.id })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = validateRequest(createAgentSchema, async (validatedData, _request) => {
  let session: any = null
  try {
    session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const timezoneValue = normalizeTimezone(validatedData.timezone ?? DEFAULT_TIMEZONE)

    if (!timezoneValue) {
      return NextResponse.json({
        error: 'Invalid timezone. Provide a valid IANA timezone like America/Sao_Paulo',
        code: 'INVALID_TIMEZONE'
      }, { status: 400 })
    }

    const agent = await prisma.agent.create({
      data: {
        name: validatedData.name.trim(),
        systemPrompt: validatedData.systemPrompt || '',
        aiProvider: validatedData.aiProvider,
        apiKey: validatedData.apiKey ? String(validatedData.apiKey) : null,
        model: validatedData.model,
        timezone: timezoneValue,
        temperature: validatedData.temperature,
        maxTokens: validatedData.maxTokens,
        conversationMemory: validatedData.conversationMemory,
        typingSimulation: validatedData.typingSimulation,
        responseDelay: secondsToMilliseconds(validatedData.responseDelay ?? 2),
        sequentialWait: secondsToMilliseconds(validatedData.sequentialWait ?? 1),
        blockSize: validatedData.blockSize,
        pauseBetweenBlocks: secondsToMilliseconds(validatedData.pauseBetweenBlocks ?? 1),
        maxBlocks: validatedData.maxBlocks,
        isActive: validatedData.isActive,
        userId: session.user.id,
      }
    })

    // Invalidate cache for this user's agents
    await invalidateCacheKey(`agents:user:${session.user.id}`)

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
})

export const PUT = validateRequest(updateAgentSchema, async (validatedData, _request) => {
  let session: any = null
  try {
    session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let timezoneToApply: string | undefined
    if (validatedData.timezone !== undefined) {
      const normalized = normalizeTimezone(validatedData.timezone)
      if (!normalized) {
        return NextResponse.json({
          error: 'Invalid timezone. Provide a valid IANA timezone like America/Sao_Paulo',
          code: 'INVALID_TIMEZONE'
        }, { status: 400 })
      }

      timezoneToApply = normalized
    }

    const updateData: any = {
      name: validatedData.name,
      systemPrompt: validatedData.systemPrompt,
      aiProvider: validatedData.aiProvider,
      apiKey: validatedData.apiKey ? String(validatedData.apiKey) : null,
      model: validatedData.model,
      temperature: validatedData.temperature,
      maxTokens: validatedData.maxTokens,
      conversationMemory: validatedData.conversationMemory,
      typingSimulation: validatedData.typingSimulation,
      responseDelay: secondsToMilliseconds(validatedData.responseDelay ?? 2),
      sequentialWait: secondsToMilliseconds(validatedData.sequentialWait ?? 1),
      blockSize: validatedData.blockSize,
      pauseBetweenBlocks: secondsToMilliseconds(validatedData.pauseBetweenBlocks ?? 1),
      maxBlocks: validatedData.maxBlocks,
    }

    if (timezoneToApply) {
      updateData.timezone = timezoneToApply
    }

    if (validatedData.isActive !== undefined) {
      updateData.isActive = validatedData.isActive
    }

    const agent = await prisma.agent.update({
      where: {
        id: validatedData.id,
        userId: session.user.id
      },
      data: updateData
    })

    // Invalidate cache for this user's agents
    await invalidateCacheKey(`agents:user:${session.user.id}`)

    logger.info('Agent updated successfully', { agentId: agent.id, userId: session.user.id, name: agent.name })

    return NextResponse.json(agent)
  } catch (error) {
    logger.error('Error updating agent', { error: error instanceof Error ? error.message : String(error), userId: session?.user?.id })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
