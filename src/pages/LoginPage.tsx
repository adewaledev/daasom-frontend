import { useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../state/auth"

function extractErrorMessage(err: any): string {
  const status = err?.response?.status
  const data = err?.response?.data

  if (!status) return "Network error. Backend may be unavailable."

  if (typeof data === "string") return data
  if (data?.detail) return String(data.detail)

  if (data && typeof data === "object") {
    const parts: string[] = []
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v)) parts.push(`${k}: ${v.join(", ")}`)
      else parts.push(`${k}: ${String(v)}`)
    }
    if (parts.length) return parts.join(" | ")
  }

  if (status === 401) return "Invalid credentials."
  if (status === 404) return "Login endpoint not found."
  if (status >= 500) return "Server error. Backend may be temporarily unavailable."

  return `Login failed (HTTP ${status}).`
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as any

  const redirectTo = useMemo(() => {
    return location?.state?.from ?? "/"
  }, [location?.state?.from])

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    try {
      await login(username.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      setError(extractErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white backdrop-blur shadow-sm">
        {/* Left: Brand */}
        <div className="hidden md:flex p-10 flex-col justify-between bg-gradient-to-br from-slate-100 via-white to-blue-50 border-r border-slate-200">
          <div className="flex items-center gap-3">
            <span className="inline-block h-3 w-3 rounded-sm bg-blue-600" />
            <span className="text-lg font-semibold tracking-wide">DAASOM</span>
          </div>

          <div>
            <h1 className="text-3xl font-semibold leading-tight text-slate-900">
              Daasom Nigeria Limited
              <br />
              <span className="text-blue-700">...we deliver peace of mind.</span>
            </h1>
            <p className="mt-3 text-sm text-slate-700 max-w-sm leading-relaxed">
              Sign in to manage clients, jobs, tracking milestones, and billing — all in one clean workflow.
            </p>

          </div>

          <div className="text-xs text-slate-600">© DAASOM</div>
        </div>

        {/* Right: Form */}
        <div className="p-8 md:p-10">
          <div className="md:hidden flex items-center gap-2 mb-6">
            <span className="inline-block h-3 w-3 rounded-sm bg-blue-600" />
            <span className="text-lg font-semibold">DAASOM</span>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="text-sm text-slate-600 mt-1">Enter your credentials to continue.</p>

          {error ? (
            <div className="mt-5 text-sm bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg">
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Username</label>
              <input
                className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
              <input
                className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              disabled={submitting}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold hover:bg-blue-700 transition disabled:opacity-60"
              type="submit"
            >
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}