'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'

const ADMIN_EMAIL = 'ramzapata@gmail.com'

type Company = {
  id: string
  slug: string
  name: string
  email: string | null
  plan: string
  active: boolean
  created_at: string
}

type Subscription = {
  id: string
  company_id: string
  start_date: string | null
  next_billing_date: string | null
  monthly_cost: number | null
}

type CompanyWithSub = Company & { subscription: Subscription | null }

const EMPTY_FORM = {
  name: '',
  slug: '',
  email: '',
  plan: 'free' as 'free' | 'pro',
  active: true,
  start_date: '',
  next_billing_date: '',
  monthly_cost: '',
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<CompanyWithSub[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Auth guard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email !== ADMIN_EMAIL) {
        router.push('/admin')
      } else {
        fetchCompanies()
      }
    })
  }, [router])

  const fetchCompanies = async () => {
    setLoading(true)
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: subsData } = await supabase
      .from('company_subscriptions')
      .select('*')

    const merged: CompanyWithSub[] = (companiesData || []).map(c => ({
      ...c,
      subscription: subsData?.find(s => s.company_id === c.id) || null,
    }))

    setCompanies(merged)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/admin')
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  const openEdit = (c: CompanyWithSub) => {
    setEditingId(c.id)
    setForm({
      name: c.name,
      slug: c.slug,
      email: c.email || '',
      plan: c.plan as 'free' | 'pro',
      active: c.active,
      start_date: c.subscription?.start_date?.split('T')[0] || '',
      next_billing_date: c.subscription?.next_billing_date?.split('T')[0] || '',
      monthly_cost: c.subscription?.monthly_cost?.toString() || '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Nombre y slug son obligatorios')
      return
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(form.slug)) {
      toast.error('El slug solo puede tener letras minúsculas, números y guiones')
      return
    }

    setSaving(true)

    const companyPayload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      email: form.email.trim() || null,
      plan: form.plan,
      active: form.active,
    }

    let companyId = editingId

    if (editingId) {
      // Update existing
      const { error } = await supabase
        .from('companies')
        .update(companyPayload)
        .eq('id', editingId)

      if (error) {
        toast.error('Error al actualizar: ' + error.message)
        setSaving(false)
        return
      }
    } else {
      // Create new
      const { data, error } = await supabase
        .from('companies')
        .insert(companyPayload)
        .select()
        .single()

      if (error) {
        toast.error('Error al crear: ' + error.message)
        setSaving(false)
        return
      }
      companyId = data.id
    }

    // Upsert subscription
    if (companyId && (form.start_date || form.next_billing_date || form.monthly_cost)) {
      const subPayload = {
        company_id: companyId,
        start_date: form.start_date || null,
        next_billing_date: form.next_billing_date || null,
        monthly_cost: form.monthly_cost ? parseFloat(form.monthly_cost) : null,
      }

      // Check if subscription exists
      const { data: existingSub } = await supabase
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .single()

      if (existingSub) {
        await supabase
          .from('company_subscriptions')
          .update(subPayload)
          .eq('company_id', companyId)
      } else {
        await supabase
          .from('company_subscriptions')
          .insert(subPayload)
      }
    }

    toast.success(editingId ? 'Empresa actualizada' : 'Empresa creada')
    setShowForm(false)
    setEditingId(null)
    setSaving(false)
    await fetchCompanies()
  }

  const handleToggleActive = async (c: CompanyWithSub) => {
    await supabase
      .from('companies')
      .update({ active: !c.active })
      .eq('id', c.id)
    toast.success(c.active ? 'Empresa desactivada' : 'Empresa activada')
    await fetchCompanies()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('company_subscriptions').delete().eq('company_id', id)
    await supabase.from('companies').delete().eq('id', id)
    toast.success('Empresa eliminada')
    setConfirmDelete(null)
    await fetchCompanies()
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const totalActive = companies.filter(c => c.active).length
  const totalPro = companies.filter(c => c.plan === 'pro').length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">BotPanel</span>
          <Badge variant="secondary" className="text-xs">Admin</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Cerrar sesión
        </Button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Title + CTA */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold">Main Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestión de empresas del SaaS</p>
          </div>
          <Button onClick={openCreate} size="sm">
            + Nueva empresa
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 text-center space-y-1">
            <p className="text-3xl font-bold tabular-nums">{companies.length}</p>
            <p className="text-xs text-muted-foreground">Total empresas</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <p className="text-3xl font-bold tabular-nums text-green-600">{totalActive}</p>
            <p className="text-xs text-muted-foreground">Activas</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <p className="text-3xl font-bold tabular-nums">{companies.length - totalActive}</p>
            <p className="text-xs text-muted-foreground">Inactivas</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <p className="text-3xl font-bold tabular-nums">{totalPro}</p>
            <p className="text-xs text-muted-foreground">Plan Pro</p>
          </Card>
        </div>

        {/* Company list */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Empresas</p>

          {companies.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No hay empresas registradas aún.</p>
            </Card>
          )}

          {companies.map(c => (
            <Card key={c.id} className={`p-5 ${!c.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Name + badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{c.name}</p>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${c.plan === 'pro' ? 'bg-violet-50 text-violet-700 border-violet-200' : ''}`}
                    >
                      {c.plan}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${c.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-muted'}`}
                    >
                      {c.active ? '● Activa' : '○ Inactiva'}
                    </Badge>
                  </div>

                  {/* Slug + email */}
                  <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>
                      Slug: <span className="font-mono text-foreground">{c.slug}</span>
                    </span>
                    <span>
                      URL: <span className="font-mono text-foreground">/dashboard/{c.slug}</span>
                    </span>
                    {c.email && <span>{c.email}</span>}
                    <span>Creada: {formatDate(c.created_at)}</span>
                  </div>

                  {/* Subscription info */}
                  {c.subscription && (
                    <div className="flex gap-4 text-xs text-muted-foreground flex-wrap pt-1 border-t border-border mt-2">
                      {c.subscription.monthly_cost != null && (
                        <span>
                          Costo mensual:{' '}
                          <span className="font-medium text-foreground">
                            ${c.subscription.monthly_cost.toLocaleString('es-MX')} MXN
                          </span>
                        </span>
                      )}
                      {c.subscription.start_date && (
                        <span>Inicio: {formatDate(c.subscription.start_date)}</span>
                      )}
                      {c.subscription.next_billing_date && (
                        <span
                          className={
                            new Date(c.subscription.next_billing_date) < new Date()
                              ? 'text-red-500 font-medium'
                              : ''
                          }
                        >
                          Próximo pago: {formatDate(c.subscription.next_billing_date)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 w-24"
                    onClick={() => openEdit(c)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 w-24"
                    onClick={() => handleToggleActive(c)}
                  >
                    {c.active ? 'Desactivar' : 'Activar'}
                  </Button>
                  {confirmDelete === c.id ? (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 flex-1"
                        onClick={() => setConfirmDelete(null)}
                      >
                        No
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 flex-1 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(c.id)}
                      >
                        Sí
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 w-24 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(c.id)}
                    >
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>

      {/* ─── Slide-in form panel ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div
            className="flex-1 bg-black/30"
            onClick={() => setShowForm(false)}
          />

          {/* Panel */}
          <div className="w-full max-w-md bg-background border-l shadow-xl flex flex-col overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-semibold text-base">
                {editingId ? 'Editar empresa' : 'Nueva empresa'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 flex-1">
              {/* Company info */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Datos de la empresa
                </p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="f-name">Nombre *</Label>
                    <Input
                      id="f-name"
                      placeholder="Ej. NutriSport Pro"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="f-slug">
                      Slug *
                      <span className="ml-1 text-xs text-muted-foreground font-normal">
                        (solo minúsculas, números y guiones)
                      </span>
                    </Label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground font-mono shrink-0">/dashboard/</span>
                      <Input
                        id="f-slug"
                        placeholder="nutrisport"
                        value={form.slug}
                        onChange={e => setForm(f => ({
                          ...f,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                        }))}
                        className="font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="f-email">Email de contacto</Label>
                    <Input
                      id="f-email"
                      type="email"
                      placeholder="cliente@empresa.com"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Plan</Label>
                      <div className="flex gap-2">
                        {(['free', 'pro'] as const).map(p => (
                          <button
                            key={p}
                            onClick={() => setForm(f => ({ ...f, plan: p }))}
                            className={`flex-1 py-1.5 rounded-lg text-sm border transition-all capitalize ${
                              form.plan === p
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Estado</Label>
                      <div className="flex gap-2">
                        {[true, false].map(v => (
                          <button
                            key={String(v)}
                            onClick={() => setForm(f => ({ ...f, active: v }))}
                            className={`flex-1 py-1.5 rounded-lg text-sm border transition-all ${
                              form.active === v
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            {v ? 'Activa' : 'Inactiva'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscription info */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Suscripción <span className="normal-case font-normal">(opcional)</span>
                </p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="f-cost">Costo mensual (MXN)</Label>
                    <Input
                      id="f-cost"
                      type="number"
                      placeholder="Ej. 499"
                      value={form.monthly_cost}
                      onChange={e => setForm(f => ({ ...f, monthly_cost: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="f-start">Fecha de inicio</Label>
                      <Input
                        id="f-start"
                        type="date"
                        value={form.start_date}
                        onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="f-next">Próximo vencimiento</Label>
                      <Input
                        id="f-next"
                        type="date"
                        value={form.next_billing_date}
                        onChange={e => setForm(f => ({ ...f, next_billing_date: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear empresa'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
