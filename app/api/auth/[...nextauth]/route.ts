
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'
import { logger } from '@/lib/logger'

const handler = NextAuth({
  ...authOptions,
  events: {
    async signIn({ user, account, _profile, _isNewUser }) {
      logger.info('User signed in', { userId: user.id, email: user.email, provider: account?.provider })
    },
    async signOut({ token }) {
      logger.info('User signed out', { userId: token?.sub })
    },
    async createUser({ user }) {
      logger.info('User created', { userId: user.id, email: user.email })
    },
  },
  callbacks: {
    ...authOptions.callbacks,
    async jwt({ token, user, _account }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})

export { handler as GET, handler as POST }
