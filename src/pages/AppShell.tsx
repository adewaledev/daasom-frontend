import { Outlet } from "react-router-dom"
import Nav from "../components/Nav"

export default function AppShell() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}