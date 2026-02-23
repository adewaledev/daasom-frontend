import http from "./http"

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID"

export interface InvoiceAddonNested {
  id: string
  invoice: string
  description: string
  amount: string
  created_at: string
}

export interface Invoice {
  id: string
  job: string // Job UUID

  invoice_number: string
  currency: string

  expenses_total: string
  addons_total: string
  grand_total: string

  status: InvoiceStatus
  issued_date: string | null
  due_date: string | null
  notes: string

  addons: InvoiceAddonNested[]

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

export function buildInvoicePayload(input: Partial<Invoice>): Record<string, any> {
  const out: Record<string, any> = {}

  if (input.job !== undefined) out.job = String(input.job).trim()
  if (input.invoice_number !== undefined) out.invoice_number = String(input.invoice_number ?? "").trim()
  if (input.currency !== undefined) out.currency = String(input.currency ?? "NGN").trim()

  if (input.issued_date !== undefined) out.issued_date = input.issued_date ? String(input.issued_date).trim() : null
  if (input.due_date !== undefined) out.due_date = input.due_date ? String(input.due_date).trim() : null

  if (input.notes !== undefined) out.notes = String(input.notes ?? "")

  // totals are read-only; status is controlled by actions (but allow patch if backend permits)
  if (input.status !== undefined) out.status = input.status

  return out
}

export async function listInvoices(): Promise<Invoice[]> {
  const res = await http.get("/invoices/")
  const data = res.data
  if (isPaginated<Invoice>(data)) return data.results
  return data as Invoice[]
}

export async function createInvoice(payload: Partial<Invoice>): Promise<Invoice> {
  const res = await http.post("/invoices/", buildInvoicePayload(payload))
  return res.data
}

export async function updateInvoice(id: string, payload: Partial<Invoice>): Promise<Invoice> {
  const res = await http.patch(`/invoices/${id}/`, buildInvoicePayload(payload))
  return res.data
}

export async function deleteInvoice(id: string): Promise<void> {
  await http.delete(`/invoices/${id}/`)
}

/** Invoice actions */
export async function issueInvoice(id: string): Promise<any> {
  const res = await http.post(`/invoices/${id}/issue/`)
  return res.data
}

export async function markInvoicePaid(id: string): Promise<any> {
  const res = await http.post(`/invoices/${id}/mark_paid/`)
  return res.data
}

export async function markInvoicePartial(id: string): Promise<any> {
  const res = await http.post(`/invoices/${id}/mark_partial/`)
  return res.data
}

export async function refreshInvoiceTotals(id: string): Promise<any> {
  const res = await http.post(`/invoices/${id}/refresh_totals/`)
  return res.data
}

export async function voidInvoice(id: string): Promise<any> {
  const res = await http.post(`/invoices/${id}/void/`)
  return res.data
}