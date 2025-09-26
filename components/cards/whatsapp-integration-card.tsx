
'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  MessageSquare, 
  QrCode, 
  RefreshCw, 
  Settings, 
  CheckCircle, 
  XCircle, 
  Clock,
  Smartphone
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import Image from 'next/image'

interface WhatsAppIntegrationCardProps {
  selectedAgent: string | null
}

export default function WhatsAppIntegrationCard({ selectedAgent }: WhatsAppIntegrationCardProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [integration, setIntegration] = useState({
    instanceName: '',
    status: 'disconnected',
    qrCode: '',
    phoneNumber: '',
    profileName: '',
    evolutionConfigured: false
  })

  useEffect(() => {
    if (selectedAgent) {
      loadIntegration()
    }
  }, [selectedAgent])

  const loadIntegration = async () => {
    try {
      const response = await fetch(`/api/whatsapp/integration/${selectedAgent}`)
      if (response.ok) {
        const data = await response.json()
        setIntegration(data)
      }
    } catch (error) {
      console.error('Error loading integration:', error)
    }
  }

  const saveConfiguration = async () => {
    if (!selectedAgent) {
      toast({
        title: "Erro",
        description: "Selecione um agente primeiro",
        variant: "destructive"
      })
      return
    }

    if (!integration.instanceName.trim()) {
      toast({
        title: "Erro",
        description: "Nome da instância é obrigatório",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/whatsapp/integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent,
          instanceName: integration.instanceName
        })
      })

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: "Instância configurada com sucesso"
        })
        await loadIntegration()
      } else {
        const errorData = await response.json()
        toast({
          title: "Erro",
          description: errorData.error || "Erro ao configurar instância",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar configuração",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const generateQR = async () => {
    if (!selectedAgent) {
      toast({
        title: "Erro", 
        description: "Selecione um agente primeiro",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/whatsapp/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent })
      })

      if (response.ok) {
        const data = await response.json()
        setIntegration(prev => ({
          ...prev,
          qrCode: data.qrCode,
          status: 'waiting_qr'
        }))
        toast({
          title: "QR Code gerado",
          description: "Escaneie com seu WhatsApp"
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao gerar QR code",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const reconnect = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/whatsapp/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent })
      })

      if (response.ok) {
        toast({
          title: "Reconexão iniciada",
          description: "Aguarde a conexão ser estabelecida"
        })
        await loadIntegration()
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao reconectar",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = () => {
    switch (integration.status) {
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'disconnected':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'waiting_qr':
        return <Clock className="w-4 h-4 text-yellow-600" />
      default:
        return <XCircle className="w-4 h-4 text-gray-600" />
    }
  }

  const getStatusText = () => {
    switch (integration.status) {
      case 'connected':
        return 'Conectado'
      case 'disconnected':
        return 'Desconectado'
      case 'waiting_qr':
        return 'Aguardando QR'
      default:
        return 'Não configurado'
    }
  }

  const getStatusVariant = () => {
    switch (integration.status) {
      case 'connected':
        return 'success'
      case 'disconnected':
        return 'destructive'
      case 'waiting_qr':
        return 'warning'
      default:
        return 'secondary'
    }
  }

  if (!selectedAgent) {
    return (
      <Card className="h-fit opacity-60">
        <CardHeader>
          <CardTitle>
            <MessageSquare className="w-5 h-5 text-green-600" />
            Integração WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Smartphone className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Selecione um agente para configurar a integração WhatsApp</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600" />
            Integração WhatsApp
          </div>
          <Badge variant={getStatusVariant() as any} className="flex items-center gap-1">
            {getStatusIcon()}
            {getStatusText()}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {!integration.evolutionConfigured && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4 text-yellow-600" />
                <p className="font-medium text-yellow-800">Evolution API não configurada</p>
              </div>
              <p className="text-sm text-yellow-700">
                O administrador precisa configurar a Evolution API primeiro. Entre em contato com o admin do sistema.
              </p>
            </div>
          )}

          {integration.evolutionConfigured && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-medium text-green-800">Evolution API configurada</p>
                </div>
                <p className="text-xs text-green-700">Configuração centralizada pelo administrador</p>
              </div>

              <div className="space-y-2">
                <Label>Nome da Instância WhatsApp</Label>
                <Input
                  value={integration.instanceName}
                  onChange={(e) => setIntegration(prev => ({ ...prev, instanceName: e.target.value }))}
                  placeholder="minha-instancia-whatsapp"
                />
                <p className="text-xs text-gray-500">
                  Escolha um nome único para sua instância do WhatsApp
                </p>
              </div>

              <Button onClick={saveConfiguration} disabled={loading} className="w-full">
                <Settings className="w-4 h-4 mr-2" />
                {loading ? 'Configurando...' : 'Configurar Instância'}
              </Button>
            </div>
          )}

          {/* Connection Status and Actions */}
          {integration.status === 'connected' && integration.phoneNumber && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-900">{integration.profileName || 'WhatsApp Conectado'}</p>
                  <p className="text-sm text-green-700">{integration.phoneNumber}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={reconnect}
                disabled={loading}
                className="mt-3 w-full"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Reconectar
              </Button>
            </div>
          )}

          {/* QR Code Display */}
          {integration.status === 'waiting_qr' && integration.qrCode && (
            <div className="text-center space-y-3">
              <div className="bg-white p-4 rounded-xl border-2 border-dashed border-gray-300 inline-block">
                <div className="relative w-48 h-48">
                  <Image
                    src={`data:image/png;base64,${integration.qrCode}`}
                    alt="QR Code WhatsApp"
                    fill
                    className="object-contain"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900">
                  Escaneie com seu WhatsApp
                </p>
                <p className="text-xs text-gray-600">
                  Abra o WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo
                </p>
              </div>
            </div>
          )}

          {/* Generate QR Button */}
          {integration.status !== 'connected' && integration.evolutionConfigured && integration.instanceName && (
            <div className="pt-4 border-t border-gray-100">
              <Button 
                onClick={generateQR}
                disabled={loading}
                className="w-full"
                variant="outline"
              >
                <QrCode className="w-4 h-4 mr-2" />
                {loading ? 'Gerando...' : 'Gerar QR Code'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
