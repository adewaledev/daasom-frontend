import React, { createContext, useContext, useEffect, useMemo, useRef, useCallback, useState } from "react"
import { login as apiLogin } from "../auth/authApi"
import type { LoginResponse } from "../auth/authApi"
import { canRole, getRoleLabel, isUserRole, type Permission, type UserRole } from "../auth/roles"

type AuthState = {
  isAuthed: boolean
  accessToken: string | null
  role: UserRole | null
  roleLabel: string
  can: (permission: Permission) => boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

const ACCESS_KEY = "daasom_access_token"
const REFRESH_KEY = "daasom_refresh_token"
const ROLE_KEY = "daasom_user_role"
const IDLE_TIMEOUT = 60 * 60 * 1000 // 1 hour in milliseconds

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function findRoleValue(input: unknown): UserRole | null {
  if (isUserRole(input)) return input
  if (Array.isArray(input)) {
    for (const item of input) {
      const role = findRoleValue(item)
      if (role) return role
    }
    return null
  }
  if (!input || typeof input !== "object") return null

  const record = input as Record<string, unknown>
  for (const key of ["role", "user_role", "userRole", "account_type"]) {
    const role = findRoleValue(record[key])
    if (role) return role
  }
  for (const key of ["roles", "groups"]) {
    const role = findRoleValue(record[key])
    if (role) return role
  }
  for (const key of ["user", "profile", "me"]) {
    const role = findRoleValue(record[key])
    if (role) return role
  }
  return null
}

function extractRoleFromToken(token: string | null): UserRole | null {
  if (!token) return null
  return findRoleValue(decodeJwtPayload(token))
}

function extractRoleFromLoginResponse(data: LoginResponse): UserRole | null {
  return findRoleValue(data) ?? extractRoleFromToken(data.access)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem(ACCESS_KEY)
  })
  const [role, setRole] = useState<UserRole | null>(() => {
    const storedRole = localStorage.getItem(ROLE_KEY)
    if (isUserRole(storedRole)) return storedRole
    return extractRoleFromToken(localStorage.getItem(ACCESS_KEY))
  })
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAuthedRef = useRef(!!accessToken)

  const isAuthed = !!accessToken
  isAuthedRef.current = isAuthed

  const resetIdleTimer = useCallback(() => {
    if (!isAuthedRef.current) return

    // Clear existing timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }

    // Set new logout timer for 1 hour of inactivity
    idleTimerRef.current = setTimeout(() => {
      console.log("Session expired due to inactivity")
      localStorage.removeItem(ACCESS_KEY)
      localStorage.removeItem(REFRESH_KEY)
      localStorage.removeItem(ROLE_KEY)
      setAccessToken(null)
      setRole(null)
    }, IDLE_TIMEOUT)
  }, [])

  const value = useMemo<AuthState>(() => {
    return {
      isAuthed,
      accessToken,
      role,
      roleLabel: getRoleLabel(role),
      can: (permission: Permission) => canRole(role, permission),
      login: async (username: string, password: string) => {
        const data = await apiLogin(username, password)
        const nextRole = extractRoleFromLoginResponse(data)
        localStorage.setItem(ACCESS_KEY, data.access)
        if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh)
        if (nextRole) localStorage.setItem(ROLE_KEY, nextRole)
        else localStorage.removeItem(ROLE_KEY)
        setAccessToken(data.access)
        setRole(nextRole)
      },
      logout: () => {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current)
        }
        localStorage.removeItem(ACCESS_KEY)
        localStorage.removeItem(REFRESH_KEY)
        localStorage.removeItem(ROLE_KEY)
        setAccessToken(null)
        setRole(null)
      },
    }
  }, [isAuthed, accessToken, role])

  useEffect(() => {
    if (!accessToken) {
      setRole(null)
      return
    }
    setRole((current) => current ?? extractRoleFromToken(accessToken))
  }, [accessToken])

  // Set up activity listeners to reset idle timer
  useEffect(() => {
    if (!isAuthed) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
      return
    }

    resetIdleTimer()

    const handleActivity = () => {
      resetIdleTimer()
    }

    const events = ["mousedown", "keydown", "scroll", "touchstart", "click"]
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
  }, [isAuthed, resetIdleTimer])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}