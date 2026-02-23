import http from "./http"

export interface InvoiceAddon {
  id: string
  invoice: string // Invoice UUID
  description: string
  amount: string
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

export function buildAddonPayload(input: Partial<InvoiceAddon>): Record<string, any> {
  const out: Record<string, any> = {}

  if (input.invoice !== undefined) out.invoice = String(input.invoice).trim()
  if (input.description !== undefined) out.description = String(input.description ?? "").trim()
  if (input.amount !== undefined) out.amount = String(input.amount ?? "").trim()

  return out
}

export async function listInvoiceAddons(params?: { invoice?: string }): Promise<InvoiceAddon[]> {
  const res = await http.get("/invoice-addons/", {
    params: params?.invoice ? { invoice: params.invoice } : undefined,
  })
  const data = res.data
  if (isPaginated<InvoiceAddon>(data)) return data.results
  return data as InvoiceAddon[]
}

export async function createInvoiceAddon(payload: Partial<InvoiceAddon>): Promise<InvoiceAddon> {
  const res = await http.post("/invoice-addons/", buildAddonPayload(payload))
  return res.data
}

export async function updateInvoiceAddon(id: string, payload: Partial<InvoiceAddon>): Promise<InvoiceAddon> {
  const res = await http.patch(`/invoice-addons/${id}/`, buildAddonPayload(payload))
  return res.data
}

export async function deleteInvoiceAddon(id: string): Promise<void> {
  await http.delete(`/invoice-addons/${id}/`)
}

export async function getAddonPaymentSummary(id: string): Promise<any> {
  const res = await http.get(`/invoice-addons/${id}/payment_summary/`)
  return res.data
}