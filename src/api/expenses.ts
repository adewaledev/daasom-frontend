import http from "./http"

export type ExpenseStatus = "DRAFT" | "SUBMITTED" | "APPROVED"

export interface Expense {
  id: string // UUID
  job: string // Job UUID (FK)

  category: string
  description: string
  amount: string // DecimalField typically comes as string
  currency: string

  expense_date: string // YYYY-MM-DD
  status: ExpenseStatus

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

function toDecimalString(v: unknown): string {
  const s = String(v ?? "").trim()
  return s
}

export function buildExpensePayload(input: Partial<Expense>): Record<string, any> {
  const out: Record<string, any> = {}

  if (input.job !== undefined) out.job = String(input.job).trim()

  if (input.category !== undefined) out.category = String(input.category ?? "").trim()
  if (input.description !== undefined) out.description = String(input.description ?? "").trim()

  if (input.amount !== undefined) out.amount = toDecimalString(input.amount)
  if (input.currency !== undefined) out.currency = String(input.currency ?? "").trim()

  if (input.expense_date !== undefined) out.expense_date = String(input.expense_date ?? "").trim()

  if (input.status !== undefined) out.status = input.status

  return out
}

export async function listExpenses(): Promise<Expense[]> {
  const res = await http.get("/expenses/")
  const data = res.data
  if (isPaginated<Expense>(data)) return data.results
  return data as Expense[]
}

export async function createExpense(payload: Partial<Expense>): Promise<Expense> {
  const res = await http.post("/expenses/", buildExpensePayload(payload))
  return res.data
}

export async function updateExpense(id: string, payload: Partial<Expense>): Promise<Expense> {
  const res = await http.patch(`/expenses/${id}/`, buildExpensePayload(payload))
  return res.data
}

export async function deleteExpense(id: string): Promise<void> {
  const cleanId = String(id ?? "").trim()
  if (!cleanId) throw new Error("Expense ID is required for delete.")

  try {
    await http.delete(`/expenses/${cleanId}/`)
  } catch (err: any) {
    const status = err?.response?.status
    // Some environments route delete endpoints without a trailing slash.
    if (status === 404 || status === 405) {
      await http.delete(`/expenses/${cleanId}`)
      return
    }
    throw err
  }
}

export async function getExpenseTotals(): Promise<any> {
  const res = await http.get("/expenses/totals/")
  return res.data
}