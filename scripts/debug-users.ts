
import { prisma } from '../lib/db'

async function debugUsers() {
  try {
    console.log('=== Current Users in Database ===')
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true
      }
    })
    
    console.log('Users found:', users.length)
    users.forEach(user => {
      console.log(`ID: ${user.id}`)
      console.log(`Email: ${user.email}`)
      console.log(`Name: ${user.name}`)
      console.log(`Phone: ${user.phone}`)
      console.log(`Role: ${user.role}`)
      console.log(`Created: ${user.createdAt}`)
      console.log('---')
    })

    console.log('\n=== Current Agents in Database ===')
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        userId: true,
        createdAt: true
      }
    })
    
    console.log('Agents found:', agents.length)
    agents.forEach(agent => {
      console.log(`ID: ${agent.id}`)
      console.log(`Name: ${agent.name}`)
      console.log(`UserID: ${agent.userId}`)
      console.log(`Created: ${agent.createdAt}`)
      console.log('---')
    })

  } catch (error) {
    console.error('Debug error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

debugUsers()
