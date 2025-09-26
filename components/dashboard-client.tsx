
'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Bot, 
  MessageSquare, 
  Shield, 
  Users, 
  UserCheck, 
  Download, 
  Zap, 
  Bell, 
  FolderOpen, 
  Play,
  User,
  Settings,
  LogOut
} from 'lucide-react'
import { signOut } from 'next-auth/react'

// Card Components
import AgentConfigCard from '@/components/cards/agent-config-card'
import WhatsAppIntegrationCard from '@/components/cards/whatsapp-integration-card'
import AccessRulesCard from '@/components/cards/access-rules-card'
import HandoffCard from '@/components/cards/handoff-card'
import MentorCard from '@/components/cards/mentor-card'
import ExportImportCard from '@/components/cards/export-import-card'
import FunnelsCard from '@/components/cards/funnels-card'
import FollowUpCard from '@/components/cards/follow-up-card'
import MediaLibraryCard from '@/components/cards/media-library-card'
import SimulatorCard from '@/components/cards/simulator-card'

// Admin Cards
import AdminEvolutionApiCard from '@/components/cards/admin-evolution-api-card'
import AdminOtpInstanceCard from '@/components/cards/admin-otp-instance-card'

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
}

export default function DashboardClient() {
  const { data: session, status } = useSession() || {}
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  
  const isAdmin = session?.user?.role === 'admin'
  
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200/50 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">WhatsApp AI Dashboard</h1>
                <p className="text-sm text-gray-600">Gerenciamento de Agentes Inteligentes</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-xl">
                {isAdmin ? (
                  <Settings className="w-4 h-4 text-orange-600" />
                ) : (
                  <User className="w-4 h-4 text-gray-600" />
                )}
                <span className="text-sm font-medium text-gray-900">
                  {session?.user?.name || session?.user?.email}
                </span>
                {isAdmin && (
                  <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded-full font-medium">
                    Admin
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut()}
                className="text-gray-600 hover:text-red-600"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Admin Section */}
        {isAdmin && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.1
                }
              }
            }}
            className="mb-8"
          >
            <div className="flex items-center space-x-2 mb-6">
              <Settings className="w-5 h-5 text-orange-600" />
              <h2 className="text-lg font-semibold text-gray-900">Configurações Administrativas</h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Evolution API Configuration */}
              <motion.div variants={cardVariants}>
                <AdminEvolutionApiCard />
              </motion.div>

              {/* OTP Instance Management */}
              <motion.div variants={cardVariants}>
                <AdminOtpInstanceCard />
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* Cards Grid */}
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.1
              }
            }
          }}
          className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
        >
          {/* Card 1: Agent Configuration */}
          <motion.div variants={cardVariants}>
            <AgentConfigCard selectedAgent={selectedAgent} setSelectedAgent={setSelectedAgent} />
          </motion.div>

          {/* Card 2: WhatsApp Integration */}
          <motion.div variants={cardVariants}>
            <WhatsAppIntegrationCard selectedAgent={selectedAgent} />
          </motion.div>

          {/* Card 3: Access Rules */}
          <motion.div variants={cardVariants}>
            <AccessRulesCard selectedAgent={selectedAgent} />
          </motion.div>

          {/* Card 4: Handoff */}
          <motion.div variants={cardVariants}>
            <HandoffCard selectedAgent={selectedAgent} />
          </motion.div>

          {/* Card 5: Human Mentor */}
          <motion.div variants={cardVariants}>
            <MentorCard selectedAgent={selectedAgent} />
          </motion.div>

          {/* Card 6: Export/Import */}
          <motion.div variants={cardVariants}>
            <ExportImportCard selectedAgent={selectedAgent} />
          </motion.div>

          {/* Card 7: Automation Funnels */}
          <motion.div variants={cardVariants}>
            <FunnelsCard selectedAgent={selectedAgent} />
          </motion.div>

          {/* Card 8: Follow-ups */}
          <motion.div variants={cardVariants}>
            <FollowUpCard selectedAgent={selectedAgent} />
          </motion.div>

          {/* Card 9: Media Library */}
          <motion.div variants={cardVariants}>
            <MediaLibraryCard selectedAgent={selectedAgent} />
          </motion.div>

          {/* Card 10: Conversation Simulator */}
          <motion.div variants={cardVariants} className="lg:col-span-2 xl:col-span-3">
            <SimulatorCard selectedAgent={selectedAgent} />
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
