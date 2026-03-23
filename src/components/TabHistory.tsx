'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import type { ChatMessage, BotKnowledge } from '@/types'

type Contact = {
  phone_number: string
  contact_name: string | null
  last_message: string
  last_time: string
  count: number
}

// ─── Selector de rango de fechas ──────────────────────────────────────────────
type DateRange = 'all' | 'today' | 'yesterday' | string // string = 'YYYY-MM-DD' specific day

function buildDateRange(range: DateRange): { from: Date | null; to: Date | null; label: string } {
  const now = new Date()
  if (range === 'all') return { from: null, to: null, label: 'Todos' }
  if (range === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0)
    const to = new Date(now); to.setHours(23, 59, 59, 999)
    return { from, to, label: 'Hoy' }
  }
  if (range === 'yesterday') {
    const from = new Date(now); from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0)
    const to = new Date(from); to.setHours(23, 59, 59, 999)
    return { from, to, label: 'Ayer' }
  }
  // Specific date YYYY-MM-DD (from Dashboard click)
  const from = new Date(range + 'T00:00:00')
  const to = new Date(range + 'T23:59:59')
  const label = from.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  return { from, to, label }
}

// Recent 7 days for quick filter buttons
function getLast7Days(): { date: string; label: string }[] {
  const days = []
  for (let i = 0; i <= 6; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const iso = d.toISOString().split('T')[0]
    const label = i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit' })
    days.push({ date: iso, label })
  }
  return days
}

export default function TabHistory({
  companyId,
  initialDateFilter,
  onDateFilterConsumed,
}: {
  companyId: string
  initialDateFilter?: string | null
  onDateFilterConsumed?: () => void
}) {
  const [knowledgeList, setKnowledgeList] = useState<BotKnowledge[]>([])
  const [selectedKnowledge, setSelectedKnowledge] = useState<string | 'all'>('all')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [showDayPicker, setShowDayPicker] = useState(false)
  const recentDays = getLast7Days()

  // Consume external date filter from Dashboard click
  useEffect(() => {
    if (initialDateFilter) {
      setDateRange(initialDateFilter)
      onDateFilterConsumed?.()
    }
  }, [initialDateFilter])

  useEffect(() => {
    const init = async () => {
      const { data: kList } = await supabase
        .from('bot_knowledge')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      if (kList) {
        setKnowledgeList(kList)
        const active = kList.find(k => k.active)
        const knowledgeId = active ? active.id : null
        if (active) setSelectedKnowledge(active.id)
        await fetchContacts(knowledgeId, dateRange)
      } else {
        await fetchContacts(null, dateRange)
      }
      setLoading(false)
    }
    init()
  }, [companyId])

  // Re-fetch when date range changes
  useEffect(() => {
    if (!loading) {
      fetchContacts(selectedKnowledge === 'all' ? null : selectedKnowledge, dateRange)
    }
  }, [dateRange])

  const fetchContacts = async (knowledgeId: string | null, range: DateRange) => {
    let query = supabase
      .from('chat_history')
      .select('phone_number, contact_name, message, created_at, role')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (knowledgeId && knowledgeId !== 'all') {
      query = query.eq('knowledge_id', knowledgeId)
    }

    // Apply date filter
    const { from, to } = buildDateRange(range)
    if (from) query = query.gte('created_at', from.toISOString())
    if (to) query = query.lte('created_at', to.toISOString())

    const { data } = await query

    if (data) {
      const map = new Map<string, Contact>()
      data.forEach(msg => {
        if (!map.has(msg.phone_number)) {
          map.set(msg.phone_number, {
            phone_number: msg.phone_number,
            contact_name: msg.contact_name || null,
            last_message: msg.message,
            last_time: msg.created_at,
            count: 1,
          })
        } else {
          const existing = map.get(msg.phone_number)!
          existing.count++
          if (!existing.contact_name && msg.contact_name) {
            existing.contact_name = msg.contact_name
          }
        }
      })
      setContacts(Array.from(map.values()))
      setSelected(null)
      setMessages([])
    }
  }

  const handleFilterChange = async (knowledgeId: string) => {
    setSelectedKnowledge(knowledgeId)
    await fetchContacts(knowledgeId === 'all' ? null : knowledgeId, dateRange)
  }

  const handleDateChange = (range: DateRange) => {
    setDateRange(range)
    setShowDayPicker(false)
  }

  const loadMessages = async (phone: string) => {
    setSelected(phone)
    let query = supabase
      .from('chat_history')
      .select('*')
      .eq('company_id', companyId)
      .eq('phone_number', phone)
      .order('created_at', { ascending: true })

    if (selectedKnowledge !== 'all') {
      query = query.eq('knowledge_id', selectedKnowledge)
    }

    // Apply date filter to messages too
    const { from, to } = buildDateRange(dateRange)
    if (from) query = query.gte('created_at', from.toISOString())
    if (to) query = query.lte('created_at', to.toISOString())

    const { data } = await query
    if (data) setMessages(data)
  }

  const handleDeleteContact = async (phone: string) => {
    let query = supabase
      .from('chat_history')
      .delete()
      .eq('company_id', companyId)
      .eq('phone_number', phone)

    if (selectedKnowledge !== 'all') {
      query = query.eq('knowledge_id', selectedKnowledge)
    }

    await query
    toast.success('Conversación borrada — el contacto será tratado como nuevo')
    setConfirmDelete(null)
    if (selected === phone) {
      setSelected(null)
      setMessages([])
    }
    await fetchContacts(selectedKnowledge === 'all' ? null : selectedKnowledge, dateRange)
  }

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const displayName = (contact: Contact) => {
    return contact.contact_name || `+${contact.phone_number}`
  }

  const activeDateLabel = buildDateRange(dateRange).label

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>

  return (
    <div className="space-y-4">
      <Toaster />
      <div>
        <h2 className="text-lg font-medium">Historial de conversaciones</h2>
        <p className="text-sm text-muted-foreground">
          {contacts.length} contacto{contacts.length !== 1 ? 's' : ''} encontrados
          {dateRange !== 'all' && (
            <span className="ml-1">· <span className="font-medium text-foreground">{activeDateLabel}</span></span>
          )}
        </p>
      </div>

      {/* ─── Filtro por campaña ─────────────────────────────────────────── */}
      {knowledgeList.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleFilterChange('all')}
            className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
              selectedKnowledge === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:border-primary/50'
            }`}
          >
            Todos
          </button>
          {knowledgeList.map(k => (
            <button
              key={k.id}
              onClick={() => handleFilterChange(k.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-all flex items-center gap-1.5 ${
                selectedKnowledge === k.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              {k.name}
              {k.active && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ─── Filtro por fecha ───────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Período:</span>
        <button
          onClick={() => handleDateChange('all')}
          className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
            dateRange === 'all'
              ? 'bg-foreground text-background border-foreground'
              : 'border-border hover:border-foreground/30'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => handleDateChange('today')}
          className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
            dateRange === 'today'
              ? 'bg-foreground text-background border-foreground'
              : 'border-border hover:border-foreground/30'
          }`}
        >
          Hoy
        </button>
        <button
          onClick={() => handleDateChange('yesterday')}
          className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
            dateRange === 'yesterday'
              ? 'bg-foreground text-background border-foreground'
              : 'border-border hover:border-foreground/30'
          }`}
        >
          Ayer
        </button>

        {/* Picker de días recientes */}
        <div className="relative">
          <button
            onClick={() => setShowDayPicker(v => !v)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-all flex items-center gap-1 ${
              !['all', 'today', 'yesterday'].includes(dateRange)
                ? 'bg-foreground text-background border-foreground'
                : 'border-border hover:border-foreground/30'
            }`}
          >
            {!['all', 'today', 'yesterday'].includes(dateRange)
              ? activeDateLabel
              : 'Elegir día'}
            <span className="text-xs opacity-60">▾</span>
          </button>

          {showDayPicker && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-popover border border-border rounded-xl shadow-lg p-1.5 flex flex-col gap-0.5 min-w-[130px]">
              {recentDays.slice(2).map(day => (
                <button
                  key={day.date}
                  onClick={() => handleDateChange(day.date)}
                  className={`text-left px-3 py-1.5 rounded-lg text-sm hover:bg-muted transition-colors ${
                    dateRange === day.date ? 'bg-muted font-medium' : ''
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Limpiar filtro de fecha si viene del Dashboard */}
        {!['all', 'today', 'yesterday'].includes(dateRange) && (
          <button
            onClick={() => handleDateChange('all')}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Limpiar
          </button>
        )}
      </div>

      {contacts.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No hay conversaciones para este filtro aún.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 space-y-2">
          {contacts.map(contact => (
            <Card
              key={contact.phone_number}
              className={`p-3 transition-colors hover:bg-muted/50 ${
                selected === contact.phone_number ? 'ring-1 ring-primary' : ''
              }`}
            >
              <div
                className="cursor-pointer"
                onClick={() => loadMessages(contact.phone_number)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {displayName(contact)}
                    </p>
                    {contact.contact_name && (
                      <p className="text-xs text-muted-foreground truncate">
                        +{contact.phone_number}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs ml-1 shrink-0">
                    {contact.count}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                  {contact.last_message}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatTime(contact.last_time)}
                </p>
              </div>

              {confirmDelete === contact.phone_number ? (
                <div className="flex gap-1 mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => setConfirmDelete(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs text-destructive hover:text-destructive h-7"
                    onClick={() => handleDeleteContact(contact.phone_number)}
                  >
                    Confirmar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs text-destructive hover:text-destructive h-7"
                  onClick={() => setConfirmDelete(contact.phone_number)}
                >
                  Borrar conversación
                </Button>
              )}
            </Card>
          ))}
        </div>

        <div className="col-span-2">
          {!selected ? (
            <Card className="p-8 text-center h-full flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Selecciona un contacto para ver la conversación
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <p className="text-sm font-medium">
                  {contacts.find(c => c.phone_number === selected)?.contact_name || `+${selected}`}
                </p>
                {contacts.find(c => c.phone_number === selected)?.contact_name && (
                  <p className="text-xs text-muted-foreground">+{selected}</p>
                )}
                {dateRange !== 'all' && (
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {activeDateLabel}
                  </Badge>
                )}
              </div>
              <Card className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-muted text-foreground'
                        : 'bg-primary text-primary-foreground'
                    }`}>
                      <p>{msg.message}</p>
                      <p className={`text-xs mt-1 ${
                        msg.role === 'user'
                          ? 'text-muted-foreground'
                          : 'text-primary-foreground/70'
                      }`}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
