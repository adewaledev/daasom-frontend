import http from "./http"

export type JobZone = "DUTY" | "FREE" | "EXPORT"

export type ClientId = string | number

export interface Job {
  id: string // UUID
  client: ClientId
  zone: JobZone

  file_number: string
  quantity: number

  bl_awb: string
  weight_kg: string | null

  container_40ft: number
  container_20ft: number
  others: string

  description: string
  container_number: string
  transit_days: number | null

  duty_amount: string | null
  refund_amount: string | null

  is_active: boolean

  created_at: string
  updated_at: string
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

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function toNumberOrZero(v: unknown): number {
  const n = Number(String(v ?? "").trim())
  return Number.isFinite(n) ? n : 0
}

function toDecimalStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s) return null
  return s
}

/**
 * Build payload aligned to the Django model fields.
 * IMPORTANT: client FK may be UUID or integer depending on Client PK — do not coerce.
 */
export function buildJobPayload(input: Partial<Job>): Record<string, any> {
  const out: Record<string, any> = {}

  if (input.client !== undefined) out.client = input.client
  if (input.zone !== undefined) out.zone = input.zone

  if (input.file_number !== undefined) out.file_number = String(input.file_number).trim()

  if (input.quantity !== undefined) out.quantity = Math.max(0, Math.trunc(toNumberOrZero(input.quantity)))

  if (input.bl_awb !== undefined) out.bl_awb = String(input.bl_awb ?? "").trim()
  if (input.weight_kg !== undefined) out.weight_kg = toDecimalStringOrNull(input.weight_kg)

  if (input.container_40ft !== undefined)
    out.container_40ft = Math.max(0, Math.trunc(toNumberOrZero(input.container_40ft)))
  if (input.container_20ft !== undefined)
    out.container_20ft = Math.max(0, Math.trunc(toNumberOrZero(input.container_20ft)))

  if (input.others !== undefined) out.others = String(input.others ?? "").trim()

  if (input.description !== undefined) out.description = String(input.description ?? "").trim()
  if (input.container_number !== undefined) out.container_number = String(input.container_number ?? "").trim()

  if (input.transit_days !== undefined) out.transit_days = toIntOrNull(input.transit_days)

  if (input.duty_amount !== undefined) out.duty_amount = toDecimalStringOrNull(input.duty_amount)
  if (input.refund_amount !== undefined) out.refund_amount = toDecimalStringOrNull(input.refund_amount)

  if (input.is_active !== undefined) out.is_active = !!input.is_active

  return out
}

export async function listJobs(): Promise<Job[]> {
  const res = await http.get("/jobs/")
  const data = res.data
  if (isPaginated<Job>(data)) return data.results
  return data as Job[]
}

export async function createJob(payload: Partial<Job>): Promise<Job> {
  const res = await http.post("/jobs/", buildJobPayload(payload))
  return res.data
}

export async function updateJob(id: string, payload: Partial<Job>): Promise<Job> {
  const res = await http.patch(`/jobs/${id}/`, buildJobPayload(payload))
  return res.data
}