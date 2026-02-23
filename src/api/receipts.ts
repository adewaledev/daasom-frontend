import http from "./http"

export interface Receipt {
  id: string
  invoice: string // Invoice UUID

  amount: string
  currency: string

  payment_date: string // YYYY-MM-DD
  method: string
  reference: string
  notes: string

  created_at: string
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

export function buildReceiptPayload(input: Partial<Receipt>): Record<string, any> {
  const out: Record<string, any> = {}

  if (input.invoice !== undefined) out.invoice = String(input.invoice).trim()

  if (input.amount !== undefined) out.amount = String(input.amount ?? "").trim()
  if (input.currency !== undefined) out.currency = String(input.currency ?? "NGN").trim()

  if (input.payment_date !== undefined) out.payment_date = String(input.payment_date ?? "").trim()
  if (input.method !== undefined) out.method = String(input.method ?? "").trim()
  if (input.reference !== undefined) out.reference = String(input.reference ?? "").trim()
  if (input.notes !== undefined) out.notes = String(input.notes ?? "").trim()

  return out
}

export async function listReceipts(): Promise<Receipt[]> {
  const res = await http.get("/receipts/")
  const data = res.data
  if (isPaginated<Receipt>(data)) return data.results
  return data as Receipt[]
}

export async function createReceipt(payload: Partial<Receipt>): Promise<Receipt> {
  const res = await http.post("/receipts/", buildReceiptPayload(payload))
  return res.data
}

export async function updateReceipt(id: string, payload: Partial<Receipt>): Promise<Receipt> {
  const res = await http.patch(`/receipts/${id}/`, buildReceiptPayload(payload))
  return res.data
}

export async function deleteReceipt(id: string): Promise<void> {
  await http.delete(`/receipts/${id}/`)
}

export async function getReceiptsSummary(): Promise<any> {
  const res = await http.get("/receipts/summary/")
  return res.data
}