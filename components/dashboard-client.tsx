
'use client'

import { useState, useMemo, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Bot, User, Settings, LogOut, ChevronDown } from 'lucide-react'
import { signOut } from 'next-auth/react'

// Card Components
import AgentConfigCard from '@/components/cards/agent-config-card'
import WhatsAppIntegrationCard from '@/components/cards/whatsapp-integration-card'
import AccessRulesCard from '@/components/cards/access-rules-card'
import HandoffCard from '@/components/cards/handoff-card'
import MentorCard from '@/components/cards/mentor-card'
import FunnelsCard from '@/components/cards/funnels-card'
import FollowUpCard from '@/components/cards/follow-up-card'
import SimulatorCard from '@/components/cards/simulator-card'

// Admin Cards
import AdminEvolutionApiCard from '@/components/cards/admin-evolution-api-card'
import AdminOtpInstanceCard from '@/components/cards/admin-otp-instance-card'
import AdminUsersCard from '@/components/cards/admin-users-card'
import AdminSubscriptionsCard from '@/components/cards/admin-subscriptions-card'

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
}

interface DashboardClientProps {
  session: any
}

const DashboardClient = memo(function DashboardClient({ session }: DashboardClientProps) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const isAdmin = useMemo(() => session?.user?.role === 'admin', [session?.user?.role])

  const adminCards = useMemo(() => (
    isAdmin
      ? [
          {
            id: 'admin-evolution',
            title: 'Configuração Evolution API',
            render: () => <AdminEvolutionApiCard />
          },
          {
            id: 'admin-otp',
            title: 'Instância OTP',
            render: () => <AdminOtpInstanceCard />
          },
          {
            id: 'admin-users',
            title: 'Usuários da plataforma',
            render: () => <AdminUsersCard currentUserId={session?.user?.id} />
          },
          {
            id: 'admin-subscriptions',
            title: 'Planos & Mercado Pago',
            render: () => <AdminSubscriptionsCard />
          }
        ]
      : []
  ), [isAdmin, session?.user?.id])

  const userCards = useMemo(() => [
    {
      id: 'agent-config',
      title: 'Configuração do Agente',
      render: () => <AgentConfigCard selectedAgent={selectedAgent} setSelectedAgent={setSelectedAgent} />
    },
    {
      id: 'whatsapp-integration',
      title: 'Integração WhatsApp',
      render: () => <WhatsAppIntegrationCard selectedAgent={selectedAgent} />
    },
    {
      id: 'access-rules',
      title: 'Regras de Uso',
      render: () => <AccessRulesCard selectedAgent={selectedAgent} />
    },
    {
      id: 'handoff',
      title: 'Handoff',
      render: () => <HandoffCard selectedAgent={selectedAgent} />
    },
    {
      id: 'mentor',
      title: 'Mentor Humano',
      render: () => <MentorCard selectedAgent={selectedAgent} />
    },
    {
      id: 'funnels',
      title: 'Funis de Automação',
      render: () => <FunnelsCard selectedAgent={selectedAgent} />
    },
    {
      id: 'follow-up',
      title: 'Follow-ups',
      render: () => <FollowUpCard selectedAgent={selectedAgent} />
    },
    {
      id: 'simulator',
      title: 'Simulador de Conversa',
      render: () => <SimulatorCard selectedAgent={selectedAgent} />
    }
  ], [selectedAgent, setSelectedAgent])

  useEffect(() => {
    setCollapsedSections((previous) => {
      const next = { ...previous }
      const ensureIds = [...adminCards, ...userCards]
      ensureIds.forEach((card) => {
        if (next[card.id] === undefined) {
          next[card.id] = true
        }
      })
      return next
    })
  }, [adminCards, userCards])

  const toggleSection = useCallback((id: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [id]: !prev[id]
    }))
  }, [])

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
                <h1 className="text-xl font-bold text-gray-900">14Chat by: Retzz & Shiny</h1>
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
            
            <div className="flex flex-col gap-4">
              {adminCards.map((card) => {
                const collapsed = collapsedSections[card.id] ?? true
                return (
                  <motion.div key={card.id} variants={cardVariants}>
                    <div className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm">
                      <button
                        type="button"
                        onClick={() => toggleSection(card.id)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900"
                      >
                        <span>{card.title}</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {!collapsed && (
                          <motion.div
                            key="content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-gray-200"
                          >
                            <div className="p-4">
                              {card.render()}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Cards Grid - Only for non-admin users */}
        {!isAdmin && (
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
            className="flex flex-col gap-6"
          >
            {userCards.map((card) => {
            const collapsed = collapsedSections[card.id] ?? true
            return (
              <motion.div key={card.id} variants={cardVariants}>
                <div className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleSection(card.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-900"
                  >
                    <span>{card.title}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {!collapsed && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-gray-200"
                      >
                        <div className="p-4">
                          {card.render()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )
          })}
          </motion.div>
        )}
      </main>
    </div>
  )
})

DashboardClient.displayName = 'DashboardClient'

export default DashboardClient
