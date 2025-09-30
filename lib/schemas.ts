import { z } from 'zod'

// Agent schemas
export const createAgentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  timezone: z.string().min(1, 'Timezone is required'),
  systemPrompt: z.string().max(10000, 'System prompt too long').optional(),
  aiProvider: z.enum(['openai', 'gemini', 'groq']),
  apiKey: z.string().optional(),
  model: z.string().min(1, 'Model is required'),
  temperature: z.number().min(0).max(1).optional().default(0.7),
  maxTokens: z.number().int().min(1).max(10000).optional().default(1500),
  conversationMemory: z.number().int().min(1).max(50).optional().default(10),
  isActive: z.boolean().optional().default(true),
  typingSimulation: z.boolean().optional().default(true),
  responseDelay: z.number().min(0).max(60).optional().default(2),
  sequentialWait: z.number().min(0).max(60).optional().default(1),
  blockSize: z.number().int().min(50).max(500).optional().default(200),
  pauseBetweenBlocks: z.number().min(0).max(60).optional().default(1),
  maxBlocks: z.number().int().min(1).max(10).optional().default(3),
})

export const updateAgentSchema = createAgentSchema.partial().extend({
  id: z.string().min(1, 'Agent ID is required'),
})

// WhatsApp integration schemas
export const createWhatsAppIntegrationSchema = z.object({
  instanceName: z.string().min(1, 'Instance name is required').max(50),
})

// Funnel schemas
export const createFunnelSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  triggerWords: z.array(z.string()).optional().default([]),
  triggerIntentions: z.array(z.string()).optional().default([]),
  contextPrompt: z.string().max(5000).optional(),
  minSimilarity: z.number().min(0).max(100).optional().default(70),
  defaultDelaySeconds: z.number().min(0).max(3600).optional().default(0),
  preventRepeat: z.boolean().optional().default(true),
  repeatCooldownDays: z.number().min(0).max(365).optional().default(7),
})

// Follow-up schemas
export const createFollowUpSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  triggerAfterMinutes: z.number().int().min(1).max(10080), // max 1 week
  maxAttempts: z.number().int().min(1).max(10).optional().default(3),
  stopOnReply: z.boolean().optional().default(true),
  message: z.string().min(1, 'Message is required').max(1000),
})

// Access rule schemas
export const createAccessRuleSchema = z.object({
  type: z.enum(['whitelist', 'blacklist', 'pattern']),
  value: z.string().min(1, 'Value is required').max(100),
  isActive: z.boolean().optional().default(true),
  notes: z.string().optional(),
})

// Handoff config schemas
export const createHandoffConfigSchema = z.object({
  isEnabled: z.boolean().optional().default(false),
  keywords: z.array(z.string()).optional().default([]),
  intentions: z.array(z.string()).optional().default([]),
  handoffMessage: z.string().max(1000).optional(),
  resumeCommand: z.string().min(1).optional().default('retomar'),
  operatorNumbers: z.array(z.string()).optional().default([]),
  maxConsecutiveFails: z.number().int().min(1).max(10).optional().default(3),
  uncertaintyThreshold: z.number().min(0).max(1).optional().default(0.3),
})

// Mentor config schemas
export const createMentorConfigSchema = z.object({
  isEnabled: z.boolean().optional().default(false),
  mentorPhone: z.string().optional(),
  timeoutMinutes: z.number().int().min(1).max(60).optional().default(5),
  alwaysConsultTopics: z.array(z.string()).optional().default([]),
  uncertaintyWords: z.array(z.string()).optional().default([]),
  timeoutMessage: z.string().max(500).optional(),
  reviewResponses: z.boolean().optional().default(false),
  approvalRequired: z.boolean().optional().default(false),
})

// Media file schemas
export const createMediaFileSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  originalName: z.string().min(1, 'Original name is required'),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileSize: z.number().int().min(1),
  cloudStoragePath: z.string().min(1, 'Storage path is required'),
  fileType: z.enum(['image', 'video', 'audio', 'document']),
})

// Conversation schemas
export const createConversationSchema = z.object({
  contactPhone: z.string().min(1, 'Contact phone is required'),
  contactName: z.string().optional(),
  isSimulation: z.boolean().optional().default(false),
})

// Message schemas
export const createMessageSchema = z.object({
  messageType: z.enum(['text', 'image', 'audio', 'video', 'document']),
  content: z.string().min(1, 'Content is required'),
  isFromUser: z.boolean(),
  mediaUrl: z.string().optional(),
})

// OTP schemas
export const sendOtpSchema = z.object({
  phone: z.string().min(10, 'Phone number too short').max(20, 'Phone number too long'),
})

export const verifyOtpSchema = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().length(6, 'OTP code must be 6 digits'),
})

// Contact schemas
export const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email'),
  message: z.string().min(10, 'Message too short').max(1000, 'Message too long'),
})
