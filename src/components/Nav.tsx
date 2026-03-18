import { useState } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { useAuth } from "../state/auth"

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "px-3 py-2 rounded-lg text-sm font-semibold transition",
    isActive
      ? "bg-blue-600/20 text-white border border-blue-500/30"
      : "text-white/80 hover:text-white hover:bg-white/10 border border-transparent",
  ].join(" ")
}

function mobileNavClass({ isActive }: { isActive: boolean }) {
  return [
    "w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition text-left",
    isActive
      ? "bg-blue-600/20 text-white border border-blue-500/30"
      : "text-white/85 hover:text-white hover:bg-white/10 border border-white/10",
  ].join(" ")
}

export default function Nav() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  function onLogout() {
    setMobileOpen(false)
    logout()
    navigate("/login", { replace: true })
  }

  function closeMobileMenu() {
    setMobileOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 bg-black/90 text-white border-b border-white/10 backdrop-blur overflow-x-clip">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" />
          <span className="font-semibold tracking-wide truncate">DAASOM</span>
        </Link>

        <div className="md:hidden flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition"
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

          <button
            onClick={onLogout}
            className="ml-2 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 transition"
            type="button"
          >
            Logout
          </button>
        </nav>
      </div>

      {mobileOpen ? (
        <div className="md:hidden border-t border-white/10 bg-black/95">
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
            <button
              onClick={onLogout}
              className="w-full px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 transition"
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