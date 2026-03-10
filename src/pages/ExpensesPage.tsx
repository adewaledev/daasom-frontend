import { useEffect, useMemo, useState } from "react"
import type { Job } from "../api/jobs"
import { listJobs } from "../api/jobs"
import type { Expense, ExpenseStatus } from "../api/expenses"
import { createExpense, deleteExpense, listExpenses, updateExpense } from "../api/expenses"

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
  if (status === "APPROVED") return `${base} bg-green-500/10 text-green-200 border-green-500/20`
  if (status === "SUBMITTED") return `${base} bg-blue-600/10 text-blue-200 border-blue-500/20`
  return `${base} bg-white/5 text-white/75 border-white/10` // DRAFT
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
  const [jobs, setJobs] = useState<Job[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [search, setSearch] = useState("")

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [showForm, setShowForm] = useState(false)

  const title = useMemo(() => (editing ? "Edit Expense" : "Create Expense"), [editing])

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
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
        await updateExpense(editing.id, payload)
        setInfo("Expense updated.")
      } else {
        await createExpense(payload)
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
    const ok = window.confirm("Delete this expense? This cannot be undone.")
    if (!ok) return

    setError("")
    setInfo("")
    try {
      await deleteExpense(x.id)
      setInfo("Expense deleted.")
      await refreshAll()
      window.setTimeout(() => setInfo(""), 1500)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to delete expense.")
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="text-blue-300">Expenses</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">Create and track expenses per job. Status: Draft → Submitted → Approved.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={showForm ? cancelEdit : startCreate}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            {showForm ? "Hide Form" : "Create Expense"}
          </button>

          <input
            className="w-64 bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses..."
          />

          <button
            type="button"
            onClick={refreshAll}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm ? (
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">{title}</h2>
          {editing ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-sm font-semibold text-white/70 hover:text-white transition"
            >
              Cancel
            </button>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error ? (
            <div className="text-sm bg-red-500/10 text-red-200 border border-red-500/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          ) : null}

          {info ? (
            <div className="text-sm bg-blue-600/10 text-blue-200 border border-blue-500/20 px-3 py-2 rounded-lg">
              {info}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-white/80 mb-1">Job</label>
              <select
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              <label className="block text-sm font-semibold text-white/80 mb-1">Status</label>
              <select
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              <label className="block text-sm font-semibold text-white/80 mb-1">Category</label>
              <select
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              <label className="block text-sm font-semibold text-white/80 mb-1">Amount</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              <label className="block text-sm font-semibold text-white/80 mb-1">Currency</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-white/80 mb-1">Description</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Expense Date</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                className="px-4 py-2 rounded-lg font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>
      ) : null}

      {/* List */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Expenses List</h2>
          <span className="text-sm text-white/60">{filteredExpenses.length} of {expenses.length}</span>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-white/60">Loading expenses...</div>
        ) : expenses.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No expenses yet.</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No expenses match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Job</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredExpenses.map((x) => {
                  const j = jobMap.get(String(x.job))
                  const jobLabel = j ? `${j.file_number} • ${j.zone}` : `Job ${String(x.job)}`

                  return (
                    <tr key={x.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-white/85">{jobLabel}</td>
                      <td className="px-4 py-3 text-white/90">{x.category}</td>
                      <td className="px-4 py-3 text-white/90">
                        {x.currency} {formatAmountWithCommas(String(x.amount ?? ""))}
                      </td>
                      <td className="px-4 py-3 text-white/80">{x.expense_date}</td>
                      <td className="px-4 py-3">
                        <span className={statusBadge(x.status)}>{x.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => startEdit(x)}
                            className="text-blue-300 hover:text-blue-200 font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(x)}
                            className="text-white/60 hover:text-red-200 font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}