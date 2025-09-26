
'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Download, Upload } from 'lucide-react'

interface ExportImportCardProps {
  selectedAgent: string | null
}

export default function ExportImportCard({ selectedAgent }: ExportImportCardProps) {
  if (!selectedAgent) {
    return (
      <Card className="h-fit opacity-60">
        <CardHeader>
          <CardTitle>
            <Download className="w-5 h-5 text-teal-600" />
            Exportar/Importar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Selecione um agente para exportar/importar</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <Download className="w-5 h-5 text-teal-600" />
          Exportar/Importar Conhecimento
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Funcionalidade em desenvolvimento</p>
        </div>
      </CardContent>
    </Card>
  )
}
