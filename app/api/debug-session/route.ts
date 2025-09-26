
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    console.log('=== SESSION DEBUG ===')
    console.log('Full session object:', JSON.stringify(session, null, 2))
    
    if (!session) {
      return NextResponse.json({ 
        error: 'No session found',
        session: null
      })
    }

    if (!session.user) {
      return NextResponse.json({ 
        error: 'No user in session',
        session: session
      })
    }

    if (!session.user.id) {
      return NextResponse.json({ 
        error: 'No user ID in session',
        session: session
      })
    }

    // Check if user exists in database
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    return NextResponse.json({
      session: session,
      userExistsInDb: !!dbUser,
      dbUser: dbUser,
      sessionUserId: session.user.id
    })
    
  } catch (error) {
    console.error('Session debug error:', error)
    return NextResponse.json({ 
      error: 'Session debug failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
