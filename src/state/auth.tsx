import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { login as apiLogin } from "../auth/authApi"

type AuthState = {
  isAuthed: boolean
  accessToken: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

const ACCESS_KEY = "daasom_access_token"
const REFRESH_KEY = "daasom_refresh_token"
const IDLE_TIMEOUT = 60 * 60 * 1000 // 1 hour in milliseconds

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem(ACCESS_KEY)
  })
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)

  const isAuthed = !!accessToken

  const resetIdleTimer = () => {
    if (!isAuthed) return

    // Clear existing timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }

    // Set new logout timer for 1 hour of inactivity
    idleTimerRef.current = setTimeout(() => {
      console.log("Session expired due to inactivity")
      localStorage.removeItem(ACCESS_KEY)
      localStorage.removeItem(REFRESH_KEY)
      setAccessToken(null)
    }, IDLE_TIMEOUT)
  }

  const value = useMemo<AuthState>(() => {
    return {
      isAuthed,
      accessToken,
      login: async (username: string, password: string) => {
        const data = await apiLogin(username, password)
        localStorage.setItem(ACCESS_KEY, data.access)
        if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh)
        setAccessToken(data.access)
        resetIdleTimer()
      },
      logout: () => {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current)
        }
        localStorage.removeItem(ACCESS_KEY)
        localStorage.removeItem(REFRESH_KEY)
        setAccessToken(null)
      },
    }
  }, [isAuthed, accessToken])

  // Set up activity listeners to reset idle timer
  useEffect(() => {
    if (!isAuthed) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
      return
    }

    resetIdleTimer()

    const events = ["mousedown", "keydown", "scroll", "touchstart", "click"]
    const handleActivity = () => {
      resetIdleTimer()
    }

    events.forEach((event) => {
      window.addEventListener(event, handleActivity)
    })

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
    }
  }, [isAuthed])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}