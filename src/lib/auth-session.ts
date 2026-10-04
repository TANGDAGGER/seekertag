import { supabase } from '@/config/supabase'

export async function ensureAppSession() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (sessionData.session) return sessionData.session

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data.session) throw new Error('Supabase did not create an application session.')
  return data.session
}
