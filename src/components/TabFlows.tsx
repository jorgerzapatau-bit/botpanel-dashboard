'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Flow } from '@/types'

const emptyFlow = { keyword: '', answer: '', media_url: '' }

export default function TabFlows({ companyId }: { companyId: string }) {
  const [flows, setFlows] = useState<Flow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [newFlow, setNewFlow] = useState(emptyFlow)
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
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
      toast.error('La palabra clave y la respuesta son requeridas')
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
      setShowForm(false)
      fetchFlows()
    }
    setSaving(false)
  }

  const handleSaveEdit = async () => {
    if (!editingFlow) return
    if (!editingFlow.keyword.trim() || !editingFlow.answer.trim()) {
      toast.error('La palabra clave y la respuesta son requeridas')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('flows')
      .update({
        keyword: editingFlow.keyword.trim().toLowerCase(),
        answer: editingFlow.answer.trim(),
        media_url: editingFlow.media_url?.trim() || null,
      })
      .eq('id', editingFlow.id)
    if (error) {
      toast.error('Error al guardar')
    } else {
      toast.success('Flujo actualizado')
      setEditingFlow(null)
      fetchFlows()
    }
    setSaving(false)
  }

  const handleToggle = async (flow: Flow) => {
    await supabase.from('flows').update({ active: !flow.active }).eq('id', flow.id)
    toast.success(flow.active ? 'Flujo pausado' : 'Flujo activado')
    fetchFlows()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('flows').delete().eq('id', id)
    toast.success('Flujo eliminado')
    setConfirmDelete(null)
    fetchFlows()
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-medium">Flujos de respuesta</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Cuando alguien escriba una palabra clave, el bot responde automáticamente con el mensaje que definas — sin pasar por la IA.
          </p>
        </div>
        <Button size="sm" onClick={() => { setShowForm(true); setEditingFlow(null) }}>
          + Nuevo flujo
        </Button>
      </div>

      {/* Formulario nuevo flujo */}
      {showForm && (
        <Card className="p-6 space-y-4 border-dashed">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Nuevo flujo</p>
            <button
              onClick={() => { setShowForm(false); setNewFlow(emptyFlow) }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕ Cancelar
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
            <p className="text-xs text-blue-700">
              💡 <strong>¿Cómo funciona?</strong> Si un cliente escribe <em>"precios"</em>, el bot responde exactamente con lo que pongas abajo, sin consultar la IA.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Palabra clave</Label>
              <Input
                placeholder="Ej: precios, hola, horario"
                value={newFlow.keyword}
                onChange={e => setNewFlow({ ...newFlow, keyword: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">El bot detecta esta palabra en el mensaje</p>
            </div>
            <div className="space-y-1.5">
              <Label>URL de imagen o video <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                placeholder="https://..."
                value={newFlow.media_url}
                onChange={e => setNewFlow({ ...newFlow, media_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Se enviará junto con la respuesta</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Respuesta del bot</Label>
            <Textarea
              placeholder="Escribe exactamente lo que el bot va a responder cuando detecte la palabra clave..."
              className="min-h-[100px]"
              value={newFlow.answer}
              onChange={e => setNewFlow({ ...newFlow, answer: e.target.value })}
            />
          </div>

          <Button onClick={handleAdd} disabled={saving} className="w-full">
            {saving ? 'Guardando...' : '+ Agregar flujo'}
          </Button>
        </Card>
      )}

      {/* Lista de flujos */}
      {flows.length === 0 && !showForm && (
        <Card className="p-8 text-center space-y-3">
          <p className="text-2xl">⚡</p>
          <p className="text-sm font-medium">No hay flujos aún</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Los flujos te permiten dar respuestas instantáneas a preguntas frecuentes sin usar la IA
          </p>
          <Button size="sm" onClick={() => setShowForm(true)}>+ Crear primer flujo</Button>
        </Card>
      )}

      <div className="space-y-3">
        {flows.map(flow => (
          <Card key={flow.id} className={`p-4 transition-all ${!flow.active ? 'opacity-60' : ''}`}>

            {/* Modo edición */}
            {editingFlow?.id === flow.id ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Palabra clave</Label>
                    <Input
                      value={editingFlow.keyword}
                      onChange={e => setEditingFlow({ ...editingFlow, keyword: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>URL de imagen o video <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                    <Input
                      placeholder="https://..."
                      value={editingFlow.media_url || ''}
                      onChange={e => setEditingFlow({ ...editingFlow, media_url: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Respuesta del bot</Label>
                  <Textarea
                    className="min-h-[100px]"
                    value={editingFlow.answer}
                    onChange={e => setEditingFlow({ ...editingFlow, answer: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingFlow(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="flex-1" disabled={saving} onClick={handleSaveEdit}>
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                </div>
              </div>
            ) : (
              /* Modo vista */
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={flow.active ? 'default' : 'secondary'} className="font-mono text-xs">
                      "{flow.keyword}"
                    </Badge>
                    {!flow.active && (
                      <span className="text-xs text-muted-foreground">pausado</span>
                    )}
                    {flow.media_url && (
                      <span className="text-xs text-muted-foreground">📎 con imagen/video</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {flow.answer}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(flow)}>
                    {flow.active ? 'Pausar' : 'Activar'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingFlow(flow); setConfirmDelete(null) }}>
                    Editar
                  </Button>
                  {confirmDelete === flow.id ? (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                        Cancelar
                      </Button>
                      <Button variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(flow.id)}>
                        Confirmar
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(flow.id)}>
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Nota informativa al pie */}
      {flows.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          💡 Los flujos tienen prioridad sobre la IA. Si un mensaje contiene la palabra clave, el bot responde con el flujo directamente.
        </p>
      )}
    </div>
  )
}
