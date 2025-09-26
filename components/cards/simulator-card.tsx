
'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Play, MessageCircle } from 'lucide-react'

interface SimulatorCardProps {
  selectedAgent: string | null
}

export default function SimulatorCard({ selectedAgent }: SimulatorCardProps) {
  if (!selectedAgent) {
    return (
      <Card className="h-fit opacity-60">
        <CardHeader>
          <CardTitle>
            <Play className="w-5 h-5 text-emerald-600" />
            Simulador de Conversa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Selecione um agente para testar conversas</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <Play className="w-5 h-5 text-emerald-600" />
          Simulador de Conversa
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Funcionalidade em desenvolvimento</p>
        </div>
      </CardContent>
    </Card>
  )
}
