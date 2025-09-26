
'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Zap, Workflow } from 'lucide-react'

interface FunnelsCardProps {
  selectedAgent: string | null
}

export default function FunnelsCard({ selectedAgent }: FunnelsCardProps) {
  if (!selectedAgent) {
    return (
      <Card className="h-fit opacity-60">
        <CardHeader>
          <CardTitle>
            <Zap className="w-5 h-5 text-pink-600" />
            Funis de Automação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Workflow className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Selecione um agente para configurar funis</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <Zap className="w-5 h-5 text-pink-600" />
          Funis de Automação
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <Workflow className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Funcionalidade em desenvolvimento</p>
        </div>
      </CardContent>
    </Card>
  )
}
