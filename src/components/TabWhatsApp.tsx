'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { WhatsappSession } from '@/types'

export default function TabWhatsApp({ companyId }: { companyId: string }) {
  const [session, setSession] = useState<Partial<WhatsappSession>>({ status: 'disconnected' })
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingQR, setLoadingQR] = useState(false)
  const [polling, setPolling] = useState(false)

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

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(async () => {
      const data = await fetchSession()
      if (data?.status === 'connected') {
        setQrUrl(null)
        setPolling(false)
        toast.success('¡WhatsApp conectado exitosamente!')
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [polling])

  const handleShowQR = async () => {
    setLoadingQR(true)
    try {
      const { data: sessionData } = await supabase
        .from('whatsapp_sessions')
        .select('fly_app_url')
        .eq('company_id', companyId)
        .single()

      const botUrl = sessionData?.fly_app_url
      if (!botUrl) {
        toast.error('El bot no está configurado. Contacta al administrador.')
        setLoadingQR(false)
        return
      }

    const res = await fetch(`${botUrl}/qr`, {
      headers: { 'ngrok-skip-browser-warning': 'true' }
    })
      const data = await res.json()

      if (data.status === 'connected') {
        toast.success('¡Ya estás conectado!')
        fetchSession()
      } else if (data.qr) {
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
    await supabase.from('whatsapp_sessions').upsert({
      company_id: companyId,
      status: 'disconnected',
      phone_number: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    fetchSession()
    toast.success('Sesión desconectada')
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>

  const isConnected = session.status === 'connected'

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
        <Card className="p-6 text-center space-y-5">
          <p className="font-medium text-lg">Escanea este código con WhatsApp</p>
          <div className="flex justify-center">
            <img src={qrUrl} alt="QR WhatsApp" className="w-64 h-64 rounded-xl border" />
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
          <Button variant="ghost" size="sm" onClick={() => { setQrUrl(null); setPolling(false) }}>
            Cancelar
          </Button>
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
