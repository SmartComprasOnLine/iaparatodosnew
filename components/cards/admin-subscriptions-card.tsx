'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'

interface SubscriptionPlan {
  id: string
  name: string
  description: string | null
  priceCents: number
  currency: string
  billingCycle: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface MercadoPagoConfig {
  publicKey: string
  accessToken: string
  webhookSecret: string
  trialDays: number
  testMode: boolean
}

const BILLING_CYCLES = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' }
]

const CURRENCIES = ['BRL', 'USD', 'EUR']

export default function AdminSubscriptionsCard() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)

  const [credentials, setCredentials] = useState<MercadoPagoConfig>({
    publicKey: '',
    accessToken: '',
    webhookSecret: '',
    trialDays: 7,
    testMode: true
  })

  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    price: '0,00',
    currency: 'BRL',
    billingCycle: 'monthly',
    isActive: true
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [credentialsResponse, plansResponse] = await Promise.all([
        fetch('/api/admin/mercado-pago'),
        fetch('/api/admin/subscription-plans')
      ])

      if (credentialsResponse.ok) {
        const data = await credentialsResponse.json()
        setCredentials({
          publicKey: data?.publicKey || '',
          accessToken: data?.accessToken || '',
          webhookSecret: data?.webhookSecret || '',
          trialDays: Number(data?.trialDays ?? 7),
          testMode: Boolean(data?.testMode ?? true)
        })
      }

      if (plansResponse.ok) {
        const data = await plansResponse.json()
        setPlans(data?.plans ?? [])
      }
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as configurações atuais.',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleSaveCredentials = async () => {
    if (!credentials.accessToken.trim() || !credentials.publicKey.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe a Public Key e o Access Token da sua conta Mercado Pago.',
        variant: 'destructive'
      })
      return
    }

    if (credentials.trialDays < 0) {
      toast({
        title: 'Trial inválido',
        description: 'O número de dias de trial deve ser um valor positivo.',
        variant: 'destructive'
      })
      return
    }

    setSavingCredentials(true)
    try {
      const response = await fetch('/api/admin/mercado-pago', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Erro ao salvar credenciais')
      }

      toast({
        title: 'Credenciais salvas',
        description: 'Integração Mercado Pago atualizada com sucesso.'
      })
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro ao salvar credenciais',
        description: error instanceof Error ? error.message : 'Tente novamente mais tarde.',
        variant: 'destructive'
      })
    } finally {
      setSavingCredentials(false)
    }
  }

  const resetPlanForm = () => {
    setPlanForm({
      name: '',
      description: '',
      price: '0,00',
      currency: 'BRL',
      billingCycle: 'monthly',
      isActive: true
    })
    setEditingPlanId(null)
  }

  const parsePriceToCents = (value: string) => {
    const normalized = value.replace(/[\.\s]/g, '').replace(',', '.')
    const numeric = Number.parseFloat(normalized)
    if (Number.isNaN(numeric) || numeric < 0) {
      return null
    }
    return Math.round(numeric * 100)
  }

  const handlePlanSubmit = async () => {
    if (!planForm.name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Defina o nome do plano.',
        variant: 'destructive'
      })
      return
    }

    const priceCents = parsePriceToCents(planForm.price)
    if (priceCents === null) {
      toast({
        title: 'Preço inválido',
        description: 'Informe um valor de mensalidade válido. Use vírgula para centavos.',
        variant: 'destructive'
      })
      return
    }

    setSavingPlan(true)
    try {
      const payload = {
        name: planForm.name.trim(),
        description: planForm.description.trim() || null,
        priceCents,
        currency: planForm.currency,
        billingCycle: planForm.billingCycle,
        isActive: planForm.isActive
      }

      const url = editingPlanId
        ? `/api/admin/subscription-plans/${editingPlanId}`
        : '/api/admin/subscription-plans'

      const response = await fetch(url, {
        method: editingPlanId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível salvar o plano')
      }

      toast({
        title: editingPlanId ? 'Plano atualizado' : 'Plano criado',
        description: 'As informações do plano foram salvas.'
      })

      resetPlanForm()
      await loadData()
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro ao salvar plano',
        description: error instanceof Error ? error.message : 'Tente novamente mais tarde.',
        variant: 'destructive'
      })
    } finally {
      setSavingPlan(false)
    }
  }

  const handleEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlanId(plan.id)
    setPlanForm({
      name: plan.name,
      description: plan.description ?? '',
      price: (plan.priceCents / 100).toFixed(2).replace('.', ','),
      currency: plan.currency,
      billingCycle: plan.billingCycle,
      isActive: plan.isActive
    })
  }

  const handleDeletePlan = async (plan: SubscriptionPlan) => {
    const confirmed = window.confirm(`Remover o plano ${plan.name}?`)
    if (!confirmed) {
      return
    }

    setSavingPlan(true)
    try {
      const response = await fetch(`/api/admin/subscription-plans/${plan.id}`, {
        method: 'DELETE'
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || 'Erro ao remover o plano')
      }

      toast({ title: 'Plano removido', description: `${plan.name} foi removido.` })
      if (editingPlanId === plan.id) {
        resetPlanForm()
      }
      await loadData()
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro ao remover plano',
        description: error instanceof Error ? error.message : 'Tente novamente mais tarde.',
        variant: 'destructive'
      })
    } finally {
      setSavingPlan(false)
    }
  }

  const formattedPlans = useMemo(
    () =>
      plans.map((plan) => ({
        ...plan,
        priceLabel: (plan.priceCents / 100).toLocaleString('pt-BR', {
          style: 'currency',
          currency: plan.currency || 'BRL'
        }),
        updatedLabel: new Date(plan.updatedAt).toLocaleString('pt-BR')
      })),
    [plans]
  )

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Assinaturas & Mercado Pago</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Credenciais Mercado Pago</h3>
              <p className="text-xs text-gray-600">Defina as chaves usadas para criar assinaturas e cobranças.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Public Key</Label>
              <Input
                value={credentials.publicKey}
                onChange={(event) =>
                  setCredentials((prev) => ({ ...prev, publicKey: event.target.value }))
                }
                placeholder="APP_USR-..."
              />
            </div>
            <div className="space-y-1">
              <Label>Access Token</Label>
              <Input
                type="password"
                value={credentials.accessToken}
                onChange={(event) =>
                  setCredentials((prev) => ({ ...prev, accessToken: event.target.value }))
                }
                placeholder="APP_USR-..."
              />
            </div>
            <div className="space-y-1">
              <Label>Webhook Secret</Label>
              <Input
                type="password"
                value={credentials.webhookSecret}
                onChange={(event) =>
                  setCredentials((prev) => ({ ...prev, webhookSecret: event.target.value }))
                }
                placeholder="Segredo usado para validar notificações"
              />
            </div>
            <div className="space-y-1">
              <Label>Dias de trial padrão</Label>
              <Input
                type="number"
                min={0}
                value={credentials.trialDays}
                onChange={(event) =>
                  setCredentials((prev) => ({
                    ...prev,
                    trialDays: Number(event.target.value) || 0
                  }))
                }
              />
              <p className="text-xs text-gray-500">
                Período de teste aplicado após o primeiro login (padrão: 7 dias).
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button onClick={handleSaveCredentials} disabled={savingCredentials}>
              {savingCredentials ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar credenciais
            </Button>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={credentials.testMode}
                  onChange={(event) =>
                    setCredentials((prev) => ({ ...prev, testMode: event.target.checked }))
                  }
                />
                Modo sandbox
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Planos de assinatura
              </h3>
              <p className="text-xs text-gray-600">
                Configure os planos disponíveis para os clientes.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2">
              <Label>Nome do plano</Label>
              <Input
                value={planForm.name}
                onChange={(event) =>
                  setPlanForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Plano Profissional"
              />
            </div>
            <div className="space-y-1">
              <Label>Preço (R$)</Label>
              <Input
                value={planForm.price}
                onChange={(event) =>
                  setPlanForm((prev) => ({ ...prev, price: event.target.value }))
                }
                placeholder="199,90"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={planForm.description}
                onChange={(event) =>
                  setPlanForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Inclui atendimento humano, relatórios avançados e integrações premium."
              />
            </div>
            <div className="space-y-1">
              <Label>Moeda</Label>
              <Select
                value={planForm.currency}
                onValueChange={(value) => setPlanForm((prev) => ({ ...prev, currency: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ciclo de cobrança</Label>
              <Select
                value={planForm.billingCycle}
                onValueChange={(value) =>
                  setPlanForm((prev) => ({ ...prev, billingCycle: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((cycle) => (
                    <SelectItem key={cycle.value} value={cycle.value}>
                      {cycle.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={planForm.isActive}
                  onChange={(event) =>
                    setPlanForm((prev) => ({ ...prev, isActive: event.target.checked }))
                  }
                />
                Plano ativo
              </Label>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button onClick={handlePlanSubmit} disabled={savingPlan}>
              {savingPlan ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {editingPlanId ? 'Atualizar plano' : 'Cadastrar plano'}
            </Button>
            {editingPlanId && (
              <Button type="button" variant="ghost" onClick={resetPlanForm} disabled={savingPlan}>
                Cancelar edição
              </Button>
            )}
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Plano</th>
                  <th className="px-4 py-3">Preço</th>
                  <th className="px-4 py-3">Ciclo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Atualizado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      Carregando planos...
                    </td>
                  </tr>
                ) : formattedPlans.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      Nenhum plano configurado ainda.
                    </td>
                  </tr>
                ) : (
                  formattedPlans.map((plan) => (
                    <tr key={plan.id} className="text-gray-700">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{plan.name}</p>
                        {plan.description && (
                          <p className="text-xs text-gray-500">{plan.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{plan.priceLabel}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {BILLING_CYCLES.find((cycle) => cycle.value === plan.billingCycle)?.label ??
                          plan.billingCycle}
                      </td>
                      <td className="px-4 py-3">
                        {plan.isActive ? (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                            Ativo
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-600">
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{plan.updatedLabel}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleEditPlan(plan)}>
                            <Plus className="h-4 w-4 rotate-45" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePlan(plan)}
                            disabled={savingPlan}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
