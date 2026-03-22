'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { WhatsappSession } from '@/types'

const QR_INTERVAL = 15
const RESTART_WAIT = 30

type Stats = {
  todayMessages: number
  totalContacts: number
  totalMessages: number
}

export default function TabWhatsApp({ companyId }: { companyId: string }) {
  const [session, setSession] = useState<Partial<WhatsappSession>>({ status: 'disconnected' })
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingQR, setLoadingQR] = useState(false)
  const [polling, setPolling] = useState(false)
  const [botUrl, setBotUrl] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(QR_INTERVAL)
  const [qrFlash, setQrFlash] = useState(false)
  const [stats, setStats] = useState<Stats>({ todayMessages: 0, totalContacts: 0, totalMessages: 0 })
  const [restarting, setRestarting] = useState(false)
  const [restartCountdown, setRestartCountdown] = useState(RESTART_WAIT)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restartRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSession = async () => {
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('company_id', companyId)
      .single()
    if (data) setSession(data)
    setLoading(false)
    return data
  }

  const fetchStats = async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const [{ count: todayMessages }, { data: allMessages }] = await Promise.all([
      supabase.from('chat_history').select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('role', 'user').gte('created_at', todayStart.toISOString()),
      supabase.from('chat_history').select('phone_number, role').eq('company_id', companyId),
    ])
    const contacts = new Set((allMessages || []).filter(m => m.role === 'user').map(m => m.phone_number))
    const totalMessages = (allMessages || []).filter(m => m.role === 'user').length
    setStats({ todayMessages: todayMessages || 0, totalContacts: contacts.size, totalMessages })
  }

  useEffect(() => { fetchSession() }, [companyId])

  useEffect(() => {
    if (session.status === 'connected') fetchStats()
  }, [session.status])

  // Poll Supabase every 5s to detect when WhatsApp connects
  useEffect(() => {
    if (!polling) return
    const interval = setInterval(async () => {
      const data = await fetchSession()
      if (data?.status === 'connected') {
        setQrUrl(null); setPolling(false); setBotUrl(null); setCountdown(QR_INTERVAL)
        toast.success('¡WhatsApp conectado exitosamente!')
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [polling])

  // Countdown timer for QR
  useEffect(() => {
    if (!qrUrl || !botUrl) {
      if (countdownRef.current) clearInterval(countdownRef.current)
      setCountdown(QR_INTERVAL)
      return
    }
    setCountdown(QR_INTERVAL)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? QR_INTERVAL : prev - 1))
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [qrUrl, botUrl])

  // Restart countdown after disconnect
  useEffect(() => {
    if (!restarting) {
      if (restartRef.current) clearInterval(restartRef.current)
      return
    }
    setRestartCountdown(RESTART_WAIT)
    restartRef.current = setInterval(() => {
      setRestartCountdown(prev => {
        if (prev <= 1) {
          setRestarting(false)
          clearInterval(restartRef.current!)
          return RESTART_WAIT
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (restartRef.current) clearInterval(restartRef.current) }
  }, [restarting])

  // Refresh QR every 15 seconds
  useEffect(() => {
    if (!qrUrl || !botUrl) return
    const refreshQR = async () => {
      try {
        const res = await fetch(`${botUrl}/qr`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
        const data = await res.json()
        if (data.status === 'connected') {
          setQrUrl(null); setPolling(false); setBotUrl(null)
          fetchSession()
          toast.success('¡WhatsApp conectado exitosamente!')
        } else if (data.qr) {
          setQrUrl(data.qr)
          setQrFlash(true); setTimeout(() => setQrFlash(false), 400)
        }
      } catch { /* silently ignore */ }
    }
    const interval = setInterval(refreshQR, QR_INTERVAL * 1000)
    return () => clearInterval(interval)
  }, [qrUrl, botUrl])

  const handleShowQR = async () => {
    setLoadingQR(true)
    try {
      const { data: sessionData } = await supabase
        .from('whatsapp_sessions').select('fly_app_url').eq('company_id', companyId).single()
      const url = sessionData?.fly_app_url
      if (!url) { toast.error('El bot no está configurado. Contacta al administrador.'); setLoadingQR(false); return }
      const res = await fetch(`${url}/qr`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      const data = await res.json()
      if (data.status === 'connected') {
        toast.success('¡Ya estás conectado!'); fetchSession()
      } else if (data.qr) {
        setBotUrl(url); setQrUrl(data.qr); setPolling(true)
        await supabase.from('whatsapp_sessions').upsert({
          company_id: companyId, status: 'connecting', updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id' })
      } else {
        toast.error('El bot está iniciando, espera unos segundos e intenta de nuevo.')
      }
    } catch { toast.error('No se pudo conectar. Intenta de nuevo.') }
    setLoadingQR(false)
  }

  const handleDisconnect = async () => {
    setQrUrl(null); setPolling(false); setBotUrl(null); setRestarting(true)
    try {
      const { data: sessionData } = await supabase
        .from('whatsapp_sessions').select('fly_app_url').eq('company_id', companyId).single()
      if (sessionData?.fly_app_url) {
        await fetch(`${sessionData.fly_app_url}/logout`, {
          method: 'POST', headers: { 'ngrok-skip-browser-warning': 'true' }
        })
      }
    } catch { /* igual actualizamos Supabase */ }
    await supabase.from('whatsapp_sessions').upsert({
      company_id: companyId, status: 'disconnected', phone_number: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    fetchSession()
  }

  const handleManualRefresh = async () => {
    if (!botUrl) return
    try {
      const res = await fetch(`${botUrl}/qr`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      const data = await res.json()
      if (data.qr) {
        setQrUrl(data.qr); setCountdown(QR_INTERVAL)
        setQrFlash(true); setTimeout(() => setQrFlash(false), 400)
        toast.success('QR actualizado')
      }
    } catch { toast.error('No se pudo actualizar el QR') }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>

  const isConnected = session.status === 'connected'
  const progress = (countdown / QR_INTERVAL) * 100
  const countdownColor = countdown <= 5 ? '#ef4444' : countdown <= 10 ? '#f59e0b' : '#22c55e'
  const restartProgress = (restartCountdown / RESTART_WAIT) * 100

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-lg font-medium">WhatsApp</h2>
        <p className="text-sm text-muted-foreground">Vincula tu número para que el bot empiece a responder</p>
      </div>

      {/* PANTALLA CONECTADO */}
      {isConnected && !qrUrl && (
        <Card className="p-8 text-center space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-green-50 flex items-center justify-center text-4xl">✓</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-xl font-medium text-green-700">Bot activo</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Número vinculado: <span className="font-medium">+{session.phone_number}</span>
            </p>
            {session.last_connected_at && (
              <p className="text-xs text-muted-foreground">
                Desde: {new Date(session.last_connected_at).toLocaleString('es-MX')}
              </p>
            )}
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{stats.todayMessages}</p>
              <p className="text-xs text-muted-foreground mt-1">Mensajes hoy</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{stats.totalContacts}</p>
              <p className="text-xs text-muted-foreground mt-1">Contactos</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{stats.totalMessages}</p>
              <p className="text-xs text-muted-foreground mt-1">Total mensajes</p>
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={handleDisconnect}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors underline underline-offset-2"
            >
              Desvincular número
            </button>
          </div>
        </Card>
      )}

      {/* PANTALLA REINICIANDO */}
      {restarting && !isConnected && !qrUrl && (
        <Card className="p-8 text-center space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center text-4xl">⚙️</div>
            <p className="text-xl font-medium">Reiniciando bot...</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              El servidor se está reiniciando. Por favor espera antes de volver a vincular.
            </p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="flex items-baseline gap-1">
              <span
                className="font-bold tabular-nums"
                style={{ fontSize: '3rem', lineHeight: 1, color: '#f59e0b' }}
              >
                {restartCountdown}
              </span>
              <span className="text-sm text-muted-foreground">seg</span>
            </div>
            <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-1000 ease-linear"
                style={{ width: `${restartProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">El botón aparecerá cuando el bot esté listo</p>
          </div>
        </Card>
      )}

      {/* PANTALLA QR */}
      {qrUrl && (
        <Card className="p-6 text-center space-y-4">
          <p className="font-medium text-lg">Escanea este código con WhatsApp</p>
          <div className="flex justify-center">
            <div className="rounded-xl border overflow-hidden" style={{ transition: 'opacity 0.2s ease', opacity: qrFlash ? 0.3 : 1 }}>
              <img src={qrUrl} alt="QR WhatsApp" className="w-64 h-64" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-baseline gap-1">
              <span className="font-bold tabular-nums" style={{ fontSize: '3rem', lineHeight: 1, color: countdownColor, transition: 'color 0.3s ease' }}>
                {countdown}
              </span>
              <span className="text-sm text-muted-foreground">seg</span>
            </div>
            <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000 ease-linear" style={{ width: `${progress}%`, backgroundColor: countdownColor }} />
            </div>
            <p className="text-xs text-muted-foreground">El QR se actualiza automáticamente</p>
          </div>
          <div className="text-left space-y-1 bg-muted/50 rounded-lg p-4">
            <p className="text-sm font-medium mb-2">¿Cómo escanear?</p>
            <p className="text-sm text-muted-foreground">1. Abre WhatsApp en tu celular</p>
            <p className="text-sm text-muted-foreground">2. Ve a <strong>Ajustes → Dispositivos vinculados</strong></p>
            <p className="text-sm text-muted-foreground">3. Toca <strong>Vincular dispositivo</strong></p>
            <p className="text-sm text-muted-foreground">4. Apunta la cámara al código de arriba</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Esperando que escanees el código...
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={handleManualRefresh}>🔄 Refrescar QR</Button>
            <Button variant="ghost" size="sm" onClick={() => { setQrUrl(null); setPolling(false); setBotUrl(null) }}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* PANTALLA DESCONECTADO */}
      {!isConnected && !qrUrl && !restarting && (
        <Card className="p-8 text-center space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-4xl">📱</div>
            <p className="text-xl font-medium">Sin conectar</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Vincula tu número de WhatsApp para que el bot empiece a responder a tus clientes automáticamente
            </p>
          </div>
          <Button className="w-full h-12 text-base" onClick={handleShowQR} disabled={loadingQR}>
            {loadingQR ? 'Generando código QR...' : '📲 Vincular WhatsApp'}
          </Button>
        </Card>
      )}
    </div>
  )
}
