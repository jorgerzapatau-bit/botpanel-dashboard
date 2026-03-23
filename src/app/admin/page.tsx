'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'

const ADMIN_EMAIL = 'ramzapata@gmail.com'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // If already logged in as admin, go straight to dashboard
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email === ADMIN_EMAIL) {
        router.push('/admin/dashboard')
      } else {
        setLoading(false)
      }
    })
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    // First check email before even trying auth
    if (email.toLowerCase() !== ADMIN_EMAIL) {
      toast.error('Acceso no autorizado')
      setSubmitting(false)
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || data.user?.email !== ADMIN_EMAIL) {
      // Sign out just in case something slipped through
      await supabase.auth.signOut()
      toast.error('Credenciales incorrectas')
      setSubmitting(false)
      return
    }

    router.push('/admin/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Toaster />
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="text-2xl font-semibold tracking-tight">BotPanel</div>
          <p className="text-sm text-muted-foreground">Panel de administración</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@correo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
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
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Verificando...' : 'Entrar'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
