import { useEffect, useMemo, useState } from "react"
import type { Job } from "../api/jobs"
import { listJobs } from "../api/jobs"
import type { Expense, ExpenseStatus } from "../api/expenses"
import { createExpense, deleteExpense, getExpenseTotals, listExpenses, updateExpense } from "../api/expenses"

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

export default function ExpensesPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [totals, setTotals] = useState<any>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm)

  const title = useMemo(() => (editing ? "Edit Expense" : "Create Expense"), [editing])

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>()
    for (const j of jobs) m.set(String(j.id), j)
    return m
  }, [jobs])

  async function refreshAll() {
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const [j, e, t] = await Promise.all([listJobs(), listExpenses(), getExpenseTotals().catch(() => null)])
      setJobs(j)
      setExpenses(e)
      setTotals(t)
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
    setEditing(x)
    setForm({
      job: String(x.job),
      category: x.category ?? "",
      description: x.description ?? "",
      amount: String(x.amount ?? ""),
      currency: x.currency ?? "NGN",
      expense_date: x.expense_date ?? "",
      status: x.status ?? "DRAFT",
    })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(emptyForm)
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
        amount: form.amount.trim(),
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

        <button
          type="button"
          onClick={refreshAll}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
        >
          Refresh
        </button>
      </div>

      {/* Totals (subtle) */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Expense Totals</div>
            <div className="text-xs text-white/60">From /api/expenses/totals/ (if available)</div>
          </div>
          <div className="text-sm text-white/70">
            {totals ? <pre className="text-xs text-white/70 whitespace-pre-wrap">{JSON.stringify(totals, null, 2)}</pre> : "—"}
          </div>
        </div>
      </section>

      {/* Form */}
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
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Terminal Charges"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Amount</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 25000.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Currency</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                placeholder="NGN"
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
                placeholder="Optional"
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

      {/* List */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Expenses List</h2>
          <span className="text-sm text-white/60">{expenses.length} total</span>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-white/60">Loading expenses...</div>
        ) : expenses.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No expenses yet.</div>
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
                {expenses.map((x) => {
                  const j = jobMap.get(String(x.job))
                  const jobLabel = j ? `${j.file_number} • ${j.zone}` : `Job ${String(x.job)}`

                  return (
                    <tr key={x.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-white/85">{jobLabel}</td>
                      <td className="px-4 py-3 text-white/90">{x.category}</td>
                      <td className="px-4 py-3 text-white/90">
                        {x.currency} {x.amount}
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