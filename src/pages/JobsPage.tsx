import { useEffect, useMemo, useState } from "react"
import type { Client } from "../api/clients"
import { listClients } from "../api/clients"
import type { Job, JobZone } from "../api/jobs"
import { createJob, listJobs, updateJob } from "../api/jobs"

type JobForm = {
  client: string // store raw id as string (uuid or number string)
  zone: JobZone

  file_number: string
  quantity: string

  bl_awb: string
  weight_kg: string

  container_40ft: string
  container_20ft: string
  others: string

  description: string
  container_number: string
  transit_days: string

  duty_amount: string
  refund_amount: string

  is_active: boolean
}

const emptyForm: JobForm = {
  client: "",
  zone: "DUTY",

  file_number: "",
  quantity: "0",

  bl_awb: "",
  weight_kg: "",

  container_40ft: "0",
  container_20ft: "0",
  others: "",

  description: "",
  container_number: "",
  transit_days: "",

  duty_amount: "",
  refund_amount: "",

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

function zoneBadge(zone: JobZone) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border"
  if (zone === "DUTY") return `${base} bg-blue-600/15 text-blue-200 border-blue-500/20`
  if (zone === "FREE") return `${base} bg-white/5 text-white/80 border-white/10`
  return `${base} bg-black/40 text-white/80 border-white/10`
}

type ViewZone = "ALL" | JobZone

export default function JobsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [jobs, setJobs] = useState<Job[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<Job | null>(null)
  const [form, setForm] = useState<JobForm>(emptyForm)

  const [viewZone, setViewZone] = useState<ViewZone>("ALL")

  const title = useMemo(() => (editing ? "Edit Job" : "Create Job"), [editing])

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>()
    for (const c of clients as any[]) m.set(String(c.id), c)
    return m
  }, [clients])

  const filteredJobs = useMemo(() => {
    if (viewZone === "ALL") return jobs
    return jobs.filter((j) => j.zone === viewZone)
  }, [jobs, viewZone])

  const showDutyFields = form.zone === "DUTY"
  const showDutyColumn = viewZone === "ALL" ? true : viewZone === "DUTY"

  async function refreshAll() {
    setError("")
    setLoading(true)
    try {
      const [c, j] = await Promise.all([listClients(), listJobs()])
      setClients(c)
      setJobs(j)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load jobs.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  function startEdit(job: Job) {
    setEditing(job)
    setForm({
      client: String(job.client),
      zone: job.zone,

      file_number: job.file_number ?? "",
      quantity: String(job.quantity ?? 0),

      bl_awb: job.bl_awb ?? "",
      weight_kg: job.weight_kg ?? "",

      container_40ft: String(job.container_40ft ?? 0),
      container_20ft: String(job.container_20ft ?? 0),
      others: job.others ?? "",

      description: job.description ?? "",
      container_number: job.container_number ?? "",
      transit_days: job.transit_days === null || job.transit_days === undefined ? "" : String(job.transit_days),

      duty_amount: job.duty_amount ?? "",
      refund_amount: job.refund_amount ?? "",

      is_active: !!job.is_active,
    })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(emptyForm)
  }

  function onZoneChange(next: JobZone) {
    setForm((f) => (next !== "DUTY" ? { ...f, zone: next, duty_amount: "" } : { ...f, zone: next }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)

    try {
      const clientIdRaw = form.client.trim()
      if (!clientIdRaw) {
        setError("Client is required.")
        return
      }

      const fileNumber = form.file_number.trim()
      if (!fileNumber) {
        setError("File Number is required.")
        return
      }

      const payload: Partial<Job> = {
        client: clientIdRaw, // IMPORTANT: send raw id (uuid or number string)
        zone: form.zone,

        file_number: fileNumber,
        quantity: Number(form.quantity || "0"),

        bl_awb: form.bl_awb,
        weight_kg: form.weight_kg,

        container_40ft: Number(form.container_40ft || "0"),
        container_20ft: Number(form.container_20ft || "0"),
        others: form.others,

        description: form.description,
        container_number: form.container_number,
        transit_days: form.transit_days ? Number(form.transit_days) : undefined,

        duty_amount: form.zone === "DUTY" ? form.duty_amount : "",
        refund_amount: form.refund_amount,

        is_active: form.is_active,
      }

      if (editing) {
        await updateJob(editing.id, payload)
      } else {
        await createJob(payload)
      }

      cancelEdit()
      await refreshAll()
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to save job.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="text-blue-300">Jobs</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">Create jobs linked to clients. Zones: DUTY, FREE, EXPORT.</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
            value={viewZone}
            onChange={(e) => setViewZone(e.target.value as ViewZone)}
          >
            <option value="ALL">View: All Zones</option>
            <option value="DUTY">View: DUTY</option>
            <option value="FREE">View: FREE</option>
            <option value="EXPORT">View: EXPORT</option>
          </select>

          <button
            type="button"
            onClick={refreshAll}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Form */}
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
              <label className="block text-sm font-semibold text-white/80 mb-1">Client</label>
              <select
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.client}
                onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                required
              >
                <option value="">Select client…</option>
                {(clients as any[]).map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.client_code} — {c.client_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Zone</label>
              <select
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.zone}
                onChange={(e) => onZoneChange(e.target.value as JobZone)}
                required
              >
                <option value="DUTY">DUTY</option>
                <option value="FREE">FREE</option>
                <option value="EXPORT">EXPORT</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">File Number</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.file_number}
                onChange={(e) => setForm((f) => ({ ...f, file_number: e.target.value }))}
                placeholder="Unique"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Quantity</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                inputMode="numeric"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-white/80 mb-1">BL/AWB</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.bl_awb}
                onChange={(e) => setForm((f) => ({ ...f, bl_awb: e.target.value }))}
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Weight (kg)</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.weight_kg}
                onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">40FT</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.container_40ft}
                onChange={(e) => setForm((f) => ({ ...f, container_40ft: e.target.value }))}
                inputMode="numeric"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">20FT</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.container_20ft}
                onChange={(e) => setForm((f) => ({ ...f, container_20ft: e.target.value }))}
                inputMode="numeric"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-white/80 mb-1">Others</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.others}
                onChange={(e) => setForm((f) => ({ ...f, others: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-white/80 mb-1">Description</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Container No.</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.container_number}
                onChange={(e) => setForm((f) => ({ ...f, container_number: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Transit Days</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.transit_days}
                onChange={(e) => setForm((f) => ({ ...f, transit_days: e.target.value }))}
                inputMode="numeric"
                placeholder="Optional"
              />
            </div>

            {showDutyFields ? (
              <div>
                <label className="block text-sm font-semibold text-white/80 mb-1">Duty Amount</label>
                <input
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={form.duty_amount}
                  onChange={(e) => setForm((f) => ({ ...f, duty_amount: e.target.value }))}
                  placeholder="DUTY only"
                />
              </div>
            ) : (
              <div className="hidden md:block" />
            )}

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Refund Amount</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.refund_amount}
                onChange={(e) => setForm((f) => ({ ...f, refund_amount: e.target.value }))}
                placeholder="Optional"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-3 text-sm font-semibold text-white/80">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? "Saving..." : editing ? "Update Job" : "Create Job"}
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

      {/* Table */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Jobs List</h2>
          <span className="text-sm text-white/60">{filteredJobs.length} shown</span>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-white/60">Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No jobs for this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">File No.</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Client</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Qty</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">BL/AWB</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">40FT</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">20FT</th>
                  {showDutyColumn ? (
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Duty Amt</th>
                  ) : null}
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Refund Amt</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Active</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredJobs.map((j) => {
                  const c = clientMap.get(String(j.client))
                  const clientLabel = c
                    ? `${(c as any).client_code} — ${(c as any).client_name}`
                    : `Client ${String(j.client)}`

                  return (
                    <tr key={j.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-white/90">{j.file_number}</td>
                      <td className="px-4 py-3 text-white/80">{clientLabel}</td>
                      <td className="px-4 py-3">
                        <span className={zoneBadge(j.zone)}>{j.zone}</span>
                      </td>
                      <td className="px-4 py-3 text-white/90">{j.quantity}</td>
                      <td className="px-4 py-3 text-white/80">{j.bl_awb || "-"}</td>
                      <td className="px-4 py-3 text-white/90">{j.container_40ft}</td>
                      <td className="px-4 py-3 text-white/90">{j.container_20ft}</td>

                      {showDutyColumn ? (
                        <td className="px-4 py-3 text-white/80">{j.duty_amount ?? "-"}</td>
                      ) : null}

                      <td className="px-4 py-3 text-white/80">{j.refund_amount ?? "-"}</td>

                      <td className="px-4 py-3">
                        <span
                          className={[
                            "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                            j.is_active
                              ? "bg-blue-600/15 text-blue-200 border-blue-500/20"
                              : "bg-white/5 text-white/70 border-white/10",
                          ].join(" ")}
                        >
                          {j.is_active ? "Yes" : "No"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(j)}
                          className="text-blue-300 hover:text-blue-200 font-semibold"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}