'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { WhatsappSession } from '@/types'

const QR_INTERVAL = 15

export default function TabWhatsApp({ companyId }: { companyId: string }) {
  const [session, setSession] = useState<Partial<WhatsappSession>>({ status: 'disconnected' })
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingQR, setLoadingQR] = useState(false)
  const [polling, setPolling] = useState(false)
  const [botUrl, setBotUrl] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(QR_INTERVAL)
  const [qrFlash, setQrFlash] = useState(false)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  useEffect(() => { fetchSession() }, [companyId])

  // Poll Supabase every 5s to detect when WhatsApp connects
  useEffect(() => {
    if (!polling) return
    const interval = setInterval(async () => {
      const data = await fetchSession()
      if (data?.status === 'connected') {
        setQrUrl(null)
        setPolling(false)
        setBotUrl(null)
        setCountdown(QR_INTERVAL)
        toast.success('¡WhatsApp conectado exitosamente!')
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [polling])

  // Countdown timer
  useEffect(() => {
    if (!qrUrl || !botUrl) {
      if (countdownRef.current) clearInterval(countdownRef.current)
      setCountdown(QR_INTERVAL)
      return
    }
    setCountdown(QR_INTERVAL)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return QR_INTERVAL
        return prev - 1
      })
    }, 1000)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [qrUrl, botUrl])

  // Refresh QR every 15 seconds while showing it
  useEffect(() => {
    if (!qrUrl || !botUrl) return
    const refreshQR = async () => {
      try {
        const res = await fetch(`${botUrl}/qr`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
        })
        const data = await res.json()
        if (data.status === 'connected') {
          setQrUrl(null)
          setPolling(false)
          setBotUrl(null)
          fetchSession()
          toast.success('¡WhatsApp conectado exitosamente!')
        } else if (data.qr) {
          setQrUrl(data.qr)
          setQrFlash(true)
          setTimeout(() => setQrFlash(false), 400)
        }
      } catch {
        // Silently ignore refresh errors
      }
    }
    const interval = setInterval(refreshQR, QR_INTERVAL * 1000)
    return () => clearInterval(interval)
  }, [qrUrl, botUrl])

  const handleShowQR = async () => {
    setLoadingQR(true)
    try {
      const { data: sessionData } = await supabase
        .from('whatsapp_sessions')
        .select('fly_app_url')
        .eq('company_id', companyId)
        .single()

      const url = sessionData?.fly_app_url
      if (!url) {
        toast.error('El bot no está configurado. Contacta al administrador.')
        setLoadingQR(false)
        return
      }

      const res = await fetch(`${url}/qr`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      })
      const data = await res.json()

      if (data.status === 'connected') {
        toast.success('¡Ya estás conectado!')
        fetchSession()
      } else if (data.qr) {
        setBotUrl(url)
        setQrUrl(data.qr)
        setPolling(true)
        await supabase.from('whatsapp_sessions').upsert({
          company_id: companyId,
          status: 'connecting',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id' })
      } else {
        toast.error('El bot está iniciando, espera unos segundos e intenta de nuevo.')
      }
    } catch {
      toast.error('No se pudo conectar. Intenta de nuevo.')
    }
    setLoadingQR(false)
  }

  const handleDisconnect = async () => {
    setQrUrl(null)
    setPolling(false)
    setBotUrl(null)
    try {
      const { data: sessionData } = await supabase
        .from('whatsapp_sessions')
        .select('fly_app_url')
        .eq('company_id', companyId)
        .single()
      if (sessionData?.fly_app_url) {
        await fetch(`${sessionData.fly_app_url}/logout`, {
          method: 'POST',
          headers: { 'ngrok-skip-browser-warning': 'true' }
        })
      }
    } catch {
      // Si el bot no responde, igual actualizamos Supabase
    }
    await supabase.from('whatsapp_sessions').upsert({
      company_id: companyId,
      status: 'disconnected',
      phone_number: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    fetchSession()
    toast.success('Sesión desconectada')
  }

  const handleManualRefresh = async () => {
    if (!botUrl) return
    try {
      const res = await fetch(`${botUrl}/qr`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      const data = await res.json()
      if (data.qr) {
        setQrUrl(data.qr)
        setCountdown(QR_INTERVAL)
        setQrFlash(true)
        setTimeout(() => setQrFlash(false), 400)
        toast.success('QR actualizado')
      }
    } catch {
      toast.error('No se pudo actualizar el QR')
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>

  const isConnected = session.status === 'connected'
  const progress = (countdown / QR_INTERVAL) * 100

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-lg font-medium">WhatsApp</h2>
        <p className="text-sm text-muted-foreground">
          Vincula tu número para que el bot empiece a responder
        </p>
      </div>

      {isConnected && !qrUrl && (
        <Card className="p-8 text-center space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center text-4xl">
              ✓
            </div>
            <p className="text-xl font-medium text-green-700">Bot activo</p>
            <p className="text-sm text-muted-foreground">
              Número vinculado: <span className="font-medium">+{session.phone_number}</span>
            </p>
            {session.last_connected_at && (
              <p className="text-xs text-muted-foreground">
                Desde: {new Date(session.last_connected_at).toLocaleString('es-MX')}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleDisconnect}>
            Desvincular número
          </Button>
        </Card>
      )}

      {qrUrl && (
        <Card className="p-6 text-center space-y-4">
          <p className="font-medium text-lg">Escanea este código con WhatsApp</p>

          {/* QR con flash al refrescar */}
          <div className="flex justify-center">
            <div
              className="rounded-xl border overflow-hidden"
              style={{
                transition: 'opacity 0.2s ease',
                opacity: qrFlash ? 0.3 : 1,
              }}
            >
              <img src={qrUrl} alt="QR WhatsApp" className="w-64 h-64" />
            </div>
          </div>

          {/* Contador regresivo grande */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-baseline gap-1">
              <span
                className="font-bold tabular-nums"
                style={{
                  fontSize: '3rem',
                  lineHeight: 1,
                  color: countdown <= 5 ? '#ef4444' : countdown <= 10 ? '#f59e0b' : '#22c55e',
                  transition: 'color 0.3s ease',
                }}
              >
                {countdown}
              </span>
              <span className="text-sm text-muted-foreground">seg</span>
            </div>

            {/* Barra de progreso */}
            <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${progress}%`,
                  backgroundColor: countdown <= 5 ? '#ef4444' : countdown <= 10 ? '#f59e0b' : '#22c55e',
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">El QR se actualiza automáticamente</p>
          </div>

          {/* Instrucciones */}
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
            <Button variant="outline" size="sm" onClick={handleManualRefresh}>
              🔄 Refrescar QR
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setQrUrl(null); setPolling(false); setBotUrl(null) }}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {!isConnected && !qrUrl && (
        <Card className="p-8 text-center space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-4xl">
              📱
            </div>
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
