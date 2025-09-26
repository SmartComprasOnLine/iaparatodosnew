
'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { FolderOpen, Image } from 'lucide-react'

interface MediaLibraryCardProps {
  selectedAgent: string | null
}

export default function MediaLibraryCard({ selectedAgent }: MediaLibraryCardProps) {
  if (!selectedAgent) {
    return (
      <Card className="h-fit opacity-60">
        <CardHeader>
          <CardTitle>
            <FolderOpen className="w-5 h-5 text-cyan-600" />
            Biblioteca de Mídias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Selecione um agente para gerenciar mídias</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <FolderOpen className="w-5 h-5 text-cyan-600" />
          Biblioteca de Mídias
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Funcionalidade em desenvolvimento</p>
        </div>
      </CardContent>
    </Card>
  )
}
