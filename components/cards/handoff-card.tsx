
'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Users, ArrowRight } from 'lucide-react'

interface HandoffCardProps {
  selectedAgent: string | null
}

export default function HandoffCard({ selectedAgent }: HandoffCardProps) {
  if (!selectedAgent) {
    return (
      <Card className="h-fit opacity-60">
        <CardHeader>
          <CardTitle>
            <Users className="w-5 h-5 text-purple-600" />
            Handoff para Atendente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <ArrowRight className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Selecione um agente para configurar handoff</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <Users className="w-5 h-5 text-purple-600" />
          Handoff para Atendente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <ArrowRight className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Funcionalidade em desenvolvimento</p>
        </div>
      </CardContent>
    </Card>
  )
}
