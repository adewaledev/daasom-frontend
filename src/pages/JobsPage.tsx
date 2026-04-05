import { useEffect, useMemo, useState } from "react"
import type { Client } from "../api/clients"
import { listClients } from "../api/clients"
import type { Job, JobZone } from "../api/jobs"
import { createJob, listJobs, updateJob } from "../api/jobs"
import PaginationControls from "../components/PaginationControls"
import { listTrackerJobs } from "../api/tracker"
import type { TrackerEntry, TrackerJobRow } from "../api/tracker"
import { useAuth } from "../state/auth"

type JobForm = {
  client: string // store raw id as string (uuid or number string)
  zone: JobZone
  date: string

  file_number: string
  quantity: string

  bl_awb: string
  weight_kg: string

  qty_20ft: string
  qty_40ft: string
  has_others: boolean

  description: string
  container_number: string

  port: string
  vessel: string

  duty_amount: string
  refund_amount: string

  is_active: boolean
}

const emptyForm: JobForm = {
  client: "",
  zone: "DUTY",
  date: "",

  file_number: "",
  quantity: "0",

  bl_awb: "",
  weight_kg: "",

  qty_20ft: "",
  qty_40ft: "",
  has_others: false,

  description: "",
  container_number: "",

  port: "",
  vessel: "",

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
  if (zone === "DUTY") return `${base} bg-blue-100 text-blue-700 border-blue-200`
  if (zone === "FREE") return `${base} bg-white text-slate-700 border-slate-200`
  return `${base} bg-white text-slate-700 border-slate-200`
}

type ViewZone = "ALL" | JobZone

const JOB_DATE_OVERRIDES_KEY = "jobs_date_overrides_v1"
const PORT_OPTIONS = ["LEKKI", "APAPA", "TINCAN", "PTML", "MMIA", "MMCA"] as const

function toInputDate(rawDate: string): string {
  const d = new Date(rawDate)
  if (!Number.isFinite(d.getTime())) return ""
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export default function JobsPage() {
  const { can, roleLabel } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [trackerJobs, setTrackerJobs] = useState<TrackerJobRow[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<Job | null>(null)
  const [form, setForm] = useState<JobForm>(emptyForm)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const [viewZone, setViewZone] = useState<ViewZone>("ALL")
  const [searchTerm, setSearchTerm] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showJobsList, setShowJobsList] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewingJob, setViewingJob] = useState<Job | null>(null)
  const [jobDateOverrides, setJobDateOverrides] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {}
    try {
      const raw = window.localStorage.getItem(JOB_DATE_OVERRIDES_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      return {}
    }
  })

  const title = useMemo(() => (editing ? "Edit Job" : "Create Job"), [editing])
  const canWriteJobs = can("jobs.write")
  const itemsPerPage = 10

  const transitDaysByJobId = useMemo(() => {
    const entriesByJob = new Map<string, TrackerEntry[]>()
    for (const trackerJob of trackerJobs) {
      entriesByJob.set(String(trackerJob.job_id), trackerJob.tracker_entries || [])
    }

    const result = new Map<string, number | null>()
    for (const job of jobs) {
      const entries = entriesByJob.get(String(job.id)) || []
      if (entries.length < 2) {
        result.set(String(job.id), entries.length === 1 ? 0 : null)
        continue
      }

      const timestamps = entries
        .map((entry) => new Date(entry.entry_date).getTime())
        .filter((value) => Number.isFinite(value))

      if (timestamps.length === 0) {
        result.set(String(job.id), null)
        continue
      }

      const oldest = Math.min(...timestamps)
      const newest = Math.max(...timestamps)
      const diffDays = Math.round((newest - oldest) / (1000 * 60 * 60 * 24))
      result.set(String(job.id), diffDays)
    }

    return result
  }, [jobs, trackerJobs])

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>()
    for (const c of clients as any[]) m.set(String(c.id), c)
    return m
  }, [clients])

  const viewingClient = useMemo(
    () => (viewingJob ? clientMap.get(String(viewingJob.client)) : null),
    [viewingJob, clientMap]
  )

  const filteredJobs = useMemo(() => {
    let result = jobs

    // Filter by zone
    if (viewZone !== "ALL") {
      result = result.filter((j) => j.zone === viewZone)
    }

    // Filter by search term (file number or client name)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter((j) => {
        const fileMatch = j.file_number?.toLowerCase().includes(term)
        const client = clientMap.get(String(j.client))
        const clientNameMatch = client?.client_name?.toLowerCase().includes(term)
        const clientCodeMatch = client?.client_code?.toLowerCase().includes(term)
        return fileMatch || clientNameMatch || clientCodeMatch
      })
    }

    // Sort by created_at descending (most recent first)
    result = [...result].sort((a, b) => {
      const dateA = new Date(a.date || a.created_at).getTime()
      const dateB = new Date(b.date || b.created_at).getTime()
      return dateB - dateA
    })

    return result
  }, [jobs, viewZone, searchTerm, clientMap])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredJobs.length / itemsPerPage)), [filteredJobs.length])
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredJobs.slice(start, start + itemsPerPage)
  }, [filteredJobs, currentPage])

  // Generate search suggestions based on file numbers and client names
  const searchSuggestions = useMemo(() => {
    if (!searchTerm.trim()) return []

    const term = searchTerm.toLowerCase()
    const suggestions: Array<{ type: "file" | "client"; value: string; label: string }> = []
    const seen = new Set<string>()

    // Collect file numbers
    for (const job of jobs) {
      if (job.file_number && job.file_number.toLowerCase().includes(term)) {
        const key = `file:${job.file_number}`
        if (!seen.has(key)) {
          seen.add(key)
          suggestions.push({
            type: "file",
            value: job.file_number,
            label: `File: ${job.file_number}`,
          })
        }
      }
    }

    // Collect client names
    for (const client of clients) {
      const nameMatch = client.client_name?.toLowerCase().includes(term)
      const codeMatch = client.client_code?.toLowerCase().includes(term)
      if (nameMatch || codeMatch) {
        const key = `client:${client.id}`
        if (!seen.has(key)) {
          seen.add(key)
          suggestions.push({
            type: "client",
            value: client.client_name,
            label: `Client: ${client.client_code} — ${client.client_name}`,
          })
        }
      }
    }

    return suggestions.slice(0, 10) // Limit to 10 suggestions
  }, [searchTerm, jobs, clients])

  const showDutyFields = form.zone === "DUTY"

  async function refreshAll() {
    setError("")
    setLoading(true)
    try {
      const [c, j, tracker] = await Promise.all([listClients(), listJobs(), listTrackerJobs()])
      setClients(c)
      setJobs(j)
      setTrackerJobs(tracker)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load jobs.")
    } finally {
      setLoading(false)
    }
  }

  function getJobDate(job: Pick<Job, "id" | "created_at"> & { date?: string | null }): string {
    return jobDateOverrides[String(job.id)] || job.date || job.created_at
  }

  function getTransitDays(jobId: string): number | null {
    return transitDaysByJobId.get(String(jobId)) ?? null
  }

  function formatTransitDays(value: number | null): string {
    if (value === null || value === undefined) return "—"
    return `${value} day${value === 1 ? "" : "s"}`
  }

  function formatDate(dateString: string): string {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    } catch {
      return "-"
    }
  }

  function handleSearchChange(value: string) {
    setSearchTerm(value)
    setShowSuggestions(true)
    setShowJobsList(value.trim().length > 0)
  }

  function selectSuggestion(value: string) {
    setSearchTerm(value)
    setShowSuggestions(false)
    setShowJobsList(true)
  }

  function clearSearch() {
    setSearchTerm("")
    setShowSuggestions(false)
    setShowJobsList(false)
  }

  useEffect(() => {
    refreshAll()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(JOB_DATE_OVERRIDES_KEY, JSON.stringify(jobDateOverrides))
  }, [jobDateOverrides])

  useEffect(() => {
    setCurrentPage(1)
  }, [viewZone, searchTerm])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  function startEdit(job: Job) {
    setEditing(job)
    setShowCreateForm(true)
    setForm({
      client: String(job.client),
      zone: job.zone,
      date: toInputDate(getJobDate(job)),

      file_number: job.file_number ?? "",
      quantity: String(job.quantity ?? 0),

      bl_awb: job.bl_awb ?? "",
      weight_kg: job.weight_kg ?? "",

      qty_20ft: (job.container_20ft ?? 0) > 0 ? String(job.container_20ft) : "",
      qty_40ft: (job.container_40ft ?? 0) > 0 ? String(job.container_40ft) : "",
      has_others: !!job.others,

      description: job.description ?? "",
      container_number: job.container_number ?? "",

      port: job.port ?? "",
      vessel: job.vessel ?? "",

      duty_amount: job.duty_amount ?? "",
      refund_amount: job.refund_amount ?? "",

      is_active: !!job.is_active,
    })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(emptyForm)
    setShowCreateForm(false)
  }

  function onZoneChange(next: JobZone) {
    setForm((f) => (next !== "DUTY" ? { ...f, zone: next, duty_amount: "" } : { ...f, zone: next }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canWriteJobs) {
      setError(`${roleLabel} role has view-only access to jobs.`)
      return
    }
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
        date: form.date || null,

        file_number: fileNumber,
        quantity: Number(form.quantity || "0"),

        bl_awb: form.bl_awb,
        weight_kg: form.weight_kg,

        container_40ft: Number(form.qty_40ft || "0"),
        container_20ft: Number(form.qty_20ft || "0"),
        others: form.has_others ? "others" : "",

        description: form.description,
        container_number: form.container_number,
        transit_days: getTransitDays(editing?.id || "") ?? undefined,

        port: form.port,
        vessel: form.vessel,

        duty_amount: form.zone === "DUTY" ? form.duty_amount : "",
        refund_amount: form.refund_amount,

        is_active: form.is_active,
      }

      const savedJob = editing
        ? await updateJob(editing.id, payload)
        : await createJob(payload)

      setJobDateOverrides((prev) => {
        const next = { ...prev }
        const normalized = form.date.trim()
        if (normalized) next[String(savedJob.id)] = normalized
        else delete next[String(savedJob.id)]
        return next
      })

      cancelEdit()
      await refreshAll()
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to save job.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 text-slate-800">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="text-blue-700">Jobs</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">Create jobs linked to clients. Zones: DUTY, FREE, EXPORT.</p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          <select
            className="w-full sm:w-auto bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowJobsList((prev) => !prev)}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
          >
            {showJobsList ? "Hide Jobs" : "View Jobs"}
          </button>

          {canWriteJobs && !showCreateForm && !editing ? (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              Create Job
            </button>
          ) : null}
        </div>
      </div>

      {!canWriteJobs ? (
        <div className="text-sm bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg">
          Signed in as {roleLabel}. Jobs are view-only for this role.
        </div>
      ) : null}

      {/* Search Section */}
      <section className="relative z-20 rounded-2xl border border-slate-200 bg-white backdrop-blur p-4">
        <div className="relative z-20">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Search Jobs
          </label>
          <div className="relative">
            <input
              type="text"
              className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg pl-10 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search by file number or client name..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition"
              >
                <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            )}
          </div>

          {/* Autocomplete Suggestions */}
          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="absolute z-30 w-full mt-1 bg-white/95 border border-slate-200 rounded-lg shadow-lg overflow-hidden">
              {searchSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectSuggestion(suggestion.value)
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-100 transition flex items-center gap-2"
                >
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${suggestion.type === "file"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-green-100 text-green-700"
                    }`}>
                    {suggestion.type === "file" ? "FILE" : "CLIENT"}
                  </span>
                  <span className="text-slate-900">{suggestion.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {searchTerm && (
          <p className="mt-2 text-xs text-slate-500">
            Showing matches for "{searchTerm}"
          </p>
        )}
      </section>

      {/* Form */}
      {canWriteJobs && (showCreateForm || editing) ? (
        <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {editing || showCreateForm ? (
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">Client</label>
                <select
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">Zone</label>
                <select
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">File Number</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.file_number}
                  onChange={(e) => setForm((f) => ({ ...f, file_number: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Quantity</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">BL/AWB</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.bl_awb}
                  onChange={(e) => setForm((f) => ({ ...f, bl_awb: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Weight (kg)</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.weight_kg}
                  onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Container Type</label>
                <div className="flex flex-col gap-3 mt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-600"
                      checked={form.qty_20ft !== ""}
                      onChange={(e) => setForm((f) => ({ ...f, qty_20ft: e.target.checked ? "1" : "" }))}
                    />
                    <span className="text-sm text-slate-700 w-14">20FT</span>
                    {form.qty_20ft !== "" && (
                      <input
                        type="number"
                        min="1"
                        className="w-20 bg-white text-slate-900 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.qty_20ft}
                        onChange={(e) => setForm((f) => ({ ...f, qty_20ft: e.target.value }))}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-600"
                      checked={form.qty_40ft !== ""}
                      onChange={(e) => setForm((f) => ({ ...f, qty_40ft: e.target.checked ? "1" : "" }))}
                    />
                    <span className="text-sm text-slate-700 w-14">40FT</span>
                    {form.qty_40ft !== "" && (
                      <input
                        type="number"
                        min="1"
                        className="w-20 bg-white text-slate-900 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.qty_40ft}
                        onChange={(e) => setForm((f) => ({ ...f, qty_40ft: e.target.value }))}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-600"
                      checked={form.has_others}
                      onChange={(e) => setForm((f) => ({ ...f, has_others: e.target.checked }))}
                    />
                    <span className="text-sm text-slate-700">Others</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Container No.</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.container_number}
                  onChange={(e) => setForm((f) => ({ ...f, container_number: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Transit Days</label>
                <input
                  readOnly
                  className="w-full bg-slate-50 text-slate-700 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"
                  value={formatTransitDays(editing ? getTransitDays(editing.id) : null)}
                  placeholder="Calculated from tracker dates"
                />
                <p className="mt-1 text-xs text-slate-500">Calculated automatically from the oldest and newest tracker entry dates for this file.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Port</label>
                <select
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                >
                  <option value="">Select port…</option>
                  {PORT_OPTIONS.map((port) => (
                    <option key={port} value={port}>{port}</option>
                  ))}
                  {form.port && !PORT_OPTIONS.includes(form.port as typeof PORT_OPTIONS[number]) ? (
                    <option value={form.port}>{form.port}</option>
                  ) : null}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Vessel</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.vessel}
                  onChange={(e) => setForm((f) => ({ ...f, vessel: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {showDutyFields ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Duty Amount</label>
                  <input
                    className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.duty_amount}
                    onChange={(e) => setForm((f) => ({ ...f, duty_amount: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="hidden md:block" />
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Refund Amount</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.refund_amount}
                  onChange={(e) => setForm((f) => ({ ...f, refund_amount: e.target.value }))}
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
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

            <div className="sticky bottom-0 -mx-5 px-5 py-3 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 md:static md:mx-0 md:px-0 md:py-0 md:border-0 md:bg-transparent">
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {saving ? "Saving..." : editing ? "Update Job" : "Create Job"}
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {/* Table */}
      <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Jobs List</h2>
          <span className="text-sm text-slate-600">{filteredJobs.length} total</span>
        </div>

        {!showJobsList && !searchTerm.trim() ? (
          <div className="p-5 text-sm text-slate-600">Click View Jobs to open the jobs list.</div>
        ) : loading ? (
          <div className="p-5 text-sm text-slate-600">Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">No jobs for this view.</div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {paginatedJobs.map((j) => {
                const c = clientMap.get(String(j.client))
                const clientLabel = c
                  ? `${(c as any).client_code} — ${(c as any).client_name}`
                  : `Client ${String(j.client)}`

                return (
                  <div key={j.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{j.file_number}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{clientLabel}</div>
                        <div className="text-xs text-slate-600 mt-1">{formatDate(getJobDate(j))} • {formatTransitDays(getTransitDays(j.id))}</div>
                      </div>
                      <span className={zoneBadge(j.zone)}>{j.zone}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-3 text-sm font-semibold">
                      <button type="button" onClick={() => setViewingJob(j)} className="text-slate-700 hover:text-slate-900">View</button>
                      {canWriteJobs ? (
                        <button type="button" onClick={() => startEdit(j)} className="text-blue-700 hover:text-blue-800">Edit</button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden sm:block overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <table className="min-w-[720px] w-full text-xs sm:text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">File No.</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Client</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Zone</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Transit</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedJobs.map((j) => {
                    const c = clientMap.get(String(j.client))
                    const clientLabel = c
                      ? `${(c as any).client_code} — ${(c as any).client_name}`
                      : `Client ${String(j.client)}`

                    return (
                      <tr key={j.id} className="border-b border-slate-100 hover:bg-white transition">
                        <td className="px-4 py-3 font-semibold text-slate-900">{j.file_number}</td>
                        <td className="px-4 py-3 text-slate-700">{clientLabel}</td>
                        <td className="px-4 py-3 text-slate-700 text-xs">{formatDate(getJobDate(j))}</td>
                        <td className="px-4 py-3">
                          <span className={zoneBadge(j.zone)}>{j.zone}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{formatTransitDays(getTransitDays(j.id))}</td>
                        <td className="px-4 py-3 text-right flex gap-3 justify-end">
                          <button
                            type="button"
                            onClick={() => setViewingJob(j)}
                            className="text-slate-600 hover:text-slate-900 font-semibold"
                          >
                            View
                          </button>
                          {canWriteJobs ? (
                            <button
                              type="button"
                              onClick={() => startEdit(j)}
                              className="text-blue-700 hover:text-blue-800 font-semibold"
                            >
                              Edit
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredJobs.length}
              itemsPerPage={itemsPerPage}
              onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
              onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            />
          </>
        )}
      </section>

      {/* Job detail modal */}
      {viewingJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setViewingJob(null) }}
        >
          <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl text-slate-900">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
              <div>
                <h2 className="font-semibold text-slate-900 text-lg">{viewingJob.file_number}</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  {viewingClient ? `${(viewingClient as any).client_code} — ${(viewingClient as any).client_name}` : `Client ${String(viewingJob.client)}`}
                  {" · "}{formatDate(getJobDate(viewingJob))}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canWriteJobs && (
                  <button
                    type="button"
                    onClick={() => { setViewingJob(null); startEdit(viewingJob) }}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingJob(null)}
                  className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition text-lg leading-none"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 space-y-5">
              {/* Status badges */}
              <div className="flex gap-2 flex-wrap">
                <span className={zoneBadge(viewingJob.zone)}>{viewingJob.zone}</span>
                <span className={[
                  "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                  viewingJob.is_active ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-white text-slate-700 border-slate-200"
                ].join(" ")}>
                  {viewingJob.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                {([
                  ["File Number", viewingJob.file_number],
                  ["Date", formatDate(getJobDate(viewingJob))],
                  ["Quantity", viewingJob.quantity],
                  ["BL / AWB", viewingJob.bl_awb || "—"],
                  ["Weight (kg)", viewingJob.weight_kg || "—"],
                  ["Container No.", viewingJob.container_number || "—"],
                  ["Container Type",
                    [
                      viewingJob.container_40ft > 0 ? `40FT x${viewingJob.container_40ft}` : "",
                      viewingJob.container_20ft > 0 ? `20FT x${viewingJob.container_20ft}` : "",
                      viewingJob.others ? "Others" : "",
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"],
                  ["Transit Days", formatTransitDays(getTransitDays(viewingJob.id))],
                  ["Port", viewingJob.port || "—"],
                  ["Vessel", viewingJob.vessel || "—"],
                  ["Description", viewingJob.description || "—"],
                  ...(viewingJob.zone === "DUTY" ? [["Duty Amount", viewingJob.duty_amount ?? "—"]] : []),
                  ["Refund Amount", viewingJob.refund_amount ?? "—"],
                ] as [string, unknown][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-slate-500 text-xs mb-0.5">{label}</p>
                    <p className="text-slate-900 font-medium">{String(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}