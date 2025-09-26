
import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/db'
import { verify } from 'jsonwebtoken'

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string
      role: string
      phone?: string
    }
  }

  interface User {
    id: string
    email: string
    name?: string
    role: string
    phone?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string
    phone?: string
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    // OTP-based authentication
    CredentialsProvider({
      id: 'otp-login',
      name: 'WhatsApp OTP',
      credentials: {
        token: { label: 'Token', type: 'text' }
      },
      async authorize(credentials) {
        if (!credentials?.token) {
          return null
        }

        try {
          // Verify JWT token from OTP verification
          const decoded = verify(credentials.token, process.env.NEXTAUTH_SECRET!) as any
          
          if (!decoded.sub) {
            return null
          }

          // Get user from database
          const user = await prisma.user.findUnique({
            where: { id: decoded.sub }
          })

          if (!user) {
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
            role: user.role,
            phone: user.phone || undefined,
          }
        } catch (error) {
          console.error('Token verification failed:', error)
          return null
        }
      }
    }),
    
    // Legacy credentials provider for development/fallback
    CredentialsProvider({
      id: 'credentials',
      name: 'Email/Password (Dev)',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })

        if (!user) {
          return null
        }

        // Simple password check for development
        const isPasswordValid = credentials.password === 'admin123' || credentials.password === 'johndoe123'

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name || undefined,
          role: user.role,
          phone: user.phone || undefined,
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.role = user.role
        token.phone = user.phone
        token.sub = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role
        session.user.phone = token.phone
      }
      return session
    },
  },
}
