import { PrismaClient } from '@prisma/client'
import { createClient } from 'redis'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Redis client setup
const globalForRedis = globalThis as unknown as {
  redis: ReturnType<typeof createClient> | undefined
}

const redis = globalForRedis.redis ?? createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
})

redis.on('error', (err) => console.error('Redis Client Error', err))

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// Connect to Redis if not connected
if (!redis.isOpen) {
  redis.connect().catch(console.error)
}

export { prisma, redis }
