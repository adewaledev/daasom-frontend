import http from "./http"

export type MilestoneStatus = "PENDING" | "DONE"

export interface JobMilestone {
  id: string // UUID
  job: string // Job UUID
  template: string // MilestoneTemplate UUID

  status: MilestoneStatus
  date: string | null

  // Optional computed/nested fields (depends on your serializer)
  template_key?: string
  template_label?: string
  sort_order?: number
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

export async function listJobMilestones(params?: { job?: string }): Promise<JobMilestone[]> {
  // Prefer backend filtering: /job-milestones/?job=<uuid>
  const res = await http.get("/job-milestones/", {
    params: params?.job ? { job: params.job } : undefined,
  })

  const data = res.data
  if (isPaginated<JobMilestone>(data)) return data.results
  return data as JobMilestone[]
}

export async function updateJobMilestone(
  id: string,
  payload: Partial<Pick<JobMilestone, "status" | "date">>
): Promise<JobMilestone> {
  const clean: Record<string, any> = {}

  if (payload.status !== undefined) clean.status = payload.status
  if (payload.date !== undefined) {
    const v = payload.date
    clean.date = v ? String(v).trim() : null
  }

  const res = await http.patch(`/job-milestones/${id}/`, clean)
  return res.data
}