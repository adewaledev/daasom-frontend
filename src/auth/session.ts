export const ACCESS_KEY = "daasom_access_token"
export const REFRESH_KEY = "daasom_refresh_token"
export const ROLE_KEY = "daasom_user_role"
export const AUTH_EXPIRED_EVENT = "daasom:auth-expired"

export function clearStoredSession() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(ROLE_KEY)
}

export function notifyAuthExpired() {
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
}

export function clearSessionAndRedirectToLogin() {
  clearStoredSession()
  notifyAuthExpired()

  if (window.location.pathname !== "/login") {
    window.location.replace("/login")
  }
}