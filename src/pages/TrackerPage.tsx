import { useEffect, useMemo, useState } from "react"
import type { TrackerEntry, TrackerJobRow, TrackerOptionsResponse } from "../api/tracker"
import {
  listTrackerJobs,
  listTrackerEntries,
  listTrackerOptions,
  createTrackerEntry,
  updateTrackerEntry,
  deleteTrackerEntry,
  markTrackerCompleted,
  reopenTracker,
} from "../api/tracker"
import PaginationControls from "../components/PaginationControls"
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

function zoneBadge(zone: string) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border"
  if (zone === "DUTY") return `${base} bg-blue-50 text-blue-700 border-blue-200`
  if (zone === "FREE") return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`
  return `${base} bg-slate-100 text-slate-700 border-slate-200`
}

type NewEntryForm = {
  entry_date: string
  progress_report: string
  notes: string
}

const emptyForm: NewEntryForm = {
  entry_date: new Date().toISOString().split("T")[0],
  progress_report: "",
  notes: "",
}

const emptyTrackerOptions: TrackerOptionsResponse = {
  progress_report_options: [],
  next_step_options: [],
}

function mergeOptions(options: string[], currentValue?: string) {
  const values = new Set(options.filter(Boolean))
  if (currentValue?.trim()) values.add(currentValue.trim())
  return Array.from(values)
}

function formatTrackerOptionLabel(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim()
  const isAllCaps = cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned)
  const hasUnderscores = cleaned.includes("_")

  if (isAllCaps && hasUnderscores) {
    // e.g. DATE_INVOICED → Date Invoiced (all-caps phrase, not an acronym)
    return cleaned
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
  }

  // Just replace underscores, preserve existing casing so acronyms (NEPZA, DTI, TDO, ETA) stay intact
  return cleaned.replace(/_/g, " ")
}

export default function TrackerPage() {
  const { can, roleLabel } = useAuth()
  const [jobs, setJobs] = useState<TrackerJobRow[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>("")
  const [entries, setEntries] = useState<TrackerEntry[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [searchTerm, setSearchTerm] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showNewEntryForm, setShowNewEntryForm] = useState(false)
  const [newEntryForm, setNewEntryForm] = useState<NewEntryForm>(emptyForm)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editingForm, setEditingForm] = useState<NewEntryForm>(emptyForm)
  const [globalOptions, setGlobalOptions] = useState<TrackerOptionsResponse>(emptyTrackerOptions)

  const [trackerStatusFilter, setTrackerStatusFilter] = useState<"all" | "pending" | "completed">("all")
  const [showJobsList, setShowJobsList] = useState(false)
  const [jobsCurrentPage, setJobsCurrentPage] = useState(1)
  const [entriesCurrentPage, setEntriesCurrentPage] = useState(1)
  const itemsPerPage = 10

  const canWriteTracker = can("tracker.write")

  const pendingJobsCount = useMemo(() => jobs.filter((j) => !j.tracker_completed).length, [jobs])

  async function refreshJobs() {
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const data = await listTrackerJobs()
      setJobs(data)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load tracker jobs.")
    } finally {
      setLoading(false)
    }
  }

  async function refreshEntries(jobId: string) {
    try {
      const data = await listTrackerEntries(jobId)
      setEntries(data)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load tracker entries.")
    }
  }

  async function refreshTrackerOptions() {
    try {
      const data = await listTrackerOptions()
      setGlobalOptions({
        progress_report_options: data.progress_report_options || [],
        next_step_options: data.next_step_options || [],
      })
    } catch {
      setGlobalOptions(emptyTrackerOptions)
    }
  }

  useEffect(() => {
    refreshJobs()
    refreshTrackerOptions()
  }, [])

  const selectedJob = useMemo(() => jobs.find((j) => j.job_id === selectedJobId) ?? null, [jobs, selectedJobId])

  const filteredJobs = useMemo(() => {
    let result = jobs

    // Apply tracker completion filter
    if (trackerStatusFilter === "pending") {
      result = result.filter((j) => !j.tracker_completed)
    } else if (trackerStatusFilter === "completed") {
      result = result.filter((j) => j.tracker_completed)
    }

    // Apply search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (j) =>
          j.file_number.toLowerCase().includes(term) ||
          j.client_code.toLowerCase().includes(term) ||
          j.client_name.toLowerCase().includes(term)
      )
    }

    // Sort by job_id descending (with assumption that IDs may correlate with creation order)
    // If the backend provides created_at, this could be improved to sort by that field
    result = [...result].sort((a, b) => {
      // Try to use created_at if available on the job object
      const dateA = (a as any).created_at ? new Date((a as any).created_at).getTime() : 0
      const dateB = (b as any).created_at ? new Date((b as any).created_at).getTime() : 0

      if (dateA !== 0 && dateB !== 0) {
        return dateB - dateA // Newest first
      }

      // Fallback: sort by latest entry date if available
      const latestEntryA = a.tracker_entries?.[0]?.entry_date || ""
      const latestEntryB = b.tracker_entries?.[0]?.entry_date || ""
      if (latestEntryA && latestEntryB) {
        return latestEntryB.localeCompare(latestEntryA)
      }

      return 0
    })

    return result
  }, [jobs, trackerStatusFilter, searchTerm])

  const jobsTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredJobs.length / itemsPerPage)), [filteredJobs.length])
  const paginatedJobs = useMemo(() => {
    const start = (jobsCurrentPage - 1) * itemsPerPage
    return filteredJobs.slice(start, start + itemsPerPage)
  }, [filteredJobs, jobsCurrentPage])

  const searchSuggestions = useMemo(() => {
    if (!searchTerm.trim()) return []

    const term = searchTerm.toLowerCase()
    const suggestions: Array<{ type: "file" | "client_code" | "client_name"; value: string; job: TrackerJobRow }> = []
    const seen = new Set<string>()

    for (const job of jobs) {
      if (job.file_number.toLowerCase().includes(term) && !seen.has(`file:${job.file_number}`)) {
        suggestions.push({ type: "file", value: job.file_number, job })
        seen.add(`file:${job.file_number}`)
      }
      if (job.client_code.toLowerCase().includes(term) && !seen.has(`code:${job.client_code}`)) {
        suggestions.push({ type: "client_code", value: job.client_code, job })
        seen.add(`code:${job.client_code}`)
      }
      if (job.client_name.toLowerCase().includes(term) && !seen.has(`name:${job.client_name}`)) {
        suggestions.push({ type: "client_name", value: job.client_name, job })
        seen.add(`name:${job.client_name}`)
      }
    }

    return suggestions.slice(0, 8) // Limit to 8 suggestions
  }, [searchTerm, jobs])

  const progressOptions = useMemo(() => {
    return (selectedJob?.progress_report_options && selectedJob.progress_report_options.length > 0)
      ? selectedJob.progress_report_options
      : globalOptions.progress_report_options
  }, [globalOptions.progress_report_options, selectedJob])

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const byDate = a.entry_date.localeCompare(b.entry_date)
      if (byDate !== 0) return byDate
      return String(a.id).localeCompare(String(b.id))
    })
  }, [entries])

  const entriesTotalPages = useMemo(() => Math.max(1, Math.ceil(sortedEntries.length / itemsPerPage)), [sortedEntries.length])
  const paginatedEntries = useMemo(() => {
    const start = (entriesCurrentPage - 1) * itemsPerPage
    return sortedEntries.slice(start, start + itemsPerPage)
  }, [sortedEntries, entriesCurrentPage])

  useEffect(() => {
    if (selectedJobId) {
      setShowNewEntryForm(false)
      setNewEntryForm(emptyForm)
      setEditingEntryId(null)
      setEntriesCurrentPage(1)
      refreshEntries(selectedJobId)
    } else {
      setEntries([])
    }
  }, [selectedJobId])

  useEffect(() => {
    setJobsCurrentPage(1)
  }, [trackerStatusFilter, searchTerm])

  useEffect(() => {
    if (jobsCurrentPage > jobsTotalPages) setJobsCurrentPage(jobsTotalPages)
  }, [jobsCurrentPage, jobsTotalPages])

  useEffect(() => {
    if (entriesCurrentPage > entriesTotalPages) setEntriesCurrentPage(entriesTotalPages)
  }, [entriesCurrentPage, entriesTotalPages])

  function openJob(jobId: string) {
    setSelectedJobId(jobId)
    setSearchTerm("")
    setShowSuggestions(false)
    setShowJobsList(false)
  }

  async function addEntry() {
    if (!selectedJobId) return
    if (!canWriteTracker) {
      setError(`${roleLabel} role has view-only access to tracker.`)
      return
    }

    if (!newEntryForm.entry_date.trim()) {
      setError("Date is required.")
      return
    }

    setError("")
    setInfo("")
    setSaving(true)

    try {
      await createTrackerEntry({
        job: selectedJobId,
        entry_date: newEntryForm.entry_date,
        progress_report: newEntryForm.progress_report,
        next_step: newEntryForm.notes,
      })

      await Promise.all([refreshJobs(), refreshEntries(selectedJobId)])
      setNewEntryForm(emptyForm)
      setShowNewEntryForm(false)
      setInfo("Entry created.")
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to create entry.")
    } finally {
      setSaving(false)
    }
  }

  async function updateEntry(entryId: string) {
    if (!canWriteTracker) {
      setError(`${roleLabel} role has view-only access to tracker.`)
      return
    }

    if (!editingForm.entry_date.trim()) {
      setError("Date is required.")
      return
    }

    setError("")
    setInfo("")
    setSaving(true)

    try {
      await updateTrackerEntry(entryId, {
        entry_date: editingForm.entry_date,
        progress_report: editingForm.progress_report,
        next_step: editingForm.notes,
      })

      if (selectedJobId) {
        await Promise.all([refreshJobs(), refreshEntries(selectedJobId)])
      }
      setEditingEntryId(null)
      setEditingForm(emptyForm)
      setInfo("Entry updated.")
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to update entry.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(entryId: string) {
    if (!canWriteTracker) {
      setError(`${roleLabel} role has view-only access to tracker.`)
      return
    }

    const ok = window.confirm("Delete this entry?")
    if (!ok) return

    setError("")
    setInfo("")
    setSaving(true)

    try {
      await deleteTrackerEntry(entryId)
      if (selectedJobId) {
        await Promise.all([refreshJobs(), refreshEntries(selectedJobId)])
      }
      setInfo("Entry deleted.")
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to delete entry.")
    } finally {
      setSaving(false)
    }
  }

  async function completeTracker() {
    if (!selectedJobId) return
    if (!canWriteTracker) {
      setError(`${roleLabel} role has view-only access to tracker.`)
      return
    }

    setError("")
    setInfo("")
    setSaving(true)

    try {
      await markTrackerCompleted(selectedJobId)
      await Promise.all([refreshJobs(), refreshEntries(selectedJobId)])
      setInfo("Job marked as completed.")
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to mark tracker as completed.")
    } finally {
      setSaving(false)
    }
  }

  async function reopenTrackerForJob() {
    if (!selectedJobId) return
    if (!canWriteTracker) {
      setError(`${roleLabel} role has view-only access to tracker.`)
      return
    }

    setError("")
    setInfo("")
    setSaving(true)

    try {
      await reopenTracker(selectedJobId)
      await Promise.all([refreshJobs(), refreshEntries(selectedJobId)])
      setInfo("Tracker reopened.")
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to reopen tracker.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tracker-page space-y-6 text-slate-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="text-blue-700">Tracker</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">Track job progress with daily entries and completion status.</p>
        </div>

        <button
          type="button"
          onClick={refreshJobs}
          disabled={loading}
          className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {!canWriteTracker ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-700">Signed in as {roleLabel}. Tracker updates are view-only for this role.</div>
        </section>
      ) : null}

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="text-sm text-red-700">{error}</div>
        </section>
      )}

      {info && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-sm text-blue-700">{info}</div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex gap-3 items-center relative">
          <input
            type="text"
            placeholder="Search by file number, client code, or client name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="flex-1 bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="tracker-suggestions absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
              {searchSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    openJob(suggestion.job.job_id)
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${suggestion.type === "file"
                      ? "bg-blue-100 text-blue-700"
                      : suggestion.type === "client_code"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-green-100 text-green-700"
                      }`}>
                      {suggestion.type === "file" ? "FILE" : suggestion.type === "client_code" ? "CODE" : "NAME"}
                    </span>
                    <span className="text-slate-800">{suggestion.value}</span>
                    <span className="text-slate-600 text-xs ml-auto">{suggestion.job.file_number}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setTrackerStatusFilter("all")
              setShowJobsList(true)
            }}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${trackerStatusFilter === "all"
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
              }`}
          >
            All Jobs
          </button>
          <button
            type="button"
            onClick={() => {
              setTrackerStatusFilter("pending")
              setShowJobsList(true)
            }}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition inline-flex items-center gap-2 ${trackerStatusFilter === "pending"
              ? "bg-amber-600 text-white"
              : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
              }`}
          >
            Pending
            {pendingJobsCount > 0 && (
              <span className="tracker-pending-pill inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-white/20 text-xs font-semibold">
                {pendingJobsCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setTrackerStatusFilter("completed")
              setShowJobsList(true)
            }}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${trackerStatusFilter === "completed"
              ? "bg-green-600 text-white"
              : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
              }`}
          >
            Completed
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Jobs ({filteredJobs.length})</h2>
          {showJobsList && (
            <button
              type="button"
              onClick={() => setShowJobsList(false)}
              className="text-slate-600 hover:text-slate-700 transition text-sm font-semibold"
            >
              Close
            </button>
          )}
        </div>

        {!searchTerm.trim() && !showJobsList ? (
          <div className="p-5 text-sm text-slate-600">Search for a job or select one from the list to get started.</div>
        ) : loading ? (
          <div className="p-5 text-sm text-slate-600">Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">No jobs found.</div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {paginatedJobs.map((job) => (
                <div key={job.job_id} className={`rounded-xl border p-3 ${selectedJobId === job.job_id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{job.file_number}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{job.client_code} • {job.client_name}</div>
                    </div>
                    <span className={zoneBadge(job.zone)}>{job.zone}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span
                      className={`tracker-status-chip inline-flex items-center px-2 py-0.5 rounded-md font-semibold border ${job.tracker_completed
                        ? "tracker-status-completed bg-green-100 text-green-700 border-green-200"
                        : "tracker-status-pending bg-amber-100 text-amber-700 border-amber-200"
                        }`}
                    >
                      {job.tracker_completed ? "COMPLETED" : "PENDING"}
                    </span>
                    <span className="text-slate-600">{job.tracker_entries?.length || 0} entries</span>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => openJob(job.job_id)}
                      className="text-blue-700 hover:text-blue-800 font-semibold text-sm"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <table className="min-w-[720px] w-full text-xs sm:text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold">File No.</th>
                    <th className="px-4 py-3 text-left font-semibold">Client Code</th>
                    <th className="px-4 py-3 text-left font-semibold">Client Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Zone</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Entries</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedJobs.map((job) => (
                    <tr
                      key={job.job_id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer ${selectedJobId === job.job_id ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">{job.file_number}</td>
                      <td className="px-4 py-3 text-slate-700">{job.client_code}</td>
                      <td className="px-4 py-3 text-slate-700">{job.client_name}</td>
                      <td className="px-4 py-3">
                        <span className={zoneBadge(job.zone)}>{job.zone}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`tracker-status-chip inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${job.tracker_completed
                            ? "tracker-status-completed bg-green-100 text-green-700 border-green-200"
                            : "tracker-status-pending bg-amber-100 text-amber-700 border-amber-200"
                            }`}
                        >
                          {job.tracker_completed ? "COMPLETED" : "PENDING"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{job.tracker_entries?.length || 0} entries</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openJob(job.job_id)}
                          className="text-blue-700 hover:text-blue-800 font-semibold text-sm"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={jobsCurrentPage}
              totalPages={jobsTotalPages}
              totalItems={filteredJobs.length}
              itemsPerPage={itemsPerPage}
              onPrevious={() => setJobsCurrentPage((page) => Math.max(1, page - 1))}
              onNext={() => setJobsCurrentPage((page) => Math.min(jobsTotalPages, page + 1))}
            />
          </>
        )}
      </section>

      {selectedJob && (
        <div
          className="tracker-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedJobId("")
              setShowNewEntryForm(false)
              setEditingEntryId(null)
            }
          }}
        >
          <div className="tracker-modal-shell relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl text-slate-800">
            {/* Modal header */}
            <div className="tracker-modal-header sticky top-0 z-10 flex items-start justify-between gap-4 bg-white border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="font-semibold text-slate-900 text-lg">
                  {selectedJob.file_number} — {selectedJob.client_name}
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  {selectedJob.tracker_completed
                    ? `Completed on ${selectedJob.tracker_completed_at ? new Date(selectedJob.tracker_completed_at).toLocaleDateString() : "N/A"} by ${selectedJob.tracker_completed_by || "unknown"}`
                    : "Tracker is active"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canWriteTracker && (
                  <>
                    {!selectedJob.tracker_completed ? (
                      <button
                        type="button"
                        onClick={completeTracker}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-green-600 text-white border border-green-400/40 shadow-[0_6px_18px_rgba(16,185,129,0.35)] hover:bg-green-500 hover:shadow-[0_8px_22px_rgba(16,185,129,0.45)] focus:outline-none focus:ring-2 focus:ring-green-300/70 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Mark as Completed
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={reopenTrackerForJob}
                        disabled={saving}
                        className="px-3 py-2 rounded-lg text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedJobId("")
                    setShowNewEntryForm(false)
                    setEditingEntryId(null)
                  }}
                  className="p-2 rounded-lg text-slate-600 hover:text-slate-700 hover:bg-slate-100 transition text-lg leading-none"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}
              {info && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{info}</div>
              )}

              {!selectedJob.tracker_completed && canWriteTracker && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowNewEntryForm(!showNewEntryForm)}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
                  >
                    {showNewEntryForm ? "Cancel" : "+ Add Entry"}
                  </button>
                </div>
              )}

              {showNewEntryForm && !selectedJob.tracker_completed && canWriteTracker && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={newEntryForm.entry_date}
                      onChange={(e) => setNewEntryForm((f) => ({ ...f, entry_date: e.target.value }))}
                      className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Progress Made</label>
                    <select
                      value={newEntryForm.progress_report}
                      onChange={(e) => setNewEntryForm((f) => ({ ...f, progress_report: e.target.value }))}
                      className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select progress made…</option>
                      {progressOptions.map((option) => (
                        <option key={option} value={option}>{formatTrackerOptionLabel(option)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Notes (optional)</label>
                    <textarea
                      value={newEntryForm.notes}
                      onChange={(e) => setNewEntryForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={4}
                      placeholder="Add any context, blockers, follow-up details, or handover notes..."
                      className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sticky bottom-0 -mx-4 px-4 py-3 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 md:static md:mx-0 md:px-0 md:py-0 md:border-0 md:bg-transparent">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewEntryForm(false)
                          setNewEntryForm(emptyForm)
                        }}
                        className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={addEntry}
                        disabled={saving}
                        className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {sortedEntries.length === 0 ? (
                <div className="p-4 text-sm text-slate-600 rounded-lg border border-slate-200 bg-slate-50">
                  No entries yet. {!selectedJob.tracker_completed && canWriteTracker ? "Add one to get started." : ""}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                    <table className="min-w-[1100px] w-full text-sm table-fixed">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr className="border-b border-slate-200">
                          <th className="w-40 px-4 py-3 text-left font-semibold">Date</th>
                          <th className="w-80 px-4 py-3 text-left font-semibold">Progress Made</th>
                          <th className="px-4 py-3 text-left font-semibold">Notes</th>
                          {canWriteTracker && <th className="w-32 px-4 py-3 text-right font-semibold">Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedEntries.map((entry) => (
                          <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                            {editingEntryId === entry.id ? (
                              <>
                                <td className="px-4 py-3 align-top">
                                  <input
                                    type="date"
                                    value={editingForm.entry_date}
                                    onChange={(e) => setEditingForm((f) => ({ ...f, entry_date: e.target.value }))}
                                    className="bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <select
                                    value={editingForm.progress_report}
                                    onChange={(e) => setEditingForm((f) => ({ ...f, progress_report: e.target.value }))}
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">Select progress made…</option>
                                    {mergeOptions(progressOptions, editingForm.progress_report).map((option) => (
                                      <option key={option} value={option}>{formatTrackerOptionLabel(option)}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <textarea
                                    value={editingForm.notes}
                                    onChange={(e) => setEditingForm((f) => ({ ...f, notes: e.target.value }))}
                                    rows={4}
                                    placeholder="Optional notes..."
                                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1 text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="flex gap-1 justify-end whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => updateEntry(entry.id)}
                                      disabled={saving}
                                      className="text-green-700 hover:text-green-700 font-semibold text-xs"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingEntryId(null)
                                        setEditingForm(emptyForm)
                                      }}
                                      className="text-slate-600 hover:text-slate-700 font-semibold text-xs"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3 align-top text-slate-700 whitespace-nowrap">{entry.entry_date}</td>
                                <td className="px-4 py-3 align-top text-slate-700 whitespace-normal break-words">{entry.progress_report ? formatTrackerOptionLabel(entry.progress_report) : "—"}</td>
                                <td className="px-4 py-3 align-top text-slate-700 whitespace-pre-wrap break-words">{entry.next_step || "—"}</td>
                                {canWriteTracker && (
                                  <td className="px-4 py-3 align-top">
                                    <div className="flex gap-2 justify-end whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingEntryId(entry.id)
                                          setEditingForm({
                                            entry_date: entry.entry_date,
                                            progress_report: entry.progress_report,
                                            notes: entry.next_step,
                                          })
                                        }}
                                        className="text-blue-700 hover:text-blue-800 font-semibold text-xs"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteEntry(entry.id)}
                                        className="text-red-700 hover:text-red-800 font-semibold text-xs"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <PaginationControls
                    currentPage={entriesCurrentPage}
                    totalPages={entriesTotalPages}
                    totalItems={sortedEntries.length}
                    itemsPerPage={itemsPerPage}
                    onPrevious={() => setEntriesCurrentPage((page) => Math.max(1, page - 1))}
                    onNext={() => setEntriesCurrentPage((page) => Math.min(entriesTotalPages, page + 1))}
                    className="px-0 pb-0"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
