
'use client'

import { useState, useEffect } from 'react'
import { getSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Bot, MessageSquare, Smartphone, Phone, CheckCircle, User, Settings } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

type LoginMode = 'user' | 'admin'
type LoginStep = 'mode' | 'admin-auth' | 'phone' | 'otp'

export default function LoginPage() {
  const [step, setStep] = useState<LoginStep>('mode')
  const [loginMode, setLoginMode] = useState<LoginMode | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // OTP flow state
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpExpiry, setOtpExpiry] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(0)
  
  // Admin auth state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    // Check if user is already logged in
    const checkSession = async () => {
      const session = await getSession()
      if (session) {
        router.push('/')
      }
    }
    checkSession()
  }, [router])

  useEffect(() => {
    // Countdown timer for OTP expiry
    if (step === 'otp' && otpExpiry) {
      const timer = setInterval(() => {
        const now = new Date().getTime()
        const expiry = otpExpiry.getTime()
        const timeLeft = expiry - now

        if (timeLeft > 0) {
          setCountdown(Math.ceil(timeLeft / 1000))
        } else {
          setCountdown(0)
          clearInterval(timer)
        }
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [step, otpExpiry])

  const handleModeSelect = (mode: LoginMode) => {
    setLoginMode(mode)
    if (mode === 'admin') {
      setStep('admin-auth')
      setEmail('admin@whatsapp.com') // Pre-fill admin email
    } else {
      setStep('phone')
    }
  }

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false
      })

      if (result?.ok) {
        toast({
          title: "Login realizado!",
          description: "Bem-vindo, Administrador!",
        })
        router.push('/')
      } else {
        toast({
          title: "Erro de autenticação",
          description: "Email ou senha incorretos",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro de conexão com o servidor",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      })

      const data = await response.json()

      if (response.ok) {
        setOtpExpiry(new Date(data.expires))
        setStep('otp')
        toast({
          title: "Código enviado!",
          description: "Verifique seu WhatsApp e digite o código recebido.",
        })
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao enviar código OTP",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro de conexão com o servidor",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOTP = async (otpValue: string) => {
    if (otpValue.length !== 6) return

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otpValue })
      })

      const data = await response.json()

      if (response.ok) {
        const welcomeMessage = data.isNewUser 
          ? `Bem-vindo ao sistema, ${data.user.name}! Seu cadastro foi criado automaticamente.`
          : "Login realizado com sucesso."
          
        toast({
          title: data.isNewUser ? "Bem-vindo!" : "Sucesso!",
          description: welcomeMessage,
        })
        
        // Use NextAuth signIn with the JWT token from OTP verification
        const result = await signIn('otp-login', {
          token: data.token,
          redirect: false
        })

        if (result?.ok) {
          router.push('/')
        } else {
          toast({
            title: "Erro",
            description: "Erro ao fazer login com o token OTP",
            variant: "destructive"
          })
        }
      } else {
        toast({
          title: "Erro",
          description: data.error || "Código OTP inválido",
          variant: "destructive"
        })
        setOtp('')
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro de conexão com o servidor",
        variant: "destructive"
      })
      setOtp('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOTP = () => {
    setOtp('')
    setStep('phone')
    setOtpExpiry(null)
    setCountdown(0)
  }

  const handleBackToPhone = () => {
    setStep('phone')
    setOtp('')
    setOtpExpiry(null)
    setCountdown(0)
  }

  const handleBackToMode = () => {
    setStep('mode')
    setLoginMode(null)
    setEmail('')
    setPassword('')
    setPhone('')
    setOtp('')
    setOtpExpiry(null)
    setCountdown(0)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-2xl border-0 backdrop-blur-sm bg-white/95">
          <CardHeader className="text-center pb-8">
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              {step === 'mode' ? (
                <Bot className="w-8 h-8 text-white" />
              ) : step === 'admin-auth' ? (
                <Settings className="w-8 h-8 text-white" />
              ) : step === 'phone' ? (
                <Smartphone className="w-8 h-8 text-white" />
              ) : (
                <MessageSquare className="w-8 h-8 text-white" />
              )}
            </div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
              WhatsApp AI Dashboard
            </CardTitle>
            <p className="text-gray-600 mt-2">
              {step === 'mode' 
                ? 'Escolha como deseja fazer login'
                : step === 'admin-auth'
                ? 'Acesso administrativo'
                : step === 'phone' 
                ? 'Digite seu número de telefone - novos usuários são cadastrados automaticamente'
                : 'Digite o código de 6 dígitos enviado pelo WhatsApp'
              }
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {step === 'mode' ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <Button 
                  onClick={() => handleModeSelect('user')}
                  className="w-full h-16 bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-left justify-start" 
                  disabled={isLoading}
                >
                  <User className="w-6 h-6 mr-4" />
                  <div>
                    <div className="font-semibold">Usuário</div>
                    <div className="text-xs opacity-90">Login via WhatsApp OTP</div>
                  </div>
                </Button>

                <Button 
                  onClick={() => handleModeSelect('admin')}
                  variant="outline"
                  className="w-full h-16 border-2 hover:bg-gray-50 text-left justify-start" 
                  disabled={isLoading}
                >
                  <Settings className="w-6 h-6 mr-4" />
                  <div>
                    <div className="font-semibold">Administrador</div>
                    <div className="text-xs text-gray-500">Login com email e senha</div>
                  </div>
                </Button>
              </motion.div>
            ) : step === 'admin-auth' ? (
              <motion.form
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                onSubmit={handleAdminLogin}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12"
                    readOnly
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12"
                  />
                  <p className="text-xs text-gray-500">
                    💡 Senha padrão: admin123
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBackToMode}
                    className="flex-1"
                    disabled={isLoading}
                  >
                    Voltar
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700" 
                    disabled={isLoading || !password}
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Entrando...
                      </>
                    ) : (
                      'Entrar'
                    )}
                  </Button>
                </div>
              </motion.form>
            ) : step === 'phone' ? (
              <motion.form
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                onSubmit={handleSendOTP}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <Label htmlFor="phone">Número de Telefone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+5511999999999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="text-center text-lg h-12"
                  />
                  <p className="text-xs text-gray-500 text-center">
                    Inclua o código do país (+55 para Brasil)
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBackToMode}
                    className="flex-1"
                    disabled={isLoading}
                  >
                    Voltar
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 h-12 bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700" 
                    disabled={isLoading || !phone}
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Phone className="w-4 h-4 mr-2" />
                        Enviar OTP
                      </>
                    )}
                  </Button>
                </div>
              </motion.form>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="text-center space-y-4">
                  <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                    <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-green-800">
                      Código enviado para:
                    </p>
                    <p className="font-mono font-bold text-green-900">
                      {phone}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <Label>Código de Verificação</Label>
                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={(value) => {
                          setOtp(value)
                          if (value.length === 6) {
                            handleVerifyOTP(value)
                          }
                        }}
                        maxLength={6}
                        disabled={isLoading}
                      >
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>

                    {countdown > 0 && (
                      <p className="text-sm text-gray-600">
                        Código expira em: <span className="font-mono font-bold text-red-600">
                          {formatCountdown(countdown)}
                        </span>
                      </p>
                    )}

                    {isLoading && (
                      <div className="flex items-center justify-center text-green-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600 mr-2"></div>
                        Verificando código...
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleBackToPhone}
                      className="flex-1"
                      disabled={isLoading}
                    >
                      Alterar número
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleResendOTP}
                      className="flex-1"
                      disabled={isLoading || countdown > 0}
                    >
                      {countdown > 0 ? `Reenviar (${formatCountdown(countdown)})` : 'Reenviar código'}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="text-center space-y-3">
                {step === 'mode' ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      🎯 Escolha o tipo de acesso
                    </p>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <p><strong>Usuário:</strong> Login via WhatsApp OTP</p>
                        <p><strong>Admin:</strong> Login com email/senha</p>
                      </div>
                    </div>
                  </div>
                ) : step === 'admin-auth' ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      🔐 Acesso Administrativo
                    </p>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="p-2 bg-yellow-50 rounded-lg">
                        <p><strong>Email:</strong> admin@whatsapp.com</p>
                        <p><strong>Senha:</strong> admin123</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      🚀 Sistema de Auto-Cadastro Ativo
                    </p>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="p-2 bg-green-50 rounded-lg border border-green-200">
                        <p><strong>✨ Primeira vez?</strong> Seu cadastro será criado automaticamente!</p>
                        <p><strong>📱 WhatsApp:</strong> Usamos seu número como ID único</p>
                        <p><strong>👤 Nome:</strong> Obtemos seu pushname automaticamente</p>
                      </div>
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <p><strong>Teste:</strong> +5511999999999</p>
                        <p><strong>Teste:</strong> +5511888888888</p>
                      </div>
                      <p className="text-xs text-gray-500 italic">
                        💡 Em desenvolvimento: OTP será exibido no console
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-center space-x-6 text-xs text-gray-500">
                <div className="flex items-center">
                  <MessageSquare className="w-3 h-3 mr-1" />
                  WhatsApp
                </div>
                <div className="flex items-center">
                  <Bot className="w-3 h-3 mr-1" />
                  IA Avançada
                </div>
                <div className="flex items-center">
                  <Smartphone className="w-3 h-3 mr-1" />
                  Automação
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
