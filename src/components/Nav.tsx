import { useEffect, useState } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { useAuth } from "../state/auth"

type ThemePreference = "light" | "dark" | "system"

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(preference: ThemePreference) {
  const resolved = preference === "system" ? getSystemTheme() : preference
  document.documentElement.classList.toggle("dark", resolved === "dark")
}

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "px-3 py-2 rounded-lg text-sm font-semibold transition",
    isActive
      ? "nav-active-chip bg-blue-100 text-blue-700 border border-blue-200"
      : "text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-transparent",
  ].join(" ")
}

function mobileNavClass({ isActive }: { isActive: boolean }) {
  return [
    "w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition text-left",
    isActive
      ? "nav-active-chip bg-blue-100 text-blue-700 border border-blue-200"
      : "text-slate-800 hover:text-slate-900 hover:bg-slate-100 border border-slate-200",
  ].join(" ")
}

export default function Nav() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [themePreference, setThemePreference] = useState<ThemePreference>("system")

  useEffect(() => {
    const saved = window.localStorage.getItem("theme")
    const initial: ThemePreference =
      saved === "light" || saved === "dark" || saved === "system" ? saved : "system"
    setThemePreference(initial)
    applyTheme(initial)
  }, [])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      if (themePreference === "system") applyTheme("system")
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [themePreference])

  function onThemeChange(next: ThemePreference) {
    window.localStorage.setItem("theme", next)
    setThemePreference(next)
    applyTheme(next)
  }

  function onLogout() {
    setMobileOpen(false)
    logout()
    navigate("/login", { replace: true })
  }

  function closeMobileMenu() {
    setMobileOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 text-slate-900 border-b border-slate-200 backdrop-blur overflow-x-clip">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" />
          <span className="font-semibold tracking-normal truncate">DAASOM</span>
        </Link>

        <div className="md:hidden flex items-center gap-2 shrink-0">
          <select
            value={themePreference}
            onChange={(e) => onThemeChange(e.target.value as ThemePreference)}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-100 transition"
            aria-label="Theme mode"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-100 transition"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          >
            {mobileOpen ? "Close" : "Menu"}
          </button>
        </div>

        <nav className="hidden md:flex items-center gap-2">
          <NavLink to="/" className={navClass} end onClick={closeMobileMenu}>
            Home
          </NavLink>

          <NavLink to="/clients" className={navClass} onClick={closeMobileMenu}>
            Clients
          </NavLink>

          <NavLink to="/jobs" className={navClass} onClick={closeMobileMenu}>
            Jobs
          </NavLink>

          <NavLink to="/tracker" className={navClass} onClick={closeMobileMenu}>
            Tracker
          </NavLink>

          <NavLink to="/documents" className={navClass} onClick={closeMobileMenu}>
            Documents
          </NavLink>

          <NavLink to="/expenses" className={navClass} onClick={closeMobileMenu}>
            Expenses
          </NavLink>

          <NavLink to="/invoices" className={navClass} onClick={closeMobileMenu}>
            Invoices
          </NavLink>

          <NavLink to="/receipts" className={navClass} onClick={closeMobileMenu}>
            Receipts
          </NavLink>

          <NavLink to="/ledger" className={navClass} onClick={closeMobileMenu}>
            Ledger
          </NavLink>

          <NavLink to="/reports" className={navClass} onClick={closeMobileMenu}>
            Reports
          </NavLink>

          <select
            value={themePreference}
            onChange={(e) => onThemeChange(e.target.value as ThemePreference)}
            className="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-100 transition"
            aria-label="Theme mode"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>

          <button
            onClick={onLogout}
            className="ml-2 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
            type="button"
          >
            Logout
          </button>
        </nav>
      </div>

      {mobileOpen ? (
        <div className="md:hidden border-t border-slate-200 bg-white">
          <nav className="max-w-6xl mx-auto px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <NavLink to="/" className={mobileNavClass} end onClick={closeMobileMenu}>Home</NavLink>
            <NavLink to="/clients" className={mobileNavClass} onClick={closeMobileMenu}>Clients</NavLink>
            <NavLink to="/jobs" className={mobileNavClass} onClick={closeMobileMenu}>Jobs</NavLink>
            <NavLink to="/tracker" className={mobileNavClass} onClick={closeMobileMenu}>Tracker</NavLink>
            <NavLink to="/documents" className={mobileNavClass} onClick={closeMobileMenu}>Documents</NavLink>
            <NavLink to="/expenses" className={mobileNavClass} onClick={closeMobileMenu}>Expenses</NavLink>
            <NavLink to="/invoices" className={mobileNavClass} onClick={closeMobileMenu}>Invoices</NavLink>
            <NavLink to="/receipts" className={mobileNavClass} onClick={closeMobileMenu}>Receipts</NavLink>
            <NavLink to="/ledger" className={mobileNavClass} onClick={closeMobileMenu}>Ledger</NavLink>
            <NavLink to="/reports" className={mobileNavClass} onClick={closeMobileMenu}>Reports</NavLink>
          </nav>
          <div className="max-w-6xl mx-auto px-3 pb-3">
            <select
              value={themePreference}
              onChange={(e) => onThemeChange(e.target.value as ThemePreference)}
              className="w-full mb-2 px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-100 transition"
              aria-label="Theme mode"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
            <button
              onClick={onLogout}
              className="w-full px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
              type="button"
            >
              Logout
            </button>
          </div>
        </div>
      ) : null}
    </header>
  )
}