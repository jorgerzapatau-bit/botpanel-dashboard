export type Company = {
  id: string
  slug: string
  name: string
  email: string
  plan: string
  active: boolean
  created_at: string
}

export type BotConfig = {
  id: string
  company_id: string
  system_prompt: string
  personality_prompt: string
  temperature: number
  max_tokens: number
  top_p: number
  bot_name: string
  welcome_message: string
  style: string
  creativity: string
  advisor_phone: string | null
  transfer_message: string | null
  updated_at: string
}

export type Flow = {
  id: string
  company_id: string
  keyword: string
  answer: string
  media_url: string | null
  active: boolean
  created_at: string
}

export type ChatMessage = {
  id: string
  company_id: string
  phone_number: string
  role: 'user' | 'assistant'
  message: string
  created_at: string
}

export type WhatsappSession = {
  id: string
  company_id: string
  status: 'connected' | 'disconnected' | 'connecting'
  phone_number: string | null
  fly_app_url: string | null
  last_connected_at: string | null
  updated_at: string
}

export type BotKnowledge = {
  id: string
  company_id: string
  name: string
  content: string
  active: boolean
  created_at: string
  updated_at: string
}