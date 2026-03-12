import http from "./http"

export interface TrackerEntry {
  id: string
  entry_date: string // YYYY-MM-DD
  progress_report: string
  next_step: string
  created_at: string
  updated_at: string
}

export interface TrackerJobRow {
  job_id: string
  file_number: string
  client_code: string
  client_name: string
  zone: string
  tracker_completed: boolean
  tracker_completed_at: string | null
  tracker_completed_by: string | null
  tracker_entries: TrackerEntry[]
  // Additional job metadata from the response
  [key: string]: any
}

type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

function isPaginated<T>(data: any): data is Paginated<T> {
  return data && typeof data === "object" && Array.isArray(data.results)
}

export async function listTrackerJobs(params?: {
  zone?: string
  client_code?: string
  file_number?: string
  tracker_completed?: boolean
}): Promise<TrackerJobRow[]> {
  const res = await http.get("/tracker/", { params })
  const data = res.data
  if (isPaginated<TrackerJobRow>(data)) return data.results
  return data as TrackerJobRow[]
}

export async function listTrackerEntries(jobId: string): Promise<TrackerEntry[]> {
  const res = await http.get(`/jobs/${jobId}/tracker_entries/`)
  const data = res.data
  if (isPaginated<TrackerEntry>(data)) return data.results
  return data as TrackerEntry[]
}

export async function createTrackerEntry(payload: {
  job: string
  entry_date: string
  progress_report: string
  next_step: string
}): Promise<TrackerEntry> {
  const res = await http.post("/tracker-entries/", payload)
  return res.data
}

export async function updateTrackerEntry(
  id: string,
  payload: Partial<Pick<TrackerEntry, "entry_date" | "progress_report" | "next_step">>
): Promise<TrackerEntry> {
  const res = await http.patch(`/tracker-entries/${id}/`, payload)
  return res.data
}

export async function deleteTrackerEntry(id: string): Promise<void> {
  await http.delete(`/tracker-entries/${id}/`)
}

export async function markTrackerCompleted(jobId: string): Promise<any> {
  const res = await http.post(`/jobs/${jobId}/mark_tracker_completed/`)
  return res.data
}

export async function reopenTracker(jobId: string): Promise<any> {
  const res = await http.post(`/jobs/${jobId}/reopen_tracker/`)
  return res.data
}
