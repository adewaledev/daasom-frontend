import axios from "axios"

const rawBaseURL = import.meta.env.VITE_API_BASE_URL as string | undefined

if (!rawBaseURL) {
  throw new Error("VITE_API_BASE_URL is missing. Check .env and restart the dev server.")
}

const baseURL = rawBaseURL.replace(/\/+$/, "")

const ACCESS_KEY = "daasom_access_token"
const REFRESH_KEY = "daasom_refresh_token"

function clearAuthAndRedirect() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)

  // Hard redirect is safest (works outside React router hooks)
  if (window.location.pathname !== "/login") {
    window.location.replace("/login")
  }
}

const http = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
})

http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(ACCESS_KEY)
    if (token) {
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

http.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status
    const data = error?.response?.data

    // SimpleJWT commonly returns:
    // { "detail": "...", "code": "token_not_valid", ... }
    const code = data?.code
    const detail = typeof data?.detail === "string" ? data.detail : ""
    const looksLikeInvalidToken =
      code === "token_not_valid" ||
      detail.toLowerCase().includes("token not valid") ||
      detail.toLowerCase().includes("not valid for any token type")

    if (status === 401 && looksLikeInvalidToken) {
      clearAuthAndRedirect()
    }

    return Promise.reject(error)
  }
)

export default http