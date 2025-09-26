
'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { 
  Bot, 
  Wand2, 
  TestTube, 
  Brain, 
  Clock, 
  MessageSquare,
  Settings,
  Save,
  Plus,
  Edit3
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface AgentConfigCardProps {
  selectedAgent: string | null
  setSelectedAgent: (agentId: string | null) => void
}

export default function AgentConfigCard({ selectedAgent, setSelectedAgent }: AgentConfigCardProps) {
  const { toast } = useToast()
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [currentConfig, setCurrentConfig] = useState({
    name: '',
    systemPrompt: '',
    aiProvider: 'openai',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1500,
    conversationMemory: 10,
    clearMemoryPerContact: false,
    rememberPreferences: true,
    typingSimulation: true,
    responseDelay: 2000,
    sequentialWait: 1000,
    blockSize: 200,
    pauseBetweenBlocks: 1000,
    maxBlocks: 3
  })

  const [improvingPrompt, setImprovingPrompt] = useState(false)
  const [activeTab, setActiveTab] = useState('prompt')

  useEffect(() => {
    loadAgents()
  }, [])

  const loadAgents = async () => {
    try {
      const response = await fetch('/api/agents')
      if (response.ok) {
        const data = await response.json()
        setAgents(data)
      }
    } catch (error) {
      console.error('Error loading agents:', error)
    }
  }

  const saveConfig = async () => {
    if (!currentConfig.name?.trim()) {
      toast({
        title: "Erro",
        description: "Nome do agente é obrigatório",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/agents', {
        method: selectedAgent ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentConfig,
          id: selectedAgent
        })
      })

      if (response.ok) {
        const agent = await response.json()
        toast({
          title: "Sucesso",
          description: selectedAgent ? "Agente atualizado com sucesso" : "Agente criado com sucesso"
        })
        setSelectedAgent(agent.id)
        await loadAgents()
      } else {
        throw new Error('Failed to save agent')
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

  const testConnection = async () => {
    if (!currentConfig.apiKey?.trim()) {
      toast({
        title: "Erro",
        description: "API key é necessária para testar conexão",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: currentConfig.aiProvider,
          apiKey: currentConfig.apiKey,
          model: currentConfig.model
        })
      })

      const result = await response.json()
      if (result.success) {
        toast({
          title: "Sucesso",
          description: "Conexão testada com sucesso"
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao testar conexão",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const improvePrompt = async () => {
    if (!currentConfig.systemPrompt?.trim()) {
      toast({
        title: "Erro",
        description: "Prompt é necessário para aprimoramento",
        variant: "destructive"
      })
      return
    }

    setImprovingPrompt(true)
    try {
      const response = await fetch('/api/ai/improve-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentConfig.systemPrompt
        })
      })

      if (response.ok) {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let improvedPrompt = ''

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') return
                
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.status === 'completed') {
                    setCurrentConfig(prev => ({
                      ...prev,
                      systemPrompt: parsed.result.improvedPrompt || improvedPrompt
                    }))
                    toast({
                      title: "Sucesso",
                      description: "Prompt aprimorado com sucesso"
                    })
                    return
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao aprimorar prompt",
        variant: "destructive"
      })
    } finally {
      setImprovingPrompt(false)
    }
  }

  const loadAgentConfig = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}`)
      if (response.ok) {
        const agent = await response.json()
        setCurrentConfig({
          name: agent.name || '',
          systemPrompt: agent.systemPrompt || '',
          aiProvider: agent.aiProvider || 'openai',
          apiKey: agent.apiKey || '',
          model: agent.model || 'gpt-4o-mini',
          temperature: agent.temperature || 0.7,
          maxTokens: agent.maxTokens || 1500,
          conversationMemory: agent.conversationMemory || 10,
          clearMemoryPerContact: agent.clearMemoryPerContact || false,
          rememberPreferences: agent.rememberPreferences || true,
          typingSimulation: agent.typingSimulation || true,
          responseDelay: agent.responseDelay || 2000,
          sequentialWait: agent.sequentialWait || 1000,
          blockSize: agent.blockSize || 200,
          pauseBetweenBlocks: agent.pauseBetweenBlocks || 1000,
          maxBlocks: agent.maxBlocks || 3
        })
      }
    } catch (error) {
      console.error('Error loading agent config:', error)
    }
  }

  useEffect(() => {
    if (selectedAgent) {
      loadAgentConfig(selectedAgent)
    }
  }, [selectedAgent])

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <Bot className="w-5 h-5 text-blue-600" />
          Configuração do Agente
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Agent Selection */}
          <div className="space-y-2">
            <Label>Agente Ativo</Label>
            <Select value={selectedAgent || 'new'} onValueChange={(value) => setSelectedAgent(value === 'new' ? null : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Criar Novo Agente
                  </div>
                </SelectItem>
                {agents?.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      {agent.name}
                      {agent.isActive && <Badge variant="success" className="text-xs">Ativo</Badge>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Agent Name */}
          <div className="space-y-2">
            <Label>Nome do Agente</Label>
            <Input
              value={currentConfig.name}
              onChange={(e) => setCurrentConfig(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Nome do seu agente IA"
            />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="prompt" onClick={() => setActiveTab('prompt')}>Prompt</TabsTrigger>
              <TabsTrigger value="provider" onClick={() => setActiveTab('provider')}>IA</TabsTrigger>
              <TabsTrigger value="memory" onClick={() => setActiveTab('memory')}>Memória</TabsTrigger>
              <TabsTrigger value="behavior" onClick={() => setActiveTab('behavior')}>Comportamento</TabsTrigger>
            </TabsList>

            {/* Prompt Tab */}
            <TabsContent value="prompt" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Prompt Central</Label>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={improvePrompt}
                    disabled={improvingPrompt}
                  >
                    <Wand2 className="w-4 h-4 mr-1" />
                    {improvingPrompt ? 'Aprimorando...' : 'Aprimorar'}
                  </Button>
                </div>
                <Textarea
                  value={currentConfig.systemPrompt}
                  onChange={(e) => setCurrentConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder="Defina como seu agente deve se comportar..."
                  rows={6}
                />
              </div>
            </TabsContent>

            {/* AI Provider Tab */}
            <TabsContent value="provider" className="space-y-4">
              <div className="space-y-2">
                <Label>Provedor de IA</Label>
                <Select value={currentConfig.aiProvider} onValueChange={(value) => setCurrentConfig(prev => ({ ...prev, aiProvider: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="groq">Groq</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={currentConfig.apiKey}
                    onChange={(e) => setCurrentConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="Sua API Key"
                  />
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={testConnection}
                    disabled={loading}
                  >
                    <TestTube className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input
                    value={currentConfig.model}
                    onChange={(e) => setCurrentConfig(prev => ({ ...prev, model: e.target.value }))}
                    placeholder="gpt-4o-mini"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    value={currentConfig.maxTokens}
                    onChange={(e) => setCurrentConfig(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Temperatura</Label>
                  <span className="text-sm text-gray-600">{currentConfig.temperature}</span>
                </div>
                <Slider
                  value={[currentConfig.temperature]}
                  onValueChange={([value]) => setCurrentConfig(prev => ({ ...prev, temperature: value }))}
                  min={0}
                  max={1}
                  step={0.1}
                />
              </div>
            </TabsContent>

            {/* Memory Tab */}
            <TabsContent value="memory" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Mensagens na Memória</Label>
                  <span className="text-sm text-gray-600">{currentConfig.conversationMemory}</span>
                </div>
                <Slider
                  value={[currentConfig.conversationMemory]}
                  onValueChange={([value]) => setCurrentConfig(prev => ({ ...prev, conversationMemory: value }))}
                  min={1}
                  max={50}
                  step={1}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Limpar por Contato</Label>
                  <p className="text-xs text-gray-600">Limpar memória para cada novo contato</p>
                </div>
                <Switch
                  checked={currentConfig.clearMemoryPerContact}
                  onCheckedChange={(checked) => setCurrentConfig(prev => ({ ...prev, clearMemoryPerContact: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Lembrar Preferências</Label>
                  <p className="text-xs text-gray-600">Manter preferências do usuário</p>
                </div>
                <Switch
                  checked={currentConfig.rememberPreferences}
                  onCheckedChange={(checked) => setCurrentConfig(prev => ({ ...prev, rememberPreferences: checked }))}
                />
              </div>
            </TabsContent>

            {/* Behavior Tab */}
            <TabsContent value="behavior" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Simular Digitação</Label>
                  <p className="text-xs text-gray-600">Mostrar "digitando..." antes de responder</p>
                </div>
                <Switch
                  checked={currentConfig.typingSimulation}
                  onCheckedChange={(checked) => setCurrentConfig(prev => ({ ...prev, typingSimulation: checked }))}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Atraso na Resposta (ms)</Label>
                  <span className="text-sm text-gray-600">{currentConfig.responseDelay}</span>
                </div>
                <Slider
                  value={[currentConfig.responseDelay]}
                  onValueChange={([value]) => setCurrentConfig(prev => ({ ...prev, responseDelay: value }))}
                  min={500}
                  max={10000}
                  step={500}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Tamanho do Bloco</Label>
                  <span className="text-sm text-gray-600">{currentConfig.blockSize}</span>
                </div>
                <Slider
                  value={[currentConfig.blockSize]}
                  onValueChange={([value]) => setCurrentConfig(prev => ({ ...prev, blockSize: value }))}
                  min={50}
                  max={500}
                  step={25}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Máximo de Blocos</Label>
                  <span className="text-sm text-gray-600">{currentConfig.maxBlocks}</span>
                </div>
                <Slider
                  value={[currentConfig.maxBlocks]}
                  onValueChange={([value]) => setCurrentConfig(prev => ({ ...prev, maxBlocks: value }))}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>
            </TabsContent>
          </Tabs>

          <Button 
            onClick={saveConfig} 
            disabled={loading}
            className="w-full"
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
