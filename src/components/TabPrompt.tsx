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
import type { BotConfig, BotKnowledge } from '@/types'

// ─── Wizard config ────────────────────────────────────────────────────────────

const OBJECTIVES = [
  { id: 'sell',     emoji: '🛒', label: 'Vender producto o servicio',     desc: 'El bot guía al cliente hacia una compra' },
  { id: 'appoint',  emoji: '📅', label: 'Agendar citas o consultas',       desc: 'El bot ayuda a reservar un espacio o reunión' },
  { id: 'faq',      emoji: '❓', label: 'Responder preguntas frecuentes',  desc: 'El bot aclara dudas comunes de tu negocio' },
  { id: 'course',   emoji: '🎓', label: 'Vender cursos o membresías',      desc: 'El bot presenta y vende tu oferta educativa' },
  { id: 'support',  emoji: '🔧', label: 'Soporte post-venta',              desc: 'El bot ayuda a clientes que ya compraron' },
]

const TONES = [
  { id: 'formal',   label: 'Formal',   desc: 'Profesional y distante' },
  { id: 'friendly', label: 'Amigable', desc: 'Cercano y cálido' },
  { id: 'casual',   label: 'Cercano',  desc: 'Como un amigo de confianza' },
]

const STYLE_OPTIONS = [
  { value: 'corto',     label: 'Corto',     desc: 'Respuestas breves y directas',       tokens: 100 },
  { value: 'medio',     label: 'Medio',     desc: 'Balance entre detalle y brevedad',   tokens: 200 },
  { value: 'detallado', label: 'Detallado', desc: 'Respuestas completas y extensas',    tokens: 400 },
]

const CREATIVITY_OPTIONS = [
  { value: 'preciso',     label: 'Preciso',     desc: 'Respuestas exactas y consistentes',   temp: 0.3 },
  { value: 'balanceado',  label: 'Balanceado',  desc: 'Mezcla de precisión y creatividad',   temp: 0.7 },
  { value: 'creativo',    label: 'Creativo',    desc: 'Respuestas variadas y expresivas',     temp: 1.0 },
]

// ─── Prompt generator ─────────────────────────────────────────────────────────

function generatePersonalityPrompt(w: WizardData): string {
  const toneMap: Record<string, string> = {
    formal:   'profesional, respetuoso y directo',
    friendly: 'amigable, cálido y cercano',
    casual:   'conversacional, empático y como un amigo de confianza',
  }
  const objMap: Record<string, string> = {
    sell:    'guiar al cliente hacia una compra. Detecta su necesidad y ofrece el producto adecuado.',
    appoint: 'ayudar al cliente a agendar una cita o consulta. Pregunta disponibilidad y confirma.',
    faq:     'responder las preguntas frecuentes del negocio con claridad y precisión.',
    course:  'presentar los cursos o membresías disponibles y guiar hacia la inscripción.',
    support: 'ayudar a clientes que ya compraron a resolver problemas o dudas post-venta.',
  }

  return `IDENTIDAD Y ROL
Eres ${w.botName || 'un asistente virtual'}, el asistente virtual de ${w.businessName || 'este negocio'}.
Tu estilo de comunicación es: ${toneMap[w.tone] || 'amigable y profesional'}.

TU OBJETIVO PRINCIPAL
Tu función es ${objMap[w.objective] || 'ayudar al cliente y guiarlo hacia una acción.'}

ESTRUCTURA DE RESPUESTA
Cada respuesta debe incluir:
1. Conexión: valida o responde al usuario
2. Contexto: información útil y breve
3. Acción: UNA sola pregunta o invitación a avanzar

REGLAS DE INTERACCIÓN
- Máximo 1 pregunta por mensaje
- No pedir datos personales innecesarios
- Siempre guiar hacia una acción concreta
- Respuestas claras y sin rodeos

CONTROL DE INFORMACIÓN (CRÍTICO)
Tu única fuente de verdad es el documento de conocimiento del negocio.
Si algo no está definido, responde EXACTAMENTE:
"No tengo esa información en este momento. ¿Deseas que te transfiera con un asesor?"

Reglas:
- No inventar información
- No estimar precios que no están definidos
- No suponer condiciones
- No usar conocimiento externo al negocio

${w.transferPhone ? `TRANSFERENCIA A ASESOR HUMANO
Cuando el usuario lo solicite o no puedas resolver su duda, transfiere con el asesor.` : ''}

PRINCIPIO CLAVE
Tu objetivo no es solo responder.
Tu objetivo es: ENTENDER → GUIAR → CONVERTIR`
}

function generateKnowledgeContent(w: WizardData): string {
  const objLabel = OBJECTIVES.find(o => o.id === w.objective)?.label || 'Asistente general'

  return `DOCUMENTO DE CONOCIMIENTO – ${(w.businessName || 'MI NEGOCIO').toUpperCase()}

PROPÓSITO
Este documento es la ÚNICA fuente de verdad del negocio.
Objetivo del bot: ${objLabel}

Si algo no está aquí → No existe → No se puede responder.

---

=====================================
1. INFORMACIÓN GENERAL
=====================================

Nombre del negocio:
${w.businessName || '[Completa aquí]'}

Tipo de negocio:
${w.businessType || '[Ej: Servicios / Productos / Cursos / Clínica]'}

Ubicación:
[Ej: Ciudad / Online / Presencial]

Horario de atención:
[Ej: Lunes a viernes 9am - 6pm]

---

=====================================
2. ${w.objective === 'faq' ? 'PREGUNTAS FRECUENTES' : 'PRODUCTOS / SERVICIOS'}
=====================================

${w.mainOffer ? `OFERTA PRINCIPAL\n\n${w.mainOffer}\n\n---` : `PRODUCTO O SERVICIO 1

Nombre:
[Nombre]

Qué es:
[Descripción en 1-2 líneas]

Beneficio principal:
[Por qué le importa al cliente]

Precio:
[Ej: $500 MXN / Desde $X / Consultar]

Enlace o forma de compra:
[URL / WhatsApp / Sucursal]

---`}

=====================================
3. PROCESO DE ${w.objective === 'appoint' ? 'AGENDAMIENTO' : w.objective === 'support' ? 'SOPORTE' : 'COMPRA O CONTACTO'}
=====================================

Pasos para el cliente:
1. [Primer paso]
2. [Segundo paso]
3. [Tercer paso]

${w.nextStep ? `El siguiente paso concreto que debe dar el cliente:\n${w.nextStep}` : ''}

---

=====================================
4. RESPUESTAS OFICIALES
=====================================

Cuando pregunten por precios:
"[Tu respuesta oficial sobre precios]"

Cuando pregunten por disponibilidad:
"[Tu respuesta sobre disponibilidad]"

---

=====================================
5. RESTRICCIONES
=====================================

- No inventar información
- No estimar precios
- No prometer resultados específicos
- No responder temas fuera del negocio

---

=====================================
6. CONTROL DE DESCONOCIMIENTO
=====================================

Si no existe información, responder EXACTAMENTE:
"No tengo esa información en este momento. ¿Deseas que te transfiera con un asesor?"`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardData = {
  // Step 1
  objective: string
  // Step 2
  businessName: string
  businessType: string
  mainOffer: string
  nextStep: string
  // Step 3
  botName: string
  tone: string
  transferPhone: string
  welcomeMessage: string
  style: string
  creativity: string
}

const emptyWizard = (): WizardData => ({
  objective: '',
  businessName: '', businessType: '', mainOffer: '', nextStep: '',
  botName: '', tone: 'friendly', transferPhone: '', welcomeMessage: '',
  style: 'medio', creativity: 'balanceado',
})

// ─── Main component ───────────────────────────────────────────────────────────

export default function TabPrompt({ companyId }: { companyId: string }) {
  const [config, setConfig] = useState<Partial<BotConfig>>({})
  const [hasConfig, setHasConfig] = useState(false)
  const [knowledgeList, setKnowledgeList] = useState<BotKnowledge[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Wizard state
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [wizard, setWizard] = useState<WizardData>(emptyWizard())
  const [editingKnowledge, setEditingKnowledge] = useState<BotKnowledge | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const fetchAll = async () => {
    const { data: cfg } = await supabase.from('bot_config').select('*').eq('company_id', companyId).single()
    if (cfg) { setConfig(cfg); setHasConfig(true) }
    const { data: kList } = await supabase.from('bot_knowledge').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (kList) setKnowledgeList(kList)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [companyId])

  // ─── Wizard save ───────────────────────────────────────────────────────────

  const handleWizardSave = async () => {
    setSaving(true)
    const personality = generatePersonalityPrompt(wizard)
    const knowledge = generateKnowledgeContent(wizard)
    const styleObj = STYLE_OPTIONS.find(s => s.value === wizard.style)
    const creativityObj = CREATIVITY_OPTIONS.find(c => c.value === wizard.creativity)

    // Save bot_config
    const { error: cfgErr } = await supabase.from('bot_config').upsert({
      company_id: companyId,
      bot_name: wizard.botName,
      welcome_message: wizard.welcomeMessage,
      personality_prompt: personality,
      style: wizard.style,
      creativity: wizard.creativity,
      max_tokens: styleObj?.tokens || 200,
      temperature: creativityObj?.temp || 0.7,
      advisor_phone: wizard.transferPhone || null,
      transfer_message: wizard.transferPhone
        ? '👋 Con gusto te transfiero con un asesor que puede ayudarte mejor:'
        : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })

    if (cfgErr) { toast.error('Error guardando configuración'); setSaving(false); return }

    // Save bot_knowledge (deactivate others, create new)
    await supabase.from('bot_knowledge').update({ active: false }).eq('company_id', companyId)
    const objLabel = OBJECTIVES.find(o => o.id === wizard.objective)?.label || 'Asistente'
    const { error: kErr } = await supabase.from('bot_knowledge').insert({
      company_id: companyId,
      name: objLabel,
      content: knowledge,
      active: true,
    })

    if (kErr) { toast.error('Error guardando conocimiento'); setSaving(false); return }

    toast.success('✅ Tu bot está configurado y listo')
    setShowWizard(false)
    setWizardStep(1)
    await fetchAll()
    setSaving(false)
  }

  // ─── Knowledge actions ────────────────────────────────────────────────────

  const handleActivate = async (id: string) => {
    await supabase.from('bot_knowledge').update({ active: false }).eq('company_id', companyId)
    await supabase.from('bot_knowledge').update({ active: true }).eq('id', id)
    toast.success('✅ Objetivo activado')
    fetchAll()
  }

  const handleSaveEditKnowledge = async () => {
    if (!editingKnowledge) return
    setSaving(true)
    await supabase.from('bot_knowledge').update({
      name: editingKnowledge.name,
      content: editingKnowledge.content,
      updated_at: new Date().toISOString(),
    }).eq('id', editingKnowledge.id)
    toast.success('Guardado')
    setEditingKnowledge(null)
    setSaving(false)
    fetchAll()
  }

  const handleDelete = async (id: string) => {
    const k = knowledgeList.find(k => k.id === id)
    if (k?.active) { toast.error('No puedes eliminar el objetivo activo. Activa otro primero.'); setConfirmDelete(null); return }
    await supabase.from('bot_knowledge').delete().eq('id', id)
    toast.success('Eliminado')
    setConfirmDelete(null)
    fetchAll()
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>

  // ─── Wizard UI ────────────────────────────────────────────────────────────

  if (showWizard) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Paso {wizardStep} de 3</span>
            <button onClick={() => { setShowWizard(false); setWizardStep(1) }}
              className="hover:text-foreground transition-colors">✕ Cancelar</button>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= wizardStep ? 'bg-foreground' : 'bg-muted'}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {wizardStep === 1 && '¿En qué se va a enfocar tu bot?'}
            {wizardStep === 2 && 'Cuéntame sobre tu negocio'}
            {wizardStep === 3 && '¿Cómo va a hablar tu bot?'}
          </p>
        </div>

        {/* Step 1 — Objetivo */}
        {wizardStep === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">¿Qué quieres que haga tu bot?</h2>
              <p className="text-sm text-muted-foreground mt-1">Elige UN objetivo principal. Puedes cambiarlo después.</p>
            </div>
            <div className="space-y-2">
              {OBJECTIVES.map(obj => (
                <button key={obj.id} onClick={() => setWizard(w => ({ ...w, objective: obj.id }))}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                    wizard.objective === obj.id
                      ? 'border-foreground bg-foreground/5 ring-1 ring-foreground'
                      : 'border-border hover:border-foreground/40'
                  }`}>
                  <span className="text-2xl shrink-0">{obj.emoji}</span>
                  <div>
                    <p className="text-sm font-medium">{obj.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{obj.desc}</p>
                  </div>
                  {wizard.objective === obj.id && (
                    <span className="ml-auto text-foreground text-lg shrink-0">✓</span>
                  )}
                </button>
              ))}
            </div>
            <Button className="w-full" disabled={!wizard.objective}
              onClick={() => setWizardStep(2)}>
              Continuar →
            </Button>
          </div>
        )}

        {/* Step 2 — Negocio */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Cuéntame sobre tu negocio</h2>
              <p className="text-sm text-muted-foreground mt-1">Con esta información el bot sabrá exactamente qué decir.</p>
            </div>
            <Card className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label>¿Cómo se llama tu negocio? *</Label>
                <Input placeholder="Ej. NutriSport Pro, Clínica Bienestar..." value={wizard.businessName}
                  onChange={e => setWizard(w => ({ ...w, businessName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>¿Qué tipo de negocio es?</Label>
                <Input placeholder="Ej. Tienda de suplementos / Clínica / Academia online..." value={wizard.businessType}
                  onChange={e => setWizard(w => ({ ...w, businessType: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {wizard.objective === 'faq'    ? '¿Cuáles son las preguntas más comunes que recibes?' :
                   wizard.objective === 'appoint' ? '¿Qué servicio o cita ofreces?' :
                   wizard.objective === 'support' ? '¿Qué tipo de soporte necesitan tus clientes?' :
                   '¿Qué vendes exactamente?'}
                  {' '}<span className="text-muted-foreground font-normal text-xs">(describe con detalle)</span>
                </Label>
                <Textarea
                  placeholder={
                    wizard.objective === 'course'
                      ? 'Ej. Curso de meditación $499, Membresía mensual $299, Taller presencial $800...'
                      : wizard.objective === 'appoint'
                      ? 'Ej. Consulta nutricional 1hr, Sesión de coaching, Cita médica general...'
                      : 'Describe tus productos o servicios principales con precios si es posible...'
                  }
                  className="min-h-[120px]"
                  value={wizard.mainOffer}
                  onChange={e => setWizard(w => ({ ...w, mainOffer: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>¿Cuál es el siguiente paso que debe dar el cliente?</Label>
                <Input
                  placeholder={
                    wizard.objective === 'appoint' ? 'Ej. Escribir al asesor para confirmar fecha y hora' :
                    wizard.objective === 'sell'    ? 'Ej. Hacer clic en el link de pago / Llamar al número X' :
                    'Ej. Contactar por WhatsApp al número...'
                  }
                  value={wizard.nextStep}
                  onChange={e => setWizard(w => ({ ...w, nextStep: e.target.value }))} />
              </div>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setWizardStep(1)}>← Atrás</Button>
              <Button className="flex-1" disabled={!wizard.businessName.trim()}
                onClick={() => setWizardStep(3)}>Continuar →</Button>
            </div>
          </div>
        )}

        {/* Step 3 — Personalidad */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">¿Cómo va a hablar tu bot?</h2>
              <p className="text-sm text-muted-foreground mt-1">Define el nombre y el estilo de comunicación.</p>
            </div>
            <Card className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nombre del bot *</Label>
                  <Input placeholder="Ej. Claudia, Max, Asistente..." value={wizard.botName}
                    onChange={e => setWizard(w => ({ ...w, botName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mensaje de bienvenida</Label>
                  <Input placeholder="Ej. ¡Hola! Soy Claudia 👋 ¿En qué te ayudo?" value={wizard.welcomeMessage}
                    onChange={e => setWizard(w => ({ ...w, welcomeMessage: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tono de comunicación</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TONES.map(t => (
                    <button key={t.id} onClick={() => setWizard(w => ({ ...w, tone: t.id }))}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        wizard.tone === t.id ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'
                      }`}>
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Número del asesor humano <span className="text-muted-foreground font-normal text-xs">(opcional — si el bot no puede resolver)</span></Label>
                <Input placeholder="529991234567 (con código de país, sin +)" value={wizard.transferPhone}
                  onChange={e => setWizard(w => ({ ...w, transferPhone: e.target.value }))} />
              </div>

              {/* Advanced options */}
              <button onClick={() => setShowAdvanced(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                {showAdvanced ? '▲' : '▼'} Opciones avanzadas (longitud y creatividad)
              </button>

              {showAdvanced && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="space-y-2">
                    <Label>Longitud de respuesta</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {STYLE_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setWizard(w => ({ ...w, style: opt.value }))}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            wizard.style === opt.value ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'
                          }`}>
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Creatividad</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {CREATIVITY_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setWizard(w => ({ ...w, creativity: opt.value }))}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            wizard.creativity === opt.value ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'
                          }`}>
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setWizardStep(2)}>← Atrás</Button>
              <Button className="flex-1" disabled={!wizard.botName.trim() || saving} onClick={handleWizardSave}>
                {saving ? 'Configurando...' : '✓ Activar mi bot'}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Main view (after setup) ──────────────────────────────────────────────

  const activeKnowledge = knowledgeList.find(k => k.active)

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-medium">Asistente IA</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {hasConfig ? 'Tu bot está configurado y activo' : 'Configura tu bot en 3 pasos'}
          </p>
        </div>
        <Button size="sm" onClick={() => { setWizard(emptyWizard()); setWizardStep(1); setShowWizard(true) }}>
          {hasConfig ? '+ Nuevo objetivo' : 'Configurar bot'}
        </Button>
      </div>

      {/* Empty state */}
      {!hasConfig && knowledgeList.length === 0 && (
        <Card className="p-10 text-center space-y-4">
          <p className="text-4xl">🤖</p>
          <div>
            <p className="text-base font-medium">Tu bot aún no está configurado</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              Responde 3 preguntas simples y tu bot estará listo para atender clientes en minutos.
            </p>
          </div>
          <Button onClick={() => { setWizard(emptyWizard()); setWizardStep(1); setShowWizard(true) }}>
            Comenzar configuración →
          </Button>
        </Card>
      )}

      {/* Bot personality summary */}
      {hasConfig && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Personalidad del bot</p>
          <Card className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Nombre', value: config.bot_name || '—' },
                { label: 'Asesor', value: config.advisor_phone ? `+${config.advisor_phone}` : 'Sin transferencia' },
                { label: 'Respuestas', value: STYLE_OPTIONS.find(s => s.value === config.style)?.label || '—' },
                { label: 'Creatividad', value: CREATIVITY_OPTIONS.find(c => c.value === config.creativity)?.label || '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium mt-0.5 capitalize">{value}</p>
                </div>
              ))}
            </div>
            {config.welcome_message && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">Mensaje de bienvenida</p>
                <p className="text-sm mt-0.5 line-clamp-2">{config.welcome_message}</p>
              </div>
            )}
          </Card>
        </div>
      )}

      <Separator />

      {/* Objectives list */}
      {knowledgeList.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Objetivos configurados
          </p>
          <p className="text-xs text-muted-foreground -mt-1">
            Solo uno puede estar activo a la vez. El bot cambia de contenido al instante.
          </p>

          {knowledgeList.map(k => (
            <Card key={k.id} className={`p-4 transition-all ${k.active ? 'ring-1 ring-green-400 bg-green-50/30' : ''}`}>
              {editingKnowledge?.id === k.id ? (
                <div className="space-y-3">
                  <Input value={editingKnowledge.name}
                    onChange={e => setEditingKnowledge({ ...editingKnowledge, name: e.target.value })} />
                  <Textarea value={editingKnowledge.content}
                    onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                    className="min-h-[200px] font-mono text-xs" />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingKnowledge(null)}>Cancelar</Button>
                    <Button size="sm" className="flex-1" disabled={saving} onClick={handleSaveEditKnowledge}>
                      {saving ? 'Guardando...' : 'Guardar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{k.name}</span>
                      {k.active && <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">● Activo ahora</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{k.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!k.active && (
                      <Button variant="outline" size="sm" onClick={() => handleActivate(k.id)}>Activar</Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setEditingKnowledge(k)}>Editar</Button>
                    {confirmDelete === k.id ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>No</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(k.id)}>Sí</Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(k.id)}>Eliminar</Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
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
import type { BotConfig, BotKnowledge } from '@/types'

// ─── Wizard config ────────────────────────────────────────────────────────────

const OBJECTIVES = [
  { id: 'sell',     emoji: '🛒', label: 'Vender producto o servicio',     desc: 'El bot guía al cliente hacia una compra' },
  { id: 'appoint',  emoji: '📅', label: 'Agendar citas o consultas',       desc: 'El bot ayuda a reservar un espacio o reunión' },
  { id: 'faq',      emoji: '❓', label: 'Responder preguntas frecuentes',  desc: 'El bot aclara dudas comunes de tu negocio' },
  { id: 'course',   emoji: '🎓', label: 'Vender cursos o membresías',      desc: 'El bot presenta y vende tu oferta educativa' },
  { id: 'support',  emoji: '🔧', label: 'Soporte post-venta',              desc: 'El bot ayuda a clientes que ya compraron' },
]

const TONES = [
  { id: 'formal',   label: 'Formal',   desc: 'Profesional y distante' },
  { id: 'friendly', label: 'Amigable', desc: 'Cercano y cálido' },
  { id: 'casual',   label: 'Cercano',  desc: 'Como un amigo de confianza' },
]

const STYLE_OPTIONS = [
  { value: 'corto',     label: 'Corto',     desc: 'Respuestas breves y directas',       tokens: 100 },
  { value: 'medio',     label: 'Medio',     desc: 'Balance entre detalle y brevedad',   tokens: 200 },
  { value: 'detallado', label: 'Detallado', desc: 'Respuestas completas y extensas',    tokens: 400 },
]

const CREATIVITY_OPTIONS = [
  { value: 'preciso',     label: 'Preciso',     desc: 'Respuestas exactas y consistentes',   temp: 0.3 },
  { value: 'balanceado',  label: 'Balanceado',  desc: 'Mezcla de precisión y creatividad',   temp: 0.7 },
  { value: 'creativo',    label: 'Creativo',    desc: 'Respuestas variadas y expresivas',     temp: 1.0 },
]

// ─── Prompt generator ─────────────────────────────────────────────────────────

function generatePersonalityPrompt(w: WizardData): string {
  const toneMap: Record<string, string> = {
    formal:   'profesional, respetuoso y directo',
    friendly: 'amigable, cálido y cercano',
    casual:   'conversacional, empático y como un amigo de confianza',
  }
  const objMap: Record<string, string> = {
    sell:    'guiar al cliente hacia una compra. Detecta su necesidad y ofrece el producto adecuado.',
    appoint: 'ayudar al cliente a agendar una cita o consulta. Pregunta disponibilidad y confirma.',
    faq:     'responder las preguntas frecuentes del negocio con claridad y precisión.',
    course:  'presentar los cursos o membresías disponibles y guiar hacia la inscripción.',
    support: 'ayudar a clientes que ya compraron a resolver problemas o dudas post-venta.',
  }

  return `IDENTIDAD Y ROL
Eres ${w.botName || 'un asistente virtual'}, el asistente virtual de ${w.businessName || 'este negocio'}.
Tu estilo de comunicación es: ${toneMap[w.tone] || 'amigable y profesional'}.

TU OBJETIVO PRINCIPAL
Tu función es ${objMap[w.objective] || 'ayudar al cliente y guiarlo hacia una acción.'}

ESTRUCTURA DE RESPUESTA
Cada respuesta debe incluir:
1. Conexión: valida o responde al usuario
2. Contexto: información útil y breve
3. Acción: UNA sola pregunta o invitación a avanzar

REGLAS DE INTERACCIÓN
- Máximo 1 pregunta por mensaje
- No pedir datos personales innecesarios
- Siempre guiar hacia una acción concreta
- Respuestas claras y sin rodeos

CONTROL DE INFORMACIÓN (CRÍTICO)
Tu única fuente de verdad es el documento de conocimiento del negocio.
Si algo no está definido, responde EXACTAMENTE:
"No tengo esa información en este momento. ¿Deseas que te transfiera con un asesor?"

Reglas:
- No inventar información
- No estimar precios que no están definidos
- No suponer condiciones
- No usar conocimiento externo al negocio

${w.transferPhone ? `TRANSFERENCIA A ASESOR HUMANO
Cuando el usuario lo solicite o no puedas resolver su duda, transfiere con el asesor.` : ''}

PRINCIPIO CLAVE
Tu objetivo no es solo responder.
Tu objetivo es: ENTENDER → GUIAR → CONVERTIR`
}

function generateKnowledgeContent(w: WizardData): string {
  const objLabel = OBJECTIVES.find(o => o.id === w.objective)?.label || 'Asistente general'

  return `DOCUMENTO DE CONOCIMIENTO – ${(w.businessName || 'MI NEGOCIO').toUpperCase()}

PROPÓSITO
Este documento es la ÚNICA fuente de verdad del negocio.
Objetivo del bot: ${objLabel}

Si algo no está aquí → No existe → No se puede responder.

---

=====================================
1. INFORMACIÓN GENERAL
=====================================

Nombre del negocio:
${w.businessName || '[Completa aquí]'}

Tipo de negocio:
${w.businessType || '[Ej: Servicios / Productos / Cursos / Clínica]'}

Ubicación:
[Ej: Ciudad / Online / Presencial]

Horario de atención:
[Ej: Lunes a viernes 9am - 6pm]

---

=====================================
2. ${w.objective === 'faq' ? 'PREGUNTAS FRECUENTES' : 'PRODUCTOS / SERVICIOS'}
=====================================

${w.mainOffer ? `OFERTA PRINCIPAL\n\n${w.mainOffer}\n\n---` : `PRODUCTO O SERVICIO 1

Nombre:
[Nombre]

Qué es:
[Descripción en 1-2 líneas]

Beneficio principal:
[Por qué le importa al cliente]

Precio:
[Ej: $500 MXN / Desde $X / Consultar]

Enlace o forma de compra:
[URL / WhatsApp / Sucursal]

---`}

=====================================
3. PROCESO DE ${w.objective === 'appoint' ? 'AGENDAMIENTO' : w.objective === 'support' ? 'SOPORTE' : 'COMPRA O CONTACTO'}
=====================================

Pasos para el cliente:
1. [Primer paso]
2. [Segundo paso]
3. [Tercer paso]

${w.nextStep ? `El siguiente paso concreto que debe dar el cliente:\n${w.nextStep}` : ''}

---

=====================================
4. RESPUESTAS OFICIALES
=====================================

Cuando pregunten por precios:
"[Tu respuesta oficial sobre precios]"

Cuando pregunten por disponibilidad:
"[Tu respuesta sobre disponibilidad]"

---

=====================================
5. RESTRICCIONES
=====================================

- No inventar información
- No estimar precios
- No prometer resultados específicos
- No responder temas fuera del negocio

---

=====================================
6. CONTROL DE DESCONOCIMIENTO
=====================================

Si no existe información, responder EXACTAMENTE:
"No tengo esa información en este momento. ¿Deseas que te transfiera con un asesor?"`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardData = {
  // Step 1
  objective: string
  // Step 2
  businessName: string
  businessType: string
  mainOffer: string
  nextStep: string
  // Step 3
  botName: string
  tone: string
  transferPhone: string
  welcomeMessage: string
  style: string
  creativity: string
}

const emptyWizard = (): WizardData => ({
  objective: '',
  businessName: '', businessType: '', mainOffer: '', nextStep: '',
  botName: '', tone: 'friendly', transferPhone: '', welcomeMessage: '',
  style: 'medio', creativity: 'balanceado',
})

// ─── Main component ───────────────────────────────────────────────────────────

export default function TabPrompt({ companyId }: { companyId: string }) {
  const [config, setConfig] = useState<Partial<BotConfig>>({})
  const [hasConfig, setHasConfig] = useState(false)
  const [knowledgeList, setKnowledgeList] = useState<BotKnowledge[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Wizard state
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [wizard, setWizard] = useState<WizardData>(emptyWizard())
  const [editingKnowledge, setEditingKnowledge] = useState<BotKnowledge | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const fetchAll = async () => {
    const { data: cfg } = await supabase.from('bot_config').select('*').eq('company_id', companyId).single()
    if (cfg) { setConfig(cfg); setHasConfig(true) }
    const { data: kList } = await supabase.from('bot_knowledge').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (kList) setKnowledgeList(kList)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [companyId])

  // ─── Wizard save ───────────────────────────────────────────────────────────

  const handleWizardSave = async () => {
    setSaving(true)
    const personality = generatePersonalityPrompt(wizard)
    const knowledge = generateKnowledgeContent(wizard)
    const styleObj = STYLE_OPTIONS.find(s => s.value === wizard.style)
    const creativityObj = CREATIVITY_OPTIONS.find(c => c.value === wizard.creativity)

    // Save bot_config
    const { error: cfgErr } = await supabase.from('bot_config').upsert({
      company_id: companyId,
      bot_name: wizard.botName,
      welcome_message: wizard.welcomeMessage,
      personality_prompt: personality,
      style: wizard.style,
      creativity: wizard.creativity,
      max_tokens: styleObj?.tokens || 200,
      temperature: creativityObj?.temp || 0.7,
      advisor_phone: wizard.transferPhone || null,
      transfer_message: wizard.transferPhone
        ? '👋 Con gusto te transfiero con un asesor que puede ayudarte mejor:'
        : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })

    if (cfgErr) { toast.error('Error guardando configuración'); setSaving(false); return }

    // Save bot_knowledge (deactivate others, create new)
    await supabase.from('bot_knowledge').update({ active: false }).eq('company_id', companyId)
    const objLabel = OBJECTIVES.find(o => o.id === wizard.objective)?.label || 'Asistente'
    const { error: kErr } = await supabase.from('bot_knowledge').insert({
      company_id: companyId,
      name: objLabel,
      content: knowledge,
      active: true,
    })

    if (kErr) { toast.error('Error guardando conocimiento'); setSaving(false); return }

    toast.success('✅ Tu bot está configurado y listo')
    setShowWizard(false)
    setWizardStep(1)
    await fetchAll()
    setSaving(false)
  }

  // ─── Knowledge actions ────────────────────────────────────────────────────

  const handleActivate = async (id: string) => {
    await supabase.from('bot_knowledge').update({ active: false }).eq('company_id', companyId)
    await supabase.from('bot_knowledge').update({ active: true }).eq('id', id)
    toast.success('✅ Objetivo activado')
    fetchAll()
  }

  const handleSaveEditKnowledge = async () => {
    if (!editingKnowledge) return
    setSaving(true)
    await supabase.from('bot_knowledge').update({
      name: editingKnowledge.name,
      content: editingKnowledge.content,
      updated_at: new Date().toISOString(),
    }).eq('id', editingKnowledge.id)
    toast.success('Guardado')
    setEditingKnowledge(null)
    setSaving(false)
    fetchAll()
  }

  const handleDelete = async (id: string) => {
    const k = knowledgeList.find(k => k.id === id)
    if (k?.active) { toast.error('No puedes eliminar el objetivo activo. Activa otro primero.'); setConfirmDelete(null); return }
    await supabase.from('bot_knowledge').delete().eq('id', id)
    toast.success('Eliminado')
    setConfirmDelete(null)
    fetchAll()
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>

  // ─── Wizard UI ────────────────────────────────────────────────────────────

  if (showWizard) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Paso {wizardStep} de 3</span>
            <button onClick={() => { setShowWizard(false); setWizardStep(1) }}
              className="hover:text-foreground transition-colors">✕ Cancelar</button>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= wizardStep ? 'bg-foreground' : 'bg-muted'}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {wizardStep === 1 && '¿En qué se va a enfocar tu bot?'}
            {wizardStep === 2 && 'Cuéntame sobre tu negocio'}
            {wizardStep === 3 && '¿Cómo va a hablar tu bot?'}
          </p>
        </div>

        {/* Step 1 — Objetivo */}
        {wizardStep === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">¿Qué quieres que haga tu bot?</h2>
              <p className="text-sm text-muted-foreground mt-1">Elige UN objetivo principal. Puedes cambiarlo después.</p>
            </div>
            <div className="space-y-2">
              {OBJECTIVES.map(obj => (
                <button key={obj.id} onClick={() => setWizard(w => ({ ...w, objective: obj.id }))}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                    wizard.objective === obj.id
                      ? 'border-foreground bg-foreground/5 ring-1 ring-foreground'
                      : 'border-border hover:border-foreground/40'
                  }`}>
                  <span className="text-2xl shrink-0">{obj.emoji}</span>
                  <div>
                    <p className="text-sm font-medium">{obj.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{obj.desc}</p>
                  </div>
                  {wizard.objective === obj.id && (
                    <span className="ml-auto text-foreground text-lg shrink-0">✓</span>
                  )}
                </button>
              ))}
            </div>
            <Button className="w-full" disabled={!wizard.objective}
              onClick={() => setWizardStep(2)}>
              Continuar →
            </Button>
          </div>
        )}

        {/* Step 2 — Negocio */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Cuéntame sobre tu negocio</h2>
              <p className="text-sm text-muted-foreground mt-1">Con esta información el bot sabrá exactamente qué decir.</p>
            </div>
            <Card className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label>¿Cómo se llama tu negocio? *</Label>
                <Input placeholder="Ej. NutriSport Pro, Clínica Bienestar..." value={wizard.businessName}
                  onChange={e => setWizard(w => ({ ...w, businessName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>¿Qué tipo de negocio es?</Label>
                <Input placeholder="Ej. Tienda de suplementos / Clínica / Academia online..." value={wizard.businessType}
                  onChange={e => setWizard(w => ({ ...w, businessType: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {wizard.objective === 'faq'    ? '¿Cuáles son las preguntas más comunes que recibes?' :
                   wizard.objective === 'appoint' ? '¿Qué servicio o cita ofreces?' :
                   wizard.objective === 'support' ? '¿Qué tipo de soporte necesitan tus clientes?' :
                   '¿Qué vendes exactamente?'}
                  {' '}<span className="text-muted-foreground font-normal text-xs">(describe con detalle)</span>
                </Label>
                <Textarea
                  placeholder={
                    wizard.objective === 'course'
                      ? 'Ej. Curso de meditación $499, Membresía mensual $299, Taller presencial $800...'
                      : wizard.objective === 'appoint'
                      ? 'Ej. Consulta nutricional 1hr, Sesión de coaching, Cita médica general...'
                      : 'Describe tus productos o servicios principales con precios si es posible...'
                  }
                  className="min-h-[120px]"
                  value={wizard.mainOffer}
                  onChange={e => setWizard(w => ({ ...w, mainOffer: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>¿Cuál es el siguiente paso que debe dar el cliente?</Label>
                <Input
                  placeholder={
                    wizard.objective === 'appoint' ? 'Ej. Escribir al asesor para confirmar fecha y hora' :
                    wizard.objective === 'sell'    ? 'Ej. Hacer clic en el link de pago / Llamar al número X' :
                    'Ej. Contactar por WhatsApp al número...'
                  }
                  value={wizard.nextStep}
                  onChange={e => setWizard(w => ({ ...w, nextStep: e.target.value }))} />
              </div>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setWizardStep(1)}>← Atrás</Button>
              <Button className="flex-1" disabled={!wizard.businessName.trim()}
                onClick={() => setWizardStep(3)}>Continuar →</Button>
            </div>
          </div>
        )}

        {/* Step 3 — Personalidad */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">¿Cómo va a hablar tu bot?</h2>
              <p className="text-sm text-muted-foreground mt-1">Define el nombre y el estilo de comunicación.</p>
            </div>
            <Card className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nombre del bot *</Label>
                  <Input placeholder="Ej. Claudia, Max, Asistente..." value={wizard.botName}
                    onChange={e => setWizard(w => ({ ...w, botName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mensaje de bienvenida</Label>
                  <Input placeholder="Ej. ¡Hola! Soy Claudia 👋 ¿En qué te ayudo?" value={wizard.welcomeMessage}
                    onChange={e => setWizard(w => ({ ...w, welcomeMessage: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tono de comunicación</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TONES.map(t => (
                    <button key={t.id} onClick={() => setWizard(w => ({ ...w, tone: t.id }))}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        wizard.tone === t.id ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'
                      }`}>
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Número del asesor humano <span className="text-muted-foreground font-normal text-xs">(opcional — si el bot no puede resolver)</span></Label>
                <Input placeholder="529991234567 (con código de país, sin +)" value={wizard.transferPhone}
                  onChange={e => setWizard(w => ({ ...w, transferPhone: e.target.value }))} />
              </div>

              {/* Advanced options */}
              <button onClick={() => setShowAdvanced(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                {showAdvanced ? '▲' : '▼'} Opciones avanzadas (longitud y creatividad)
              </button>

              {showAdvanced && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="space-y-2">
                    <Label>Longitud de respuesta</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {STYLE_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setWizard(w => ({ ...w, style: opt.value }))}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            wizard.style === opt.value ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'
                          }`}>
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Creatividad</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {CREATIVITY_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setWizard(w => ({ ...w, creativity: opt.value }))}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            wizard.creativity === opt.value ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'
                          }`}>
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setWizardStep(2)}>← Atrás</Button>
              <Button className="flex-1" disabled={!wizard.botName.trim() || saving} onClick={handleWizardSave}>
                {saving ? 'Configurando...' : '✓ Activar mi bot'}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Main view (after setup) ──────────────────────────────────────────────

  const activeKnowledge = knowledgeList.find(k => k.active)

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-medium">Asistente IA</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {hasConfig ? 'Tu bot está configurado y activo' : 'Configura tu bot en 3 pasos'}
          </p>
        </div>
        <Button size="sm" onClick={() => { setWizard(emptyWizard()); setWizardStep(1); setShowWizard(true) }}>
          {hasConfig ? '+ Nuevo objetivo' : 'Configurar bot'}
        </Button>
      </div>

      {/* Empty state */}
      {!hasConfig && knowledgeList.length === 0 && (
        <Card className="p-10 text-center space-y-4">
          <p className="text-4xl">🤖</p>
          <div>
            <p className="text-base font-medium">Tu bot aún no está configurado</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              Responde 3 preguntas simples y tu bot estará listo para atender clientes en minutos.
            </p>
          </div>
          <Button onClick={() => { setWizard(emptyWizard()); setWizardStep(1); setShowWizard(true) }}>
            Comenzar configuración →
          </Button>
        </Card>
      )}

      {/* Bot personality summary */}
      {hasConfig && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Personalidad del bot</p>
          <Card className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Nombre', value: config.bot_name || '—' },
                { label: 'Asesor', value: config.advisor_phone ? `+${config.advisor_phone}` : 'Sin transferencia' },
                { label: 'Respuestas', value: STYLE_OPTIONS.find(s => s.value === config.style)?.label || '—' },
                { label: 'Creatividad', value: CREATIVITY_OPTIONS.find(c => c.value === config.creativity)?.label || '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium mt-0.5 capitalize">{value}</p>
                </div>
              ))}
            </div>
            {config.welcome_message && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">Mensaje de bienvenida</p>
                <p className="text-sm mt-0.5 line-clamp-2">{config.welcome_message}</p>
              </div>
            )}
          </Card>
        </div>
      )}

      <Separator />

      {/* Objectives list */}
      {knowledgeList.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Objetivos configurados
          </p>
          <p className="text-xs text-muted-foreground -mt-1">
            Solo uno puede estar activo a la vez. El bot cambia de contenido al instante.
          </p>

          {knowledgeList.map(k => (
            <Card key={k.id} className={`p-4 transition-all ${k.active ? 'ring-1 ring-green-400 bg-green-50/30' : ''}`}>
              {editingKnowledge?.id === k.id ? (
                <div className="space-y-3">
                  <Input value={editingKnowledge.name}
                    onChange={e => setEditingKnowledge({ ...editingKnowledge, name: e.target.value })} />
                  <Textarea value={editingKnowledge.content}
                    onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                    className="min-h-[200px] font-mono text-xs" />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingKnowledge(null)}>Cancelar</Button>
                    <Button size="sm" className="flex-1" disabled={saving} onClick={handleSaveEditKnowledge}>
                      {saving ? 'Guardando...' : 'Guardar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{k.name}</span>
                      {k.active && <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">● Activo ahora</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{k.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!k.active && (
                      <Button variant="outline" size="sm" onClick={() => handleActivate(k.id)}>Activar</Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setEditingKnowledge(k)}>Editar</Button>
                    {confirmDelete === k.id ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>No</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(k.id)}>Sí</Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(k.id)}>Eliminar</Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
