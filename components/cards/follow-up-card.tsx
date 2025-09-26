
'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Bell, Clock } from 'lucide-react'

interface FollowUpCardProps {
  selectedAgent: string | null
}

export default function FollowUpCard({ selectedAgent }: FollowUpCardProps) {
  if (!selectedAgent) {
    return (
      <Card className="h-fit opacity-60">
        <CardHeader>
          <CardTitle>
            <Bell className="w-5 h-5 text-yellow-600" />
            Follow-ups Automáticos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Selecione um agente para configurar follow-ups</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <Bell className="w-5 h-5 text-yellow-600" />
          Follow-ups Automáticos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Funcionalidade em desenvolvimento</p>
        </div>
      </CardContent>
    </Card>
  )
}
