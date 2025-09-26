
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@whatsapp.com' },
    update: {},
    create: {
      email: 'admin@whatsapp.com',
      name: 'Administrador',
      phone: '+5511999999999',
      role: 'admin',
    }
  })

  console.log('✅ Admin user created:', adminUser.email)

  // Create test user
  const testUser = await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      name: 'John Doe',
      phone: '+5511888888888',
      role: 'admin',
    }
  })

  console.log('✅ Test user created:', testUser.email)

  // Create sample agent for admin
  const existingAgent = await prisma.agent.findFirst({
    where: {
      userId: adminUser.id,
      name: 'Agente de Vendas'
    }
  })

  const sampleAgent = existingAgent || await prisma.agent.create({
    data: {
      name: 'Agente de Vendas',
      userId: adminUser.id,
      systemPrompt: `Você é um assistente inteligente especializado em vendas e atendimento ao cliente via WhatsApp. 

Sua personalidade:
- Profissional, mas amigável e acessível
- Proativo em ajudar e resolver problemas
- Conhece bem os produtos/serviços da empresa
- Sempre busca entender as necessidades do cliente

Diretrizes de comportamento:
- Responda de forma clara e objetiva
- Use emojis moderadamente para humanizar a conversa
- Faça perguntas qualificadoras para entender melhor o cliente
- Ofereça soluções adequadas ao perfil do cliente
- Seja paciente com dúvidas e objeções
- Sempre finalize com uma chamada para ação

Limitações:
- Não forneça informações que não tem certeza
- Encaminhe para humano em casos complexos
- Não negocie preços sem autorização
- Mantenha sempre o foco profissional`,
      aiProvider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1500,
      conversationMemory: 15,
      rememberPreferences: true,
      typingSimulation: true,
      responseDelay: 2500,
      sequentialWait: 1500,
      blockSize: 180,
      pauseBetweenBlocks: 1200,
      maxBlocks: 4,
      isActive: true,
    }
  })

  console.log('✅ Sample agent created:', sampleAgent.name)

  // Create sample WhatsApp integration for the agent
  await prisma.whatsAppIntegration.upsert({
    where: { agentId: sampleAgent.id },
    update: {},
    create: {
      agentId: sampleAgent.id,
      userId: testUser.id,
      instanceName: 'vendas-bot',
      status: 'disconnected',
    }
  })

  console.log('✅ WhatsApp integration created')

  // Create sample access rules
  await prisma.accessRule.createMany({
    data: [
      {
        agentId: sampleAgent.id,
        type: 'whitelist',
        value: '+5511*',
        notes: 'São Paulo region',
        isActive: true,
      },
      {
        agentId: sampleAgent.id,
        type: 'blacklist',
        value: '+5511555555555',
        notes: 'Spam number',
        isActive: true,
      }
    ],
    skipDuplicates: true,
  })

  console.log('✅ Sample access rules created')

  // Create handoff configuration
  await prisma.handoffConfig.upsert({
    where: { agentId: sampleAgent.id },
    update: {},
    create: {
      agentId: sampleAgent.id,
      isEnabled: true,
      keywords: ['falar com humano', 'atendente', 'gerente', 'suporte técnico'],
      intentions: ['complaint', 'technical_support', 'complex_question'],
      handoffMessage: 'Entendi que você gostaria de falar com um atendente humano. Vou transferir você agora. Por favor, aguarde um momento.',
      resumeCommand: 'retomar bot',
      operatorNumbers: ['+5511999999998', '+5511999999997'],
      maxConsecutiveFails: 3,
      uncertaintyThreshold: 0.4,
    }
  })

  console.log('✅ Handoff configuration created')

  // Create mentor configuration
  await prisma.mentorConfig.upsert({
    where: { agentId: sampleAgent.id },
    update: {},
    create: {
      agentId: sampleAgent.id,
      isEnabled: false,
      mentorPhone: '+5511999999996',
      timeoutMinutes: 3,
      alwaysConsultTopics: ['preços', 'desconto', 'política de devolução'],
      uncertaintyWords: ['não sei', 'talvez', 'não tenho certeza', 'preciso verificar'],
      reviewResponses: true,
      approvalRequired: false,
    }
  })

  console.log('✅ Mentor configuration created')

  // Create sample automation funnel
  const salesFunnel = await prisma.automationFunnel.create({
    data: {
      agentId: sampleAgent.id,
      name: 'Funil de Boas-vindas',
      description: 'Sequência automática para novos contatos',
      isActive: true,
      triggerWords: ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite'],
      triggerIntentions: ['greeting', 'first_contact'],
      repeatCooldownDays: 30,
    }
  })

  // Create funnel steps
  await prisma.funnelStep.createMany({
    data: [
      {
        funnelId: salesFunnel.id,
        stepNumber: 1,
        stepType: 'text',
        textContent: 'Olá! 👋 Seja bem-vindo(a)! Sou o assistente virtual da nossa empresa.',
        delaySeconds: 0,
      },
      {
        funnelId: salesFunnel.id,
        stepNumber: 2,
        stepType: 'pause',
        delaySeconds: 2,
      },
      {
        funnelId: salesFunnel.id,
        stepNumber: 3,
        stepType: 'text',
        textContent: 'Como posso ajudá-lo(a) hoje? Posso fornecer informações sobre nossos produtos e serviços! 😊',
        delaySeconds: 0,
      }
    ]
  })

  console.log('✅ Sample automation funnel created')

  // Create follow-up rules
  await prisma.followUpRule.createMany({
    data: [
      {
        agentId: sampleAgent.id,
        name: 'Follow-up 1h',
        isActive: true,
        triggerAfterMinutes: 60,
        maxAttempts: 1,
        stopOnReply: true,
        message: 'Oi! Notei que você não respondeu nossa conversa anterior. Há algo em que posso ajudar? 😊',
      },
      {
        agentId: sampleAgent.id,
        name: 'Follow-up 24h',
        isActive: true,
        triggerAfterMinutes: 1440,
        maxAttempts: 2,
        stopOnReply: true,
        message: 'Olá! Tudo bem? Vi que conversamos ontem e queria saber se ainda precisa de ajuda com alguma coisa! 👋',
      }
    ],
    skipDuplicates: true,
  })

  console.log('✅ Follow-up rules created')

  // Create system configurations
  await prisma.systemConfig.createMany({
    data: [
      {
        key: 'default_ai_provider',
        value: { provider: 'openai', model: 'gpt-4o-mini' }
      },
      {
        key: 'max_agents_per_user',
        value: { limit: 10 }
      },
      {
        key: 'whisper_config',
        value: { 
          url: 'http://localhost:9000',
          model: 'base'
        }
      }
    ],
    skipDuplicates: true,
  })

  console.log('✅ System configurations created')

  console.log('🎉 Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
