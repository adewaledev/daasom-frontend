import { useEffect, useMemo, useState } from "react"
import type { Client } from "../api/clients"
import { createClient, listClients, updateClient } from "../api/clients"
import PaginationControls from "../components/PaginationControls"
import { useAuth } from "../state/auth"

type ClientForm = {
  client_code: string
  client_prefix: string
  client_name: string
  email: string
  phone: string
  address: string
  is_active: boolean
}

const emptyForm: ClientForm = {
  client_code: "",
  client_prefix: "",
  client_name: "",
  email: "",
  phone: "",
  address: "",
  is_active: true,
}

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

  return `Request failed (HTTP ${status}).`
}

export default function ClientsPage() {
  const { can, roleLabel } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState<ClientForm>(emptyForm)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const title = useMemo(() => (editing ? "Edit Client" : "Create Client"), [editing])
  const canWriteClients = can("clients.write")
  const totalPages = useMemo(() => Math.max(1, Math.ceil(clients.length / itemsPerPage)), [clients.length])
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return clients.slice(start, start + itemsPerPage)
  }, [clients, currentPage])

  async function refresh() {
    setError("")
    setLoading(true)
    try {
      const data = await listClients()
      setClients(data)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load clients.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  function startEdit(c: Client) {
    setEditing(c)
    setForm({
      client_code: c.client_code ?? "",
      client_prefix: c.client_prefix ?? "",
      client_name: c.client_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      is_active: !!c.is_active,
    })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(emptyForm)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canWriteClients) {
      setError(`${roleLabel} role has view-only access to clients.`)
      return
    }
    setError("")
    setSaving(true)

    try {
      const payload = {
        client_code: form.client_code.trim(),
        client_prefix: form.client_prefix.trim(),
        client_name: form.client_name.trim(),
        email: form.email,
        phone: form.phone,
        address: form.address,
        is_active: form.is_active,
      }

      if (!payload.client_code) {
        setError("Client Code is required.")
        return
      }
      if (!payload.client_prefix) {
        setError("Client Prefix is required.")
        return
      }
      if (!payload.client_name) {
        setError("Client Name is required.")
        return
      }

      if (editing) {
        await updateClient(editing.id, payload)
      } else {
        await createClient(payload)
      }

      cancelEdit()
      await refresh()
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to save client.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 text-slate-800">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="text-blue-700">Clients</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage client codes, prefixes, and names. Keep records consistent for job linkage.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
        >
          Refresh
        </button>
      </div>

      {!canWriteClients ? (
        <div className="text-sm bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg">
          Signed in as {roleLabel}. Clients are view-only for this role.
        </div>
      ) : null}

      {/* Form Card */}
      {canWriteClients ? (
        <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {editing ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm font-semibold text-slate-700 hover:text-slate-900 transition"
              >
                Cancel
              </button>
            ) : null}
          </div>

          <form onSubmit={onSubmit} className="p-5 space-y-4">
            {error ? (
              <div className="text-sm bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Client Code</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.client_code}
                  onChange={(e) => setForm((f) => ({ ...f, client_code: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Client Prefix</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.client_prefix}
                  onChange={(e) => setForm((f) => ({ ...f, client_prefix: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Client Name</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.client_name}
                  onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  type="email"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Phone</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Address</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="is_active"
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <label htmlFor="is_active" className="text-sm font-semibold text-slate-700">
                Active
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-60"
              >
                {saving ? "Saving..." : editing ? "Update Client" : "Create Client"}
              </button>

              {editing ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2 rounded-lg font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {/* Table Card */}
      <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Client Directory</h2>
          <span className="text-sm text-slate-600">{clients.length} total</span>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-slate-600">Loading clients...</div>
        ) : clients.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">No clients yet.</div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {paginatedClients.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">{c.client_name}</div>
                    <span
                      className={[
                        "client-status-chip inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                        c.is_active
                          ? "client-status-active bg-blue-100 text-blue-700 border-blue-200"
                          : "client-status-inactive bg-white text-slate-700 border-slate-200",
                      ].join(" ")}
                    >
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">{c.client_code} • {c.client_prefix}</div>
                  <div className="mt-3 flex justify-end">
                    {canWriteClients ? (
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-blue-700 hover:text-blue-800 font-semibold text-sm"
                      >
                        Edit
                      </button>
                    ) : <span className="text-slate-600 text-sm">View only</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <table className="min-w-[720px] w-full text-xs sm:text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Code</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Prefix</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedClients.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-white transition">
                      <td className="px-4 py-3 text-slate-900">{c.client_code}</td>
                      <td className="px-4 py-3 text-slate-900">{c.client_prefix}</td>
                      <td className="px-4 py-3 text-slate-900">{c.client_name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "client-status-chip inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                            c.is_active
                              ? "client-status-active bg-blue-100 text-blue-700 border-blue-200"
                              : "client-status-inactive bg-white text-slate-700 border-slate-200",
                          ].join(" ")}
                        >
                          {c.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canWriteClients ? (
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className="text-blue-700 hover:text-blue-800 font-semibold"
                          >
                            Edit
                          </button>
                        ) : <span className="text-slate-600">View only</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={clients.length}
              itemsPerPage={itemsPerPage}
              onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
              onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            />
          </>
        )}
      </section>
    </div>
  )
}