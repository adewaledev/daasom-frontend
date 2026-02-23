import { useEffect, useMemo, useState } from "react"
import type { Client } from "../api/clients"
import { createClient, listClients, updateClient } from "../api/clients"

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
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState<ClientForm>(emptyForm)

  const title = useMemo(() => (editing ? "Edit Client" : "Create Client"), [editing])

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
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="text-blue-300">Clients</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Manage client codes, prefixes, and names. Keep records consistent for job linkage.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
        >
          Refresh
        </button>
      </div>

      {/* Form Card */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">{title}</h2>
          {editing ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-sm font-semibold text-white/70 hover:text-white transition"
            >
              Cancel
            </button>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error ? (
            <div className="text-sm bg-red-500/10 text-red-200 border border-red-500/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Client Code</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.client_code}
                onChange={(e) => setForm((f) => ({ ...f, client_code: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Client Prefix</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.client_prefix}
                onChange={(e) => setForm((f) => ({ ...f, client_prefix: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Client Name</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.client_name}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Email</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                type="email"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Phone</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Address</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
            <label htmlFor="is_active" className="text-sm font-semibold text-white/80">
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
                className="px-4 py-2 rounded-lg font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {/* Table Card */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Client Directory</h2>
          <span className="text-sm text-white/60">{clients.length} total</span>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-white/60">Loading clients...</div>
        ) : clients.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No clients yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Prefix</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-3 text-white/90">{c.client_code}</td>
                    <td className="px-4 py-3 text-white/90">{c.client_prefix}</td>
                    <td className="px-4 py-3 text-white/90">{c.client_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                          c.is_active
                            ? "bg-blue-600/15 text-blue-200 border-blue-500/20"
                            : "bg-white/5 text-white/70 border-white/10",
                        ].join(" ")}
                      >
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-blue-300 hover:text-blue-200 font-semibold"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}