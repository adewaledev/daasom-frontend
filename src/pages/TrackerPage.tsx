import { useEffect, useMemo, useState } from "react"
import { listJobs } from "../api/jobs"
import type { Job } from "../api/jobs"
import { listClients } from "../api/clients"
import type { Client } from "../api/clients"
import { listJobMilestones, updateJobMilestone } from "../api/jobMilestones"
import type { JobMilestone, MilestoneStatus } from "../api/jobMilestones"

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

function zoneBadge(zone: Job["zone"]) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border"
  if (zone === "DUTY") return `${base} bg-blue-600/15 text-blue-200 border-blue-500/20`
  if (zone === "FREE") return `${base} bg-white/5 text-white/80 border-white/10`
  return `${base} bg-black/40 text-white/80 border-white/10`
}

function safeLabel(m: JobMilestone) {
  return m.template_label || m.template_key || m.template
}

function statusBadge(status: MilestoneStatus) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border"
  if (status === "DONE") return `${base} bg-green-500/10 text-green-200 border-green-500/20`
  return `${base} bg-amber-500/10 text-amber-200 border-amber-500/20` // PENDING
}

export default function TrackerPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [jobs, setJobs] = useState<Job[]>([])

  const [selectedJobId, setSelectedJobId] = useState<string>("")
  const [milestones, setMilestones] = useState<JobMilestone[]>([])

  const [loading, setLoading] = useState(true)
  const [loadingMilestones, setLoadingMilestones] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>()
    for (const c of clients as any[]) m.set(String(c.id), c)
    return m
  }, [clients])

  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedJobId) ?? null, [jobs, selectedJobId])

  const selectedJobLabel = useMemo(() => {
    if (!selectedJob) return ""
    const c = clientMap.get(String(selectedJob.client))
    const clientLabel = c ? `${(c as any).client_code} — ${(c as any).client_name}` : `Client ${String(selectedJob.client)}`
    return `${selectedJob.file_number} • ${clientLabel}`
  }, [selectedJob, clientMap])

  async function refreshBase() {
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const [c, j] = await Promise.all([listClients(), listJobs()])
      setClients(c)
      setJobs(j)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load tracker data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshBase()
  }, [])

  async function loadMilestones(jobId: string) {
    setError("")
    setInfo("")
    setLoadingMilestones(true)
    try {
      let ms = await listJobMilestones({ job: jobId })

      // Fallback: if backend ignores filter and returns all, filter client-side
      if (ms.length && ms.some((x) => x.job !== jobId)) {
        ms = ms.filter((x) => x.job === jobId)
      }

      // Sort best-effort: use sort_order if provided; else stable by label
      ms = [...ms].sort((a, b) => {
        const ao = typeof a.sort_order === "number" ? a.sort_order : 10_000
        const bo = typeof b.sort_order === "number" ? b.sort_order : 10_000
        if (ao !== bo) return ao - bo
        return safeLabel(a).localeCompare(safeLabel(b))
      })

      setMilestones(ms)

      if (!ms.length) {
        setInfo(
          "No milestones found for this job yet. If milestones should auto-create on job creation, confirm backend creates JobMilestone rows."
        )
      }
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load milestones.")
    } finally {
      setLoadingMilestones(false)
    }
  }

  useEffect(() => {
    if (selectedJobId) loadMilestones(selectedJobId)
    else setMilestones([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId])

  async function saveRow(id: string, status: MilestoneStatus, date: string) {
    setError("")
    setInfo("")
    try {
      const updated = await updateJobMilestone(id, { status, date: date ? date : null })
      setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)))
      setInfo("Saved.")
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to save milestone.")
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="text-blue-300">Tracker</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Update milestone status and dates per job. Colors are subtle: Pending (amber) and Done (green).
          </p>
        </div>

        <button
          type="button"
          onClick={refreshBase}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
        >
          Refresh
        </button>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
        {error ? (
          <div className="text-sm bg-red-500/10 text-red-200 border border-red-500/20 px-3 py-2 rounded-lg">
            {error}
          </div>
        ) : null}

        {info ? (
          <div className="text-sm bg-blue-600/10 text-blue-200 border border-blue-500/20 px-3 py-2 rounded-lg">
            {info}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-white/80 mb-1">Select Job</label>
            <select
              className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              disabled={loading}
            >
              <option value="">Choose a job…</option>
              {jobs.map((j) => {
                const c = clientMap.get(String(j.client))
                const clientLabel = c ? `${(c as any).client_code} — ${(c as any).client_name}` : `Client ${String(j.client)}`
                return (
                  <option key={j.id} value={j.id}>
                    {j.file_number} — {clientLabel}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="md:col-span-1">
            <div className="text-sm text-white/60">Selected</div>
            <div className="mt-1 text-sm font-semibold text-white/90 truncate">{selectedJobLabel || "—"}</div>
            {selectedJob ? (
              <div className="mt-2 flex items-center gap-2">
                <span className={zoneBadge(selectedJob.zone)}>{selectedJob.zone}</span>
                <span className="text-xs text-white/50">•</span>
                <span className="text-xs text-white/60">
                  {milestones.length ? (
                    <>
                      <span className="text-white/80 font-semibold">
                        {milestones.filter((m) => m.status === "DONE").length}
                      </span>{" "}
                      done /{" "}
                      <span className="text-white/80 font-semibold">
                        {milestones.filter((m) => m.status === "PENDING").length}
                      </span>{" "}
                      pending
                    </>
                  ) : (
                    "No milestones loaded"
                  )}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-white">Milestones</h2>
            {/* subtle legend */}
            <div className="hidden md:flex items-center gap-2 ml-2">
              <span className={statusBadge("PENDING")}>PENDING</span>
              <span className={statusBadge("DONE")}>DONE</span>
            </div>
          </div>

          <span className="text-sm text-white/60">{loadingMilestones ? "Loading…" : `${milestones.length} items`}</span>
        </div>

        {!selectedJobId ? (
          <div className="p-5 text-sm text-white/60">Select a job to view milestones.</div>
        ) : loadingMilestones ? (
          <div className="p-5 text-sm text-white/60">Loading milestones…</div>
        ) : milestones.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No milestones found for this job.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Milestone</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Action</th>
                </tr>
              </thead>

              <tbody>
                {milestones.map((m) => (
                  <MilestoneRow key={m.id} m={m} onSave={saveRow} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <p className="text-sm text-white/60 leading-relaxed">
          The status colors are intentionally low-saturation to avoid overwhelming the page. The main brand remains blue + black.
        </p>
      </section>
    </div>
  )
}

function MilestoneRow({
  m,
  onSave,
}: {
  m: JobMilestone
  onSave: (id: string, status: MilestoneStatus, date: string) => Promise<void>
}) {
  const [status, setStatus] = useState<MilestoneStatus>(m.status)
  const [date, setDate] = useState<string>(m.date ?? "")
  const [saving, setSaving] = useState(false)

  const dirty = status !== m.status || (date || "") !== (m.date ?? "")

  function statusSelectClass(s: MilestoneStatus) {
    // Very subtle tint on the control itself (not loud).
    const base =
      "bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
    if (s === "DONE") return base + " ring-1 ring-green-500/20"
    return base + " ring-1 ring-amber-500/20"
  }

  async function save() {
    setSaving(true)
    try {
      await onSave(m.id, status, date)
    } finally {
      setSaving(false)
    }
  }

  const badge =
    m.status === "DONE"
      ? "bg-green-500/10 text-green-200 border-green-500/20"
      : "bg-amber-500/10 text-amber-200 border-amber-500/20"

  return (
    <tr className="border-b border-white/5 hover:bg-white/5 transition">
      <td className="px-4 py-3 text-white/90">
        <div className="flex items-center gap-2">
          <div className="font-semibold">{safeLabel(m)}</div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${badge}`}>
            {m.status}
          </span>
        </div>
        <div className="text-xs text-white/50 mt-1">Template: {m.template}</div>
      </td>

      <td className="px-4 py-3">
        <select className={statusSelectClass(status)} value={status} onChange={(e) => setStatus(e.target.value as MilestoneStatus)}>
          <option value="PENDING">PENDING</option>
          <option value="DONE">DONE</option>
        </select>
      </td>

      <td className="px-4 py-3">
        <input
          className="bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </td>

      <td className="px-4 py-3 text-right">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className={[
            "px-3 py-2 rounded-lg text-sm font-semibold transition border",
            !dirty || saving
              ? "bg-white/5 text-white/40 border-white/10 cursor-not-allowed"
              : "bg-blue-600 text-white border-blue-500/30 hover:bg-blue-700",
          ].join(" ")}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  )
}