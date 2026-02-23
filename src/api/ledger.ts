import http from "./http"

export type LedgerEntryType = "EXPENSE" | "RECEIPT"
export type LedgerDirection = "DEBIT" | "CREDIT"

export interface LedgerEntry {
  id: string

  entry_type: LedgerEntryType
  direction: LedgerDirection

  source_id: string

  job_id: string | null
  invoice_id: string | null

  description: string
  amount: string
  currency: string

  event_date: string // YYYY-MM-DD
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

export async function listLedger(params?: { job_id?: string }): Promise<LedgerEntry[]> {
  const res = await http.get("/ledger/", {
    params: params?.job_id ? { job_id: params.job_id } : undefined,
  })
  const data = res.data
  if (isPaginated<LedgerEntry>(data)) return data.results
  return data as LedgerEntry[]
}