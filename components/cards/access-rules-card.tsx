
'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Shield, 
  Plus, 
  Trash2, 
  Users, 
  Ban,
  Globe,
  Smartphone
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface AccessRule {
  id?: string
  type: 'whitelist' | 'blacklist' | 'pattern'
  value: string
  notes?: string
  isActive: boolean
}

interface AccessRulesCardProps {
  selectedAgent: string | null
}

export default function AccessRulesCard({ selectedAgent }: AccessRulesCardProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<AccessRule[]>([])
  const [newRule, setNewRule] = useState<AccessRule>({
    type: 'whitelist',
    value: '',
    notes: '',
    isActive: true
  })

  useEffect(() => {
    if (selectedAgent) {
      loadRules()
    }
  }, [selectedAgent])

  const loadRules = async () => {
    try {
      const response = await fetch(`/api/agents/${selectedAgent}/access-rules`)
      if (response.ok) {
        const data = await response.json()
        setRules(data)
      }
    } catch (error) {
      console.error('Error loading access rules:', error)
    }
  }

  const addRule = async () => {
    if (!newRule.value.trim()) {
      toast({
        title: "Erro",
        description: "Valor da regra é obrigatório",
        variant: "destructive"
      })
      return
    }

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
      const response = await fetch('/api/access-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent,
          ...newRule
        })
      })

      if (response.ok) {
        await loadRules()
        setNewRule({
          type: 'whitelist',
          value: '',
          notes: '',
          isActive: true
        })
        toast({
          title: "Sucesso",
          description: "Regra adicionada com sucesso"
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao adicionar regra",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const removeRule = async (ruleId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/access-rules/${ruleId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadRules()
        toast({
          title: "Sucesso",
          description: "Regra removida com sucesso"
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao remover regra",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/access-rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive })
      })

      if (response.ok) {
        await loadRules()
        toast({
          title: "Sucesso",
          description: `Regra ${!isActive ? 'ativada' : 'desativada'}`
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao atualizar regra",
        variant: "destructive"
      })
    }
  }

  const getRuleIcon = (type: string) => {
    switch (type) {
      case 'whitelist':
        return <Users className="w-4 h-4" />
      case 'blacklist':
        return <Ban className="w-4 h-4" />
      case 'pattern':
        return <Globe className="w-4 h-4" />
      default:
        return <Shield className="w-4 h-4" />
    }
  }

  const getRuleVariant = (type: string) => {
    switch (type) {
      case 'whitelist':
        return 'success'
      case 'blacklist':
        return 'destructive'
      case 'pattern':
        return 'secondary'
      default:
        return 'secondary'
    }
  }

  const getRuleLabel = (type: string) => {
    switch (type) {
      case 'whitelist':
        return 'Permitido'
      case 'blacklist':
        return 'Bloqueado'
      case 'pattern':
        return 'Padrão'
      default:
        return 'Desconhecido'
    }
  }

  if (!selectedAgent) {
    return (
      <Card className="h-fit opacity-60">
        <CardHeader>
          <CardTitle>
            <Shield className="w-5 h-5 text-orange-600" />
            Regras de Acesso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Selecione um agente para configurar regras de acesso</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <Shield className="w-5 h-5 text-orange-600" />
          Regras de Acesso
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Add New Rule */}
          <div className="space-y-3 p-4 border border-gray-200 rounded-xl bg-gray-50">
            <div className="space-y-2">
              <Label>Tipo de Regra</Label>
              <Select value={newRule.type} onValueChange={(value: any) => setNewRule(prev => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whitelist">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Lista Branca (Permitir)
                    </div>
                  </SelectItem>
                  <SelectItem value="blacklist">
                    <div className="flex items-center gap-2">
                      <Ban className="w-4 h-4" />
                      Lista Negra (Bloquear)
                    </div>
                  </SelectItem>
                  <SelectItem value="pattern">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Padrão (DDD/País)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                {newRule.type === 'pattern' ? 'Padrão' : 'Número'}
              </Label>
              <Input
                value={newRule.value}
                onChange={(e) => setNewRule(prev => ({ ...prev, value: e.target.value }))}
                placeholder={
                  newRule.type === 'pattern' 
                    ? '+55 11* ou +1*' 
                    : '+5511999999999'
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Input
                value={newRule.notes || ''}
                onChange={(e) => setNewRule(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Adicione uma nota para esta regra"
              />
            </div>

            <Button onClick={addRule} disabled={loading} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              {loading ? 'Adicionando...' : 'Adicionar Regra'}
            </Button>
          </div>

          {/* Rules List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Regras Ativas</h4>
              <Badge variant="secondary">{rules.length} regras</Badge>
            </div>

            {rules.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <Shield className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p>Nenhuma regra configurada</p>
                <p className="text-xs">Adicione regras para controlar o acesso</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      rule.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Badge variant={getRuleVariant(rule.type) as any} className="flex items-center gap-1">
                        {getRuleIcon(rule.type)}
                        {getRuleLabel(rule.type)}
                      </Badge>
                      <div>
                        <p className="font-medium text-sm">{rule.value}</p>
                        {rule.notes && (
                          <p className="text-xs text-gray-600">{rule.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleRule(rule.id!, rule.isActive)}
                        className={rule.isActive ? 'text-green-600' : 'text-gray-400'}
                      >
                        {rule.isActive ? 'Ativo' : 'Inativo'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeRule(rule.id!)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
