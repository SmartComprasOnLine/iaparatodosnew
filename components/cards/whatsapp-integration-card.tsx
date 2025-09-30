
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  Smartphone,
  Trash2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type QRCodeData = string | { base64?: string; qrcode?: string | { base64?: string } } | null

interface IntegrationState {
  instanceName: string
  status: string
  qrCode: QRCodeData
  phoneNumber: string
  profileName: string
  evolutionConfigured: boolean
}

interface WhatsAppIntegrationCardProps {
  selectedAgent: string | null
}

const ensureDataPrefix = (value: string) =>
  value.startsWith('data:') ? value : `data:image/png;base64,${value}`

const resolveQrCodeSrc = (qrCode: QRCodeData) => {
  if (!qrCode) {
    return ''
  }

  if (typeof qrCode === 'string') {
    return ensureDataPrefix(qrCode)
  }

  if (typeof qrCode === 'object') {
    const qrObj = qrCode as Record<string, any>

    if (typeof qrObj.base64 === 'string' && qrObj.base64) {
      return ensureDataPrefix(qrObj.base64)
    }

    const nestedQr = qrObj.qrcode

    if (typeof nestedQr === 'string' && nestedQr) {
      return ensureDataPrefix(nestedQr)
    }

    if (typeof nestedQr === 'object' && nestedQr) {
      const nestedBase64 = (nestedQr as Record<string, any>).base64
      if (typeof nestedBase64 === 'string' && nestedBase64) {
        return ensureDataPrefix(nestedBase64)
      }
    }
  }

  console.warn('Unexpected QR code object format:', qrCode)
  return ''
}

export default function WhatsAppIntegrationCard({ selectedAgent }: WhatsAppIntegrationCardProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [qrError, setQrError] = useState(false)
  const [integration, setIntegration] = useState<IntegrationState>({
    instanceName: '',
    status: 'disconnected',
    qrCode: null,
    phoneNumber: '',
    profileName: '',
    evolutionConfigured: false
  })

  useEffect(() => {
    setQrError(false)
  }, [integration.qrCode])

  const loadIntegration = useCallback(async () => {
    if (!selectedAgent) {
      return
    }

    try {
      const response = await fetch(`/api/whatsapp/integration/${selectedAgent}`)
      if (response.ok) {
        const data = await response.json()
        setIntegration(prev => ({
          ...prev,
          instanceName: data.instanceName ?? '',
          status: data.status ?? 'disconnected',
          qrCode: data.qrCode ? data.qrCode : null,
          phoneNumber: data.phoneNumber ?? '',
          profileName: data.profileName ?? '',
          evolutionConfigured: Boolean(data.evolutionConfigured)
        }))
        setQrError(false)
      }
    } catch (error) {
      console.error('Error loading integration:', error)
    }
  }, [selectedAgent])

  useEffect(() => {
    loadIntegration()
  }, [loadIntegration])

  const refreshQr = useCallback(async () => {
    if (!selectedAgent) return

    try {
      const response = await fetch(`/api/whatsapp/qr?agentId=${encodeURIComponent(selectedAgent)}`)
      if (response.ok) {
        const data = await response.json()
        setIntegration(prev => {
          if (data.status === 'connected') {
            return { ...prev, status: data.status, qrCode: null }
          }

          if (data.qrCode) {
            setQrError(false)
            return { ...prev, qrCode: data.qrCode, status: data.status ?? prev.status }
          }

          if (data.status) {
            return { ...prev, status: data.status }
          }

          return prev
        })
      }
    } catch (error) {
      console.error('Error refreshing QR code:', error)
    }
  }, [selectedAgent])

  const saveConfiguration = async () => {
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
      const response = await fetch('/api/whatsapp/integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent
        })
      })

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: "Instância configurada com sucesso"
        })
        const responseData = await response.json()
        setIntegration(prev => ({
          ...prev,
          instanceName: responseData.instanceName ?? prev.instanceName,
          status: responseData.status ?? prev.status
        }))
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
          qrCode: data.qrCode ? data.qrCode : null,
          status: data.status ?? 'waiting_qr'
        }))
        setQrError(false)
        toast({
          title: "QR Code gerado",
          description: "Escaneie com seu WhatsApp"
        })
        // kick off first refresh to keep QR valid
        refreshQr()
        if (data.status === 'connected') {
          loadIntegration()
        }
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
          title: "Reinício iniciado",
          description: "Aguarde a reconexão da instância"
        })
        await loadIntegration()
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao reiniciar a instância",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const deleteInstance = async () => {
    if (!selectedAgent) return

    const confirmed = window.confirm('Excluir a instância irá remover a conexão atual. Deseja continuar?')
    if (!confirmed) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/whatsapp/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent })
      })

      let data: any = null
      try {
        data = await response.json()
      } catch (error) {
        data = null
      }

      if (response.ok) {
        toast({
          title: 'Instância removida',
          description: 'Você poderá configurar uma nova instância quando quiser.'
        })
        setIntegration(prev => ({
          ...prev,
          instanceName: '',
          status: 'disconnected',
          qrCode: null,
          phoneNumber: '',
          profileName: ''
        }))
      } else {
        toast({
          title: 'Erro',
          description: data?.error || 'Erro ao remover instância',
          variant: 'destructive'
        })
      }

      await loadIntegration()
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao remover instância',
        variant: 'destructive'
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
      case 'qr_waiting':
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
      case 'qr_waiting':
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
      case 'qr_waiting':
      case 'waiting_qr':
        return 'warning'
      default:
        return 'secondary'
    }
  }

  const isAwaitingQr = integration.status === 'waiting_qr' || integration.status === 'qr_waiting'

  useEffect(() => {
    if (!selectedAgent || !isAwaitingQr) {
      return
    }

    const interval = setInterval(() => {
      refreshQr()
    }, 5000)

    // immediate attempt to get the freshest QR
    refreshQr()

    return () => {
      clearInterval(interval)
    }
  }, [isAwaitingQr, refreshQr, selectedAgent])

  useEffect(() => {
    if (!selectedAgent || !integration.instanceName || isAwaitingQr) {
      return
    }

    const pollStatus = () => {
      loadIntegration()
    }

    const interval = setInterval(pollStatus, integration.status === 'connected' ? 15000 : 10000)

    // fetch once to reduce latency after leaving QR stage
    pollStatus()

    return () => {
      clearInterval(interval)
    }
  }, [integration.instanceName, integration.status, isAwaitingQr, loadIntegration, selectedAgent])

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
                {integration.instanceName ? (
                  <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg font-mono text-sm text-gray-800 flex items-center justify-between">
                    <span className="truncate">{integration.instanceName}</span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    O sistema irá gerar automaticamente um nome exclusivo ao configurar.
                  </p>
                )}
              </div>

              {integration.status === 'connected' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={reconnect}
                    disabled={loading}
                    className="w-full"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reiniciar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={deleteInstance}
                    disabled={loading}
                    className="w-full"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir instância
                  </Button>
                </div>
              ) : (
                <Button onClick={saveConfiguration} disabled={loading} className="w-full">
                  <Settings className="w-4 h-4 mr-2" />
                  {loading ? 'Configurando...' : integration.instanceName ? 'Atualizar Configuração' : 'Configurar Instância'}
                </Button>
              )}
            </div>
          )}

          {/* Connection Status and Actions */}
          {integration.status === 'connected' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-900">{integration.profileName || 'WhatsApp Conectado'}</p>
                  {integration.phoneNumber && (
                    <p className="text-sm text-green-700">{integration.phoneNumber}</p>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-green-700">
                Use os botões acima para reiniciar ou excluir a instância.
              </p>
            </div>
          )}

          {/* QR Code Display */}
          {isAwaitingQr && (
            <div className="p-3 bg-yellow-50 rounded-lg text-center space-y-3">
              <div className="relative inline-block">
                {(() => {
                  console.log('QR Code data:', typeof integration.qrCode, integration.qrCode)
                  const qrCodeSrc = resolveQrCodeSrc(integration.qrCode)

                  if (!qrCodeSrc || qrError) {
                    return (
                      <div className="w-40 h-40 mx-auto border border-gray-300 rounded-lg bg-white flex items-center justify-center">
                        <p className="text-sm text-gray-500 text-center">QR Code<br />indisponível</p>
                      </div>
                    )
                  }

                  return (
                    <img
                      src={qrCodeSrc}
                      alt="QR Code para conectar WhatsApp"
                      className="w-40 h-40 mx-auto border border-gray-300 rounded-lg bg-white p-2"
                      onError={(errorEvent) => {
                        console.error('Erro ao carregar QR Code:', {
                          error: errorEvent,
                          src: qrCodeSrc,
                          originalQrCode: integration.qrCode,
                          qrCodeType: typeof integration.qrCode
                        })
                        setQrError(true)
                      }}
                    />
                  )
                })()}
              </div>
              <p className="text-xs text-yellow-800 font-medium">
                📱 Escaneie este QR Code com WhatsApp para conectar
              </p>
              <p className="text-xs text-yellow-600">
                Abra WhatsApp → Três pontos → Dispositivos vinculados → Vincular dispositivo
              </p>
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
