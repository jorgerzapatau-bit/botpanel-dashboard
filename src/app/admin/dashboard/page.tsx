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
import CompanyMiniDashboard from '@/components/CompanyMiniDashboard'

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
  plan: string
  start_date: string
  end_date: string
  monthly_cost: number | null
  status: 'pending' | 'paid' | 'expired'
  notes: string | null
  created_at: string
}

type CompanyWithSubs = Company & { subscriptions: Subscription[] }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function plusOneMonth(fromDate: string) {
  const d = new Date(fromDate + 'T00:00:00')
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().split('T')[0]
}

function daysUntil(dateStr: string) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const end = new Date(dateStr + 'T00:00:00')
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function urgencyColor(days: number) {
  if (days < 0) return 'text-red-600 bg-red-50 border-red-200'
  if (days <= 2) return 'text-red-600 bg-red-50 border-red-200'
  if (days <= 4) return 'text-orange-600 bg-orange-50 border-orange-200'
  if (days <= 7) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-green-600 bg-green-50 border-green-200'
}

function statusLabel(s: string) {
  if (s === 'paid') return { label: 'Pagado', cls: 'bg-green-50 text-green-700 border-green-200' }
  if (s === 'pending') return { label: 'Pendiente', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
  return { label: 'Vencido', cls: 'bg-red-50 text-red-600 border-red-200' }
}

// ─── Empty form ───────────────────────────────────────────────────────────────

const makeEmptyForm = () => ({
  name: '',
  slug: '',
  email: '',
  plan: 'free' as 'free' | 'pro',
  active: true,
  sub_plan: 'free' as 'free' | 'pro',
  start_date: todayISO(),
  end_date: plusOneMonth(todayISO()),
  monthly_cost: '',
  sub_notes: '',
})

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<CompanyWithSubs[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(makeEmptyForm())
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedTab, setExpandedTab] = useState<'dashboard' | 'subscriptions'>('dashboard')
  // Subscription actions
  const [subAction, setSubAction] = useState<{ type: 'renew' | 'markpaid', companyId: string, sub?: Subscription } | null>(null)
  const [renewForm, setRenewForm] = useState({ start_date: '', end_date: '', monthly_cost: '', notes: '' })

  // Auth guard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email !== ADMIN_EMAIL) {
        router.push('/admin')
      } else {
        runExpireAndFetch()
      }
    })
  }, [router])

  const runExpireAndFetch = async () => {
    // Run expire function first
    await supabase.rpc('expire_subscriptions')
    await fetchCompanies()
  }

  const fetchCompanies = async () => {
    setLoading(true)
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: subsData } = await supabase
      .from('company_subscriptions')
      .select('*')
      .order('start_date', { ascending: false })

    const merged: CompanyWithSubs[] = (companiesData || []).map(c => ({
      ...c,
      subscriptions: (subsData || []).filter(s => s.company_id === c.id),
    }))

    setCompanies(merged)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/admin')
  }

  // Latest active subscription per company
  const latestSub = (c: CompanyWithSubs): Subscription | null => {
    const active = c.subscriptions.filter(s => s.status !== 'expired')
    if (active.length > 0) return active[0]
    return c.subscriptions[0] || null
  }

  // ─── Create / Edit company ─────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null)
    setForm(makeEmptyForm())
    setShowForm(true)
  }

  const openEdit = (c: CompanyWithSubs) => {
    const sub = latestSub(c)
    setEditingId(c.id)
    setForm({
      name: c.name,
      slug: c.slug,
      email: c.email || '',
      plan: c.plan as 'free' | 'pro',
      active: c.active,
      sub_plan: (sub?.plan || c.plan) as 'free' | 'pro',
      start_date: sub?.start_date || todayISO(),
      end_date: sub?.end_date || plusOneMonth(todayISO()),
      monthly_cost: sub?.monthly_cost?.toString() || '',
      sub_notes: sub?.notes || '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Nombre y slug son obligatorios')
      return
    }
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
      const { error } = await supabase.from('companies').update(companyPayload).eq('id', editingId)
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('companies').insert(companyPayload).select().single()
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return }
      companyId = data.id
    }

    // Create initial subscription record
    if (companyId && form.start_date && form.end_date) {
      const subPayload = {
        company_id: companyId,
        plan: form.plan,
        start_date: form.start_date,
        end_date: form.end_date,
        monthly_cost: form.plan === 'pro' && form.monthly_cost ? parseFloat(form.monthly_cost) : null,
        status: 'pending' as const,
        notes: form.sub_notes || null,
      }
      // Only insert new sub when creating company; on edit, don't overwrite history
      if (!editingId) {
        await supabase.from('company_subscriptions').insert(subPayload)
      }
    }

    toast.success(editingId ? 'Empresa actualizada' : 'Empresa creada')
    setShowForm(false)
    setSaving(false)
    await fetchCompanies()
  }

  const handleToggleActive = async (c: CompanyWithSubs) => {
    await supabase.from('companies').update({ active: !c.active }).eq('id', c.id)
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

  // ─── Subscription actions ──────────────────────────────────────────────────

  const openRenew = (c: CompanyWithSubs) => {
    const sub = latestSub(c)
    // Start from last end_date so no days lost
    const startFrom = sub?.end_date || todayISO()
    setRenewForm({
      start_date: startFrom,
      end_date: plusOneMonth(startFrom),
      monthly_cost: sub?.monthly_cost?.toString() || '',
      notes: '',
    })
    setSubAction({ type: 'renew', companyId: c.id, sub: sub || undefined })
  }

  const handleRenew = async () => {
    if (!subAction) return
    setSaving(true)
    const { error } = await supabase.from('company_subscriptions').insert({
      company_id: subAction.companyId,
      plan: companies.find(c => c.id === subAction.companyId)?.plan || 'pro',
      start_date: renewForm.start_date,
      end_date: renewForm.end_date,
      monthly_cost: renewForm.monthly_cost ? parseFloat(renewForm.monthly_cost) : null,
      status: 'pending',
      notes: renewForm.notes || null,
    })
    if (error) { toast.error('Error: ' + error.message) }
    else { toast.success('Membresía renovada — pendiente de pago') }
    setSubAction(null)
    setSaving(false)
    await fetchCompanies()
  }

  const handleMarkPaid = async (subId: string) => {
    await supabase.from('company_subscriptions').update({ status: 'paid' }).eq('id', subId)
    toast.success('Membresía marcada como pagada')
    await fetchCompanies()
  }

  // ─── Summary stats ─────────────────────────────────────────────────────────

  const totalActive = companies.filter(c => c.active).length
  const totalPro = companies.filter(c => c.plan === 'pro').length

  // Alerts: companies with active sub expiring soon
  const expiringAlerts = companies
    .map(c => {
      const sub = latestSub(c)
      if (!sub || sub.status === 'expired') return null
      const days = daysUntil(sub.end_date)
      if (days > 7) return null
      return { company: c, sub, days }
    })
    .filter(Boolean) as { company: CompanyWithSubs; sub: Subscription; days: number }[]

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
        <Button variant="ghost" size="sm" onClick={handleLogout}>Cerrar sesión</Button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Title */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold">Main Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestión de empresas del SaaS</p>
          </div>
          <Button onClick={openCreate} size="sm">+ Nueva empresa</Button>
        </div>

        {/* ─── Alertas de vencimiento ──────────────────────────────────── */}
        {expiringAlerts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              ⚠️ Membresías por vencer
            </p>
            {expiringAlerts.map(({ company, sub, days }) => (
              <div
                key={company.id}
                className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm ${urgencyColor(days)}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{company.name}</span>
                  <span className="opacity-70">·</span>
                  <span>Vence {formatDate(sub.end_date)}</span>
                </div>
                <span className="font-bold">
                  {days <= 0 ? 'Vencida hoy' : days === 1 ? '1 día restante' : `${days} días restantes`}
                </span>
              </div>
            ))}
          </div>
        )}

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

        {/* ─── Company list ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Empresas</p>

          {companies.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No hay empresas registradas aún.</p>
            </Card>
          )}

          {companies.map(c => {
            const sub = latestSub(c)
            const isExpanded = expandedId === c.id
            const daysLeft = sub && sub.status !== 'expired' ? daysUntil(sub.end_date) : null

            return (
              <Card key={c.id} className={`overflow-hidden ${!c.active ? 'opacity-70' : ''}`}>
                {/* ── Company header row ── */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Name + badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{c.name}</p>
                        <Badge variant="secondary" className={`text-xs ${c.plan === 'pro' ? 'bg-violet-50 text-violet-700 border-violet-200' : ''}`}>
                          {c.plan}
                        </Badge>
                        <Badge variant="secondary" className={`text-xs ${c.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                          {c.active ? '● Activa' : '○ Inactiva'}
                        </Badge>
                        {!c.active && sub?.status === 'expired' && (
                          <span className="text-xs text-red-500">Membresía vencida</span>
                        )}
                      </div>

                      {/* Meta info */}
                      <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>Slug: <span className="font-mono text-foreground">{c.slug}</span></span>
                        <span>URL: <span className="font-mono text-foreground">/dashboard/{c.slug}</span></span>
                        {c.email && <span>{c.email}</span>}
                        <span>Creada: {formatDateTime(c.created_at)}</span>
                      </div>

                      {/* Subscription summary */}
                      {sub && (
                        <div className={`flex gap-4 text-xs flex-wrap pt-2 border-t border-border`}>
                          <span className="text-muted-foreground">
                            Membresía:{' '}
                            <span className={`font-medium px-1.5 py-0.5 rounded-md border ${statusLabel(sub.status).cls}`}>
                              {statusLabel(sub.status).label}
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            Período: <span className="text-foreground">{formatDate(sub.start_date)} → {formatDate(sub.end_date)}</span>
                          </span>
                          {sub.monthly_cost != null && (
                            <span className="text-muted-foreground">
                              Costo: <span className="text-foreground font-medium">${sub.monthly_cost.toLocaleString('es-MX')} MXN</span>
                            </span>
                          )}
                          {daysLeft !== null && (
                            <span className={`font-medium ${daysLeft <= 2 ? 'text-red-500' : daysLeft <= 4 ? 'text-orange-500' : daysLeft <= 7 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                              {daysLeft <= 0 ? 'Vence hoy' : `${daysLeft} días restantes`}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button variant="outline" size="sm" className="text-xs h-7 w-24" onClick={() => openEdit(c)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 w-24" onClick={() => handleToggleActive(c)}>
                        {c.active ? 'Desactivar' : 'Activar'}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 w-24" onClick={() => openRenew(c)}>
                        Renovar
                      </Button>
                      {confirmDelete === c.id ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="text-xs h-7 flex-1" onClick={() => setConfirmDelete(null)}>No</Button>
                          <Button variant="ghost" size="sm" className="text-xs h-7 flex-1 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>Sí</Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-xs h-7 w-24 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(c.id)}>
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expand toggle */}
                  <button
                    className="mt-3 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  >
                    <span>{isExpanded ? '▲ Ocultar detalle' : '▼ Ver detalle'}</span>
                  </button>
                </div>

                {/* ── Expanded panel ── */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Tab selector */}
                    <div className="flex border-b border-border bg-muted/30">
                      {(['dashboard', 'subscriptions'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setExpandedTab(tab)}
                          className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            expandedTab === tab
                              ? 'border-foreground text-foreground'
                              : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {tab === 'dashboard' ? 'Dashboard' : 'Membresías'}
                        </button>
                      ))}
                    </div>

                    <div className="p-5">
                      {/* Mini Dashboard */}
                      {expandedTab === 'dashboard' && (
                        <CompanyMiniDashboard companyId={c.id} />
                      )}

                      {/* Subscription history */}
                      {expandedTab === 'subscriptions' && (
                        <div className="space-y-2">
                          {c.subscriptions.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No hay registros de membresía aún.
                            </p>
                          ) : (
                            c.subscriptions.map(s => {
                              const { label, cls } = statusLabel(s.status)
                              return (
                                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${cls}`}>{label}</span>
                                      <span className="text-xs font-medium capitalize">{s.plan}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDate(s.start_date)} → {formatDate(s.end_date)}
                                    </p>
                                    {s.monthly_cost != null && (
                                      <p className="text-xs text-muted-foreground">
                                        ${s.monthly_cost.toLocaleString('es-MX')} MXN/mes
                                      </p>
                                    )}
                                    {s.notes && <p className="text-xs text-muted-foreground italic">{s.notes}</p>}
                                  </div>
                                  {s.status === 'pending' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7 text-green-700 border-green-200 hover:bg-green-50"
                                      onClick={() => handleMarkPaid(s.id)}
                                    >
                                      Marcar pagado
                                    </Button>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </main>

      {/* ─── Slide-in form: Create/Edit company ──────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-background border-l shadow-xl flex flex-col overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-semibold text-base">{editingId ? 'Editar empresa' : 'Nueva empresa'}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>

            <div className="p-6 space-y-5 flex-1">
              {/* Company data */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Datos de la empresa</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="f-name">Nombre *</Label>
                    <Input id="f-name" placeholder="Ej. NutriSport Pro" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="f-slug">Slug * <span className="text-xs text-muted-foreground font-normal">(solo minúsculas, números y guiones)</span></Label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground font-mono shrink-0">/dashboard/</span>
                      <Input id="f-slug" placeholder="nutrisport" value={form.slug} className="font-mono"
                        onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="f-email">Email de contacto</Label>
                    <Input id="f-email" type="email" placeholder="cliente@empresa.com" value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Plan</Label>
                      <div className="flex gap-2">
                        {(['free', 'pro'] as const).map(p => (
                          <button key={p} onClick={() => setForm(f => ({ ...f, plan: p, sub_plan: p }))}
                            className={`flex-1 py-1.5 rounded-lg text-sm border capitalize transition-all ${form.plan === p ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Estado</Label>
                      <div className="flex gap-2">
                        {[true, false].map(v => (
                          <button key={String(v)} onClick={() => setForm(f => ({ ...f, active: v }))}
                            className={`flex-1 py-1.5 rounded-lg text-sm border transition-all ${form.active === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                            {v ? 'Activa' : 'Inactiva'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscription — only for new companies */}
              {!editingId && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {form.plan === 'free' ? 'Período de prueba' : 'Suscripción inicial'}
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    {form.plan === 'free'
                      ? 'Define el tiempo de acceso gratuito para esta empresa.'
                      : 'Este período quedará como pendiente de pago.'}
                  </p>
                  <div className="space-y-3">
                    {form.plan === 'pro' && (
                      <div className="space-y-1.5">
                        <Label htmlFor="f-cost">Costo mensual (MXN)</Label>
                        <Input id="f-cost" type="number" placeholder="Ej. 499" value={form.monthly_cost}
                          onChange={e => setForm(f => ({ ...f, monthly_cost: e.target.value }))} />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="f-start">Fecha de inicio</Label>
                        <Input id="f-start" type="date" value={form.start_date}
                          onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: plusOneMonth(e.target.value) }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="f-end">{form.plan === 'free' ? 'Fin de prueba' : 'Vencimiento'}</Label>
                        <Input id="f-end" type="date" value={form.end_date}
                          onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-notes">Notas (opcional)</Label>
                      <Input id="f-notes" placeholder="Ej. Primer mes gratis por referido" value={form.sub_notes}
                        onChange={e => setForm(f => ({ ...f, sub_notes: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {editingId && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  Para agregar o renovar la membresía, usa el botón <strong>Renovar</strong> en la tarjeta de la empresa.
                </p>
              )}
            </div>

            <div className="p-6 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear empresa'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Slide-in: Renew subscription ────────────────────────────────── */}
      {subAction?.type === 'renew' && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setSubAction(null)} />
          <div className="w-full max-w-md bg-background border-l shadow-xl flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-semibold text-base">Renovar membresía</h2>
              <button onClick={() => setSubAction(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4 flex-1">
              <p className="text-sm text-muted-foreground">
                El nuevo período inicia donde terminó el anterior para no perder días.
              </p>
              <div className="space-y-1.5">
                <Label>Costo mensual (MXN)</Label>
                <Input type="number" placeholder="Ej. 499" value={renewForm.monthly_cost}
                  onChange={e => setRenewForm(f => ({ ...f, monthly_cost: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Fecha de inicio</Label>
                  <Input type="date" value={renewForm.start_date}
                    onChange={e => setRenewForm(f => ({ ...f, start_date: e.target.value, end_date: plusOneMonth(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Vencimiento</Label>
                  <Input type="date" value={renewForm.end_date}
                    onChange={e => setRenewForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notas (opcional)</Label>
                <Input placeholder="Ej. Renovación mensual" value={renewForm.notes}
                  onChange={e => setRenewForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="p-6 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSubAction(null)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleRenew} disabled={saving}>
                {saving ? 'Guardando...' : 'Crear renovación'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
