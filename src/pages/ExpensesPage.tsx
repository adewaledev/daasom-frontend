import { useEffect, useMemo, useState } from "react"
import type { Job } from "../api/jobs"
import { listJobs } from "../api/jobs"
import type { Expense, ExpenseStatus } from "../api/expenses"
import { createExpense, deleteExpense, listExpenses, updateExpense } from "../api/expenses"
import { listInvoices, refreshInvoiceTotals } from "../api/invoices"
import PaginationControls from "../components/PaginationControls"
import { useAuth } from "../state/auth"

type ExpenseForm = {
  job: string
  category: string
  description: string
  amount: string
  currency: string
  expense_date: string
  status: ExpenseStatus
}

const emptyForm: ExpenseForm = {
  job: "",
  category: "",
  description: "",
  amount: "",
  currency: "NGN",
  expense_date: "",
  status: "DRAFT",
}

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

function statusBadge(status: ExpenseStatus) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border"
  if (status === "APPROVED") return `${base} bg-green-50 text-green-700 border-green-200`
  if (status === "SUBMITTED") return `${base} bg-blue-50 text-blue-700 border-blue-200`
  return `${base} bg-white text-slate-700 border-slate-200` // DRAFT
}

function formatAmountWithCommas(value: string): string {
  const normalized = String(value ?? "").replace(/,/g, "").trim()
  if (!normalized) return ""

  const isNegative = normalized.startsWith("-")
  const unsigned = isNegative ? normalized.slice(1) : normalized
  const hasDecimal = unsigned.includes(".")
  const [integerPartRaw, ...decimalParts] = unsigned.split(".")

  const integerDigits = integerPartRaw.replace(/\D/g, "")
  const decimalDigits = decimalParts.join("").replace(/\D/g, "")

  if (!integerDigits && !decimalDigits) return ""

  const formattedInteger = (integerDigits || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const sign = isNegative ? "-" : ""

  if (!hasDecimal) return `${sign}${formattedInteger}`
  return `${sign}${formattedInteger}.${decimalDigits}`
}

function normalizeAmountForSubmit(value: string): string {
  return String(value ?? "").replace(/,/g, "").trim()
}

function includesQuery(parts: Array<string | undefined | null>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return parts.some((part) => String(part ?? "").toLowerCase().includes(q))
}

export default function ExpensesPage() {
  const { can, roleLabel } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [search, setSearch] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showExpenseList, setShowExpenseList] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [showForm, setShowForm] = useState(false)

  const title = useMemo(() => (editing ? "Edit Expense" : "Create Expense"), [editing])
  const canWriteExpenses = can("expenses.write")

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>()
    for (const j of jobs) m.set(String(j.id), j)
    return m
  }, [jobs])

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return expenses

    return expenses.filter((x) => {
      const j = jobMap.get(String(x.job))
      return includesQuery(
        [
          j?.file_number,
          j?.zone,
          x.category,
          x.description,
          x.currency,
          formatAmountWithCommas(String(x.amount ?? "")),
          x.expense_date,
          x.status,
        ],
        q,
      )
    })
  }, [expenses, jobMap, search])

  const searchSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []

    const suggestions: string[] = []
    const seen = new Set<string>()

    for (const x of expenses) {
      const j = jobMap.get(String(x.job))
      const candidates = [
        j?.file_number,
        j ? `${j.file_number} — ${j.zone}` : null,
        x.category,
        x.description,
        x.status,
        x.expense_date,
        formatAmountWithCommas(String(x.amount ?? "")),
      ]

      for (const candidate of candidates) {
        const value = String(candidate ?? "").trim()
        if (!value) continue
        if (!value.toLowerCase().includes(q)) continue

        const key = value.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        suggestions.push(value)

        if (suggestions.length >= 10) return suggestions
      }
    }

    return suggestions
  }, [expenses, jobMap, search])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredExpenses.length / itemsPerPage))
  }, [filteredExpenses.length, itemsPerPage])

  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredExpenses.slice(start, start + itemsPerPage)
  }, [filteredExpenses, currentPage, itemsPerPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [search])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  async function refreshAll() {
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const [j, e] = await Promise.all([listJobs(), listExpenses()])
      setJobs(j)
      setExpenses(e)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load expenses.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  function startEdit(x: Expense) {
    setShowForm(true)
    setEditing(x)
    setForm({
      job: String(x.job),
      category: x.category ?? "",
      description: x.description ?? "",
      amount: formatAmountWithCommas(String(x.amount ?? "")),
      currency: x.currency ?? "NGN",
      expense_date: x.expense_date ?? "",
      status: x.status ?? "DRAFT",
    })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(false)
  }

  function startCreate() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  async function refreshInvoiceTotalsForJob(jobId: string) {
    const cleanJobId = String(jobId).trim()
    if (!cleanJobId) return

    try {
      const invoices = await listInvoices()
      const invoice = invoices.find((inv) => String(inv.job) === cleanJobId)
      if (!invoice?.id) return
      await refreshInvoiceTotals(invoice.id)
    } catch {
      // Ignore totals sync failure; expense CRUD success should still be preserved.
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canWriteExpenses) {
      setError(`${roleLabel} role has view-only access to expenses.`)
      return
    }
    setError("")
    setInfo("")
    setSaving(true)

    try {
      if (!form.job.trim()) {
        setError("Job is required.")
        return
      }
      if (!form.category.trim()) {
        setError("Category is required.")
        return
      }
      if (!form.amount.trim()) {
        setError("Amount is required.")
        return
      }
      if (!form.expense_date.trim()) {
        setError("Expense date is required.")
        return
      }

      const payload: Partial<Expense> = {
        job: form.job.trim(),
        category: form.category.trim(),
        description: form.description,
        amount: normalizeAmountForSubmit(form.amount),
        currency: (form.currency || "NGN").trim(),
        expense_date: form.expense_date,
        status: form.status,
      }

      if (editing) {
        const previousJobId = String(editing.job)
        await updateExpense(editing.id, payload)
        await refreshInvoiceTotalsForJob(previousJobId)
        if (previousJobId !== payload.job) {
          await refreshInvoiceTotalsForJob(String(payload.job))
        }
        setInfo("Expense updated.")
      } else {
        await createExpense(payload)
        await refreshInvoiceTotalsForJob(String(payload.job))
        setInfo("Expense created.")
      }

      cancelEdit()
      await refreshAll()
      window.setTimeout(() => setInfo(""), 1500)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to save expense.")
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(x: Expense) {
    if (!canWriteExpenses) {
      setError(`${roleLabel} role has view-only access to expenses.`)
      return
    }
    const ok = window.confirm("Delete this expense? This cannot be undone.")
    if (!ok) return

    setError("")
    setInfo("")
    try {
      const expenseId = String((x as any).id ?? (x as any).expense_id ?? "").trim()
      if (!expenseId) {
        setError("Expense ID is missing. Please refresh and try again.")
        return
      }
      const jobId = String(x.job)
      await deleteExpense(expenseId)
      await refreshInvoiceTotalsForJob(jobId)
      setInfo("Expense deleted.")
      await refreshAll()
      window.setTimeout(() => setInfo(""), 1500)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to delete expense.")
    }
  }

  return (
    <div className="space-y-6 text-slate-800">
      <div>
        <h1 className="text-2xl font-semibold">
          <span className="text-blue-700">Expenses</span>
        </h1>
        <p className="mt-1 text-sm text-slate-600">Create and track expenses per job. Status: Draft → Submitted → Approved.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur p-4 space-y-3">
        <div className="relative w-full md:max-w-xl">
          <input
            className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search expenses..."
          />

          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch("")
                setShowSuggestions(false)
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition"
              aria-label="Clear expense search"
            >
              ×
            </button>
          ) : null}

          {showSuggestions && searchSuggestions.length > 0 ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
              {searchSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setSearch(suggestion)
                    setShowSuggestions(false)
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 transition"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWriteExpenses ? (
            <button
              type="button"
              onClick={showForm ? cancelEdit : startCreate}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              {showForm ? "Hide Form" : "Create Expense"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setShowExpenseList((v) => !v)}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
          >
            {showExpenseList ? "Hide Expense List" : "Show Expense List"}
          </button>

          <button
            type="button"
            onClick={refreshAll}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
          >
            Refresh
          </button>
        </div>
      </section>

      {!canWriteExpenses ? (
        <div className="text-sm bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg">
          Signed in as {roleLabel}. Expenses are view-only for this role.
        </div>
      ) : null}

      {/* Form */}
      {showForm && canWriteExpenses ? (
        <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {editing ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm font-semibold text-slate-700 hover:text-slate-900 transition"
              >
                Cancel
              </button>
            ) : null}
          </div>

          <form onSubmit={onSubmit} className="p-5 space-y-4">
            {error ? (
              <div className="text-sm bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg">
                {error}
              </div>
            ) : null}

            {info ? (
              <div className="text-sm bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg">
                {info}
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Job</label>
                <select
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.job}
                  onChange={(e) => setForm((f) => ({ ...f, job: e.target.value }))}
                  required
                >
                  <option value="">Select job…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={String(j.id)}>
                      {j.file_number} — {j.zone}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
                <select
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ExpenseStatus }))}
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="SUBMITTED">SUBMITTED</option>
                  <option value="APPROVED">APPROVED</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                <select
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  required
                >
                  <option value="">Select category…</option>
                  <option>Operational Expenses</option>
                  <option>Terminal Charges</option>
                  <option>Shipping Charges</option>
                  <option>NAHCO Charge</option>
                  <option>SAHCO Charge</option>
                  <option>FAAN Charge</option>
                  <option>Consol Charge</option>
                  <option>SSS Unblocking</option>
                  <option>NDLEA Unblocking</option>
                  <option>FOU</option>
                  <option>Cover Letter</option>
                  <option>Road Expenses</option>
                  <option>Gate OC Terminal</option>
                  <option>Compliance DC Custom</option>
                  <option>Enforcement</option>
                  <option>TDO</option>
                  <option>Express Invoice/Receipt</option>
                  <option>Releasing</option>
                  <option>Pallets</option>
                  <option>NAFDAC/Endorsement</option>
                  <option>Escort Officer</option>
                  <option>Transportation</option>
                  <option>Change of nature</option>
                  <option>Change of Terminal Code</option>
                  <option>Demmurage</option>
                  <option>Truck Parking</option>
                  <option>Convey Officer</option>
                  <option>Reroute</option>
                  <option>PR</option>
                  <option>Bond</option>
                  <option>Merging</option>
                  <option>MST</option>
                  <option>Manifest Unlock</option>
                  <option>Abandoned Manifest</option>
                  <option>Miscellaneous</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Amount</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      amount: formatAmountWithCommas(e.target.value),
                    }))
                  }
                  inputMode="decimal"
                  placeholder="e.g. 250,000"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Currency</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Expense Date</label>
                <input
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-60"
              >
                {saving ? "Saving..." : editing ? "Update Expense" : "Create Expense"}
              </button>

              {editing ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2 rounded-lg font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {/* List */}
      <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Expenses List</h2>
          <span className="text-sm text-slate-600">
            {showExpenseList ? `${filteredExpenses.length} of ${expenses.length}` : `Hidden • ${expenses.length} total`}
          </span>
        </div>

        {!showExpenseList ? (
          <div className="p-5 text-sm text-slate-600">Expense list is hidden. Click "Show Expense List" to view entries.</div>
        ) : loading ? (
          <div className="p-5 text-sm text-slate-600">Loading expenses...</div>
        ) : expenses.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">No expenses yet.</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">No expenses match your search.</div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {paginatedExpenses.map((x) => {
                const j = jobMap.get(String(x.job))
                const jobLabel = j ? `${j.file_number} • ${j.zone}` : `Job ${String(x.job)}`
                return (
                  <div key={x.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{x.category}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{jobLabel}</div>
                        <div className="text-xs text-slate-600 mt-1">{x.expense_date}</div>
                      </div>
                      <span className={statusBadge(x.status)}>{x.status}</span>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{x.currency} {formatAmountWithCommas(String(x.amount ?? ""))}</div>
                    <div className="mt-3 flex items-center justify-end gap-3 text-sm font-semibold">
                      {canWriteExpenses ? (
                        <>
                          <button type="button" onClick={() => startEdit(x)} className="text-blue-700 hover:text-blue-800">Edit</button>
                          <button type="button" onClick={() => onDelete(x)} className="text-slate-600 hover:text-red-700">Delete</button>
                        </>
                      ) : <span className="text-slate-500">View only</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden sm:block overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <table className="min-w-[720px] w-full text-xs sm:text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Job</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedExpenses.map((x) => {
                    const j = jobMap.get(String(x.job))
                    const jobLabel = j ? `${j.file_number} • ${j.zone}` : `Job ${String(x.job)}`

                    return (
                      <tr key={x.id} className="border-b border-slate-100 hover:bg-white transition">
                        <td className="px-4 py-3 text-slate-800">{jobLabel}</td>
                        <td className="px-4 py-3 text-slate-900">{x.category}</td>
                        <td className="px-4 py-3 text-slate-900">
                          {x.currency} {formatAmountWithCommas(String(x.amount ?? ""))}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{x.expense_date}</td>
                        <td className="px-4 py-3">
                          <span className={statusBadge(x.status)}>{x.status}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-3">
                            {canWriteExpenses ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEdit(x)}
                                  className="text-blue-700 hover:text-blue-800 font-semibold"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDelete(x)}
                                  className="text-slate-600 hover:text-red-700 font-semibold"
                                >
                                  Delete
                                </button>
                              </>
                            ) : <span className="text-slate-500">View only</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredExpenses.length}
              itemsPerPage={itemsPerPage}
              onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
              onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            />
          </>
        )}
      </section>
    </div>
  )
}