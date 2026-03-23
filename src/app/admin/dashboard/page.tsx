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
  id: string; slug: string; name: string; email: string | null
  plan: string; active: boolean; created_at: string; notes: string | null
}

type Subscription = {
  id: string; company_id: string; plan: string
  start_date: string; end_date: string
  monthly_cost: number | null; status: 'pending' | 'paid' | 'expired'
  notes: string | null; created_at: string
}

type CompanyWithSubs = Company & { subscriptions: Subscription[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayISO = () => new Date().toISOString().split('T')[0]

function plusOneMonth(from: string) {
  const d = new Date(from + 'T00:00:00')
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
  if (days <= 2) return 'text-red-600 bg-red-50 border-red-200'
  if (days <= 4) return 'text-orange-600 bg-orange-50 border-orange-200'
  return 'text-yellow-600 bg-yellow-50 border-yellow-200'
}

function statusBadge(s: string) {
  if (s === 'paid')    return { label: '✓ Pagado',    cls: 'bg-green-50 text-green-700 border-green-200' }
  if (s === 'pending') return { label: '⏳ Pendiente', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
  return                      { label: '✕ Vencido',   cls: 'bg-red-50 text-red-600 border-red-200' }
}

const makeEmptyForm = () => ({
  name: '', slug: '', email: '', plan: 'free' as 'free' | 'pro',
  active: true, notes: '',
  start_date: todayISO(), end_date: plusOneMonth(todayISO()),
  monthly_cost: '', sub_notes: '',
})

// ─── Component ────────────────────────────────────────────────────────────────

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
  const [showRenew, setShowRenew] = useState<CompanyWithSubs | null>(null)
  const [renewForm, setRenewForm] = useState({ start_date: '', end_date: '', monthly_cost: '', notes: '' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email !== ADMIN_EMAIL) router.push('/admin')
      else { supabase.rpc('expire_subscriptions').then(() => fetchCompanies()) }
    })
  }, [router])

  const fetchCompanies = async () => {
    setLoading(true)
    const { data: companiesData } = await supabase.from('companies').select('*').order('created_at', { ascending: false })
    const { data: subsData } = await supabase.from('company_subscriptions').select('*').order('start_date', { ascending: false })
    setCompanies((companiesData || []).map(c => ({
      ...c,
      subscriptions: (subsData || []).filter(s => s.company_id === c.id),
    })))
    setLoading(false)
  }

  const latestSub = (c: CompanyWithSubs): Subscription | null => {
    const active = c.subscriptions.filter(s => s.status !== 'expired')
    return active[0] || c.subscriptions[0] || null
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  const totalActive = companies.filter(c => c.active).length
  const totalPro    = companies.filter(c => c.plan === 'pro').length

  // Ingresos del mes: membresías pagadas cuyo período cubre el mes actual
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  const monthlyRevenue = companies.reduce((sum, c) => {
    const paid = c.subscriptions.filter(s =>
      s.status === 'paid' && s.monthly_cost != null &&
      s.start_date <= monthEnd && s.end_date >= monthStart
    )
    return sum + paid.reduce((s2, s) => s2 + (s.monthly_cost || 0), 0)
  }, 0)

  // Pending payments total
  const pendingRevenue = companies.reduce((sum, c) => {
    const pend = c.subscriptions.filter(s => s.status === 'pending' && s.monthly_cost != null)
    return sum + pend.reduce((s2, s) => s2 + (s.monthly_cost || 0), 0)
  }, 0)

  const expiringAlerts = companies
    .map(c => {
      const sub = latestSub(c)
      if (!sub || sub.status === 'expired') return null
      const days = daysUntil(sub.end_date)
      if (days > 7) return null
      return { company: c, sub, days }
    })
    .filter(Boolean) as { company: CompanyWithSubs; sub: Subscription; days: number }[]

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/admin') }

  const openCreate = () => { setEditingId(null); setForm(makeEmptyForm()); setShowForm(true) }

  const openEdit = (c: CompanyWithSubs) => {
    setEditingId(c.id)
    setForm({
      name: c.name, slug: c.slug, email: c.email || '',
      plan: c.plan as 'free' | 'pro', active: c.active, notes: c.notes || '',
      start_date: todayISO(), end_date: plusOneMonth(todayISO()),
      monthly_cost: '', sub_notes: '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) { toast.error('Nombre y slug son obligatorios'); return }
    if (!/^[a-z0-9-]+$/.test(form.slug)) { toast.error('El slug solo puede tener letras minúsculas, números y guiones'); return }
    setSaving(true)

    const payload = {
      name: form.name.trim(), slug: form.slug.trim().toLowerCase(),
      email: form.email.trim() || null, plan: form.plan,
      active: form.active, notes: form.notes.trim() || null,
    }

    let companyId = editingId
    if (editingId) {
      const { error } = await supabase.from('companies').update(payload).eq('id', editingId)
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('companies').insert(payload).select().single()
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return }
      companyId = data.id
      // Create initial subscription
      if (form.start_date && form.end_date) {
        await supabase.from('company_subscriptions').insert({
          company_id: companyId,
          plan: form.plan,
          start_date: form.start_date,
          end_date: form.end_date,
          monthly_cost: form.plan === 'pro' && form.monthly_cost ? parseFloat(form.monthly_cost) : null,
          status: 'pending',
          notes: form.sub_notes || null,
        })
      }
    }

    toast.success(editingId ? 'Empresa actualizada' : 'Empresa creada')
    setShowForm(false); setSaving(false)
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
    toast.success('Empresa eliminada'); setConfirmDelete(null)
    await fetchCompanies()
  }

  const openRenew = (c: CompanyWithSubs) => {
    const sub = latestSub(c)
    const startFrom = sub?.end_date || todayISO()
    setRenewForm({
      start_date: startFrom, end_date: plusOneMonth(startFrom),
      monthly_cost: sub?.monthly_cost?.toString() || '', notes: '',
    })
    setShowRenew(c)
  }

  const handleRenew = async () => {
    if (!showRenew) return
    setSaving(true)
    const { error } = await supabase.from('company_subscriptions').insert({
      company_id: showRenew.id,
      plan: showRenew.plan,
      start_date: renewForm.start_date,
      end_date: renewForm.end_date,
      monthly_cost: renewForm.monthly_cost ? parseFloat(renewForm.monthly_cost) : null,
      status: 'pending',
      notes: renewForm.notes || null,
    })
    if (error) toast.error('Error: ' + error.message)
    else toast.success('Renovación creada — pendiente de pago')
    setShowRenew(null); setSaving(false)
    await fetchCompanies()
  }

  const handleMarkPaid = async (subId: string) => {
    await supabase.from('company_subscriptions').update({ status: 'paid' }).eq('id', subId)
    toast.success('Membresía marcada como pagada')
    await fetchCompanies()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Cargando...</p>
    </div>
  )

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

        {/* ─── Alertas de vencimiento ──────────────────────────── */}
        {expiringAlerts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">⚠️ Membresías por vencer</p>
            {expiringAlerts.map(({ company, sub, days }) => (
              <div key={company.id}
                className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm ${urgencyColor(days)}`}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{company.name}</span>
                  <span className="opacity-60">·</span>
                  <span>Vence {formatDate(sub.end_date)}</span>
                </div>
                <span className="font-bold">
                  {days <= 0 ? 'Vence hoy' : days === 1 ? '1 día restante' : `${days} días restantes`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ─── Summary cards ───────────────────────────────────── */}
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
            <p className="text-3xl font-bold tabular-nums text-violet-600">{totalPro}</p>
            <p className="text-xs text-muted-foreground">Plan Pro</p>
          </Card>
          {/* Ingresos del mes */}
          <Card className="p-4 text-center space-y-1">
            <p className="text-2xl font-bold tabular-nums text-green-600">
              ${monthlyRevenue.toLocaleString('es-MX')}
            </p>
            <p className="text-xs text-muted-foreground">Ingresos este mes</p>
          </Card>
        </div>

        {/* Pending payments banner */}
        {pendingRevenue > 0 && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-yellow-200 bg-yellow-50 text-sm">
            <span className="text-yellow-700">💰 Pagos pendientes de confirmar</span>
            <span className="font-bold text-yellow-800">${pendingRevenue.toLocaleString('es-MX')} MXN</span>
          </div>
        )}

        {/* ─── Company list ─────────────────────────────────────── */}
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
            const { label: subLabel, cls: subCls } = sub ? statusBadge(sub.status) : { label: 'Sin membresía', cls: 'bg-muted text-muted-foreground border-border' }

            return (
              <Card key={c.id} className={`overflow-hidden transition-opacity ${!c.active ? 'opacity-60' : ''}`}>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">

                      {/* Row 1: name + plan + active + payment status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{c.name}</p>
                        <Badge variant="secondary" className={`text-xs ${c.plan === 'pro' ? 'bg-violet-50 text-violet-700 border-violet-200' : ''}`}>
                          {c.plan}
                        </Badge>
                        <Badge variant="secondary" className={`text-xs ${c.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                          {c.active ? '● Activa' : '○ Inactiva'}
                        </Badge>
                        {/* Payment status indicator — visible without opening detail */}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${subCls}`}>
                          {subLabel}
                        </span>
                        {!c.active && sub?.status === 'expired' && (
                          <span className="text-xs text-red-500 font-medium">· Membresía vencida</span>
                        )}
                      </div>

                      {/* Row 2: meta */}
                      <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>Slug: <span className="font-mono text-foreground">{c.slug}</span></span>
                        <span>URL: <span className="font-mono text-foreground">/dashboard/{c.slug}</span></span>
                        {c.email && <span>{c.email}</span>}
                        <span>Creada: {formatDateTime(c.created_at)}</span>
                      </div>

                      {/* Row 3: notes */}
                      {c.notes && (
                        <p className="text-xs text-muted-foreground italic bg-muted/40 rounded-lg px-2.5 py-1.5">
                          📝 {c.notes}
                        </p>
                      )}

                      {/* Row 4: subscription summary */}
                      {sub && (
                        <div className="flex gap-4 text-xs flex-wrap pt-2 border-t border-border items-center">
                          <span className="text-muted-foreground">
                            Período: <span className="text-foreground">{formatDate(sub.start_date)} → {formatDate(sub.end_date)}</span>
                          </span>
                          {sub.monthly_cost != null ? (
                            <span className="text-muted-foreground">
                              <span className="text-foreground font-medium">${sub.monthly_cost.toLocaleString('es-MX')} MXN</span>/mes
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">Sin costo (período de prueba)</span>
                          )}
                          {daysLeft !== null && (
                            <span className={`font-medium ${daysLeft <= 2 ? 'text-red-500' : daysLeft <= 4 ? 'text-orange-500' : daysLeft <= 7 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                              {daysLeft <= 0 ? '⚠️ Vence hoy' : `${daysLeft} días restantes`}
                            </span>
                          )}
                          {/* Quick mark paid button */}
                          {sub.status === 'pending' && (
                            <button
                              onClick={() => handleMarkPaid(sub.id)}
                              className="text-xs font-medium text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 px-2.5 py-0.5 rounded-md transition-colors"
                            >
                              ✓ Marcar pagado
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button variant="outline" size="sm" className="text-xs h-7 w-24" onClick={() => openEdit(c)}>Editar</Button>
                      <Button variant="ghost"   size="sm" className="text-xs h-7 w-24" onClick={() => handleToggleActive(c)}>
                        {c.active ? 'Desactivar' : 'Activar'}
                      </Button>
                      <Button variant="ghost"   size="sm" className="text-xs h-7 w-24" onClick={() => openRenew(c)}>Renovar</Button>
                      {confirmDelete === c.id ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="text-xs h-7 flex-1" onClick={() => setConfirmDelete(null)}>No</Button>
                          <Button variant="ghost" size="sm" className="text-xs h-7 flex-1 text-destructive" onClick={() => handleDelete(c.id)}>Sí</Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-xs h-7 w-24 text-destructive" onClick={() => setConfirmDelete(c.id)}>Eliminar</Button>
                      )}
                    </div>
                  </div>

                  {/* Expand toggle */}
                  <button
                    className="mt-3 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  >
                    {isExpanded ? '▲ Ocultar detalle' : '▼ Ver detalle'}
                  </button>
                </div>

                {/* ── Expanded panel ── */}
                {isExpanded && (
                  <div className="border-t border-border">
                    <div className="flex border-b border-border bg-muted/30">
                      {(['dashboard', 'subscriptions'] as const).map(tab => (
                        <button key={tab} onClick={() => setExpandedTab(tab)}
                          className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            expandedTab === tab ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}>
                          {tab === 'dashboard' ? 'Dashboard' : 'Membresías'}
                        </button>
                      ))}
                    </div>

                    <div className="p-5">
                      {expandedTab === 'dashboard' && <CompanyMiniDashboard companyId={c.id} />}

                      {expandedTab === 'subscriptions' && (
                        <div className="space-y-2">
                          {c.subscriptions.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No hay registros de membresía aún.</p>
                          ) : (
                            c.subscriptions.map(s => {
                              const { label, cls } = statusBadge(s.status)
                              return (
                                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${cls}`}>{label}</span>
                                      <span className="text-xs font-medium capitalize">{s.plan}</span>
                                      {s.monthly_cost != null
                                        ? <span className="text-xs text-muted-foreground">${s.monthly_cost.toLocaleString('es-MX')} MXN/mes</span>
                                        : <span className="text-xs text-muted-foreground italic">Sin costo</span>
                                      }
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDate(s.start_date)} → {formatDate(s.end_date)}
                                    </p>
                                    {s.notes && <p className="text-xs text-muted-foreground italic">{s.notes}</p>}
                                  </div>
                                  {s.status === 'pending' && (
                                    <Button size="sm" variant="outline"
                                      className="text-xs h-7 text-green-700 border-green-200 hover:bg-green-50"
                                      onClick={() => handleMarkPaid(s.id)}>
                                      ✓ Marcar pagado
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

      {/* ─── Slide-in: Crear / Editar empresa ────────────────────── */}
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
                    <Label>Nombre *</Label>
                    <Input placeholder="Ej. NutriSport Pro" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Slug * <span className="text-xs text-muted-foreground font-normal">(minúsculas, números, guiones)</span></Label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground font-mono shrink-0">/dashboard/</span>
                      <Input placeholder="nutrisport" value={form.slug} className="font-mono"
                        onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email de contacto</Label>
                    <Input type="email" placeholder="cliente@empresa.com" value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  {/* Internal notes */}
                  <div className="space-y-1.5">
                    <Label>Notas internas <span className="text-xs text-muted-foreground font-normal">(solo visible para ti)</span></Label>
                    <Input placeholder="Ej. Cliente referido por Juan, descuento especial" value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Plan</Label>
                      <div className="flex gap-2">
                        {(['free', 'pro'] as const).map(p => (
                          <button key={p} onClick={() => setForm(f => ({ ...f, plan: p }))}
                            className={`flex-1 py-1.5 rounded-lg text-sm border capitalize transition-all ${form.plan === p ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Estado</Label>
                      <div className="flex gap-2">
                        {([true, false] as const).map(v => (
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

              {/* Subscription section — only on create */}
              {!editingId && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {form.plan === 'free' ? 'Período de prueba' : 'Suscripción inicial'}
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    {form.plan === 'free'
                      ? 'Define el tiempo de acceso gratuito. Sin costo.'
                      : 'El período quedará como pendiente de pago hasta que lo confirmes.'}
                  </p>
                  <div className="space-y-3">
                    {/* Cost — only for Pro */}
                    {form.plan === 'pro' && (
                      <div className="space-y-1.5">
                        <Label>Costo mensual (MXN)</Label>
                        <Input type="number" placeholder="Ej. 499" value={form.monthly_cost}
                          onChange={e => setForm(f => ({ ...f, monthly_cost: e.target.value }))} />
                      </div>
                    )}
                    {form.plan === 'free' && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                        🎁 Sin costo — período de prueba gratuito
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Inicio</Label>
                        <Input type="date" value={form.start_date}
                          onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: plusOneMonth(e.target.value) }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{form.plan === 'free' ? 'Fin de prueba' : 'Vencimiento'}</Label>
                        <Input type="date" value={form.end_date}
                          onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nota de membresía <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
                      <Input placeholder="Ej. Primer mes gratis por referido" value={form.sub_notes}
                        onChange={e => setForm(f => ({ ...f, sub_notes: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {editingId && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  Para renovar o agregar membresía, usa el botón <strong>Renovar</strong> en la tarjeta de la empresa.
                </div>
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

      {/* ─── Slide-in: Renovar membresía ─────────────────────────── */}
      {showRenew && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowRenew(null)} />
          <div className="w-full max-w-md bg-background border-l shadow-xl flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-base">Renovar membresía</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{showRenew.name}</p>
              </div>
              <button onClick={() => setShowRenew(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4 flex-1">
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                El nuevo período inicia donde terminó el anterior para no perder días.
              </div>
              {/* Only show cost if plan is Pro */}
              {showRenew.plan === 'pro' && (
                <div className="space-y-1.5">
                  <Label>Costo mensual (MXN)</Label>
                  <Input type="number" placeholder="Ej. 499" value={renewForm.monthly_cost}
                    onChange={e => setRenewForm(f => ({ ...f, monthly_cost: e.target.value }))} />
                </div>
              )}
              {showRenew.plan === 'free' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                  🎁 Sin costo — extensión de período de prueba
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Inicio</Label>
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
                <Label>Notas <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
                <Input placeholder="Ej. Renovación mensual" value={renewForm.notes}
                  onChange={e => setRenewForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="p-6 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowRenew(null)}>Cancelar</Button>
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
