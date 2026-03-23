'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { BotKnowledge, WhatsappSession } from '@/types'

type CampaignStats = {
  knowledge: BotKnowledge
  todayMessages: number
  totalMessages: number
  totalContacts: number
  lastConversation: string | null
}

type GlobalStats = {
  todayMessages: number
  totalMessages: number
  totalContacts: number
  lastConversation: string | null
}

type DayBar = {
  label: string
  date: string
  count: number
  peakHour: number | null
  peakCount: number
}

type GlobalPeak = {
  hour: number
  count: number
}

function formatHour(h: number) {
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00 ${ampm}`
}

// ─── Gráfica con click para ir al historial ───────────────────────────────────
function BarChart({ data, onDayClick }: { data: DayBar[], onDayClick?: (date: string) => void }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const CHART_HEIGHT = 120 // px

  return (
    <div className="w-full">
      {/* Barras */}
      <div className="flex items-end gap-2 w-full" style={{ height: CHART_HEIGHT }}>
        {data.map((d, i) => {
          const isToday = i === data.length - 1
          const pct = d.count > 0 ? Math.max((d.count / maxCount) * 100, 5) : 0
          const isHov = hovered === i
          const isClickable = d.count > 0 && !!onDayClick

          return (
            <div
              key={d.date}
              className="relative flex-1 flex flex-col justify-end"
              style={{ height: '100%', cursor: isClickable ? 'pointer' : 'default' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => isClickable && onDayClick?.(d.date)}
            >
              {/* Tooltip */}
              {isHov && (
                <div
                  className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 
                             bg-popover border border-border rounded-xl shadow-lg 
                             px-3 py-2 text-sm whitespace-nowrap pointer-events-none"
                >
                  <p className="font-semibold text-foreground mb-1">{d.label}</p>
                  {d.count > 0 ? (
                    <>
                      <p className="text-muted-foreground">
                        <span className="text-lg font-bold text-foreground tabular-nums">{d.count}</span>
                        {' '}{d.count === 1 ? 'mensaje' : 'mensajes'}
                      </p>
                      {d.peakHour !== null && (
                        <p className="text-xs text-muted-foreground mt-1 pt-1 border-t border-border">
                          Hora pico{' '}
                          <span className="font-semibold text-foreground">{formatHour(d.peakHour)}</span>
                          <span className="ml-1 opacity-60">({d.peakCount})</span>
                        </p>
                      )}
                      {onDayClick && (
                        <p className="text-xs text-primary mt-1 pt-1 border-t border-border font-medium">
                          Clic para ver historial →
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin actividad</p>
                  )}
                </div>
              )}

              {/* Barra fondo (altura completa) */}
              <div
                className="w-full rounded-lg transition-colors"
                style={{
                  height: '100%',
                  backgroundColor: isHov ? '#e2e8f0' : '#f1f5f9',
                  position: 'absolute',
                  bottom: 0,
                }}
              />

              {/* Barra de datos (altura proporcional) */}
              <div
                className="w-full rounded-lg transition-all duration-300 relative"
                style={{
                  height: `${pct}%`,
                  backgroundColor: isToday
                    ? (isHov ? '#3f3f46' : '#18181b')
                    : (isHov ? '#64748b' : '#94a3b8'),
                  minHeight: d.count > 0 ? 6 : 0,
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Etiquetas de días */}
      <div className="flex gap-2 w-full mt-2">
        {data.map((d, i) => {
          const isToday = i === data.length - 1
          return (
            <div
              key={d.date}
              className="flex-1 text-center text-xs"
              style={{
                fontWeight: isToday ? 700 : 400,
                color: isToday ? '#18181b' : '#94a3b8',
              }}
            >
              {d.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TabDashboard({
  companyId,
  onDayClick,
}: {
  companyId: string
  onDayClick?: (date: string) => void
}) {
  const [campaignStats, setCampaignStats] = useState<CampaignStats[]>([])
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    todayMessages: 0, totalMessages: 0, totalContacts: 0, lastConversation: null,
  })
  const [session, setSession] = useState<Partial<WhatsappSession>>({ status: 'disconnected' })
  const [chartData, setChartData] = useState<DayBar[]>([])
  const [globalPeak, setGlobalPeak] = useState<GlobalPeak | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('company_id', companyId)
        .single()
      if (sessionData) setSession(sessionData)

      const { data: campaigns } = await supabase
        .from('bot_knowledge')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })

      const { data: allMessages } = await supabase
        .from('chat_history')
        .select('phone_number, role, created_at, knowledge_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      const messages = allMessages || []
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const userMessages = messages.filter(m => m.role === 'user')
      const globalContacts = new Set(userMessages.map(m => m.phone_number))
      const globalToday = userMessages.filter(m => new Date(m.created_at) >= todayStart)

      setGlobalStats({
        todayMessages: globalToday.length,
        totalMessages: userMessages.length,
        totalContacts: globalContacts.size,
        lastConversation: userMessages[0]?.created_at || null,
      })

      // Hora pico global
      const hourCounts: Record<number, number> = {}
      userMessages.forEach(m => {
        const h = new Date(m.created_at).getHours()
        hourCounts[h] = (hourCounts[h] || 0) + 1
      })
      if (Object.keys(hourCounts).length > 0) {
        const [peakH, peakC] = Object.entries(hourCounts)
          .sort((a, b) => Number(b[1]) - Number(a[1]))[0]
        setGlobalPeak({ hour: Number(peakH), count: peakC as number })
      }

      // Últimos 7 días con hora pico por día
      const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
      const bars: DayBar[] = []

      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        d.setHours(0, 0, 0, 0)
        const nextD = new Date(d)
        nextD.setDate(nextD.getDate() + 1)

        const dayMsgs = userMessages.filter(m => {
          const t = new Date(m.created_at)
          return t >= d && t < nextD
        })

        let dayPeakHour: number | null = null
        let dayPeakCount = 0
        if (dayMsgs.length > 0) {
          const dayHours: Record<number, number> = {}
          dayMsgs.forEach(m => {
            const h = new Date(m.created_at).getHours()
            dayHours[h] = (dayHours[h] || 0) + 1
          })
          const [ph, pc] = Object.entries(dayHours)
            .sort((a, b) => Number(b[1]) - Number(a[1]))[0]
          dayPeakHour = Number(ph)
          dayPeakCount = pc as number
        }

        bars.push({
          label: i === 0 ? 'Hoy' : DAY_LABELS[d.getDay()],
          date: d.toISOString().split('T')[0],
          count: dayMsgs.length,
          peakHour: dayPeakHour,
          peakCount: dayPeakCount,
        })
      }
      setChartData(bars)

      // Stats por campaña
      const stats: CampaignStats[] = (campaigns || []).map(k => {
        const kMessages = messages.filter(m => m.knowledge_id === k.id && m.role === 'user')
        const kContacts = new Set(kMessages.map(m => m.phone_number))
        const kToday = kMessages.filter(m => new Date(m.created_at) >= todayStart)
        return {
          knowledge: k,
          todayMessages: kToday.length,
          totalMessages: kMessages.length,
          totalContacts: kContacts.size,
          lastConversation: kMessages[0]?.created_at || null,
        }
      })
      setCampaignStats(stats)
      setLoading(false)
    }
    load()
  }, [companyId])

  const formatTime = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>

  const isConnected = session.status === 'connected'
  const hasActivity = chartData.some(d => d.count > 0)

  return (
    <div className="space-y-8">

      {/* Estado del bot */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Resumen de actividad de tu bot</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
          isConnected ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          {isConnected ? `Bot activo · +${session.phone_number}` : 'Bot desconectado'}
        </div>
      </div>

      {/* Estadísticas globales */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Total general</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 text-center space-y-1">
            <p className="text-3xl font-bold tabular-nums">{globalStats.todayMessages}</p>
            <p className="text-xs text-muted-foreground">Mensajes hoy</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <p className="text-3xl font-bold tabular-nums">{globalStats.totalMessages}</p>
            <p className="text-xs text-muted-foreground">Total mensajes</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <p className="text-3xl font-bold tabular-nums">{globalStats.totalContacts}</p>
            <p className="text-xs text-muted-foreground">Contactos únicos</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <p className="text-sm font-medium tabular-nums">{formatTime(globalStats.lastConversation)}</p>
            <p className="text-xs text-muted-foreground">Última conversación</p>
          </Card>
        </div>
      </div>

      {/* Gráfica */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Actividad últimos 7 días
        </p>
        <Card className="p-5">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-sm font-medium">Mensajes por día</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {onDayClick
                  ? 'Pasa el cursor para ver el detalle · Haz clic para ver el historial del día'
                  : 'Pasa el cursor sobre cada barra para ver el detalle'}
              </p>
            </div>
            {globalPeak && hasActivity && (
              <div className="text-right bg-muted/50 rounded-xl px-3 py-2">
                <p className="text-xs text-muted-foreground">Hora pico general</p>
                <p className="text-base font-bold tabular-nums">{formatHour(globalPeak.hour)}</p>
                <p className="text-xs text-muted-foreground">{globalPeak.count} msgs</p>
              </div>
            )}
          </div>

          {hasActivity ? (
            <BarChart data={chartData} onDayClick={onDayClick} />
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Sin mensajes en los últimos 7 días</p>
            </div>
          )}
        </Card>
      </div>

      {/* Por campaña */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Por campaña</p>
        {campaignStats.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No hay campañas creadas aún.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {campaignStats.map(({ knowledge, todayMessages, totalMessages, totalContacts, lastConversation }) => (
              <Card key={knowledge.id} className={`p-5 ${knowledge.active ? 'ring-1 ring-green-200' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{knowledge.name}</p>
                    {knowledge.active ? (
                      <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">● Activa</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Inactiva</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Última: {formatTime(lastConversation)}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums">{todayMessages}</p>
                    <p className="text-xs text-muted-foreground mt-1">Mensajes hoy</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums">{totalMessages}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total mensajes</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums">{totalContacts}</p>
                    <p className="text-xs text-muted-foreground mt-1">Contactos únicos</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
