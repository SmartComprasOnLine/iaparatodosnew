
'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { UserCheck, Brain } from 'lucide-react'

interface MentorCardProps {
  selectedAgent: string | null
}

export default function MentorCard({ selectedAgent }: MentorCardProps) {
  if (!selectedAgent) {
    return (
      <Card className="h-fit opacity-60">
        <CardHeader>
          <CardTitle>
            <UserCheck className="w-5 h-5 text-indigo-600" />
            Mentor Humano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Selecione um agente para configurar mentor</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <UserCheck className="w-5 h-5 text-indigo-600" />
          Mentor Humano
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Funcionalidade em desenvolvimento</p>
        </div>
      </CardContent>
    </Card>
  )
}
