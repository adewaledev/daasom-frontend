import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../state/auth"
import type { ReactNode } from "react"

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth()
  const location = useLocation()

  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
