import { useEffect, useMemo, useState } from "react"
import { listJobs } from "../api/jobs"
import type { Job } from "../api/jobs"
import { listClients } from "../api/clients"
import type { Client } from "../api/clients"
import { listJobMilestones, updateJobMilestone } from "../api/jobMilestones"
import type { JobMilestone, MilestoneStatus } from "../api/jobMilestones"
import { useAuth } from "../state/auth"

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
  const { can, roleLabel } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [jobs, setJobs] = useState<Job[]>([])

  const [selectedJobId, setSelectedJobId] = useState<string>("")
  const [milestones, setMilestones] = useState<JobMilestone[]>([])
  const [allJobMilestones, setAllJobMilestones] = useState<JobMilestone[]>([])

  const [loading, setLoading] = useState(true)
  const [loadingMilestones, setLoadingMilestones] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [searchTerm, setSearchTerm] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const canWriteTracker = can("tracker.write")

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>()
    for (const c of clients as any[]) m.set(String(c.id), c)
    return m
  }, [clients])

  // Check if a job has any pending milestones
  const jobHasPendingMilestones = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const job of jobs) {
      const jobMilestones = allJobMilestones.filter((m) => m.job === job.id)
      const hasPending = jobMilestones.some((m) => m.status === "PENDING")
      map.set(job.id, hasPending)
    }
    return map
  }, [jobs, allJobMilestones])

  // Generate search suggestions
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

    return suggestions.slice(0, 10)
  }, [searchTerm, jobs, clients])

  // Filter and paginate jobs
  const filteredAndPaginatedJobs = useMemo(() => {
    let result = jobs

    // Apply status filter based on milestone status
    if (statusFilter === "PENDING") {
      result = result.filter((j) => jobHasPendingMilestones.get(j.id) === true)
    } else if (statusFilter === "COMPLETED") {
      result = result.filter((j) => jobHasPendingMilestones.get(j.id) === false)
    }

    // Sort: jobs with pending milestones first, then by date (newest first)
    result = [...result].sort((a, b) => {
      const aPending = jobHasPendingMilestones.get(a.id) === true
      const bPending = jobHasPendingMilestones.get(b.id) === true
      // Pending jobs come first
      if (aPending !== bPending) {
        return aPending ? -1 : 1
      }
      // Then sort by created_at descending (newest first)
      const dateA = new Date(a.created_at).getTime()
      const dateB = new Date(b.created_at).getTime()
      return dateB - dateA
    })

    // Calculate pagination
    const totalPages = Math.ceil(result.length / itemsPerPage)
    const startIdx = (Math.max(1, Math.min(currentPage, totalPages)) - 1) * itemsPerPage
    const paginatedResult = result.slice(startIdx, startIdx + itemsPerPage)

    return {
      items: paginatedResult,
      total: result.length,
      totalPages,
      currentPage: Math.max(1, Math.min(currentPage, totalPages)),
    }
  }, [jobs, statusFilter, currentPage, itemsPerPage, jobHasPendingMilestones])

  async function refreshBase() {
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const [c, j, allMs] = await Promise.all([listClients(), listJobs(), listJobMilestones()])
      setClients(c)
      setJobs(j)
      setAllJobMilestones(allMs)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load tracker data.")
    } finally {
      setLoading(false)
    }
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
  }

  function selectSuggestion(value: string) {
    setSearchTerm(value)
    setShowSuggestions(false)
  }

  function clearSearch() {
    setSearchTerm("")
    setShowSuggestions(false)
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
    if (!canWriteTracker) {
      setError(`${roleLabel} role has view-only access to tracker updates.`)
      return
    }
    setError("")
    setInfo("")
    try {
      const updated = await updateJobMilestone(id, { status, date: date ? date : null })
      setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)))
      setAllJobMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)))
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
          <p className="mt-1 text-sm text-white/60">Track job milestones and update status.</p>
        </div>

        <button
          type="button"
          onClick={refreshBase}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
        >
          Refresh
        </button>
      </div>

      {!canWriteTracker ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4">
          <div className="text-sm text-white/75">Signed in as {roleLabel}. Tracker updates are view-only for this role.</div>
        </section>
      ) : null}

      {/* Search Section */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4">
        <div className="relative">
          <label className="block text-sm font-semibold text-white/80 mb-2">
            Search Jobs
          </label>
          <div className="relative">
            <input
              type="text"
              className="w-full bg-black/40 text-white border border-white/10 rounded-lg pl-10 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Search by file number or client name..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            )}
          </div>

          {/* Autocomplete Suggestions */}
          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-black/90 border border-white/10 rounded-lg shadow-lg overflow-hidden">
              {searchSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectSuggestion(suggestion.value)}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-white/10 transition flex items-center gap-2"
                >
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${suggestion.type === "file"
                      ? "bg-blue-600/20 text-blue-300"
                      : "bg-green-600/20 text-green-300"
                      }`}
                  >
                    {suggestion.type === "file" ? "FILE" : "CLIENT"}
                  </span>
                  <span className="text-white/90">{suggestion.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-500/20 bg-red-500/10 backdrop-blur p-4">
          <div className="text-sm text-red-200">{error}</div>
        </section>
      ) : null}

      {info ? (
        <section className="rounded-2xl border border-blue-500/20 bg-blue-600/10 backdrop-blur p-4">
          <div className="text-sm text-blue-200">{info}</div>
        </section>
      ) : null}

      {/* All Jobs with Pagination and Filters */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">All Jobs</h2>
          <span className="text-sm text-white/60">
            {filteredAndPaginatedJobs.total} total
          </span>
        </div>

        {/* Filter Buttons */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("ALL")
              setCurrentPage(1)
            }}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${statusFilter === "ALL"
              ? "bg-blue-600 text-white border border-blue-500/30"
              : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"
              }`}
          >
            All Files
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("PENDING")
              setCurrentPage(1)
            }}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${statusFilter === "PENDING"
              ? "bg-amber-600 text-white border border-amber-500/30"
              : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"
              }`}
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("COMPLETED")
              setCurrentPage(1)
            }}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${statusFilter === "COMPLETED"
              ? "bg-green-600 text-white border border-green-500/30"
              : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"
              }`}
          >
            Completed
          </button>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-white/60">Loading jobs...</div>
        ) : filteredAndPaginatedJobs.total === 0 ? (
          <div className="p-5 text-sm text-white/60">No jobs found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-black/60 text-white">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left font-semibold text-white/90">File No.</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Client</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-white/90">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredAndPaginatedJobs.items.map((j) => {
                    const c = clientMap.get(String(j.client))
                    const clientLabel = c
                      ? `${(c as any).client_code} — ${(c as any).client_name}`
                      : `Client ${String(j.client)}`

                    return (
                      <tr
                        key={j.id}
                        className={`border-b border-white/5 hover:bg-white/5 transition ${selectedJobId === j.id ? "bg-white/10" : ""}`}
                      >
                        <td className="px-4 py-3 text-white/90">{j.file_number}</td>
                        <td className="px-4 py-3 text-white/80">{clientLabel}</td>
                        <td className="px-4 py-3 text-white/70 text-xs">{formatDate(j.created_at)}</td>
                        <td className="px-4 py-3">
                          <span className={zoneBadge(j.zone)}>{j.zone}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${jobHasPendingMilestones.get(j.id)
                              ? "bg-amber-500/10 text-amber-200 border-amber-500/20"
                              : "bg-green-500/10 text-green-200 border-green-500/20"
                              }`}
                          >
                            {jobHasPendingMilestones.get(j.id) ? "PENDING" : "COMPLETED"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedJobId(j.id)}
                            className="text-blue-300 hover:text-blue-200 font-semibold text-sm"
                          >
                            Track
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredAndPaginatedJobs.totalPages > 1 && (
              <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-sm text-white/60">
                  Page {filteredAndPaginatedJobs.currentPage} of {filteredAndPaginatedJobs.totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage(Math.min(filteredAndPaginatedJobs.totalPages, currentPage + 1))
                    }
                    disabled={currentPage === filteredAndPaginatedJobs.totalPages}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
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
                  <MilestoneRow key={m.id} m={m} onSave={saveRow} canWrite={canWriteTracker} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}

function MilestoneRow({
  m,
  onSave,
  canWrite,
}: {
  m: JobMilestone
  onSave: (id: string, status: MilestoneStatus, date: string) => Promise<void>
  canWrite: boolean
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
        <select className={statusSelectClass(status)} value={status} onChange={(e) => setStatus(e.target.value as MilestoneStatus)} disabled={!canWrite}>
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
          disabled={!canWrite}
        />
      </td>

      <td className="px-4 py-3 text-right">
        <button
          type="button"
          disabled={!canWrite || !dirty || saving}
          onClick={save}
          className={[
            "px-3 py-2 rounded-lg text-sm font-semibold transition border",
            !canWrite || !dirty || saving
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