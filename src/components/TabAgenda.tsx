'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Appointment = {
  id: string
  phone_number: string
  contact_name: string | null
  service_name: string
  appointment_date: string
  appointment_time: string
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  notes: string | null
  created_at: string
}

type AppointmentService = {
  id: string
  name: string
  duration_minutes: number
  active: boolean
}

type AvailabilitySlot = {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

type AppointmentRules = {
  id: string
  min_advance_hours: number
  max_days_ahead: number
  buffer_minutes: number
  cancel_hours: number
  confirm_message: string
}

type ViewMode = 'appointments' | 'services' | 'horarios' | 'rules'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmada', className: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelada', className: 'bg-red-50 text-red-600 border-red-200' },
  completed: { label: 'Completada', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  no_show: { label: 'No asistió', className: 'bg-orange-50 text-orange-700 border-orange-200' },
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
}

function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function getWeekDays() {
  const days = []
  const today = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TabAgenda({ companyId }: { companyId: string }) {
  const [view, setView] = useState<ViewMode>('appointments')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<AppointmentService[]>([])
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [rules, setRules] = useState<AppointmentRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState<string>(todayISO())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [saving, setSaving] = useState(false)

  // ── Fetch citas ──
  const fetchAppointments = useCallback(async () => {
    let query = supabase
      .from('appointments')
      .select('*')
      .eq('company_id', companyId)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })

    if (dateFilter !== 'all') {
      query = query.eq('appointment_date', dateFilter)
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data } = await query
    setAppointments(data || [])
  }, [companyId, dateFilter, statusFilter])

  // ── Fetch configuración ──
  const fetchConfig = useCallback(async () => {
    const [{ data: svc }, { data: sl }, { data: rl }] = await Promise.all([
      supabase.from('appointment_services').select('*').eq('company_id', companyId).order('name'),
      supabase.from('availability_slots').select('*').eq('company_id', companyId).order('day_of_week').order('start_time'),
      supabase.from('appointment_rules').select('*').eq('company_id', companyId).single(),
    ])
    setServices(svc || [])
    setSlots(sl || [])
    setRules(rl || null)
  }, [companyId])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([fetchAppointments(), fetchConfig()])
      setLoading(false)
    }
    init()
  }, [fetchAppointments, fetchConfig])

  // Realtime: actualizar citas automáticamente
  useEffect(() => {
    const channel = supabase
      .channel(`appointments-${companyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `company_id=eq.${companyId}`,
      }, () => { fetchAppointments() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [companyId, fetchAppointments])

  // ── Cambiar status de una cita ──
  const updateStatus = async (id: string, status: Appointment['status']) => {
    const { error } = await supabase
      .from('appointments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      toast.error('Error al actualizar la cita')
    } else {
      toast.success('Cita actualizada')
      fetchAppointments()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground text-sm">Cargando agenda...</p>
      </div>
    )
  }

  const todayCount = appointments.filter(a =>
    a.appointment_date === todayISO() && a.status === 'confirmed'
  ).length

  const weekDays = getWeekDays()
  const weekCount = appointments.filter(a =>
    weekDays.includes(a.appointment_date) && a.status === 'confirmed'
  ).length

  return (
    <div className="space-y-6">

      {/* ── Stats rápidas ── */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-semibold">{todayCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Hoy confirmadas</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-semibold">{weekCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Esta semana</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-semibold">{services.filter(s => s.active).length}</p>
          <p className="text-xs text-muted-foreground mt-1">Servicios activos</p>
        </Card>
      </div>

      {/* ── Navegación de vistas ── */}
      <div className="flex gap-2 border-b pb-3">
        {([
          { key: 'appointments', label: '📅 Citas' },
          { key: 'services', label: '💼 Servicios' },
          { key: 'horarios', label: '🕐 Horarios' },
          { key: 'rules', label: '⚙️ Reglas' },
        ] as { key: ViewMode; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
              view === key
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════
          VISTA: CITAS
      ══════════════════════════════════════════════════ */}
      {view === 'appointments' && (
        <div className="space-y-4">

          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Filtro por fecha rápida */}
            <div className="flex gap-1 flex-wrap">
              {[
                { value: todayISO(), label: 'Hoy' },
                { value: new Date(Date.now() + 86400000).toISOString().split('T')[0], label: 'Mañana' },
                { value: 'all', label: 'Todas' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setDateFilter(value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    dateFilter === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
              <input
                type="date"
                value={dateFilter === 'all' ? '' : dateFilter}
                onChange={e => e.target.value && setDateFilter(e.target.value)}
                className="text-xs px-2 py-1 rounded-full border border-border bg-background text-foreground"
              />
            </div>

            {/* Filtro por estado */}
            <div className="flex gap-1 ml-auto">
              {(['all', 'confirmed', 'completed', 'cancelled', 'no_show'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-foreground'
                  }`}
                >
                  {s === 'all' ? 'Todas' : STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de citas */}
          {appointments.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              No hay citas para esta selección
            </div>
          ) : (
            <div className="space-y-2">
              {appointments.map(appt => (
                <AppointmentCard
                  key={appt.id}
                  appointment={appt}
                  onUpdateStatus={updateStatus}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          VISTA: SERVICIOS
      ══════════════════════════════════════════════════ */}
      {view === 'services' && (
        <ServicesEditor
          companyId={companyId}
          services={services}
          onRefresh={fetchConfig}
        />
      )}

      {/* ══════════════════════════════════════════════════
          VISTA: HORARIOS
      ══════════════════════════════════════════════════ */}
      {view === 'horarios' && (
        <HorariosEditor
          companyId={companyId}
          slots={slots}
          onRefresh={fetchConfig}
        />
      )}

      {/* ══════════════════════════════════════════════════
          VISTA: REGLAS
      ══════════════════════════════════════════════════ */}
      {view === 'rules' && (
        <RulesEditor
          companyId={companyId}
          rules={rules}
          onRefresh={fetchConfig}
        />
      )}
    </div>
  )
}

// ─── Tarjeta de cita individual ───────────────────────────────────────────────

function AppointmentCard({
  appointment: a,
  onUpdateStatus,
}: {
  appointment: Appointment
  onUpdateStatus: (id: string, status: Appointment['status']) => void
}) {
  const [open, setOpen] = useState(false)
  const status = STATUS_CONFIG[a.status]

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">

        {/* Fecha/hora */}
        <div className="text-center min-w-[52px]">
          <p className="text-xs text-muted-foreground">{formatDate(a.appointment_date)}</p>
          <p className="text-base font-semibold tabular-nums">{formatTime(a.appointment_time)}</p>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{a.contact_name || a.phone_number}</p>
            {a.contact_name && (
              <span className="text-xs text-muted-foreground">{a.phone_number}</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{a.service_name}</p>
          {a.notes && <p className="text-xs text-muted-foreground mt-1 italic">{a.notes}</p>}
        </div>

        {/* Acciones */}
        <button
          onClick={() => setOpen(!open)}
          className="text-muted-foreground hover:text-foreground text-lg px-1"
        >
          {open ? '▲' : '▼'}
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
          {a.status !== 'confirmed' && (
            <button
              onClick={() => onUpdateStatus(a.id, 'confirmed')}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
            >
              ✓ Confirmar
            </button>
          )}
          {a.status !== 'completed' && (
            <button
              onClick={() => onUpdateStatus(a.id, 'completed')}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
            >
              ✓ Completada
            </button>
          )}
          {a.status !== 'no_show' && (
            <button
              onClick={() => onUpdateStatus(a.id, 'no_show')}
              className="text-xs px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200"
            >
              ✗ No asistió
            </button>
          )}
          {a.status !== 'cancelled' && (
            <button
              onClick={() => onUpdateStatus(a.id, 'cancelled')}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
            >
              ✗ Cancelar
            </button>
          )}
          <a
            href={`https://wa.me/${a.phone_number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/70 border border-border ml-auto"
          >
            💬 WhatsApp
          </a>
        </div>
      )}
    </Card>
  )
}

// ─── Editor de servicios ──────────────────────────────────────────────────────

function ServicesEditor({
  companyId,
  services,
  onRefresh,
}: {
  companyId: string
  services: AppointmentService[]
  onRefresh: () => void
}) {
  const [newName, setNewName] = useState('')
  const [newDuration, setNewDuration] = useState('60')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!newName.trim()) return toast.error('Escribe el nombre del servicio')
    setSaving(true)
    const { error } = await supabase.from('appointment_services').insert({
      company_id: companyId,
      name: newName.trim(),
      duration_minutes: parseInt(newDuration) || 60,
      active: true,
    })
    if (error) {
      toast.error('Error al guardar')
    } else {
      toast.success('Servicio agregado')
      setNewName('')
      setNewDuration('60')
      onRefresh()
    }
    setSaving(false)
  }

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from('appointment_services').update({ active: !active }).eq('id', id)
    onRefresh()
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('appointment_services').delete().eq('id', id)
    if (error) toast.error('No se puede eliminar (tiene citas asociadas)')
    else { toast.success('Eliminado'); onRefresh() }
  }

  return (
    <div className="space-y-4">
      {/* Formulario nuevo servicio */}
      <Card className="p-4">
        <p className="text-sm font-medium mb-3">Agregar servicio</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Nombre del servicio"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="w-28">
            <Input
              type="number"
              placeholder="Duración min"
              value={newDuration}
              onChange={e => setNewDuration(e.target.value)}
              min={15}
              step={15}
            />
          </div>
          <Button onClick={handleAdd} disabled={saving} size="sm">
            {saving ? '...' : 'Agregar'}
          </Button>
        </div>
      </Card>

      {/* Lista */}
      {services.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">
          No hay servicios. Agrega uno arriba.
        </p>
      ) : (
        <div className="space-y-2">
          {services.map(s => (
            <Card key={s.id} className="p-3 flex items-center gap-3">
              <div className="flex-1">
                <p className={`text-sm font-medium ${!s.active ? 'line-through text-muted-foreground' : ''}`}>
                  {s.name}
                </p>
                <p className="text-xs text-muted-foreground">{s.duration_minutes} min</p>
              </div>
              <button
                onClick={() => toggleActive(s.id, s.active)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  s.active
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {s.active ? 'Activo' : 'Inactivo'}
              </button>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-xs text-red-500 hover:text-red-700 px-1"
              >
                🗑
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Editor de horarios ───────────────────────────────────────────────────────

function HorariosEditor({
  companyId,
  slots,
  onRefresh,
}: {
  companyId: string
  slots: AvailabilitySlot[]
  onRefresh: () => void
}) {
  const [newDay, setNewDay] = useState('1')
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('18:00')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (newStart >= newEnd) return toast.error('La hora de inicio debe ser antes del fin')
    setSaving(true)
    const { error } = await supabase.from('availability_slots').insert({
      company_id: companyId,
      day_of_week: parseInt(newDay),
      start_time: newStart,
      end_time: newEnd,
      active: true,
    })
    if (error) toast.error('Error al guardar')
    else { toast.success('Horario agregado'); onRefresh() }
    setSaving(false)
  }

  const toggleSlot = async (id: string, active: boolean) => {
    await supabase.from('availability_slots').update({ active: !active }).eq('id', id)
    onRefresh()
  }

  const deleteSlot = async (id: string) => {
    await supabase.from('availability_slots').delete().eq('id', id)
    toast.success('Eliminado')
    onRefresh()
  }

  // Agrupar por día
  const byDay: Record<number, AvailabilitySlot[]> = {}
  slots.forEach(s => {
    if (!byDay[s.day_of_week]) byDay[s.day_of_week] = []
    byDay[s.day_of_week].push(s)
  })

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm font-medium mb-3">Agregar horario</p>
        <div className="flex gap-2 flex-wrap">
          <select
            value={newDay}
            onChange={e => setNewDay(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground"
          >
            {DAY_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={newStart}
              onChange={e => setNewStart(e.target.value)}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground"
            />
            <span className="text-muted-foreground text-sm">a</span>
            <input
              type="time"
              value={newEnd}
              onChange={e => setNewEnd(e.target.value)}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground"
            />
          </div>
          <Button onClick={handleAdd} disabled={saving} size="sm">
            {saving ? '...' : 'Agregar'}
          </Button>
        </div>
      </Card>

      {slots.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">
          No hay horarios. Agrega turnos arriba.
        </p>
      ) : (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 0].map(day => {
            const daySlots = byDay[day]
            if (!daySlots) return null
            return (
              <Card key={day} className="p-3">
                <p className="text-sm font-medium mb-2">{DAY_NAMES[day]}</p>
                <div className="space-y-1.5">
                  {daySlots.map(slot => (
                    <div key={slot.id} className="flex items-center gap-2">
                      <span className={`text-sm tabular-nums ${!slot.active ? 'line-through text-muted-foreground' : ''}`}>
                        {slot.start_time.substring(0, 5)} – {slot.end_time.substring(0, 5)}
                      </span>
                      <button
                        onClick={() => toggleSlot(slot.id, slot.active)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                          slot.active
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {slot.active ? 'Activo' : 'Inactivo'}
                      </button>
                      <button
                        onClick={() => deleteSlot(slot.id)}
                        className="text-xs text-red-500 hover:text-red-700 ml-auto"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Editor de reglas ─────────────────────────────────────────────────────────

function RulesEditor({
  companyId,
  rules,
  onRefresh,
}: {
  companyId: string
  rules: AppointmentRules | null
  onRefresh: () => void
}) {
  const [form, setForm] = useState({
    min_advance_hours: rules?.min_advance_hours ?? 2,
    max_days_ahead: rules?.max_days_ahead ?? 14,
    buffer_minutes: rules?.buffer_minutes ?? 0,
    cancel_hours: rules?.cancel_hours ?? 24,
    confirm_message: rules?.confirm_message ?? '✅ Tu cita ha sido agendada:\n\n📅 {fecha}\n🕐 {hora}\n💼 {servicio}\n\n¡Te esperamos!',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      company_id: companyId,
      ...form,
      updated_at: new Date().toISOString(),
    }
    const { error } = rules
      ? await supabase.from('appointment_rules').update(payload).eq('company_id', companyId)
      : await supabase.from('appointment_rules').insert(payload)

    if (error) toast.error('Error al guardar')
    else { toast.success('Reglas guardadas'); onRefresh() }
    setSaving(false)
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: typeof form[key] === 'number' ? Number(e.target.value) : e.target.value })),
  })

  return (
    <Card className="p-5 space-y-4">
      <p className="text-sm font-medium">Reglas de agendamiento</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="min_advance">Anticipación mínima (horas)</Label>
          <Input id="min_advance" type="number" min={0} {...field('min_advance_hours')} />
          <p className="text-xs text-muted-foreground">Mín. horas antes para agendar</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max_days">Días máximos hacia adelante</Label>
          <Input id="max_days" type="number" min={1} {...field('max_days_ahead')} />
          <p className="text-xs text-muted-foreground">Cuántos días ofrece el bot</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="buffer">Buffer entre citas (minutos)</Label>
          <Input id="buffer" type="number" min={0} step={5} {...field('buffer_minutes')} />
          <p className="text-xs text-muted-foreground">Tiempo libre entre citas</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cancel">Anticipación para cancelar (horas)</Label>
          <Input id="cancel" type="number" min={0} {...field('cancel_hours')} />
          <p className="text-xs text-muted-foreground">Mín. horas para cancelar</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm_msg">Mensaje de confirmación</Label>
        <textarea
          id="confirm_msg"
          rows={5}
          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          {...field('confirm_message')}
        />
        <p className="text-xs text-muted-foreground">
          Variables disponibles: <code className="bg-muted px-1 rounded">{'{fecha}'}</code>{' '}
          <code className="bg-muted px-1 rounded">{'{hora}'}</code>{' '}
          <code className="bg-muted px-1 rounded">{'{servicio}'}</code>
        </p>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Guardando...' : 'Guardar reglas'}
      </Button>
    </Card>
  )
}
