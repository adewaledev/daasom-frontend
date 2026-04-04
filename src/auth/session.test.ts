import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ACCESS_KEY,
  AUTH_EXPIRED_EVENT,
  REFRESH_KEY,
  ROLE_KEY,
  clearSessionAndRedirectToLogin,
  clearStoredSession,
} from "./session"

type MemoryStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function createMemoryStorage(): MemoryStorage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
  }
}

function installMockBrowser(pathname: string) {
  const storage = createMemoryStorage()
  const replace = vi.fn()
  const dispatchEvent = vi.fn()

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  })

  Object.defineProperty(globalThis, "window", {
    value: {
      location: {
        pathname,
        replace,
      },
      dispatchEvent,
    },
    configurable: true,
  })

  Object.defineProperty(globalThis, "CustomEvent", {
    value: class {
      type: string
      constructor(type: string) {
        this.type = type
      }
    },
    configurable: true,
  })

  return { storage, replace, dispatchEvent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("session helpers", () => {
  it("clears persisted auth keys", () => {
    const { storage } = installMockBrowser("/jobs")
    storage.setItem(ACCESS_KEY, "access")
    storage.setItem(REFRESH_KEY, "refresh")
    storage.setItem(ROLE_KEY, "admin")

    clearStoredSession()

    expect(storage.getItem(ACCESS_KEY)).toBeNull()
    expect(storage.getItem(REFRESH_KEY)).toBeNull()
    expect(storage.getItem(ROLE_KEY)).toBeNull()
  })

  it("clears session, emits auth-expired event, and redirects from non-login routes", () => {
    const { storage, replace, dispatchEvent } = installMockBrowser("/reports")
    storage.setItem(ACCESS_KEY, "access")
    storage.setItem(REFRESH_KEY, "refresh")
    storage.setItem(ROLE_KEY, "admin")

    clearSessionAndRedirectToLogin()

    expect(storage.getItem(ACCESS_KEY)).toBeNull()
    expect(storage.getItem(REFRESH_KEY)).toBeNull()
    expect(storage.getItem(ROLE_KEY)).toBeNull()
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    const eventArg = dispatchEvent.mock.calls[0]?.[0] as { type?: string }
    expect(eventArg?.type).toBe(AUTH_EXPIRED_EVENT)
    expect(replace).toHaveBeenCalledWith("/login")
  })

  it("does not redirect when already on login route", () => {
    const { replace } = installMockBrowser("/login")

    clearSessionAndRedirectToLogin()

    expect(replace).not.toHaveBeenCalled()
  })
})