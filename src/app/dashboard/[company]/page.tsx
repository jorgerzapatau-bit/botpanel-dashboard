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

export default function DashboardPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.company as string

  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)

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
      setLoading(false)
    }
    init()
  }, [slug, router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push(`/?company=${slug}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">{company?.name}</span>
          <Badge variant="secondary">{company?.plan}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Cerrar sesión
        </Button>
      </header>

      {/* Tabs */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Tabs defaultValue="dashboard">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="dashboard" className="flex-1">Dashboard</TabsTrigger>
            <TabsTrigger value="prompt" className="flex-1">Asistente IA</TabsTrigger>
            <TabsTrigger value="flows" className="flex-1">Flujos</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">Historial</TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex-1">WhatsApp</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <TabDashboard companyId={company!.id} />
          </TabsContent>

          <TabsContent value="prompt">
            <TabPrompt companyId={company!.id} />
          </TabsContent>

          <TabsContent value="flows">
            <TabFlows companyId={company!.id} />
          </TabsContent>

          <TabsContent value="history">
            <TabHistory companyId={company!.id} />
          </TabsContent>

          <TabsContent value="whatsapp">
            <TabWhatsApp companyId={company!.id} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
