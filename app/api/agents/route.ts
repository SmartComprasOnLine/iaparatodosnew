
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

    return NextResponse.json(agents)
  } catch (error) {
    console.error('Error fetching agents:', error)
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

    const agent = await prisma.agent.create({
      data: {
        name: data.name.trim(),
        systemPrompt: data.systemPrompt || '',
        aiProvider: data.aiProvider || 'openai',
        apiKey: data.apiKey || null,
        model: data.model || 'gpt-4o-mini',
        temperature: data.temperature || 0.7,
        maxTokens: data.maxTokens || 1500,
        conversationMemory: data.conversationMemory || 10,
        clearMemoryPerContact: data.clearMemoryPerContact || false,
        rememberPreferences: data.rememberPreferences || true,
        typingSimulation: data.typingSimulation || true,
        responseDelay: data.responseDelay || 2000,
        sequentialWait: data.sequentialWait || 1000,
        blockSize: data.blockSize || 200,
        pauseBetweenBlocks: data.pauseBetweenBlocks || 1000,
        maxBlocks: data.maxBlocks || 3,
        userId: session.user.id,
      }
    })

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error creating agent:', error)
    
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

    const agent = await prisma.agent.update({
      where: {
        id: data.id,
        userId: session.user.id
      },
      data: {
        name: data.name,
        systemPrompt: data.systemPrompt,
        aiProvider: data.aiProvider,
        apiKey: data.apiKey,
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        conversationMemory: data.conversationMemory,
        clearMemoryPerContact: data.clearMemoryPerContact,
        rememberPreferences: data.rememberPreferences,
        typingSimulation: data.typingSimulation,
        responseDelay: data.responseDelay,
        sequentialWait: data.sequentialWait,
        blockSize: data.blockSize,
        pauseBetweenBlocks: data.pauseBetweenBlocks,
        maxBlocks: data.maxBlocks,
      }
    })

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error updating agent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
