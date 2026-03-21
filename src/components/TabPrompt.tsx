'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PERSONALITY_TEMPLATE, KNOWLEDGE_TEMPLATE } from '@/lib/templates'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { BotConfig, BotKnowledge } from '@/types'

const STYLE_OPTIONS = [
  { value: 'corto', label: 'Corto', desc: 'Respuestas breves y directas', tokens: 100 },
  { value: 'medio', label: 'Medio', desc: 'Balance entre detalle y brevedad', tokens: 200 },
  { value: 'detallado', label: 'Detallado', desc: 'Respuestas completas y extensas', tokens: 400 },
]

const CREATIVITY_OPTIONS = [
  { value: 'preciso', label: 'Preciso', desc: 'Respuestas exactas y consistentes', temp: 0.3 },
  { value: 'balanceado', label: 'Balanceado', desc: 'Mezcla de precisión y creatividad', temp: 0.7 },
  { value: 'creativo', label: 'Creativo', desc: 'Respuestas variadas y expresivas', temp: 1.0 },
]

export default function TabPrompt({ companyId }: { companyId: string }) {
  const [config, setConfig] = useState<Partial<BotConfig>>({
    bot_name: '',
    welcome_message: '',
    personality_prompt: '',
    style: 'medio',
    creativity: 'balanceado',
    advisor_phone: '',
    transfer_message: '👋 Con gusto te transfiero con un asesor que puede ayudarte mejor:',
  })
  const [editingPersonality, setEditingPersonality] = useState(false)
  const [hasConfig, setHasConfig] = useState(false)
  const [knowledgeList, setKnowledgeList] = useState<BotKnowledge[]>([])
  const [newKnowledge, setNewKnowledge] = useState({ name: '', content: '' })
  const [editingKnowledge, setEditingKnowledge] = useState<BotKnowledge | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingKnowledge, setSavingKnowledge] = useState(false)
  const [originalConfig, setOriginalConfig] = useState<Partial<BotConfig>>({})

  const personalityFileRef = useRef<HTMLInputElement>(null)
  const knowledgeFileRef = useRef<HTMLInputElement>(null)
  const editKnowledgeFileRef = useRef<HTMLInputElement>(null)

  const fetchConfig = async () => {
    const { data } = await supabase
      .from('bot_config')
      .select('*')
      .eq('company_id', companyId)
      .single()
    if (data) {
      setConfig(data)
      setOriginalConfig(data)
      setHasConfig(true)
    } else {
      setEditingPersonality(true)
    }
    setLoadingConfig(false)
  }

  const fetchKnowledge = async () => {
    const { data } = await supabase
      .from('bot_knowledge')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (data) setKnowledgeList(data)
  }

  useEffect(() => {
    fetchConfig()
    fetchKnowledge()
  }, [companyId])

  const handleCancelPersonality = () => {
    setConfig(originalConfig)
    setEditingPersonality(false)
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    const styleObj = STYLE_OPTIONS.find(s => s.value === config.style)
    const creativityObj = CREATIVITY_OPTIONS.find(c => c.value === config.creativity)

    const { error } = await supabase.from('bot_config').upsert({
      ...config,
      company_id: companyId,
      max_tokens: styleObj?.tokens || 200,
      temperature: creativityObj?.temp || 0.7,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })

    if (error) {
      toast.error('Error al guardar')
    } else {
      toast.success('Configuración guardada')
      setOriginalConfig(config)
      setHasConfig(true)
      setEditingPersonality(false)
    }
    setSavingConfig(false)
  }

  const handlePersonalityFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setConfig({ ...config, personality_prompt: text })
      toast.success(`Archivo "${file.name}" cargado`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleKnowledgeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setNewKnowledge({ ...newKnowledge, content: text })
      toast.success(`Archivo "${file.name}" cargado`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleEditKnowledgeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingKnowledge) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setEditingKnowledge({ ...editingKnowledge, content: text })
      toast.success(`Archivo "${file.name}" cargado`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleAddKnowledge = async () => {
    if (!newKnowledge.name.trim() || !newKnowledge.content.trim()) {
      toast.error('El nombre y el contenido son requeridos')
      return
    }
    setSavingKnowledge(true)
    const { error } = await supabase.from('bot_knowledge').insert({
      company_id: companyId,
      name: newKnowledge.name.trim(),
      content: newKnowledge.content.trim(),
      active: knowledgeList.length === 0,
    })
    if (error) {
      toast.error('Error al guardar')
    } else {
      toast.success('Conocimiento agregado')
      setNewKnowledge({ name: '', content: '' })
      fetchKnowledge()
    }
    setSavingKnowledge(false)
  }

  const handleSaveEditKnowledge = async () => {
    if (!editingKnowledge) return
    setSavingKnowledge(true)
    const { error } = await supabase
      .from('bot_knowledge')
      .update({
        name: editingKnowledge.name,
        content: editingKnowledge.content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingKnowledge.id)

    if (error) {
      toast.error('Error al guardar')
    } else {
      toast.success('Conocimiento actualizado')
      setEditingKnowledge(null)
      fetchKnowledge()
    }
    setSavingKnowledge(false)
  }

  const handleActivate = async (id: string) => {
    await supabase
      .from('bot_knowledge')
      .update({ active: false })
      .eq('company_id', companyId)
    await supabase
      .from('bot_knowledge')
      .update({ active: true })
      .eq('id', id)
    toast.success('Modo activado')
    fetchKnowledge()
  }

  const handleDeleteKnowledge = async (id: string) => {
    await supabase.from('bot_knowledge').delete().eq('id', id)
    toast.success('Eliminado')
    fetchKnowledge()
  }

  if (loadingConfig) return <p className="text-sm text-muted-foreground">Cargando...</p>

  return (
    <div className="space-y-8">

      {/* SECCIÓN 1: PERSONALIDAD */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Personalidad del bot</h2>
            <p className="text-sm text-muted-foreground">
              Define cómo se llama, cómo habla y cómo se comporta tu bot
            </p>
          </div>
          {hasConfig && !editingPersonality && (
            <Button variant="outline" size="sm" onClick={() => setEditingPersonality(true)}>
              Editar
            </Button>
          )}
        </div>

        {/* Vista resumida */}
        {hasConfig && !editingPersonality && (
          <Card className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Nombre</p>
                <p className="text-sm font-medium">{config.bot_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bienvenida</p>
                <p className="text-sm font-medium line-clamp-1">{config.welcome_message || '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Personalidad</p>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {config.personality_prompt || '—'}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Badge variant="secondary">
                  {STYLE_OPTIONS.find(s => s.value === config.style)?.label || 'Medio'}
                </Badge>
                <Badge variant="secondary">
                  {CREATIVITY_OPTIONS.find(c => c.value === config.creativity)?.label || 'Balanceado'}
                </Badge>
              </div>
              {config.advisor_phone && (
                <p className="text-xs text-muted-foreground">
                  Asesor: +{config.advisor_phone}
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Formulario de edición */}
        {editingPersonality && (
          <Card className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nombre del bot</Label>
                <Input
                  placeholder="TonyFit, Asistente, Sofia..."
                  value={config.bot_name || ''}
                  onChange={e => setConfig({ ...config, bot_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mensaje de bienvenida</Label>
                <Input
                  placeholder="¡Hola! ¿En qué te puedo ayudar?"
                  value={config.welcome_message || ''}
                  onChange={e => setConfig({ ...config, welcome_message: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Personalidad y tono</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setConfig({ ...config, personality_prompt: PERSONALITY_TEMPLATE })}>
                    Usar plantilla
                  </Button>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => personalityFileRef.current?.click()}>
                    Cargar .txt
                  </Button>
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setConfig({ ...config, personality_prompt: '' })}>
                    Limpiar
                  </Button>
                  <input ref={personalityFileRef} type="file" accept=".txt"
                    className="hidden" onChange={handlePersonalityFile} />
                </div>
              </div>
              <Textarea
                placeholder="Ej: Eres un asesor amable y profesional..."
                className="min-h-[160px] font-mono text-sm"
                value={config.personality_prompt || ''}
                onChange={e => setConfig({ ...config, personality_prompt: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Define el tono, el idioma y las reglas de comportamiento del bot
              </p>
            </div>

            <div className="space-y-3">
              <Label>Longitud de respuestas</Label>
              <div className="grid grid-cols-3 gap-3">
                {STYLE_OPTIONS.map(opt => (
                  <button key={opt.value}
                    onClick={() => setConfig({ ...config, style: opt.value })}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      config.style === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Estilo de respuesta</Label>
              <div className="grid grid-cols-3 gap-3">
                {CREATIVITY_OPTIONS.map(opt => (
                  <button key={opt.value}
                    onClick={() => setConfig({ ...config, creativity: opt.value })}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      config.creativity === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Transferencia a asesor */}
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Transferencia a asesor humano</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cuando el bot no pueda responder o el usuario lo solicite, enviará este contacto
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Número del asesor</Label>
                  <Input
                    placeholder="529991234567 (con código de país, sin +)"
                    value={config.advisor_phone || ''}
                    onChange={e => setConfig({ ...config, advisor_phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Mensaje de transferencia</Label>
                  <Input
                    placeholder="👋 Te transfiero con un asesor..."
                    value={config.transfer_message || ''}
                    onChange={e => setConfig({ ...config, transfer_message: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              {hasConfig && (
                <Button variant="outline" className="flex-1" onClick={handleCancelPersonality}>
                  Cancelar
                </Button>
              )}
              <Button onClick={handleSaveConfig} disabled={savingConfig} className="flex-1">
                {savingConfig ? 'Guardando...' : 'Guardar configuración'}
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Separator />

      {/* SECCIÓN 2: CONOCIMIENTO */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Conocimiento del bot</h2>
          <p className="text-sm text-muted-foreground">
            Agrega lo que tu bot debe saber. Solo uno puede estar activo a la vez.
          </p>
        </div>

        <div className="space-y-3">
          {knowledgeList.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aún no hay conocimientos. Agrega el primero abajo.
            </p>
          )}
          {knowledgeList.map(k => (
            <Card key={k.id} className={`p-4 ${k.active ? 'ring-1 ring-primary' : ''}`}>
              {editingKnowledge?.id === k.id ? (
                <div className="space-y-3">
                  <Input
                    value={editingKnowledge.name}
                    onChange={e => setEditingKnowledge({ ...editingKnowledge, name: e.target.value })}
                    placeholder="Nombre"
                  />
                  <div className="space-y-2">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => setEditingKnowledge({ ...editingKnowledge, content: KNOWLEDGE_TEMPLATE })}>
                        Usar plantilla
                      </Button>
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => editKnowledgeFileRef.current?.click()}>
                        Cargar .txt
                      </Button>
                      <Button type="button" variant="ghost" size="sm"
                        onClick={() => setEditingKnowledge({ ...editingKnowledge, content: '' })}>
                        Limpiar
                      </Button>
                      <input ref={editKnowledgeFileRef} type="file" accept=".txt"
                        className="hidden" onChange={handleEditKnowledgeFile} />
                    </div>
                    <Textarea
                      value={editingKnowledge.content}
                      onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                      className="min-h-[200px] font-mono text-sm"
                      placeholder="Contenido del conocimiento..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1"
                      onClick={() => setEditingKnowledge(null)}>
                      Cancelar
                    </Button>
                    <Button size="sm" className="flex-1" disabled={savingKnowledge}
                      onClick={handleSaveEditKnowledge}>
                      {savingKnowledge ? 'Guardando...' : 'Guardar cambios'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{k.name}</span>
                      {k.active && <Badge>Activo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{k.content}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {!k.active && (
                      <Button variant="outline" size="sm" onClick={() => handleActivate(k.id)}>
                        Activar
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setEditingKnowledge(k)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteKnowledge(k.id)}>
                      Eliminar
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>

        <Card className="p-6 space-y-4">
          <p className="text-sm font-medium">Agregar nuevo conocimiento</p>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              placeholder="Ej: Catálogo normal, Promoción verano, Menú del día..."
              value={newKnowledge.name}
              onChange={e => setNewKnowledge({ ...newKnowledge, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Contenido</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm"
                  onClick={() => setNewKnowledge({ ...newKnowledge, content: KNOWLEDGE_TEMPLATE })}>
                  Usar plantilla
                </Button>
                <Button type="button" variant="outline" size="sm"
                  onClick={() => knowledgeFileRef.current?.click()}>
                  Cargar .txt
                </Button>
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => setNewKnowledge({ ...newKnowledge, content: '' })}>
                  Limpiar
                </Button>
                <input ref={knowledgeFileRef} type="file" accept=".txt"
                  className="hidden" onChange={handleKnowledgeFile} />
              </div>
            </div>
            <Textarea
              placeholder="Lista tus productos, precios, servicios, horarios, políticas..."
              className="min-h-[160px] font-mono text-sm"
              value={newKnowledge.content}
              onChange={e => setNewKnowledge({ ...newKnowledge, content: e.target.value })}
            />
          </div>
          <Button onClick={handleAddKnowledge} disabled={savingKnowledge} className="w-full">
            {savingKnowledge ? 'Guardando...' : '+ Agregar conocimiento'}
          </Button>
        </Card>
      </div>
    </div>
  )
}
