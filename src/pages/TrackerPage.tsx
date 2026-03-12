import { useEffect, useMemo, useState } from "react"
import type { TrackerEntry, TrackerJobRow } from "../api/tracker"
import {
  listTrackerJobs,
  createTrackerEntry,
  updateTrackerEntry,
  deleteTrackerEntry,
  markTrackerCompleted,
  reopenTracker,
} from "../api/tracker"
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
  if (zone === "DUTY") return `${base} bg-blue-600/15 text-blue-200 border-blue-500/20`
  if (zone === "FREE") return `${base} bg-white/5 text-white/80 border-white/10`
  return `${base} bg-black/40 text-white/80 border-white/10`
}

type NewEntryForm = {
  entry_date: string
  progress_report: string
  next_step: string
}

const emptyForm: NewEntryForm = {
  entry_date: new Date().toISOString().split("T")[0],
  progress_report: "",
  next_step: "",
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

  const [trackerStatusFilter, setTrackerStatusFilter] = useState<"all" | "pending" | "completed">("all")
  const [showJobsList, setShowJobsList] = useState(false)

  const canWriteTracker = can("tracker.write")

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

  useEffect(() => {
    refreshJobs()
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

  useEffect(() => {
    if (selectedJobId && selectedJob) {
      setEntries(selectedJob.tracker_entries || [])
      setShowNewEntryForm(false)
      setNewEntryForm(emptyForm)
      setEditingEntryId(null)
    } else {
      setEntries([])
    }
  }, [selectedJobId, selectedJob])

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
      const created = await createTrackerEntry({
        job: selectedJobId,
        entry_date: newEntryForm.entry_date,
        progress_report: newEntryForm.progress_report,
        next_step: newEntryForm.next_step,
      })

      setEntries((prev) => [...prev, created])
      setJobs((prev) =>
        prev.map((j) =>
          j.job_id === selectedJobId
            ? { ...j, tracker_entries: [...(j.tracker_entries || []), created] }
            : j
        )
      )
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
      const updated = await updateTrackerEntry(entryId, {
        entry_date: editingForm.entry_date,
        progress_report: editingForm.progress_report,
        next_step: editingForm.next_step,
      })

      setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)))
      setJobs((prev) =>
        prev.map((j) =>
          j.job_id === selectedJobId
            ? { ...j, tracker_entries: (j.tracker_entries || []).map((e) => (e.id === entryId ? updated : e)) }
            : j
        )
      )
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
      setEntries((prev) => prev.filter((e) => e.id !== entryId))
      setJobs((prev) =>
        prev.map((j) =>
          j.job_id === selectedJobId
            ? { ...j, tracker_entries: (j.tracker_entries || []).filter((e) => e.id !== entryId) }
            : j
        )
      )
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
      await refreshJobs()
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
      await refreshJobs()
      setInfo("Tracker reopened.")
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to reopen tracker.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-blue-300">Tracker</h1>
          <p className="mt-1 text-sm text-white/60">Track job progress with daily entries and completion status.</p>
        </div>

        <button
          type="button"
          onClick={refreshJobs}
          disabled={loading}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {!canWriteTracker ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4">
          <div className="text-sm text-white/75">Signed in as {roleLabel}. Tracker updates are view-only for this role.</div>
        </section>
      ) : null}

      {error && (
        <section className="rounded-2xl border border-red-500/20 bg-red-500/10 backdrop-blur p-4">
          <div className="text-sm text-red-200">{error}</div>
        </section>
      )}

      {info && (
        <section className="rounded-2xl border border-blue-500/20 bg-blue-600/10 backdrop-blur p-4">
          <div className="text-sm text-blue-200">{info}</div>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
        <div className="flex gap-3 items-center relative">
          <input
            type="text"
            placeholder="Search by file number, client code, or client name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="flex-1 bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-black/80 border border-white/10 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
              {searchSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    openJob(suggestion.job.job_id)
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 transition border-b border-white/5 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${suggestion.type === "file"
                      ? "bg-blue-600/20 text-blue-200"
                      : suggestion.type === "client_code"
                        ? "bg-purple-600/20 text-purple-200"
                        : "bg-green-600/20 text-green-200"
                      }`}>
                      {suggestion.type === "file" ? "FILE" : suggestion.type === "client_code" ? "CODE" : "NAME"}
                    </span>
                    <span className="text-white/90">{suggestion.value}</span>
                    <span className="text-white/40 text-xs ml-auto">{suggestion.job.file_number}</span>
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
              : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
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
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${trackerStatusFilter === "pending"
              ? "bg-amber-600 text-white"
              : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
              }`}
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => {
              setTrackerStatusFilter("completed")
              setShowJobsList(true)
            }}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${trackerStatusFilter === "completed"
              ? "bg-green-600 text-white"
              : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
              }`}
          >
            Completed
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Jobs ({filteredJobs.length})</h2>
          {showJobsList && (
            <button
              type="button"
              onClick={() => setShowJobsList(false)}
              className="text-white/60 hover:text-white/80 transition text-sm font-semibold"
            >
              Close
            </button>
          )}
        </div>

        {!searchTerm.trim() && !showJobsList ? (
          <div className="p-5 text-sm text-white/60">Search for a job or select one from the list to get started.</div>
        ) : loading ? (
          <div className="p-5 text-sm text-white/60">Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No jobs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">File No.</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Client Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Client Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Entries</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr
                    key={job.job_id}
                    className={`border-b border-white/5 hover:bg-white/5 transition cursor-pointer ${selectedJobId === job.job_id ? "bg-white/10" : ""}`}
                  >
                    <td className="px-4 py-3 font-semibold text-white">{job.file_number}</td>
                    <td className="px-4 py-3 text-white/80">{job.client_code}</td>
                    <td className="px-4 py-3 text-white/80">{job.client_name}</td>
                    <td className="px-4 py-3">
                      <span className={zoneBadge(job.zone)}>{job.zone}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${job.tracker_completed
                          ? "bg-green-500/10 text-green-200 border-green-500/20"
                          : "bg-amber-500/10 text-amber-200 border-amber-500/20"
                          }`}
                      >
                        {job.tracker_completed ? "COMPLETED" : "PENDING"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/70">{job.tracker_entries?.length || 0} entries</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openJob(job.job_id)}
                        className="text-blue-300 hover:text-blue-200 font-semibold text-sm"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedJobId("")
              setShowNewEntryForm(false)
              setEditingEntryId(null)
            }
          }}
        >
          <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1117] shadow-2xl text-white">
            {/* Modal header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-[#0f1117] border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="font-semibold text-white text-lg">
                  {selectedJob.file_number} — {selectedJob.client_name}
                </h2>
                <p className="text-xs text-white/55 mt-1">
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
                  className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition text-lg leading-none"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4">
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
              )}
              {info && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-600/10 p-3 text-sm text-blue-200">{info}</div>
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
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-white/80 mb-1">Date</label>
                    <input
                      type="date"
                      value={newEntryForm.entry_date}
                      onChange={(e) => setNewEntryForm((f) => ({ ...f, entry_date: e.target.value }))}
                      className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white/80 mb-1">Progress Report</label>
                    <textarea
                      value={newEntryForm.progress_report}
                      onChange={(e) => setNewEntryForm((f) => ({ ...f, progress_report: e.target.value }))}
                      placeholder="What progress was made?"
                      rows={3}
                      className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white/80 mb-1">Next Step</label>
                    <textarea
                      value={newEntryForm.next_step}
                      onChange={(e) => setNewEntryForm((f) => ({ ...f, next_step: e.target.value }))}
                      placeholder="What is the next step?"
                      rows={3}
                      className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewEntryForm(false)
                        setNewEntryForm(emptyForm)
                      }}
                      className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
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
              )}

              {entries.length === 0 ? (
                <div className="p-4 text-sm text-white/60 rounded-lg border border-white/10 bg-black/20">
                  No entries yet. {!selectedJob.tracker_completed && canWriteTracker ? "Add one to get started." : ""}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-black/60 text-white">
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 text-left font-semibold text-white/90">Date</th>
                        <th className="px-4 py-3 text-left font-semibold text-white/90">Progress Report</th>
                        <th className="px-4 py-3 text-left font-semibold text-white/90">Next Step</th>
                        {canWriteTracker && <th className="px-4 py-3 text-right font-semibold text-white/90">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5 transition">
                          {editingEntryId === entry.id ? (
                            <>
                              <td className="px-4 py-3">
                                <input
                                  type="date"
                                  value={editingForm.entry_date}
                                  onChange={(e) => setEditingForm((f) => ({ ...f, entry_date: e.target.value }))}
                                  className="bg-black/40 text-white border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <textarea
                                  value={editingForm.progress_report}
                                  onChange={(e) => setEditingForm((f) => ({ ...f, progress_report: e.target.value }))}
                                  rows={2}
                                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <textarea
                                  value={editingForm.next_step}
                                  onChange={(e) => setEditingForm((f) => ({ ...f, next_step: e.target.value }))}
                                  rows={2}
                                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                                />
                              </td>
                              <td className="px-4 py-3 text-right flex gap-1 justify-end">
                                <button
                                  type="button"
                                  onClick={() => updateEntry(entry.id)}
                                  disabled={saving}
                                  className="text-green-300 hover:text-green-200 font-semibold text-xs"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingEntryId(null)
                                    setEditingForm(emptyForm)
                                  }}
                                  className="text-white/60 hover:text-white/80 font-semibold text-xs"
                                >
                                  Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-white/80">{entry.entry_date}</td>
                              <td className="px-4 py-3 text-white/70 max-w-xs truncate">{entry.progress_report || "—"}</td>
                              <td className="px-4 py-3 text-white/70 max-w-xs truncate">{entry.next_step || "—"}</td>
                              {canWriteTracker && (
                                <td className="px-4 py-3 text-right flex gap-2 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingEntryId(entry.id)
                                      setEditingForm({
                                        entry_date: entry.entry_date,
                                        progress_report: entry.progress_report,
                                        next_step: entry.next_step,
                                      })
                                    }}
                                    className="text-blue-300 hover:text-blue-200 font-semibold text-xs"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteEntry(entry.id)}
                                    className="text-red-300 hover:text-red-200 font-semibold text-xs"
                                  >
                                    Delete
                                  </button>
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
