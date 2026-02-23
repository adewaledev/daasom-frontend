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

export default function Nav() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  function onLogout() {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <header className="bg-black/90 text-white border-b border-white/10 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" />
          <span className="font-semibold tracking-wide">DAASOM</span>
        </Link>

        <nav className="flex items-center gap-2">
          <NavLink to="/" className={navClass} end>
            Home
          </NavLink>

          <NavLink to="/clients" className={navClass}>
            Clients
          </NavLink>

          <NavLink to="/jobs" className={navClass}>
            Jobs
          </NavLink>

          <NavLink to="/tracker" className={navClass}>
            Tracker
          </NavLink>

          <NavLink to="/expenses" className={navClass}>
            Expenses
          </NavLink>

          <NavLink to="/invoices" className={navClass}>
            Invoices
          </NavLink>

          <NavLink to="/receipts" className={navClass}>
            Receipts
          </NavLink>

          <NavLink to="/ledger" className={navClass}>
            Ledger
          </NavLink>

          <NavLink to="/documents" className={navClass}>
            Documents
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
    </header>
  )
}