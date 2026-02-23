import { Navigate, Route, Routes } from "react-router-dom"
import ProtectedRoute from "./routes/ProtectedRoute"
import AppShell from "./pages/AppShell"
import LoginPage from "./pages/LoginPage"
import ClientsPage from "./pages/ClientsPage"
import HomePage from "./pages/HomePage"
import JobsPage from "./pages/JobsPage"
import TrackerPage from "./pages/TrackerPage"
import ExpensesPage from "./pages/ExpensesPage"
import InvoicesPage from "./pages/InvoicesPage"
import ReceiptsPage from "./pages/ReceiptsPage"
import LedgerPage from "./pages/LedgerPage"
import DocumentsPage from "./pages/DocumentsPage"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/receipts" element={<ReceiptsPage />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}