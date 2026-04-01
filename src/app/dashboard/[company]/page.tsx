'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import type { Company } from '@/types'

import TabDashboard from '@/components/TabDashboard'
import TabPrompt from '@/components/TabPrompt'
import TabFlows from '@/components/TabFlows'
import TabHistory from '@/components/TabHistory'
import TabWhatsApp from '@/components/TabWhatsApp'
import TabAgenda from '@/components/TabAgenda'

type Subscription = {
  id: string
  plan: string
  start_date: string
  end_date: string
  monthly_cost: number | null
  status: 'pending' | 'paid' | 'expired'
}

function daysUntil(dateStr: string) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const end = new Date(dateStr + 'T00:00:00')
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Locked tab placeholder ───────────────────────────────────────────────────
function LockedTab({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-3">
      <div className="text-4xl">🔒</div>
      <p className="text-sm font-medium text-foreground">Acceso restringido</p>
      <p className="text-sm text-muted-foreground text-center max-w-xs">{reason}</p>
    </div>
  )
}

export default function DashboardPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.company as string

  const [company, setCompany] = useState<Company | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [historyDateFilter, setHistoryDateFilter] = useState<string | null>(null)
  const [agendaEnabled, setAgendaEnabled] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push(`/?company=${slug}`)
        return
      }

      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .single()

      if (!data) {
        toast.error('Empresa no encontrada')
        return
      }

      setCompany(data)

      // Fetch agenda_enabled from bot_config
      const { data: cfg } = await supabase
        .from('bot_config')
        .select('agenda_enabled')
        .eq('company_id', data.id)
        .single()
      if (cfg?.agenda_enabled) setAgendaEnabled(true)

      // Fetch active subscription
      const { data: subs } = await supabase
        .from('company_subscriptions')
        .select('*')
        .eq('company_id', data.id)
        .neq('status', 'expired')
        .order('end_date', { ascending: false })
        .limit(1)

      if (subs && subs.length > 0) setSubscription(subs[0])

      setLoading(false)
    }
    init()
  }, [slug, router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push(`/?company=${slug}`)
  }

  const handleDayClick = (date: string) => {
    setHistoryDateFilter(date)
    setActiveTab('history')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Cargando...</p>
      </div>
    )
  }

  const isActive = company?.active === true
  const lockedReason = !isActive
    ? 'Tu membresía ha vencido o la cuenta está inactiva. Contacta al administrador para renovar.'
    : ''

  // Compute days left for the subscription banner
  const daysLeft = subscription ? daysUntil(subscription.end_date) : null
  const isExpiringSoon = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">{company?.name}</span>
          <Badge variant="secondary">{company?.plan}</Badge>
          {!isActive && (
            <Badge className="bg-red-50 text-red-600 border-red-200 text-xs">● Inactiva</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Cerrar sesión
        </Button>
      </header>

      {/* ─── Membership banner ─────────────────────────────────────── */}
      {!isActive && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <span>🔒</span>
            <span className="font-medium">Cuenta inactiva</span>
            <span className="text-red-500">·</span>
            <span>Membresía vencida o suspendida. Contacta al administrador.</span>
          </div>
        </div>
      )}

      {isActive && subscription && isExpiringSoon && (
        <div className={`border-b px-6 py-3 flex items-center justify-between text-sm ${
          daysLeft! <= 2
            ? 'bg-red-50 border-red-200 text-red-700'
            : daysLeft! <= 4
            ? 'bg-orange-50 border-orange-200 text-orange-700'
            : 'bg-yellow-50 border-yellow-200 text-yellow-700'
        }`}>
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>
              Tu membresía vence el <strong>{formatDate(subscription.end_date)}</strong>
            </span>
          </div>
          <span className="font-bold">
            {daysLeft === 0 ? 'Vence hoy' : daysLeft === 1 ? '1 día restante' : `${daysLeft} días restantes`}
          </span>
        </div>
      )}

      {isActive && subscription && !isExpiringSoon && daysLeft !== null && (
        <div className="bg-muted/40 border-b px-6 py-2.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span>📅 Membresía activa hasta <span className="font-medium text-foreground">{formatDate(subscription.end_date)}</span></span>
          <span>·</span>
          <span className="text-green-600 font-medium">{daysLeft} días restantes</span>
        </div>
      )}

      {/* Tabs */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={(val) => {
          // If inactive, only allow dashboard tab
          if (!isActive && val !== 'dashboard') {
            toast.error('Cuenta inactiva — contacta al administrador')
            return
          }
          setActiveTab(val)
        }}>
          <TabsList className="w-full mb-6">
            <TabsTrigger value="dashboard" className="flex-1">Dashboard</TabsTrigger>
            <TabsTrigger
              value="prompt"
              className={`flex-1 ${!isActive ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Asistente IA
            </TabsTrigger>
            <TabsTrigger
              value="flows"
              className={`flex-1 ${!isActive ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Flujos
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">Historial</TabsTrigger>
            <TabsTrigger
              value="whatsapp"
              className={`flex-1 ${!isActive ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              WhatsApp
            </TabsTrigger>
            {agendaEnabled && (
              <TabsTrigger
                value="agenda"
                className={`flex-1 ${!isActive ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                Agenda
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="dashboard">
            <TabDashboard
              companyId={company!.id}
              onDayClick={handleDayClick}
              subscription={subscription}
            />
          </TabsContent>

          <TabsContent value="prompt">
            {isActive
              ? <TabPrompt companyId={company!.id} />
              : <LockedTab reason={lockedReason} />}
          </TabsContent>

          <TabsContent value="flows">
            {isActive
              ? <TabFlows companyId={company!.id} />
              : <LockedTab reason={lockedReason} />}
          </TabsContent>

          <TabsContent value="history">
            <TabHistory
              companyId={company!.id}
              initialDateFilter={historyDateFilter}
              onDateFilterConsumed={() => setHistoryDateFilter(null)}
            />
          </TabsContent>

          <TabsContent value="whatsapp">
            {isActive
              ? <TabWhatsApp companyId={company!.id} />
              : <LockedTab reason={lockedReason} />}
          </TabsContent>

          {agendaEnabled && (
            <TabsContent value="agenda">
              {isActive
                ? <TabAgenda companyId={company!.id} />
                : <LockedTab reason={lockedReason} />}
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  )
}
