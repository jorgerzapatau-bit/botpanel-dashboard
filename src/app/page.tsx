'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const company = searchParams.get('company') || ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [companyName, setCompanyName] = useState('')

  useEffect(() => {
    if (company) {
      supabase
        .from('companies')
        .select('name')
        .eq('slug', company)
        .single()
        .then(({ data }) => {
          if (data) setCompanyName(data.name)
        })
    }
  }, [company])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error('Credenciales incorrectas')
      setLoading(false)
      return
    }

    router.push(`/dashboard/${company}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Toaster />
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="text-3xl font-semibold tracking-tight">
            {companyName || 'BotPanel'}
          </div>
          <p className="text-sm text-muted-foreground">
            Accede al panel de tu chatbot
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </Card>

        {company && (
          <p className="text-center text-xs text-muted-foreground">
            Accediendo como <span className="font-medium">{company}</span>
          </p>
        )}
      </div>
    </div>
  )
}
