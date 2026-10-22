
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type UserRole =
  | 'admin'
  | 'receiving_staff'
  | 'releasing_staff'

type AuthContextType = {
  session: Session | null
  role: UserRole | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function isValidRole(role: unknown): role is UserRole {
  return (
    role === 'admin' ||
    role === 'receiving_staff' ||
    role === 'releasing_staff'
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  // Initialize the session and listen for authentication changes.
  useEffect(() => {
    let active = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return

      setSession(currentSession => {
        const currentUserId = currentSession?.user?.id ?? null
        const newUserId = newSession?.user?.id ?? null

        // Only clear the current role when the account changes.
        if (currentUserId !== newUserId) {
          setRole(null)
        }

        return newSession
      })

      if (!newSession) {
        setRole(null)
        setLoading(false)
      }

      // Do not set loading=true for token refreshes.
      // The user's ID may remain unchanged, so the role-loading
      // effect would not rerun and the app could remain stuck.
    })

    async function initializeSession() {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (!active) return

        if (error) {
          console.error('Unable to get session:', error.message)
          setSession(null)
          setRole(null)
          setLoading(false)
          return
        }

        setSession(data.session)
      } catch (error) {
        if (!active) return

        console.error('Unable to initialize session:', error)
        setSession(null)
        setRole(null)
        setLoading(false)
      }
    }

    void initializeSession()

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Load the user's role whenever the authenticated account changes.
  useEffect(() => {
    let active = true

    async function loadRole() {
      const user = session?.user

      if (!user) {
        setRole(null)
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (!active) return

        if (isValidRole(data?.role)) {
          setRole(data.role)
        } else {
          console.error(
            'User has no valid role in the profiles table.'
          )
          setRole(null)
        }
      } catch (error) {
        if (!active) return

        console.error('Unable to load user role:', error)
        setRole(null)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadRole()

    return () => {
      active = false
    }
  }, [session?.user?.id])

  return (
    <AuthContext.Provider value={{ session, role, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
