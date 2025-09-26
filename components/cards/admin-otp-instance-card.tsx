
'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Smartphone, 
  Plus, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  QrCode,
  Phone,
  Play,
  Settings2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface OtpInstance {
  id: string
  instanceName: string
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_waiting'
  qrCode?: string | { base64?: string; qrcode?: string | { base64?: string } } | any
  phoneNumber?: string
  createdAt: Date
  lastConnection?: Date
  lastQrUpdate?: Date
  lastStatusCheck?: Date
}

export default function AdminOtpInstanceCard() {
  const [instance, setInstance] = useState<OtpInstance | null>(null)
  const [newInstanceName, setNewInstanceName] = useState('Sistema OTP Central')
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isRefreshingQr, setIsRefreshingQr] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadInstance()
  }, [])

  // Auto-refresh system - polls status based on instance state
  useEffect(() => {
    if (!instance) return

    let interval: NodeJS.Timeout
    let pollFunction: () => void
    let pollInterval: number

    // Different polling strategies based on status
    switch (instance.status) {
      case 'qr_waiting':
      case 'connecting':
        // Fast polling for active states needing QR updates
        pollFunction = refreshQrCode
        pollInterval = 2000 // Every 2 seconds
        break
      case 'connected':
        // Medium polling for connected state to catch disconnections
        pollFunction = loadInstance
        pollInterval = 10000 // Every 10 seconds
        break
      case 'disconnected':
        // Slower polling for disconnected state
        pollFunction = loadInstance
        pollInterval = 15000 // Every 15 seconds
        break
      default:
        // Default case
        pollFunction = loadInstance
        pollInterval = 5000 // Every 5 seconds
        break
    }

    // Start polling
    interval = setInterval(pollFunction, pollInterval)

    // Cleanup interval on unmount or dependency change
    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [instance?.status, instance?.id]) // Re-run when status changes

  // Additional effect for immediate status changes detection
  useEffect(() => {
    if (instance) {
      console.log(`[OTP Status Monitor] Instance status: ${instance.status}, Last update: ${new Date().toLocaleTimeString()}`)
    }
  }, [instance?.status])

  // Show success toast when instance connects
  useEffect(() => {
    if (instance && instance.status === 'connected' && !instance.qrCode) {
      // Check if this is a new connection
      const wasConnected = localStorage.getItem(`otp_central_instance_connected`)
      if (!wasConnected) {
        toast({
          title: "WhatsApp Conectado! 🎉",
          description: "Sistema OTP está pronto para enviar códigos para todos os usuários.",
        })
        localStorage.setItem(`otp_central_instance_connected`, 'true')
      }
    } else if (!instance || instance.status !== 'connected') {
      // Remove flag if instance disconnects
      localStorage.removeItem(`otp_central_instance_connected`)
    }
  }, [instance, toast])

  const refreshQrCode = async () => {
    if (isRefreshingQr || !instance || instance.status !== 'qr_waiting') return
    
    try {
      setIsRefreshingQr(true)
      const response = await fetch(`/api/admin/otp-instances/central/qr-code`)
      if (response.ok) {
        const data = await response.json()
        setInstance(prevInstance => prevInstance ? { ...prevInstance, ...data } : null)
      } else {
        // If QR refresh fails, do full instance reload
        loadInstance()
      }
    } catch (error) {
      console.error('Error refreshing QR code:', error)
      loadInstance()
    } finally {
      setIsRefreshingQr(false)
    }
  }

  const loadInstance = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/otp-instances/central')
      if (response.ok) {
        const data = await response.json()
        setInstance(data.instance)
      } else {
        setInstance(null)
      }
    } catch (error) {
      console.error('Error loading central instance:', error)
      setInstance(null)
    } finally {
      setIsLoading(false)
    }
  }

  const createInstance = async () => {
    if (!newInstanceName.trim()) {
      toast({
        title: "Erro",
        description: "Digite um nome para a instância",
        variant: "destructive"
      })
      return
    }

    try {
      setIsCreating(true)
      
      const response = await fetch('/api/admin/otp-instances/central', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: newInstanceName.trim() })
      })

      const data = await response.json()

      if (response.ok) {
        setInstance(data.instance)
        toast({
          title: "Sistema OTP criado!",
          description: `Instância "${data.instance.instanceName}" está pronta.`,
        })
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar instância central",
        variant: "destructive"
      })
    } finally {
      setIsCreating(false)
    }
  }

  const deleteInstance = async () => {
    if (!instance) return
    
    try {
      const response = await fetch(`/api/admin/otp-instances/central`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setInstance(null)
        toast({
          title: "Sistema removido",
          description: "Instância central OTP foi deletada.",
        })
      } else {
        const data = await response.json()
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao deletar instância",
        variant: "destructive"
      })
    }
  }

  const connectInstance = async () => {
    if (!instance) return
    
    try {
      const response = await fetch(`/api/admin/otp-instances/central/connect`, {
        method: 'POST'
      })

      const data = await response.json()

      if (response.ok) {
        setInstance(prev => prev ? { ...prev, ...data } : null)
        
        if (data.qrCode) {
          toast({
            title: "QR Code gerado!",
            description: "Escaneie o QR Code com o WhatsApp para conectar.",
          })
        }
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao conectar instância",
        variant: "destructive"
      })
    }
  }

  const getStatusBadge = (status: OtpInstance['status']) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Conectado</Badge>
      case 'qr_waiting':
        return <Badge className="bg-yellow-100 text-yellow-800"><QrCode className="w-3 h-3 mr-1" />Aguardando QR</Badge>
      case 'connecting':
        return <Badge className="bg-blue-100 text-blue-800"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Conectando</Badge>
      default:
        return <Badge variant="outline">Desconectado</Badge>
    }
  }

  return (
    <Card className="h-full bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-lg hover:shadow-xl transition-all duration-300">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-gray-900">Sistema OTP Central</CardTitle>
              <p className="text-sm text-gray-600">Uma instância para todos os usuários</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {instance && (
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${
                  instance.status === 'connected' ? 'bg-green-500' :
                  instance.status === 'qr_waiting' || instance.status === 'connecting' ? 'bg-blue-500' :
                  'bg-gray-400'
                } animate-pulse`}></div>
              </div>
            )}
            {instance ? getStatusBadge(instance.status) : <Badge variant="outline">Não configurado</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Create Central Instance (only if none exists) */}
        {!instance && (
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <Label htmlFor="instanceName">Criar Sistema OTP Central</Label>
            <div className="flex gap-2">
              <Input
                id="instanceName"
                placeholder="Nome do sistema"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createInstance()}
              />
              <Button
                onClick={createInstance}
                disabled={isCreating || !newInstanceName.trim()}
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-600">
              Esta será a única instância para envio de códigos OTP a todos os usuários.
            </p>
          </div>
        )}

        {/* Central Instance Display */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        ) : !instance ? (
          <div className="text-center py-8 text-gray-500">
            <Settings2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Sistema OTP Central não configurado</p>
            <p className="text-xs text-gray-400 mt-1">Configure para permitir login de usuários via WhatsApp</p>
          </div>
        ) : (
          <div className="space-y-3">
            <motion.div
              key="central-instance"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-white rounded-lg border border-gray-200 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-green-600" />
                    <span className="font-medium">{instance.instanceName}</span>
                  </div>
                  {instance.phoneNumber && (
                    <p className="text-sm text-green-600 font-medium">📱 {instance.phoneNumber}</p>
                  )}
                </div>
                {getStatusBadge(instance.status)}
              </div>

                {instance.status === 'qr_waiting' && instance.qrCode && (
                  <div className="p-3 bg-yellow-50 rounded-lg text-center">
                    <div className="relative">
                      {(() => {
                        // Debug: log the QR code data type and content
                        console.log('QR Code data:', typeof instance.qrCode, instance.qrCode)
                        
                        let qrCodeSrc = ''
                        
                        if (typeof instance.qrCode === 'string') {
                          // It's already a string - check if it already has the data: prefix
                          qrCodeSrc = instance.qrCode.startsWith('data:') 
                            ? instance.qrCode 
                            : `data:image/png;base64,${instance.qrCode}`
                        } else if (typeof instance.qrCode === 'object' && instance.qrCode !== null) {
                          // It's an object, try to extract the base64 string
                          const qrObj = instance.qrCode as any
                          if (qrObj.base64) {
                            const base64Data = qrObj.base64
                            qrCodeSrc = base64Data.startsWith('data:') 
                              ? base64Data 
                              : `data:image/png;base64,${base64Data}`
                          } else if (qrObj.qrcode) {
                            if (typeof qrObj.qrcode === 'string') {
                              const qrData = qrObj.qrcode
                              qrCodeSrc = qrData.startsWith('data:') ? qrData : `data:image/png;base64,${qrData}`
                            } else if (qrObj.qrcode?.base64) {
                              const base64Data = qrObj.qrcode.base64
                              qrCodeSrc = base64Data.startsWith('data:') 
                                ? base64Data 
                                : `data:image/png;base64,${base64Data}`
                            }
                          } else {
                            console.warn('Unexpected QR code object format:', qrObj)
                            qrCodeSrc = '' // Don't try to display invalid data
                          }
                        }

                        if (!qrCodeSrc) {
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
                            onError={(e) => {
                              console.error('Erro ao carregar QR Code:', {
                                error: e,
                                src: qrCodeSrc,
                                originalQrCode: instance.qrCode,
                                qrCodeType: typeof instance.qrCode
                              })
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              const parent = target.parentElement
                              if (parent) {
                                parent.innerHTML = `
                                  <div class="w-40 h-40 mx-auto border border-gray-300 rounded-lg bg-white flex items-center justify-center">
                                    <p class="text-sm text-gray-500 text-center">Erro ao carregar<br>QR Code<br><small class="text-xs">Verifique console</small></p>
                                  </div>
                                `
                              }
                            }}
                          />
                        )
                      })()}
                      <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                        <QrCode className="w-3 h-3" />
                      </div>
                      {isRefreshingQr && (
                        <div className="absolute top-2 left-2 bg-blue-500 text-white rounded-full p-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-yellow-800 mt-3 font-medium">
                      📱 Escaneie este QR Code com WhatsApp para conectar
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                      Abra WhatsApp → Três pontos → Dispositivos vinculados → Vincular dispositivo
                    </p>
                    {instance.lastQrUpdate && (
                      <p className="text-xs text-gray-500 mt-2 flex items-center justify-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        Atualizado: {new Date(instance.lastQrUpdate).toLocaleTimeString('pt-BR')}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-center text-xs text-green-600">
                      <div className="animate-pulse flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Monitoramento ativo - QR atualizado a cada 2s
                      </div>
                    </div>
                  </div>
                )}

                {instance.status === 'qr_waiting' && !instance.qrCode && (
                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                    <div className="w-40 h-40 mx-auto border border-blue-300 rounded-lg bg-white flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
                        <p className="text-sm text-blue-600">Gerando QR Code...</p>
                      </div>
                    </div>
                    <p className="text-xs text-blue-800 mt-3">
                      Aguarde enquanto o QR Code é gerado
                    </p>
                  </div>
                )}

                {instance.status === 'connected' && (
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <div className="w-40 h-40 mx-auto border border-green-300 rounded-lg bg-white flex items-center justify-center">
                      <div className="text-center">
                        <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-2" />
                        <p className="text-sm text-green-600 font-medium">WhatsApp Conectado!</p>
                        {instance.phoneNumber && (
                          <p className="text-xs text-gray-500 mt-1">{instance.phoneNumber}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-green-800 mt-3 font-medium">
                      ✅ Instância está pronta para enviar códigos OTP
                    </p>
                    <div className="mt-2 flex items-center justify-center text-xs text-green-600">
                      <div className="animate-pulse flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Monitorando conexão a cada 10s
                      </div>
                    </div>
                  </div>
                )}

                {instance.status === 'connecting' && (
                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                    <div className="w-40 h-40 mx-auto border border-blue-300 rounded-lg bg-white flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
                        <p className="text-sm text-blue-600">Conectando...</p>
                      </div>
                    </div>
                    <p className="text-xs text-blue-800 mt-3">
                      Estabelecendo conexão com WhatsApp
                    </p>
                    <div className="mt-2 flex items-center justify-center text-xs text-blue-600">
                      <div className="animate-pulse flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        Verificando status a cada 2s
                      </div>
                    </div>
                  </div>
                )}

              <div className="flex gap-2">
                {instance.status === 'disconnected' ? (
                  <Button
                    size="sm"
                    onClick={connectInstance}
                    className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Conectar Sistema
                  </Button>
                ) : instance.status === 'connected' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadInstance}
                    className="flex-1 text-green-700 border-green-200 hover:bg-green-50"
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Sistema Ativo
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadInstance}
                    className="flex-1"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Atualizar Status
                  </Button>
                )}
                
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={deleteInstance}
                  className="px-3"
                >
                  <Settings2 className="w-3 h-3" />
                </Button>
              </div>

              {/* Status monitoring bar */}
              <div className="text-xs text-gray-500 border-t pt-2 space-y-1">
                {instance.lastConnection && (
                  <div>
                    Última conexão: {new Date(instance.lastConnection).toLocaleString('pt-BR')}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>Monitoramento:</span>
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${
                      instance.status === 'connected' ? 'bg-green-500' :
                      instance.status === 'qr_waiting' || instance.status === 'connecting' ? 'bg-blue-500' :
                      'bg-gray-400'
                    } animate-pulse`}></div>
                    <span className="text-xs">
                      {instance.status === 'connected' ? 'Ativo (10s)' :
                       instance.status === 'qr_waiting' || instance.status === 'connecting' ? 'Ativo (2s)' :
                       'Ativo (15s)'}
                    </span>
                  </div>
                </div>
                {instance.lastStatusCheck && (
                  <div className="flex items-center justify-between">
                    <span>Última verificação:</span>
                    <span className="text-xs">
                      {new Date(instance.lastStatusCheck).toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit' 
                      })}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        <div className="bg-blue-50 p-3 rounded-lg">
          <p className="text-xs text-blue-800">
            💡 <strong>Sistema Central:</strong> Esta instância única será usada para enviar códigos OTP a todos os usuários do sistema.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
