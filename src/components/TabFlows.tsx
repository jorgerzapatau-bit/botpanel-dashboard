'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { Flow } from '@/types'

const emptyFlow = { keyword: '', answer: '', media_url: '' }

export default function TabFlows({ companyId }: { companyId: string }) {
  const [flows, setFlows] = useState<Flow[]>([])
  const [newFlow, setNewFlow] = useState(emptyFlow)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchFlows = async () => {
    const { data } = await supabase
      .from('flows')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
    if (data) setFlows(data)
    setLoading(false)
  }

  useEffect(() => { fetchFlows() }, [companyId])

  const handleAdd = async () => {
    if (!newFlow.keyword.trim() || !newFlow.answer.trim()) {
      toast.error('Palabra clave y respuesta son requeridas')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('flows').insert({
      company_id: companyId,
      keyword: newFlow.keyword.trim().toLowerCase(),
      answer: newFlow.answer.trim(),
      media_url: newFlow.media_url?.trim() || null,
    })
    if (error) {
      toast.error('Error al agregar flujo')
    } else {
      toast.success('Flujo agregado')
      setNewFlow(emptyFlow)
      fetchFlows()
    }
    setSaving(false)
  }

  const handleToggle = async (flow: Flow) => {
    await supabase
      .from('flows')
      .update({ active: !flow.active })
      .eq('id', flow.id)
    fetchFlows()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('flows').delete().eq('id', id)
    toast.success('Flujo eliminado')
    fetchFlows()
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Flujos de conversación</h2>
        <p className="text-sm text-muted-foreground">
          Cuando alguien escriba la palabra clave, el bot responde automáticamente
        </p>
      </div>

      {/* Agregar nuevo flujo */}
      <Card className="p-6 space-y-4">
        <p className="text-sm font-medium">Agregar nuevo flujo</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Palabra clave</Label>
            <Input
              placeholder="ej: precios, productos, hola"
              value={newFlow.keyword}
              onChange={e => setNewFlow({ ...newFlow, keyword: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>URL de imagen o video (opcional)</Label>
            <Input
              placeholder="https://..."
              value={newFlow.media_url}
              onChange={e => setNewFlow({ ...newFlow, media_url: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Respuesta</Label>
          <Textarea
            placeholder="Escribe la respuesta que enviará el bot..."
            className="min-h-[100px]"
            value={newFlow.answer}
            onChange={e => setNewFlow({ ...newFlow, answer: e.target.value })}
          />
        </div>
        <Button onClick={handleAdd} disabled={saving} className="w-full">
          {saving ? 'Agregando...' : '+ Agregar flujo'}
        </Button>
      </Card>

      {/* Lista de flujos */}
      <div className="space-y-3">
        {flows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay flujos aún. Agrega el primero arriba.
          </p>
        )}
        {flows.map(flow => (
          <Card key={flow.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={flow.active ? 'default' : 'secondary'}>
                    {flow.keyword}
                  </Badge>
                  {!flow.active && (
                    <span className="text-xs text-muted-foreground">inactivo</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {flow.answer}
                </p>
                {flow.media_url && (
                  <p className="text-xs text-muted-foreground truncate">
                    Media: {flow.media_url}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggle(flow)}
                >
                  {flow.active ? 'Pausar' : 'Activar'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(flow.id)}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
