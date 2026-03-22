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

export default function TabDashboard({ companyId }: { companyId: string }) {
  const [campaignStats, setCampaignStats] = useState<CampaignStats[]>([])
  const [globalStats, setGlobalStats] = useState<GlobalStats>({ todayMessages: 0, totalMessages: 0, totalContacts: 0, lastConversation: null })
  const [session, setSession] = useState<Partial<WhatsappSession>>({ status: 'disconnected' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      // Load WhatsApp session
      const { data: sessionData } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('company_id', companyId)
        .single()
      if (sessionData) setSession(sessionData)

      // Load all campaigns
      const { data: campaigns } = await supabase
        .from('bot_knowledge')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })

      // Load all chat history
      const { data: allMessages } = await supabase
        .from('chat_history')
        .select('phone_number, role, created_at, knowledge_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      const messages = allMessages || []
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      // Global stats
      const userMessages = messages.filter(m => m.role === 'user')
      const globalContacts = new Set(userMessages.map(m => m.phone_number))
      const globalToday = userMessages.filter(m => new Date(m.created_at) >= todayStart)
      setGlobalStats({
        todayMessages: globalToday.length,
        totalMessages: userMessages.length,
        totalContacts: globalContacts.size,
        lastConversation: userMessages[0]?.created_at || null,
      })

      // Per-campaign stats
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

      {/* Estadísticas por campaña */}
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
                      <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">
                        ● Activa
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Inactiva</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Última: {formatTime(lastConversation)}
                  </p>
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
