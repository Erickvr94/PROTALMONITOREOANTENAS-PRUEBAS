import { createClient } from '@supabase/supabase-js'

// Para proyectos TypeScript creados con Vite:
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase en el archivo .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)