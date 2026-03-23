'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'

type DayBar = {
  label: string
  date: string
  count: number
  peakHour: number | null
  peakCount: number
}

type Stats = {
  todayMessages: number
  totalMessages: number
  totalContacts: number
  lastConversation: string | null
}

function formatHour(h: number) {
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00 ${ampm}`
}

function MiniBarChart({ data }: { data: DayBar[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const CHART_HEIGHT = 80

  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5 w-full" style={{ height: CHART_HEIGHT }}>
        {data.map((d, i) => {
          const isToday = i === data.length - 1
          const pct = d.count > 0 ? Math.max((d.count / maxCount) * 100, 5) : 0
          const isHov = hovered === i

          return (
            <div
              key={d.date}
              className="relative flex-1 flex flex-col justify-end"
              style={{ height: '100%' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {isHov && d.count > 0 && (
                <div className="absolute z-50 bottom-full mb-1.5 left-1/2 -translate-x-1/2
                               bg-popover border border-border rounded-lg shadow-lg
                               px-2 py-1.5 text-xs whitespace-nowrap pointer-events-none">
                  <p className="font-semibold">{d.label}</p>
                  <p className="text-muted-foreground">
                    <span className="font-bold text-foreground">{d.count}</span> msgs
                  </p>
                  {d.peakHour !== null && (
                    <p className="text-muted-foreground">Pico: {formatHour(d.peakHour)}</p>
                  )}
                </div>
              )}
              <div className="w-full rounded-md" style={{
                height: '100%', position: 'absolute', bottom: 0,
                backgroundColor: isHov ? '#e2e8f0' : '#f1f5f9',
              }} />
              <div className="w-full rounded-md transition-all duration-300 relative" style={{
                height: `${pct}%`,
                backgroundColor: isToday
                  ? (isHov ? '#3f3f46' : '#18181b')
                  : (isHov ? '#64748b' : '#94a3b8'),
                minHeight: d.count > 0 ? 4 : 0,
              }} />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 w-full mt-1.5">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center"
            style={{ fontSize: 10, fontWeight: i === data.length - 1 ? 700 : 400, color: i === data.length - 1 ? '#18181b' : '#94a3b8' }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CompanyMiniDashboard({ companyId }: { companyId: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [chartData, setChartData] = useState<DayBar[]>([])
  const [peakHour, setPeakHour] = useState<{ hour: number; count: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: allMessages } = await supabase
        .from('chat_history')
        .select('phone_number, role, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      const messages = allMessages || []
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const userMsgs = messages.filter(m => m.role === 'user')
      const contacts = new Set(userMsgs.map(m => m.phone_number))
      const todayMsgs = userMsgs.filter(m => new Date(m.created_at) >= todayStart)

      setStats({
        todayMessages: todayMsgs.length,
        totalMessages: userMsgs.length,
        totalContacts: contacts.size,
        lastConversation: userMsgs[0]?.created_at || null,
      })

      // Hora pico global
      const hourCounts: Record<number, number> = {}
      userMsgs.forEach(m => {
        const h = new Date(m.created_at).getHours()
        hourCounts[h] = (hourCounts[h] || 0) + 1
      })
      if (Object.keys(hourCounts).length > 0) {
        const [ph, pc] = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
        setPeakHour({ hour: Number(ph), count: pc as number })
      }

      // Últimos 7 días
      const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
      const bars: DayBar[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0)
        const nextD = new Date(d); nextD.setDate(nextD.getDate() + 1)
        const dayMsgs = userMsgs.filter(m => { const t = new Date(m.created_at); return t >= d && t < nextD })
        let dayPeakHour: number | null = null, dayPeakCount = 0
        if (dayMsgs.length > 0) {
          const dh: Record<number, number> = {}
          dayMsgs.forEach(m => { const h = new Date(m.created_at).getHours(); dh[h] = (dh[h] || 0) + 1 })
          const [ph, pc] = Object.entries(dh).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
          dayPeakHour = Number(ph); dayPeakCount = pc as number
        }
        bars.push({ label: i === 0 ? 'Hoy' : DAY_LABELS[d.getDay()], date: d.toISOString().split('T')[0], count: dayMsgs.length, peakHour: dayPeakHour, peakCount: dayPeakCount })
      }
      setChartData(bars)
      setLoading(false)
    }
    load()
  }, [companyId])

  const formatTime = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return <p className="text-xs text-muted-foreground py-2">Cargando actividad...</p>

  return (
    <div className="space-y-4 pt-2">
      {/* Métricas */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { value: stats?.todayMessages ?? 0, label: 'Mensajes hoy' },
          { value: stats?.totalMessages ?? 0, label: 'Total mensajes' },
          { value: stats?.totalContacts ?? 0, label: 'Contactos únicos' },
          { value: formatTime(stats?.lastConversation ?? null), label: 'Última conv.' },
        ].map(({ value, label }) => (
          <Card key={label} className="p-3 text-center space-y-0.5">
            <p className="text-xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>

      {/* Gráfica */}
      <Card className="p-4">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Actividad últimos 7 días
          </p>
          {peakHour && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Hora pico</p>
              <p className="text-sm font-bold">{formatHour(peakHour.hour)}</p>
            </div>
          )}
        </div>
        {chartData.some(d => d.count > 0)
          ? <MiniBarChart data={chartData} />
          : <p className="text-xs text-muted-foreground text-center py-4">Sin mensajes en los últimos 7 días</p>
        }
      </Card>
    </div>
  )
}
