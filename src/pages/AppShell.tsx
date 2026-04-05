import { Outlet } from "react-router-dom"
import Nav from "../components/Nav"

export default function AppShell() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Nav />
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 [&_h1]:tracking-tight [&_h1]:leading-tight [&_h2]:tracking-tight [&_h2]:leading-tight [&_h3]:tracking-tight [&_h3]:leading-tight [&_p]:leading-relaxed [&_p]:text-slate-700">
        <Outlet />
      </main>
    </div>
  )
}