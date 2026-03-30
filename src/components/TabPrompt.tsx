'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { BotConfig, BotKnowledge } from '@/types'

// ─── Wizard config ─────────────────────────────────────────────────────────────

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
  { value: 'corto',     label: 'Corto',     desc: 'Respuestas breves y directas',     tokens: 100 },
  { value: 'medio',     label: 'Medio',     desc: 'Balance entre detalle y brevedad', tokens: 200 },
  { value: 'detallado', label: 'Detallado', desc: 'Respuestas completas y extensas',  tokens: 400 },
]

const CREATIVITY_OPTIONS = [
  { value: 'preciso',    label: 'Preciso',    desc: 'Respuestas exactas y consistentes', temp: 0.3 },
  { value: 'balanceado', label: 'Balanceado', desc: 'Mezcla de precisión y creatividad', temp: 0.7 },
  { value: 'creativo',   label: 'Creativo',   desc: 'Respuestas variadas y expresivas',  temp: 1.0 },
]

// ─── Opciones específicas para citas ───────────────────────────────────────────

const APPOINTMENT_MODALITY = [
  { value: 'presencial', label: 'Presencial', desc: 'En tu consultorio o local' },
  { value: 'online',     label: 'Online',     desc: 'Videollamada o llamada' },
  { value: 'domicilio',  label: 'A domicilio', desc: 'El profesional va al cliente' },
]

const APPOINTMENT_BOOKING_MODE = [
  { value: 'manual',    label: 'El asesor confirma', desc: 'El bot recopila datos y avisa al asesor por WhatsApp' },
  { value: 'link',      label: 'Link de calendario', desc: 'El bot envía un link para que el cliente elija su slot' },
  { value: 'whatsapp',  label: 'Solo por WhatsApp',  desc: 'El cliente confirma directamente en la conversación' },
]

const APPOINTMENT_DURATION = [
  { value: '30',  label: '30 min' },
  { value: '45',  label: '45 min' },
  { value: '60',  label: '1 hora' },
  { value: '90',  label: '1.5 horas' },
  { value: '120', label: '2 horas' },
  { value: 'flex', label: 'Variable' },
]

// ─── Types ─────────────────────────────────────────────────────────────────────

type PriceType = 'fixed' | 'from' | 'quote'

type CatalogItem = {
  id: string
  title: string
  benefit: string
  priceType: PriceType
  priceValue: string
  nextStep: string
  // Campos exclusivos para appoint:
  duration?: string
  modality?: string
}

// Configuración de disponibilidad — solo aplica cuando objective === 'appoint'
type AvailabilityConfig = {
  scheduleText: string      // Ej: "Lunes a viernes 9am–6pm"
  bookingMode: string       // 'manual' | 'link' | 'whatsapp'
  calendarLink: string      // URL opcional si bookingMode === 'link'
  maxPerDay: string         // Número opcional de citas máx por día
  requiresConfirmation: boolean
}

type WizardData = {
  objective: string
  businessName: string
  businessType: string
  catalogItems: CatalogItem[]
  botName: string
  tone: string
  transferPhone: string
  welcomeMessage: string
  style: string
  creativity: string
  // Solo para appoint:
  availability: AvailabilityConfig
}

const emptyAvailability = (): AvailabilityConfig => ({
  scheduleText: '',
  bookingMode: 'manual',
  calendarLink: '',
  maxPerDay: '',
  requiresConfirmation: true,
})

const newCatalogItem = (): CatalogItem => ({
  id: Math.random().toString(36).slice(2),
  title: '',
  benefit: '',
  priceType: 'fixed',
  priceValue: '',
  nextStep: '',
  duration: '60',
  modality: 'presencial',
})

function formatPrice(item: CatalogItem): string {
  if (item.priceType === 'quote') return 'Precio a cotizar'
  if (item.priceType === 'from')  return item.priceValue ? `Desde ${item.priceValue}` : 'Desde [monto]'
  return item.priceValue || ''
}

function priceInstruction(item: CatalogItem): string {
  if (item.priceType === 'quote')
    return 'El precio de esta opción requiere cotización personalizada. Cuando el cliente pregunte por el precio, responde: "El precio varía según tus necesidades específicas. ¿Te conecto con un asesor para darte un presupuesto a medida?"'
  if (item.priceType === 'from')
    return `El precio parte desde ${item.priceValue || '[monto base]'}. Puedes mencionarlo así y ofrecer contacto con asesor para detalles.`
  return item.priceValue ? `Precio fijo: ${item.priceValue}` : 'Precio no especificado — no inventar ni estimar.'
}

const emptyWizard = (): WizardData => ({
  objective: '',
  businessName: '', businessType: '',
  catalogItems: [newCatalogItem()],
  botName: '', tone: 'friendly', transferPhone: '', welcomeMessage: '',
  style: 'medio', creativity: 'balanceado',
  availability: emptyAvailability(),
})

function getTitlePlaceholder(objective: string): string {
  switch (objective) {
    case 'appoint': return 'Ej. Consulta nutricional'
    case 'course':  return 'Ej. Curso de meditación'
    case 'support': return 'Ej. Soporte técnico'
    case 'faq':     return 'Ej. Información general'
    default:        return 'Ej. Plan mensual premium'
  }
}

function getBenefitPlaceholder(objective: string): string {
  switch (objective) {
    case 'appoint': return 'Ej. Evaluación personalizada de 1 hora con especialista'
    case 'course':  return 'Ej. 8 semanas de práctica guiada, acceso de por vida'
    case 'support': return 'Ej. Atención prioritaria para resolver tu problema'
    case 'faq':     return 'Ej. Todo lo que necesitas saber antes de comprar'
    default:        return 'Ej. Incluye X, Y y Z. Ideal para clientes que...'
  }
}

function getNextStepPlaceholder(objective: string): string {
  switch (objective) {
    case 'appoint': return 'Ej. El asesor confirma la cita en menos de 24h'
    case 'sell':    return 'Ej. Clic en link de pago'
    case 'course':  return 'Ej. Inscribirse en el formulario'
    default:        return 'Ej. Contactar al asesor'
  }
}

// ─── Generadores ───────────────────────────────────────────────────────────────

function generateMenuText(w: WizardData): string {
  const lines = w.catalogItems
    .filter(i => i.title.trim())
    .map((item, idx) => {
      const price = formatPrice(item)
      // Para citas añadimos duración si está disponible
      const durationLabel = w.objective === 'appoint' && item.duration && item.duration !== 'flex'
        ? ` (${APPOINTMENT_DURATION.find(d => d.value === item.duration)?.label || ''})`
        : ''
      return `${idx + 1}️⃣ ${item.title}${durationLabel}${price ? ` — ${price}` : ''}`
    })
    .join('\n')
  return `¡Hola! 👋 ¿En qué te puedo ayudar?\n\n${lines}\n\nResponde con el número de tu elección.`
}

// ─── Generador de personalidad mejorado para 'appoint' ────────────────────────

// Convierte el formato interno "DAYS:Lun,Mar|FROM:09:00|TO:18:00" a texto legible
function resolveScheduleText(raw: string): string {
  if (!raw.startsWith('DAYS:')) return raw
  const parts: Record<string, string> = {}
  raw.split('|').forEach(p => { const [k, v] = p.split(':'); parts[k] = v })
  const days = parts['DAYS'] || ''
  const from = (parts['FROM'] || '09:00').replace(':', 'h')
  const to   = (parts['TO']   || '18:00').replace(':', 'h')
  return `${days} · ${from}–${to}`
}

function generatePersonalityPrompt(w: WizardData): string {
  const toneMap: Record<string, string> = {
    formal:   'profesional, respetuoso y directo',
    friendly: 'amigable, cálido y cercano',
    casual:   'conversacional, empático y como un amigo de confianza',
  }

  // Para objetivos distintos de appoint, lógica original sin cambios
  if (w.objective !== 'appoint') {
    const objMap: Record<string, string> = {
      sell:    'guiar al cliente hacia una compra. Detecta su necesidad y ofrece el producto adecuado.',
      faq:     'responder las preguntas frecuentes del negocio con claridad y precisión.',
      course:  'presentar los cursos o membresías disponibles y guiar hacia la inscripción.',
      support: 'ayudar a clientes que ya compraron a resolver problemas o dudas post-venta.',
    }
    return `IDENTIDAD Y ROL
Eres ${w.botName || 'un asistente virtual'}, el asistente virtual de ${w.businessName || 'este negocio'}.
Tu estilo de comunicación es: ${toneMap[w.tone] || 'amigable y profesional'}.

TU OBJETIVO PRINCIPAL
Tu función es ${objMap[w.objective] || 'ayudar al cliente y guiarlo hacia una acción.'}

MENÚ DE BIENVENIDA
Al iniciar cualquier conversación, presenta el menú numerado de opciones disponibles.
Ejemplo de formato:
"¡Hola! 👋 ¿En qué te puedo ayudar hoy?
${w.catalogItems.filter(i => i.title.trim()).map((item, idx) => {
  const price = formatPrice(item)
  return `${idx + 1}️⃣ ${item.title}${price ? ` — ${price}` : ''}`
}).join('\n')}

Responde con el número de tu elección o escribe tu pregunta."

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

  // ── Prompt especializado para AGENDAR CITAS ──────────────────────────────────
  const bookingModeInstructions: Record<string, string> = {
    manual: `Cuando el cliente haya confirmado todos sus datos, indícale:
"Perfecto ✅ Recibirás la confirmación de tu cita en menos de 24 horas por este mismo WhatsApp. ¡Hasta pronto!"
El asesor recibirá un aviso con el resumen y se encargará de confirmar.`,
    link: `En cuanto el cliente confirme el servicio de interés, envíale el link DE INMEDIATO:\n"¡Perfecto! Puedes elegir el día y la hora aquí:\n${w.availability.calendarLink || '[link de calendario]'}\nUna vez que reserves, te llegará la confirmación automáticamente. 🗓️"\n\nDespués de enviar el link NO preguntes por fecha, nombre ni contacto — el calendario lo gestiona todo.`,
    whatsapp: `El cliente confirma directamente en esta conversación.
Al tener todos los datos, responde con el resumen completo y pide confirmación final:
"¿Confirmas tu cita con estos datos? Responde SÍ para reservar o NO para ajustar algo."`,
  }

  const menuPreview = w.catalogItems
    .filter(i => i.title.trim())
    .map((item, idx) => {
      const price = formatPrice(item)
      const dur = item.duration && item.duration !== 'flex'
        ? ` (${APPOINTMENT_DURATION.find(d => d.value === item.duration)?.label || ''})`
        : ''
      return `${idx + 1}️⃣ ${item.title}${dur}${price ? ` — ${price}` : ''}`
    })
    .join('\n')

  return `IDENTIDAD Y ROL
Eres ${w.botName || 'un asistente virtual'}, el asistente de agenda de ${w.businessName || 'este negocio'}.
Tu estilo de comunicación es: ${toneMap[w.tone] || 'amigable y profesional'}.

TU OBJETIVO PRINCIPAL
Ayudar al cliente a agendar una cita o consulta de forma clara, ordenada y sin fricción.
Tu trabajo es recopilar la información necesaria paso a paso — UNA pregunta a la vez.

MENÚ DE BIENVENIDA
Al iniciar cualquier conversación SIEMPRE presenta el menú numerado:
"¡Hola! 👋 ¿En qué te puedo ayudar?

${menuPreview}

Responde con el número de tu elección."

${w.availability.bookingMode === 'link' ? `FLUJO DE AGENDAMIENTO CON CALENDARIO ONLINE

PASO 1 — Confirmar servicio
Cuando el cliente elija un número o mencione un servicio, confirma brevemente qué incluye.

PASO 2 — Enviar link (INMEDIATO)
En cuanto el cliente confirme su interés, envía el link sin hacer más preguntas:
"¡Perfecto! Puedes elegir el día y la hora directamente aquí:
${w.availability.calendarLink || '[link de calendario]'}
Una vez que reserves, te llegará la confirmación automáticamente. 🗓️"

REGLA ABSOLUTA SOBRE DISPONIBILIDAD:
- NUNCA digas que un horario está ocupado, lleno o no disponible
- NUNCA preguntes por fecha ni hora preferida — eso lo gestiona el calendario
- NUNCA inventes disponibilidad ni restricciones de horario
- Si el cliente pregunta "¿hay lugar a las 9am?", responde:
  "Puedes ver la disponibilidad actualizada directamente en el link: ${w.availability.calendarLink || '[link]'}"

REGLAS DE INTERACCIÓN
- Máximo 1 pregunta por mensaje
- No pedir datos personales — el calendario los recopila
- Si el cliente pregunta algo fuera del agendamiento, responde brevemente y ofrece el link` : `FLUJO DE AGENDAMIENTO (sigue este orden estrictamente)

PASO 1 — Confirmar servicio
Cuando el cliente elija un número o mencione un servicio, confirma brevemente qué incluye y pregunta si es lo que busca.

PASO 2 — Fecha y hora preferida
Pregunta: "¿Tienes alguna fecha u horario de preferencia?"
${w.availability.scheduleText ? `Recuerda indicar la disponibilidad: ${resolveScheduleText(w.availability.scheduleText)}` : ''}
Si el cliente pide una fecha fuera del horario disponible, explícalo con amabilidad y ofrece alternativas.
IMPORTANTE: Solo puedes decir si una fecha está FUERA del horario de atención general. NUNCA digas que un horario específico dentro del rango está ocupado — no tienes acceso al calendario real.

PASO 3 — Nombre completo
Pregunta: "¿Me puedes dar tu nombre completo para registrar la cita?"

PASO 4 — Datos de contacto
Pregunta: "¿Un número de teléfono o correo donde podamos confirmarte la cita?"
${!w.transferPhone ? 'Este paso es opcional, no insistas si el cliente prefiere no dar el dato.' : ''}

PASO 5 — Resumen y cierre
Repite todos los datos recopilados en un mensaje de confirmación:
"Perfecto, aquí está el resumen de tu cita:
📋 Servicio: [servicio elegido]
📅 Fecha/hora: [fecha solicitada]
👤 Nombre: [nombre]
📱 Contacto: [dato de contacto]

${bookingModeInstructions[w.availability.bookingMode] || bookingModeInstructions['manual']}

REGLAS CRÍTICAS DE INTERACCIÓN
- Máximo 1 pregunta por mensaje — nunca agrupar dos preguntas en el mismo mensaje
- No saltar pasos del flujo — siempre seguir el orden 1→2→3→4→5
- NUNCA digas que un horario específico está ocupado — no tienes acceso al calendario real
- Solo puedes indicar si una fecha está fuera del horario general de atención
- No pedir más datos de los necesarios
- Si el cliente pregunta algo fuera del agendamiento, responde brevemente y vuelve al flujo`}

CONTROL DE INFORMACIÓN (CRÍTICO)
Tu única fuente de verdad es el documento de conocimiento del negocio.
Si algo no está definido, responde EXACTAMENTE:
"No tengo esa información en este momento. ¿Deseas que te transfiera con un asesor?"

${w.transferPhone ? `TRANSFERENCIA A ASESOR HUMANO
Si el cliente lo solicita o hay un problema que no puedes resolver, transfiere con el asesor.` : ''}

PRINCIPIO CLAVE
Tu objetivo es: ESCUCHAR → RECOPILAR → CONFIRMAR`
}

// ─── Generador de knowledge mejorado para 'appoint' ──────────────────────────

function generateKnowledgeContent(w: WizardData): string {
  const objLabel = OBJECTIVES.find(o => o.id === w.objective)?.label || 'Asistente general'
  const validItems = w.catalogItems.filter(i => i.title.trim())

  // Para objetivos distintos de appoint, lógica original sin cambios
  if (w.objective !== 'appoint') {
    const catalogSection = validItems.length > 0
      ? validItems.map((item, idx) => `OPCIÓN ${idx + 1}: ${item.title.toUpperCase()}

Nombre:
${item.title}

Descripción / beneficio:
${item.benefit || '[Sin descripción]'}

Precio:
${formatPrice(item) || '[No especificado]'}

Instrucción de precio para el bot:
${priceInstruction(item)}

Siguiente paso del cliente:
${item.nextStep || '[No especificado]'}

---`).join('\n\n')
      : `[Sin productos/servicios definidos]`

    const menuPreview = validItems.length > 0
      ? validItems.map((item, idx) => {
          const price = formatPrice(item)
          return `${idx + 1}️⃣ ${item.title}${price ? ` — ${price}` : ''}`
        }).join('\n')
      : '[Sin opciones definidas]'

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
2. CATÁLOGO DE ${w.objective === 'faq' ? 'TEMAS' : w.objective === 'course' ? 'CURSOS / MEMBRESÍAS' : 'PRODUCTOS / SERVICIOS'}
=====================================

MENÚ PRINCIPAL DEL BOT:
${menuPreview}

---

${catalogSection}

=====================================
3. RESTRICCIONES
=====================================

- No inventar información
- No estimar precios que no están definidos
- No prometer resultados específicos
- No responder temas fuera del negocio

---

=====================================
4. CONTROL DE DESCONOCIMIENTO
=====================================

Si no existe información, responder EXACTAMENTE:
"No tengo esa información en este momento. ¿Deseas que te transfiera con un asesor?"`
  }

  // ── Knowledge especializado para AGENDAR CITAS ───────────────────────────────
  const bookingModeLabel: Record<string, string> = {
    manual:   'El asesor confirma la cita manualmente por WhatsApp',
    link:     `El cliente elige su slot en el link: ${w.availability.calendarLink || '[pendiente agregar link]'}`,
    whatsapp: 'La cita se confirma directamente en la conversación de WhatsApp',
  }

  const servicesSection = validItems.length > 0
    ? validItems.map((item, idx) => {
        const durLabel = item.duration && item.duration !== 'flex'
          ? APPOINTMENT_DURATION.find(d => d.value === item.duration)?.label || item.duration + ' min'
          : 'Variable según caso'
        const modalityLabel = APPOINTMENT_MODALITY.find(m => m.value === item.modality)?.label || item.modality || '[No especificado]'

        return `SERVICIO ${idx + 1}: ${item.title.toUpperCase()}

Nombre:
${item.title}

Descripción / qué incluye:
${item.benefit || '[Sin descripción]'}

Duración:
${durLabel}

Modalidad:
${modalityLabel}

Precio:
${formatPrice(item) || '[No especificado]'}

Instrucción de precio para el bot:
${priceInstruction(item)}

Confirmación / siguiente paso:
${item.nextStep || 'El asesor confirmará la cita por WhatsApp en menos de 24 horas.'}

---`
      }).join('\n\n')
    : '[Sin servicios definidos]'

  const menuPreview = validItems.length > 0
    ? validItems.map((item, idx) => {
        const price = formatPrice(item)
        const dur = item.duration && item.duration !== 'flex'
          ? ` (${APPOINTMENT_DURATION.find(d => d.value === item.duration)?.label || ''})`
          : ''
        return `${idx + 1}️⃣ ${item.title}${dur}${price ? ` — ${price}` : ''}`
      }).join('\n')
    : '[Sin servicios definidos]'

  return `DOCUMENTO DE CONOCIMIENTO – ${(w.businessName || 'MI NEGOCIO').toUpperCase()}
MODO: AGENDAMIENTO DE CITAS

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
${w.businessType || '[Ej: Clínica / Consultorio / Estudio / Academia]'}

Ubicación:
[Completa: Ciudad / Dirección / Online]

=====================================
2. DISPONIBILIDAD Y HORARIOS
=====================================

Horario de atención:
${resolveScheduleText(w.availability.scheduleText) || '[Ej: Lunes a viernes 9am–6pm, Sábados 9am–2pm]'}

Modo de agendamiento:
${bookingModeLabel[w.availability.bookingMode] || bookingModeLabel['manual']}

${w.availability.maxPerDay ? `Límite de citas por día:\n${w.availability.maxPerDay} citas máximo por día` : ''}

Requiere confirmación del asesor:
${w.availability.requiresConfirmation ? 'Sí — el asesor confirma antes de dar por agendada la cita' : 'No — la cita queda agendada al completar el flujo'}

${w.availability.calendarLink ? `Link de calendario:\n${w.availability.calendarLink}` : ''}

---

=====================================
3. CATÁLOGO DE SERVICIOS / CITAS
=====================================

MENÚ PRINCIPAL DEL BOT:
${menuPreview}

---

${servicesSection}

=====================================
4. DATOS A RECOPILAR (EN ESTE ORDEN)
=====================================

El bot SIEMPRE debe recopilar los siguientes datos antes de confirmar una cita:

1. Servicio de interés (del menú)
2. Fecha y hora preferida
3. Nombre completo del cliente
4. Dato de contacto (teléfono o email)

NO continuar al siguiente paso hasta obtener respuesta del anterior.

=====================================
5. RESTRICCIONES
=====================================

- No inventar fechas ni horarios disponibles
- No confirmar citas fuera del horario indicado
- No omitir ningún paso del flujo de recopilación
- No estimar precios no definidos
- No prometer resultados específicos

---

=====================================
6. CONTROL DE DESCONOCIMIENTO
=====================================

Si no existe información, responder EXACTAMENTE:
"No tengo esa información en este momento. ¿Deseas que te transfiera con un asesor?"`
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function TabPrompt({ companyId }: { companyId: string }) {
  const [config, setConfig] = useState<Partial<BotConfig>>({})
  const [hasConfig, setHasConfig] = useState(false)
  const [knowledgeList, setKnowledgeList] = useState<BotKnowledge[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [wizard, setWizard] = useState<WizardData>(emptyWizard())
  const [editingKnowledge, setEditingKnowledge] = useState<BotKnowledge | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Total de pasos: 4 para todos los objetivos, igual que antes
  const TOTAL_STEPS = 4
  const stepLabel = (s: number) => {
    switch (s) {
      case 1: return '¿En qué se va a enfocar tu bot?'
      case 2: return wizard.objective === 'appoint'
        ? 'Datos de tu negocio y disponibilidad'
        : 'Datos de tu negocio'
      case 3: return wizard.objective === 'appoint'
        ? 'Servicios o citas disponibles'
        : 'Tus productos o servicios'
      case 4: return '¿Cómo va a hablar tu bot?'
    }
  }

  const fetchAll = async () => {
    const { data: cfg } = await supabase.from('bot_config').select('*').eq('company_id', companyId).single()
    if (cfg) { setConfig(cfg); setHasConfig(true) }
    const { data: kList } = await supabase.from('bot_knowledge').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (kList) setKnowledgeList(kList)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [companyId])

  const updateCatalogItem = (id: string, field: keyof CatalogItem, value: string) => {
    setWizard(w => ({
      ...w,
      catalogItems: w.catalogItems.map(item => item.id === id ? { ...item, [field]: value } : item),
    }))
  }

  const addCatalogItem = () => {
    setWizard(w => ({ ...w, catalogItems: [...w.catalogItems, newCatalogItem()] }))
  }

  const removeCatalogItem = (id: string) => {
    setWizard(w => ({ ...w, catalogItems: w.catalogItems.filter(item => item.id !== id) }))
  }

  const updateAvailability = (field: keyof AvailabilityConfig, value: string | boolean) => {
    setWizard(w => ({ ...w, availability: { ...w.availability, [field]: value } }))
  }

  const handleWizardSave = async () => {
    setSaving(true)
    const personality = generatePersonalityPrompt(wizard)
    const knowledge = generateKnowledgeContent(wizard)
    const styleObj = STYLE_OPTIONS.find(s => s.value === wizard.style)
    const creativityObj = CREATIVITY_OPTIONS.find(c => c.value === wizard.creativity)

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

  // ─── Wizard UI ─────────────────────────────────────────────────────────────

  if (showWizard) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Paso {wizardStep} de {TOTAL_STEPS}</span>
            <button
              onClick={() => { setShowWizard(false); setWizardStep(1) }}
              className="hover:text-foreground transition-colors"
            >
              ✕ Cancelar
            </button>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all ${s <= wizardStep ? 'bg-foreground' : 'bg-muted'}`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{stepLabel(wizardStep)}</p>
        </div>

        {/* ── PASO 1: Objetivo — sin cambios ──────────────────────────────── */}
        {wizardStep === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">¿Qué quieres que haga tu bot?</h2>
              <p className="text-sm text-muted-foreground mt-1">Elige UN objetivo principal. Puedes cambiarlo después.</p>
            </div>
            <div className="space-y-2">
              {OBJECTIVES.map(obj => (
                <button
                  key={obj.id}
                  onClick={() => setWizard(w => ({ ...w, objective: obj.id }))}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                    wizard.objective === obj.id
                      ? 'border-foreground bg-foreground/5 ring-1 ring-foreground'
                      : 'border-border hover:border-foreground/40'
                  }`}
                >
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
            <Button className="w-full" disabled={!wizard.objective} onClick={() => setWizardStep(2)}>
              Continuar →
            </Button>
          </div>
        )}

        {/* ── PASO 2: Datos del negocio — con bloque extra si es appoint ──── */}
        {wizardStep === 2 && (() => {
          // Días de la semana — estado local simulado con wizard.availability.scheduleText
          // Usamos un formato estructurado interno: días seleccionados + hora inicio + hora fin
          // Para compatibilidad con el campo scheduleText existente, construimos el texto al cambiar
          const DAYS = [
            { id: 'Lun', label: 'Lun' }, { id: 'Mar', label: 'Mar' }, { id: 'Mié', label: 'Mié' },
            { id: 'Jue', label: 'Jue' }, { id: 'Vie', label: 'Vie' },
            { id: 'Sáb', label: 'Sáb' }, { id: 'Dom', label: 'Dom' },
          ]

          // Parsear days/hours desde el campo scheduleText si ya fue llenado con el nuevo formato
          // Formato interno: "DAYS:Lun,Mar,Mié|FROM:09:00|TO:18:00"
          const parseStructured = (text: string) => {
            if (!text.startsWith('DAYS:')) return null
            const parts: Record<string, string> = {}
            text.split('|').forEach(p => { const [k, v] = p.split(':'); parts[k] = v })
            return {
              days: parts['DAYS'] ? parts['DAYS'].split(',') : [],
              from: parts['FROM'] || '09:00',
              to: parts['TO'] || '18:00',
            }
          }

          const structured = parseStructured(wizard.availability.scheduleText)
          const selectedDays: string[] = structured?.days ?? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
          const timeFrom: string = structured?.from ?? '09:00'
          const timeTo: string = structured?.to ?? '18:00'

          const buildScheduleText = (days: string[], from: string, to: string) =>
            `DAYS:${days.join(',')}|FROM:${from}|TO:${to}`

          const humanSchedule = (days: string[], from: string, to: string) => {
            if (days.length === 0) return ''
            return `${days.join(', ')} · ${from.replace(':', 'h')}–${to.replace(':', 'h')}`
          }

          const toggleDay = (day: string) => {
            const next = selectedDays.includes(day)
              ? selectedDays.filter(d => d !== day)
              : [...selectedDays, day]
            updateAvailability('scheduleText', buildScheduleText(next, timeFrom, timeTo))
          }

          const BOOKING_MODE_WITH_META = [
            {
              value: 'manual',
              label: 'El asesor confirma',
              desc: 'Ideal si no tienes calendario online. El bot guarda los datos y te avisa.',
              tag: { text: 'Recomendado', cls: 'bg-green-100 text-green-700' },
            },
            {
              value: 'link',
              label: 'Link de calendario',
              desc: 'Usa Calendly, Cal.com, etc. El cliente elige su horario solo.',
              tag: { text: 'Automático', cls: 'bg-blue-100 text-blue-700' },
            },
            {
              value: 'whatsapp',
              label: 'Solo por WhatsApp',
              desc: 'Tú y el cliente acuerdan fecha escribiéndose directamente.',
              tag: null,
            },
          ]

          const isStep2Valid =
            wizard.businessName.trim() &&
            wizard.businessType.trim() &&
            !(wizard.objective === 'appoint' && wizard.availability.bookingMode === 'link' && !wizard.availability.calendarLink.trim())

          return (
            <div className="space-y-5">

              {/* ── Mejora 5: Separación visual con numeración de secciones ── */}
              <div className="flex items-center gap-3 pb-1">
                <div className="w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-semibold text-foreground shrink-0">1</div>
                <div>
                  <p className="text-base font-semibold leading-tight">Datos del negocio</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Información general que aplica a todo tu negocio.</p>
                </div>
              </div>

              <Card className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>¿Cómo se llama tu negocio? *</Label>
                  <Input
                    placeholder="Ej. NutriSport Pro, Clínica Bienestar, Academia Online..."
                    value={wizard.businessName}
                    onChange={e => setWizard(w => ({ ...w, businessName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>¿Qué tipo de negocio es? *</Label>
                  <Input
                    placeholder="Ej. Clínica dental / Consultorio / Estudio de yoga..."
                    value={wizard.businessType}
                    onChange={e => setWizard(w => ({ ...w, businessType: e.target.value }))}
                  />
                </div>
              </Card>

              {/* ── Bloque de disponibilidad — SOLO para appoint ─────────── */}
              {wizard.objective === 'appoint' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pt-1 pb-0.5 border-t border-border/50 mt-2">
                    <div className="w-6 h-6 rounded-full border-2 border-foreground flex items-center justify-center text-xs font-semibold text-foreground shrink-0">2</div>
                    <div>
                      <p className="text-base font-semibold leading-tight">Disponibilidad y agenda</p>
                      <p className="text-xs text-muted-foreground mt-0.5">El bot usará esta info para indicar cuándo puedes atender.</p>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground">En curso</span>
                  </div>

                  <Card className="p-5 space-y-5">

                    {/* ── Mejora 1: Días con pills + horas estructuradas ── */}
                    <div className="space-y-3">
                      <Label>Días disponibles</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map(d => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => toggleDay(d.id)}
                            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                              selectedDays.includes(d.id)
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border text-muted-foreground hover:border-foreground/40'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Hora inicio</Label>
                          <Input
                            type="time"
                            value={timeFrom}
                            onChange={e => updateAvailability('scheduleText', buildScheduleText(selectedDays, e.target.value, timeTo))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Hora fin</Label>
                          <Input
                            type="time"
                            value={timeTo}
                            onChange={e => updateAvailability('scheduleText', buildScheduleText(selectedDays, timeFrom, e.target.value))}
                          />
                        </div>
                      </div>
                      {selectedDays.length > 0 && (
                        <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                          ✓ El bot informará: <span className="font-medium">{humanSchedule(selectedDays, timeFrom, timeTo)}</span>
                        </p>
                      )}
                    </div>

                    {/* ── Mejora 2: Modo con tag recomendado y contexto ── */}
                    <div className="space-y-2">
                      <Label>¿Cómo se agenda la cita?</Label>
                      <div className="space-y-2">
                        {BOOKING_MODE_WITH_META.map(mode => (
                          <button
                            key={mode.value}
                            type="button"
                            onClick={() => updateAvailability('bookingMode', mode.value)}
                            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                              wizard.availability.bookingMode === mode.value
                                ? 'border-foreground bg-foreground/5 ring-1 ring-foreground'
                                : 'border-border hover:border-foreground/40'
                            }`}
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                                {mode.label}
                                {mode.tag && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${mode.tag.cls}`}>
                                    {mode.tag.text}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">{mode.desc}</p>
                            </div>
                            {wizard.availability.bookingMode === mode.value && (
                              <span className="text-foreground text-sm shrink-0 mt-0.5">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Link de calendario — solo si eligió 'link' */}
                    {wizard.availability.bookingMode === 'link' && (
                      <div className="space-y-1.5">
                        <Label>Link de calendario *</Label>
                        <Input
                          placeholder="Ej. https://calendly.com/tu-usuario"
                          value={wizard.availability.calendarLink}
                          onChange={e => updateAvailability('calendarLink', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">El bot enviará este link al cliente para que elija su horario.</p>
                      </div>
                    )}

                    {/* ── Mejora 3: Campo de citas con impacto explicado ── */}
                    <div className="space-y-1.5">
                      <Label>
                        ¿Cuántas citas puedes atender por día?
                        <span className="text-muted-foreground font-normal text-xs ml-1">(opcional)</span>
                      </Label>
                      <Input
                        placeholder="Ej. 8 — o deja vacío si no hay límite"
                        type="number"
                        min="1"
                        value={wizard.availability.maxPerDay}
                        onChange={e => updateAvailability('maxPerDay', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        El bot no agendará más de este número al día y avisará cuando no haya disponibilidad.
                      </p>
                    </div>
                  </Card>
                </div>
              )}
              {/* ── Fin bloque appoint ────────────────────────────────────── */}

              {/* ── Mejora 4: Mini resumen antes de continuar ─────────────── */}
              {wizard.businessName.trim() && (
                <div className="rounded-xl border border-green-200 bg-green-50/60 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-green-800">Resumen hasta aquí</p>
                  <p className="text-xs text-green-700">
                    <span className="font-medium">{wizard.businessType || 'Negocio'}</span>
                    {' · '}{wizard.businessName}
                    {wizard.objective === 'appoint' && selectedDays.length > 0 && (
                      <> · {humanSchedule(selectedDays, timeFrom, timeTo)}</>
                    )}
                    {wizard.objective === 'appoint' && (
                      <> · {BOOKING_MODE_WITH_META.find(m => m.value === wizard.availability.bookingMode)?.label}</>
                    )}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setWizardStep(1)}>← Atrás</Button>
                <Button
                  className="flex-1"
                  disabled={!isStep2Valid}
                  onClick={() => setWizardStep(3)}
                >
                  {wizard.businessName.trim() ? 'Todo bien, continuar →' : 'Continuar →'}
                </Button>
              </div>
            </div>
          )
        })()}

        {/* ── PASO 3: Catálogo — con campos extra si es appoint ──────────── */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">
                {wizard.objective === 'faq'     ? 'Temas que maneja tu bot' :
                 wizard.objective === 'appoint' ? 'Servicios o citas disponibles' :
                 wizard.objective === 'course'  ? 'Cursos o membresías' :
                 wizard.objective === 'support' ? 'Tipos de soporte' :
                 'Productos o servicios'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Cada opción que agregues aparecerá como una entrada numerada en el menú del chat.
              </p>
            </div>

            <div className="space-y-3">
              {wizard.catalogItems.map((item, idx) => (
                <Card key={item.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {wizard.objective === 'appoint' ? `Servicio ${idx + 1}` : `Opción ${idx + 1}`}
                    </span>
                    {wizard.catalogItems.length > 1 && (
                      <button
                        onClick={() => removeCatalogItem(item.id)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        ✕ quitar
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>
                      {wizard.objective === 'appoint' ? 'Nombre del servicio o cita' : 'Nombre del producto o servicio'}
                      <span className="text-muted-foreground font-normal text-xs ml-1">(aparece en el menú)</span>
                    </Label>
                    <Input
                      placeholder={getTitlePlaceholder(wizard.objective)}
                      value={item.title}
                      onChange={e => updateCatalogItem(item.id, 'title', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>
                      Descripción breve
                      <span className="text-muted-foreground font-normal text-xs ml-1">(el bot la usa para explicar al cliente)</span>
                    </Label>
                    <Input
                      placeholder={getBenefitPlaceholder(wizard.objective)}
                      value={item.benefit}
                      onChange={e => updateCatalogItem(item.id, 'benefit', e.target.value)}
                    />
                  </div>

                  {/* ── Campos extra para appoint ─────────────────────────────── */}
                  {wizard.objective === 'appoint' && (
                    <>
                      <div className="space-y-2">
                        <Label>Duración de la cita</Label>
                        <div className="flex flex-wrap gap-2">
                          {APPOINTMENT_DURATION.map(dur => (
                            <button
                              key={dur.value}
                              type="button"
                              onClick={() => updateCatalogItem(item.id, 'duration', dur.value)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                item.duration === dur.value
                                  ? 'border-foreground bg-foreground/5'
                                  : 'border-border hover:border-foreground/40'
                              }`}
                            >
                              {dur.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Modalidad</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {APPOINTMENT_MODALITY.map(mod => (
                            <button
                              key={mod.value}
                              type="button"
                              onClick={() => updateCatalogItem(item.id, 'modality', mod.value)}
                              className={`p-2.5 rounded-lg border text-left transition-all ${
                                item.modality === mod.value
                                  ? 'border-foreground bg-foreground/5'
                                  : 'border-border hover:border-foreground/40'
                              }`}
                            >
                              <p className="text-xs font-medium">{mod.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{mod.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {/* ── Fin campos extra appoint ──────────────────────────────── */}

                  <div className="space-y-2">
                    <Label>Precio</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { type: 'fixed', label: 'Precio fijo',  hint: 'Ej. $1,200' },
                        { type: 'from',  label: 'Desde...',     hint: 'Ej. Desde $500' },
                        { type: 'quote', label: 'A cotizar',    hint: 'El bot redirige al asesor' },
                      ] as const).map(opt => (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => updateCatalogItem(item.id, 'priceType', opt.type)}
                          className={`p-2.5 rounded-lg border text-left transition-all ${
                            item.priceType === opt.type
                              ? 'border-foreground bg-foreground/5'
                              : 'border-border hover:border-foreground/40'
                          }`}
                        >
                          <p className="text-xs font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{opt.hint}</p>
                        </button>
                      ))}
                    </div>
                    {item.priceType !== 'quote' && (
                      <Input
                        placeholder={item.priceType === 'from' ? 'Ej. $500' : 'Ej. $1,200'}
                        value={item.priceValue}
                        onChange={e => updateCatalogItem(item.id, 'priceValue', e.target.value)}
                      />
                    )}
                    {item.priceType === 'quote' && (
                      <p className="text-xs text-muted-foreground border border-dashed border-border rounded-lg p-2.5">
                        Cuando el cliente pregunte por el precio, el bot responderá que varía según sus necesidades y ofrecerá conectarlo con un asesor.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>
                      {wizard.objective === 'appoint' ? 'Confirmación / siguiente paso' : 'Siguiente paso del cliente'}
                    </Label>
                    <Input
                      placeholder={getNextStepPlaceholder(wizard.objective)}
                      value={item.nextStep}
                      onChange={e => updateCatalogItem(item.id, 'nextStep', e.target.value)}
                    />
                  </div>
                </Card>
              ))}

              <button
                onClick={addCatalogItem}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-all"
              >
                + Agregar {wizard.objective === 'appoint' ? 'otro servicio' : 'otra opción'}
              </button>
            </div>

            {wizard.catalogItems.some(i => i.title.trim()) && (
              <div className="rounded-xl bg-[#0b1f0e] p-4 space-y-2">
                <p className="text-xs text-green-400 font-medium">Vista previa — menú en WhatsApp</p>
                <p className="text-sm text-green-100 whitespace-pre-line font-mono leading-relaxed">
                  {generateMenuText(wizard)}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setWizardStep(2)}>← Atrás</Button>
              <Button
                className="flex-1"
                disabled={!wizard.catalogItems.some(i => i.title.trim())}
                onClick={() => {
                  setWizard(w => ({ ...w, welcomeMessage: generateMenuText(w) }))
                  setWizardStep(4)
                }}
              >
                Continuar →
              </Button>
            </div>
          </div>
        )}

        {/* ── PASO 4: Personalidad — sin cambios ──────────────────────────── */}
        {wizardStep === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">¿Cómo va a hablar tu bot?</h2>
              <p className="text-sm text-muted-foreground mt-1">Define el nombre y el estilo de comunicación.</p>
            </div>
            <Card className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label>Nombre del bot *</Label>
                <Input
                  placeholder="Ej. Claudia, Max, Asistente..."
                  value={wizard.botName}
                  onChange={e => setWizard(w => ({ ...w, botName: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Mensaje de bienvenida</Label>
                  <button
                    type="button"
                    onClick={() => setWizard(w => ({ ...w, welcomeMessage: generateMenuText(w) }))}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ↺ Restaurar menú generado
                  </button>
                </div>
                <Textarea
                  className="min-h-[120px] font-mono text-xs leading-relaxed"
                  value={wizard.welcomeMessage}
                  onChange={e => setWizard(w => ({ ...w, welcomeMessage: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Este es el primer mensaje que recibirá el cliente. Puedes editarlo libremente.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Tono de comunicación</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TONES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setWizard(w => ({ ...w, tone: t.id }))}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        wizard.tone === t.id ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'
                      }`}
                    >
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Número del asesor humano{' '}
                  <span className="text-muted-foreground font-normal text-xs">
                    {wizard.objective === 'appoint'
                      ? '(recomendado — para recibir resumen de citas)'
                      : '(opcional — si el bot no puede resolver)'}
                  </span>
                </Label>
                <Input
                  placeholder="529991234567 (con código de país, sin +)"
                  value={wizard.transferPhone}
                  onChange={e => setWizard(w => ({ ...w, transferPhone: e.target.value }))}
                />
                {wizard.objective === 'appoint' && (
                  <p className="text-xs text-muted-foreground">
                    El bot enviará un aviso a este número cada vez que un cliente complete el flujo de agendamiento.
                  </p>
                )}
              </div>

              <button
                onClick={() => setShowAdvanced(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                {showAdvanced ? '▲' : '▼'} Opciones avanzadas (longitud y creatividad)
              </button>

              {showAdvanced && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="space-y-2">
                    <Label>Longitud de respuesta</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {STYLE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setWizard(w => ({ ...w, style: opt.value }))}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            wizard.style === opt.value ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'
                          }`}
                        >
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
                        <button
                          key={opt.value}
                          onClick={() => setWizard(w => ({ ...w, creativity: opt.value }))}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            wizard.creativity === opt.value ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'
                          }`}
                        >
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
              <Button variant="outline" className="flex-1" onClick={() => setWizardStep(3)}>← Atrás</Button>
              <Button
                className="flex-1"
                disabled={!wizard.botName.trim() || saving}
                onClick={handleWizardSave}
              >
                {saving ? 'Configurando...' : '✓ Activar mi bot'}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Vista principal ────────────────────────────────────────────────────────

  const activeKnowledge = knowledgeList.find(k => k.active)
  const inactiveKnowledge = knowledgeList.filter(k => !k.active)

  return (
    <div className="space-y-8 max-w-3xl">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-medium">Asistente IA</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {hasConfig ? 'Tu bot está configurado y activo' : 'Configura tu bot en 4 pasos'}
          </p>
        </div>
        <Button size="sm" onClick={() => { setWizard(emptyWizard()); setWizardStep(1); setShowWizard(true) }}>
          {hasConfig ? '+ Nuevo objetivo' : 'Configurar bot'}
        </Button>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!hasConfig && knowledgeList.length === 0 && (
        <Card className="p-10 text-center space-y-4">
          <p className="text-4xl">🤖</p>
          <div>
            <p className="text-base font-medium">Tu bot aún no está configurado</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              Responde 4 pasos simples y tu bot estará listo para atender clientes en minutos.
            </p>
          </div>
          <Button onClick={() => { setWizard(emptyWizard()); setWizardStep(1); setShowWizard(true) }}>
            Comenzar configuración →
          </Button>
        </Card>
      )}

      {hasConfig && (
        <>
          {/* ── SECCIÓN 1: Objetivo activo ────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Objetivo activo
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Es el tema que domina tu bot ahora mismo — lo que sabe responder.
                </p>
              </div>
            </div>

            {activeKnowledge ? (
              <Card className="p-5 border-2 border-foreground bg-foreground/[0.02]">
                {editingKnowledge?.id === activeKnowledge.id ? (
                  <div className="space-y-3">
                    <Input
                      value={editingKnowledge.name}
                      onChange={e => setEditingKnowledge({ ...editingKnowledge, name: e.target.value })}
                    />
                    <Textarea
                      value={editingKnowledge.content}
                      onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                      className="min-h-[200px] font-mono text-xs"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingKnowledge(null)}>Cancelar</Button>
                      <Button size="sm" className="flex-1" disabled={saving} onClick={handleSaveEditKnowledge}>
                        {saving ? 'Guardando...' : 'Guardar'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <span className="text-sm font-semibold">{activeKnowledge.name}</span>
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Activo ahora</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 pl-4">
                          {activeKnowledge.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setEditingKnowledge(activeKnowledge)}>Editar</Button>
                        {confirmDelete === activeKnowledge.id ? (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>No</Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(activeKnowledge.id)}>Sí</Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(activeKnowledge.id)}>Eliminar</Button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border/60">
                      <p className="text-xs text-muted-foreground">
                        🤖 <span className="font-medium text-foreground">{config.bot_name || 'Tu bot'}</span> usa este objetivo para saber qué responder — con tono <span className="font-medium text-foreground">{TONES.find(t => t.id === config.style)?.label ?? TONES.find(t => t.id === 'friendly')?.label}</span> y respuestas <span className="font-medium text-foreground lowercase">{STYLE_OPTIONS.find(s => s.value === config.style)?.label ?? 'medias'}</span>.
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-5 border border-dashed text-center">
                <p className="text-sm text-muted-foreground">No hay ningún objetivo activo.</p>
                <p className="text-xs text-muted-foreground mt-1">Activa uno de los objetivos de abajo para que el bot sepa qué responder.</p>
              </Card>
            )}
          </div>

          {/* ── SECCIÓN 2: Personalidad ──────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Personalidad del bot
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Así habla tu bot — aplica a todos los objetivos por igual.
                </p>
              </div>
            </div>

            <Card className="p-4 bg-muted/30">
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
                <div className="mt-3 pt-3 border-t border-border/60">
                  <p className="text-xs text-muted-foreground">Mensaje de bienvenida</p>
                  <p className="text-sm mt-0.5 line-clamp-2 text-muted-foreground">{config.welcome_message}</p>
                </div>
              )}
            </Card>
          </div>

          <Separator />

          {/* ── SECCIÓN 3: Otros objetivos ───────────────────────────────── */}
          {inactiveKnowledge.length > 0 && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Otros objetivos disponibles
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Puedes cambiar el foco del bot en cualquier momento — solo activa uno.
                </p>
              </div>

              <div className="space-y-2">
                {inactiveKnowledge.map(k => (
                  <Card key={k.id} className="p-4 opacity-70 hover:opacity-100 transition-opacity">
                    {editingKnowledge?.id === k.id ? (
                      <div className="space-y-3">
                        <Input
                          value={editingKnowledge.name}
                          onChange={e => setEditingKnowledge({ ...editingKnowledge, name: e.target.value })}
                        />
                        <Textarea
                          value={editingKnowledge.content}
                          onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                          className="min-h-[200px] font-mono text-xs"
                        />
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
                          <p className="text-sm font-medium">{k.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{k.content}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleActivate(k.id)}
                            className="text-xs"
                          >
                            Activar
                          </Button>
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
            </div>
          )}
        </>
      )}
    </div>
  )
}
