import { useEffect, useMemo, useState } from "react"
import type { Job } from "../api/jobs"
import { listJobs } from "../api/jobs"
import type { Invoice, InvoiceStatus } from "../api/invoices"
import {
  createInvoice,
  deleteInvoice,
  issueInvoice,
  listInvoices,
  markInvoicePaid,
  markInvoicePartial,
  refreshInvoiceTotals,
  updateInvoice,
  voidInvoice,
} from "../api/invoices"

type InvoiceForm = {
  job: string
  invoice_number: string
  currency: string
  issued_date: string
  due_date: string
  notes: string
  invoice_amount: string
  breakdown: string
}

const emptyForm: InvoiceForm = {
  job: "",
  invoice_number: "",
  currency: "NGN",
  issued_date: "",
  due_date: "",
  notes: "",
  invoice_amount: "",
  breakdown: "",
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

function statusBadge(status: InvoiceStatus) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border"
  if (status === "PAID") return `${base} bg-green-500/10 text-green-200 border-green-500/20`
  if (status === "PARTIALLY_PAID") return `${base} bg-amber-500/10 text-amber-200 border-amber-500/20`
  if (status === "ISSUED") return `${base} bg-blue-600/10 text-blue-200 border-blue-500/20`
  if (status === "VOID") return `${base} bg-white/5 text-white/60 border-white/10`
  return `${base} bg-white/5 text-white/80 border-white/10` // DRAFT
}

function canEditInvoiceFields(status: InvoiceStatus) {
  // Keep simple: allow edits only in DRAFT
  return status === "DRAFT"
}

function generateInvoiceNumber(fileNumber: string) {
  const normalizedFileNumber = fileNumber.trim()
  if (!normalizedFileNumber) return ""

  const randomSuffix = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")

  return `${normalizedFileNumber}${randomSuffix}`
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

export default function InvoicesPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [search, setSearch] = useState("")

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)

  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [editing, setEditing] = useState<Invoice | null>(null)
  const [form, setForm] = useState<InvoiceForm>(emptyForm)
  const [showForm, setShowForm] = useState(false)

  const title = useMemo(() => (editing ? "Edit Invoice" : "Create Invoice"), [editing])

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>()
    for (const j of jobs) m.set(String(j.id), j)
    return m
  }, [jobs])

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices

    return invoices.filter((x) => {
      const j = jobMap.get(String(x.job))
      return includesQuery(
        [
          x.invoice_number,
          x.status,
          x.currency,
          formatAmountWithCommas(String(x.invoice_amount || x.grand_total || "")),
          x.breakdown,
          x.notes,
          j?.file_number,
          j?.zone,
        ],
        q,
      )
    })
  }, [invoices, jobMap, search])

  async function refreshAll() {
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const [j, inv] = await Promise.all([listJobs(), listInvoices()])
      setJobs(j)
      setInvoices(inv)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load invoices.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function jobLabel(jobId: string) {
    const j = jobMap.get(String(jobId))
    return j ? `${j.file_number} • ${j.zone}` : `Job ${String(jobId)}`
  }

  function startEdit(x: Invoice) {
    setShowForm(true)
    setEditing(x)
    setForm({
      job: String(x.job),
      invoice_number: x.invoice_number ?? "",
      currency: x.currency ?? "NGN",
      issued_date: x.issued_date ?? "",
      due_date: x.due_date ?? "",
      notes: x.notes ?? "",
      invoice_amount: formatAmountWithCommas(x.invoice_amount || x.grand_total || ""),
      breakdown: x.breakdown ?? "",
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

  function handleJobChange(jobId: string) {
    const selectedJob = jobMap.get(jobId)

    setForm((currentForm) => ({
      ...currentForm,
      job: jobId,
      invoice_number: selectedJob ? generateInvoiceNumber(selectedJob.file_number) : "",
    }))
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
      if (!form.invoice_number.trim()) {
        setError("Invoice number is required.")
        return
      }
      const normalizedInvoiceAmount = normalizeAmountForSubmit(form.invoice_amount)
      if (!normalizedInvoiceAmount) {
        setError("Invoice amount is required.")
        return
      }

      const payload: Partial<Invoice> = {
        job: form.job.trim(),
        invoice_number: form.invoice_number.trim(),
        currency: (form.currency || "NGN").trim(),
        invoice_amount: normalizedInvoiceAmount,
      }

      if (form.issued_date.trim()) payload.issued_date = form.issued_date.trim()
      if (form.due_date.trim()) payload.due_date = form.due_date.trim()
      if (form.notes.trim()) payload.notes = form.notes.trim()
      if (form.breakdown.trim()) payload.breakdown = form.breakdown.trim()

      if (editing) {
        // Only allow editing invoice fields in DRAFT to avoid weird state drift
        if (!canEditInvoiceFields(editing.status)) {
          setError("Only DRAFT invoices can be edited.")
          return
        }
        await updateInvoice(editing.id, payload)
        setInfo("Invoice updated.")
      } else {
        await createInvoice(payload)
        setInfo("Invoice created.")
      }

      cancelEdit()
      await refreshAll()
      window.setTimeout(() => setInfo(""), 1500)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to save invoice.")
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(x: Invoice) {
    const ok = window.confirm("Delete this invoice? This cannot be undone.")
    if (!ok) return

    setError("")
    setInfo("")
    try {
      await deleteInvoice(x.id)
      setInfo("Invoice deleted.")
      await refreshAll()
      window.setTimeout(() => setInfo(""), 1500)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to delete invoice.")
    }
  }

  async function runAction(id: string, action: () => Promise<any>, label: string) {
    setError("")
    setInfo("")
    setBusyActionId(id)
    try {
      await action()
      setInfo(label)
      await refreshAll()
      window.setTimeout(() => setInfo(""), 1500)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Action failed.")
    } finally {
      setBusyActionId(null)
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="text-blue-300">Invoices</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">
            One invoice per job. Use actions to issue, mark paid/partial, refresh totals, or void.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={showForm ? cancelEdit : startCreate}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            {showForm ? "Hide Form" : "Create Invoice"}
          </button>

          <input
            className="w-64 bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoices..."
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

      {/* Alerts */}
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
            {editing && !canEditInvoiceFields(editing.status) ? (
              <div className="text-sm bg-amber-500/10 text-amber-200 border border-amber-500/20 px-3 py-2 rounded-lg">
                This invoice is <span className="font-semibold">{editing.status}</span>. Only DRAFT invoices can be edited.
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-white/80 mb-1">Job</label>
                <select
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                  value={form.job}
                  onChange={(e) => handleJobChange(e.target.value)}
                  required
                  disabled={!!editing} // can't change job on edit (OneToOne)
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
                <label className="block text-sm font-semibold text-white/80 mb-1">Currency</label>
                <input
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-white/80 mb-1">Invoice Number</label>
                <input
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={form.invoice_number}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
                  required
                  disabled={!!editing && !canEditInvoiceFields(editing.status)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/80 mb-1">Issued Date</label>
                <input
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  type="date"
                  value={form.issued_date}
                  onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))}
                  disabled={!!editing && !canEditInvoiceFields(editing.status)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/80 mb-1">Due Date</label>
                <input
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  disabled={!!editing && !canEditInvoiceFields(editing.status)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Notes</label>
              <textarea
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 min-h-[88px]"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                disabled={!!editing && !canEditInvoiceFields(editing.status)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-white/80 mb-1">Invoice Amount</label>
                <input
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={form.invoice_amount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      invoice_amount: formatAmountWithCommas(e.target.value),
                    }))
                  }
                  inputMode="decimal"
                  placeholder="e.g. 500,000"
                  required
                  disabled={!!editing && !canEditInvoiceFields(editing.status)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/80 mb-1">Breakdown <span className="text-white/40 font-normal">(optional)</span></label>
                <textarea
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 min-h-[88px]"
                  value={form.breakdown}
                  onChange={(e) => setForm((f) => ({ ...f, breakdown: e.target.value }))}
                  placeholder="e.g. Clearing: 300,000 | Transport: 200,000"
                  disabled={!!editing && !canEditInvoiceFields(editing.status)}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || (!!editing && !canEditInvoiceFields(editing.status))}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-60"
              >
                {saving ? "Saving..." : editing ? "Update Invoice" : "Create Invoice"}
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
          <h2 className="font-semibold text-white">Invoices List</h2>
          <span className="text-sm text-white/60">{filteredInvoices.length} of {invoices.length}</span>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-white/60">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No invoices yet.</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No invoices match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Job</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredInvoices.map((x) => {
                  const isBusy = busyActionId === x.id

                  return (
                    <tr key={x.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-white/90 font-semibold">{x.invoice_number}</td>
                      <td className="px-4 py-3 text-white/80">{jobLabel(String(x.job))}</td>
                      <td className="px-4 py-3 text-white/80">
                        <div className="text-sm font-semibold text-white/90">
                          {x.currency}{" "}
                          {x.invoice_amount || x.grand_total
                            ? formatAmountWithCommas(String(x.invoice_amount || x.grand_total || ""))
                            : "—"}
                        </div>
                        {x.breakdown ? (
                          <div className="text-xs text-white/50 mt-0.5 max-w-xs truncate">{x.breakdown}</div>
                        ) : null}
                      </td>
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

                          <div className="hidden md:inline-flex items-center gap-2 ml-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAction(x.id, () => refreshInvoiceTotals(x.id), "Totals refreshed.")}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60"
                            >
                              Refresh
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAction(x.id, () => issueInvoice(x.id), "Invoice issued.")}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60"
                            >
                              Issue
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAction(x.id, () => markInvoicePartial(x.id), "Marked partially paid.")}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60"
                            >
                              Partial
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAction(x.id, () => markInvoicePaid(x.id), "Marked paid.")}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60"
                            >
                              Paid
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAction(x.id, () => voidInvoice(x.id), "Invoice voided.")}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60"
                            >
                              Void
                            </button>
                          </div>
                        </div>

                        {isBusy ? <div className="text-xs text-white/50 mt-2">Working…</div> : null}
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