
'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Settings, 
  Link, 
  Key, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  TestTube,
  Save 
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface EvolutionConfig {
  apiUrl: string
  apiKey: string
  status: 'not_configured' | 'testing' | 'connected' | 'error'
  lastTested?: Date
  error?: string
}

export default function AdminEvolutionApiCard() {
  const [config, setConfig] = useState<EvolutionConfig>({
    apiUrl: '',
    apiKey: '',
    status: 'not_configured'
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isTestingOTP, setIsTestingOTP] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testResults, setTestResults] = useState<any>(null)
  const { toast } = useToast()

  useEffect(() => {
    loadConfiguration()
  }, [])

  const loadConfiguration = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/evolution-config')
      if (response.ok) {
        const data = await response.json()
        setConfig(data)
      }
    } catch (error) {
      console.error('Error loading configuration:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveConfiguration = async () => {
    try {
      setIsLoading(true)
      
      const response = await fetch('/api/admin/evolution-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: config.apiUrl,
          apiKey: config.apiKey
        })
      })

      const data = await response.json()

      if (response.ok) {
        setConfig(prev => ({ 
          ...prev, 
          status: 'connected',
          lastTested: new Date()
        }))
        toast({
          title: "Configuração salva!",
          description: "API Evolution configurada com sucesso.",
        })
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      setConfig(prev => ({ 
        ...prev, 
        status: 'error',
        error: error.message
      }))
      toast({
        title: "Erro",
        description: error.message || "Erro ao salvar configuração",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const testConnection = async () => {
    if (!config.apiUrl || !config.apiKey) {
      toast({
        title: "Erro",
        description: "Preencha URL e API Key antes de testar",
        variant: "destructive"
      })
      return
    }

    try {
      setIsTesting(true)
      setConfig(prev => ({ ...prev, status: 'testing' }))

      const response = await fetch('/api/admin/evolution-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: config.apiUrl,
          apiKey: config.apiKey
        })
      })

      const data = await response.json()

      if (response.ok) {
        setConfig(prev => ({ 
          ...prev, 
          status: 'connected',
          lastTested: new Date(),
          error: undefined
        }))
        toast({
          title: "Conexão OK!",
          description: "API Evolution conectada com sucesso.",
        })
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      setConfig(prev => ({ 
        ...prev, 
        status: 'error',
        error: error.message,
        lastTested: new Date()
      }))
      toast({
        title: "Erro de conexão",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setIsTesting(false)
    }
  }

  const testOTPSending = async () => {
    if (!testPhone.trim()) {
      toast({
        title: "Erro",
        description: "Digite um número de telefone para testar",
        variant: "destructive"
      })
      return
    }

    try {
      setIsTestingOTP(true)
      setTestResults(null)

      const response = await fetch('/api/admin/test-evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testPhone })
      })

      const data = await response.json()

      if (response.ok) {
        setTestResults(data)
        toast({
          title: "Teste completo!",
          description: data.tests?.message?.success 
            ? "Mensagem de teste enviada com sucesso!" 
            : "Teste executado - verifique os resultados abaixo",
        })
      } else {
        setTestResults(data)
        toast({
          title: "Erro no teste",
          description: data.error || "Erro ao executar teste",
          variant: "destructive"
        })
      }
    } catch (error: any) {
      setTestResults({ error: error.message })
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setIsTestingOTP(false)
    }
  }

  const getStatusBadge = () => {
    switch (config.status) {
      case 'connected':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Conectado</Badge>
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>
      case 'testing':
        return <Badge className="bg-blue-100 text-blue-800"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Testando</Badge>
      default:
        return <Badge variant="outline">Não configurado</Badge>
    }
  }

  return (
    <Card className="h-full bg-gradient-to-br from-orange-50 to-red-50 border-orange-200 shadow-lg hover:shadow-xl transition-all duration-300">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-gray-900">Evolution API</CardTitle>
              <p className="text-sm text-gray-600">Configuração do servidor</p>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiUrl" className="flex items-center">
                  <Link className="w-4 h-4 mr-2" />
                  URL da API Evolution
                </Label>
                <Input
                  id="apiUrl"
                  type="url"
                  placeholder="https://api.evolution.example.com"
                  value={config.apiUrl}
                  onChange={(e) => setConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey" className="flex items-center">
                  <Key className="w-4 h-4 mr-2" />
                  API Key
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Sua API Key da Evolution"
                  value={config.apiKey}
                  onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>

              {config.status === 'error' && config.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">
                    <AlertCircle className="w-4 h-4 inline mr-2" />
                    {config.error}
                  </p>
                </div>
              )}

              {config.lastTested && (
                <div className="text-xs text-gray-500">
                  Último teste: {config.lastTested.toLocaleString('pt-BR')}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={testConnection}
                disabled={isTesting || !config.apiUrl || !config.apiKey}
                className="flex-1"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testando...
                  </>
                ) : (
                  <>
                    <TestTube className="w-4 h-4 mr-2" />
                    Testar Conexão
                  </>
                )}
              </Button>

              <Button
                onClick={saveConfiguration}
                disabled={isLoading || !config.apiUrl || !config.apiKey}
                className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar
                  </>
                )}
              </Button>
            </div>

            {/* Advanced Testing Section */}
            {config.status === 'connected' && (
              <div className="border-t pt-4 space-y-4">
                <h4 className="font-semibold text-sm text-gray-900">🧪 Teste Avançado de OTP</h4>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="testPhone" className="text-sm">
                      Número para teste (com código do país)
                    </Label>
                    <Input
                      id="testPhone"
                      type="tel"
                      placeholder="+5511999999999"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <Button
                    variant="outline"
                    onClick={testOTPSending}
                    disabled={isTestingOTP || !testPhone.trim()}
                    className="w-full"
                  >
                    {isTestingOTP ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Testando envio...
                      </>
                    ) : (
                      <>
                        <TestTube className="w-4 h-4 mr-2" />
                        Testar Envio de Mensagem
                      </>
                    )}
                  </Button>
                </div>

                {/* Test Results */}
                {testResults && (
                  <div className="bg-gray-50 p-3 rounded-lg max-h-64 overflow-y-auto">
                    <h5 className="font-semibold text-sm mb-2 text-gray-900">Resultados do Teste:</h5>
                    
                    {testResults.success ? (
                      <div className="space-y-2 text-xs">
                        <div className="text-green-800">
                          ✅ <strong>Status:</strong> {testResults.success ? 'Sucesso' : 'Erro'}
                        </div>
                        
                        <div>
                          <strong>Configuração:</strong>
                          <ul className="ml-4 mt-1">
                            <li>• URL: {testResults.configuration?.evolutionApiUrl}</li>
                            <li>• Instância: {testResults.configuration?.instanceName}</li>
                            <li>• Status: {testResults.configuration?.instanceStatus}</li>
                            <li>• API Key: {testResults.configuration?.hasApiKey ? '✅ Configurada' : '❌ Faltando'}</li>
                          </ul>
                        </div>

                        <div>
                          <strong>Instâncias:</strong>
                          <ul className="ml-4 mt-1">
                            <li>• Total: {testResults.instances?.total || 0}</li>
                            <li>• Conectadas: {testResults.instances?.connected || 0}</li>
                          </ul>
                        </div>

                        {testResults.tests?.message && (
                          <div>
                            <strong>Teste de Mensagem:</strong>
                            <div className={`ml-4 mt-1 ${testResults.tests.message.success ? 'text-green-800' : 'text-red-800'}`}>
                              {testResults.tests.message.success ? '✅' : '❌'} 
                              {testResults.tests.message.success 
                                ? ` Enviada para ${testResults.tests.message.phone}` 
                                : ` Erro: ${testResults.tests.message.error || 'Status ' + testResults.tests.message.status}`
                              }
                            </div>
                          </div>
                        )}

                        {testResults.tests?.connection && (
                          <div>
                            <strong>Teste de Conexão:</strong>
                            <div className={`ml-4 mt-1 ${testResults.tests.connection.success ? 'text-green-800' : 'text-red-800'}`}>
                              {testResults.tests.connection.success ? '✅' : '❌'} 
                              {testResults.tests.connection.success 
                                ? ' Conectado' 
                                : ` Erro: ${testResults.tests.connection.error || 'Status ' + testResults.tests.connection.status}`
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-red-800 text-xs">
                        ❌ <strong>Erro:</strong> {testResults.error}
                        {testResults.details && (
                          <div className="mt-1 text-gray-600">
                            <strong>Detalhes:</strong> {JSON.stringify(testResults.details)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-xs text-blue-800">
                💡 <strong>Importante:</strong> Configure primeiro a Evolution API antes de criar instâncias para envio de OTP.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
