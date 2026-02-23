import React, { createContext, useContext, useMemo, useState } from "react"
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem(ACCESS_KEY)
  })

  const isAuthed = !!accessToken

  const value = useMemo<AuthState>(() => {
    return {
      isAuthed,
      accessToken,
      login: async (username: string, password: string) => {
        const data = await apiLogin(username, password)
        localStorage.setItem(ACCESS_KEY, data.access)
        if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh)
        setAccessToken(data.access)
      },
      logout: () => {
        localStorage.removeItem(ACCESS_KEY)
        localStorage.removeItem(REFRESH_KEY)
        setAccessToken(null)
      },
    }
  }, [isAuthed, accessToken])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}