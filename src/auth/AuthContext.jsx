import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * Session + profile state for the whole app.
 * `profile` carries the app_role ('owner' | 'admin' | 'general_manager' |
 * 'manager') and drives what RLS lets each user see — the UI reads it only
 * for display; enforcement lives in the database.
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data ?? null))
  }, [session?.user?.id])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
