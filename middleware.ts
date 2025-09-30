import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Simple in-memory rate limiting store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export function middleware(request: NextRequest) {
  // Apply rate limiting to API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const windowMs = 15 * 60 * 1000 // 15 minutes
    const maxRequests = 100

    const existing = rateLimitStore.get(ip)

    if (!existing || now > existing.resetTime) {
      // Reset or new entry
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs })
    } else if (existing.count >= maxRequests) {
      // Rate limit exceeded
      return new NextResponse('Too many requests from this IP, please try again later.', {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((existing.resetTime - now) / 1000).toString(),
        },
      })
    } else {
      // Increment count
      existing.count++
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
