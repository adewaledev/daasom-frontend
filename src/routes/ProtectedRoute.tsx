import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../state/auth"

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isAuthed } = useAuth()
  const location = useLocation()

  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}