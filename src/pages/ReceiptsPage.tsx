import { useEffect, useMemo, useState } from "react"
import type { Invoice } from "../api/invoices"
import { listInvoices, refreshInvoiceTotals } from "../api/invoices"
import type { Receipt } from "../api/receipts"
import { createReceipt, deleteReceipt, listReceipts, updateReceipt } from "../api/receipts"

type ReceiptForm = {
  invoice: string
  amount: string
  currency: string
  payment_date: string
  method: string
  reference: string
  notes: string
}

const emptyForm: ReceiptForm = {
  invoice: "",
  amount: "",
  currency: "NGN",
  payment_date: "",
  method: "",
  reference: "",
  notes: "",
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

function isDuplicateReferenceError(err: any): boolean {
  const data = err?.response?.data
  const ref = data?.reference
  if (!ref) return false
  if (Array.isArray(ref)) return ref.join(" ").toLowerCase().includes("duplicate reference")
  return String(ref).toLowerCase().includes("duplicate reference")
}

export default function ReceiptsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [editing, setEditing] = useState<Receipt | null>(null)
  const [form, setForm] = useState<ReceiptForm>(emptyForm)

  const invoiceMap = useMemo(() => {
    const m = new Map<string, Invoice>()
    for (const inv of invoices) m.set(String(inv.id), inv)
    return m
  }, [invoices])

  const title = useMemo(() => (editing ? "Edit Receipt" : "Create Receipt"), [editing])

  async function refreshAll() {
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const [inv, r] = await Promise.all([listInvoices(), listReceipts()])
      setInvoices(inv)
      setReceipts(r)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load receipts.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  function startEdit(x: Receipt) {
    setEditing(x)
    setForm({
      invoice: String(x.invoice),
      amount: String(x.amount ?? ""),
      currency: x.currency ?? "NGN",
      payment_date: x.payment_date ?? "",
      method: x.method ?? "",
      reference: x.reference ?? "",
      notes: x.notes ?? "",
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
      if (!form.invoice.trim()) {
        setError("Invoice is required.")
        return
      }
      if (!form.amount.trim()) {
        setError("Amount is required.")
        return
      }
      if (!form.payment_date.trim()) {
        setError("Payment date is required.")
        return
      }

      const payload: Partial<Receipt> = {
        invoice: form.invoice.trim(),
        amount: form.amount.trim(),
        currency: (form.currency || "NGN").trim(),
        payment_date: form.payment_date,
        method: form.method,
        reference: form.reference,
        notes: form.notes,
      }

      if (editing) {
        await updateReceipt(editing.id, payload)
        setInfo("Receipt updated.")
      } else {
        await createReceipt(payload)
        setInfo("Receipt created.")
      }

      await refreshInvoiceTotals(form.invoice.trim()).catch(() => null)

      cancelEdit()
      await refreshAll()
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      if (isDuplicateReferenceError(err)) {
        setError("Duplicate reference for this invoice.")
      } else {
        setError(extractErrorMessage(err) || "Failed to save receipt.")
      }
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(x: Receipt) {
    const ok = window.confirm("Delete this receipt? This cannot be undone.")
    if (!ok) return

    setError("")
    setInfo("")
    try {
      await deleteReceipt(x.id)
      await refreshInvoiceTotals(String(x.invoice)).catch(() => null)
      setInfo("Receipt deleted.")
      await refreshAll()
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to delete receipt.")
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-blue-300">Receipts</h1>
          <p className="mt-1 text-sm text-white/60">Record payments against invoices.</p>
        </div>

        <button
          type="button"
          onClick={refreshAll}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="text-sm bg-red-500/10 text-red-200 border border-red-500/20 px-3 py-2 rounded-lg">{error}</div>
      ) : null}

      {info ? (
        <div className="text-sm bg-blue-600/10 text-blue-200 border border-blue-500/20 px-3 py-2 rounded-lg">{info}</div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">{title}</h2>
          {editing ? (
            <button type="button" onClick={cancelEdit} className="text-sm font-semibold text-white/70 hover:text-white transition">
              Cancel
            </button>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-white/80 mb-1">Invoice</label>
              <select
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.invoice}
                onChange={(e) => setForm((f) => ({ ...f, invoice: e.target.value }))}
                required
              >
                <option value="">Select invoice</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={String(inv.id)}>
                    {inv.invoice_number} — {inv.currency} {inv.grand_total} — {inv.status}
                  </option>
                ))}
              </select>
              {form.invoice ? (
                <div className="mt-1 text-xs text-white/55">
                  {(() => {
                    const inv = invoiceMap.get(String(form.invoice))
                    return inv ? `${inv.invoice_number} • ${inv.currency} ${inv.grand_total}` : ""
                  })()}
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Payment Date</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Amount</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="50000.00"
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

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Method</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                placeholder="transfer"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Reference</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white/80 mb-1">Notes</label>
            <input
              className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? "Saving..." : editing ? "Update Receipt" : "Create Receipt"}
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

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Receipts</h2>
          <span className="text-sm text-white/60">{receipts.length}</span>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-white/60">Loading...</div>
        ) : receipts.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No receipts.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Method</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Reference</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Actions</th>
                </tr>
              </thead>

              <tbody>
                {receipts.map((r) => {
                  const inv = invoiceMap.get(String(r.invoice))
                  return (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-white/85">{inv ? inv.invoice_number : String(r.invoice)}</td>
                      <td className="px-4 py-3 text-white/90">
                        {r.currency} {r.amount}
                      </td>
                      <td className="px-4 py-3 text-white/80">{r.payment_date}</td>
                      <td className="px-4 py-3 text-white/80">{r.method || ""}</td>
                      <td className="px-4 py-3 text-white/80">{r.reference || ""}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button type="button" onClick={() => startEdit(r)} className="text-blue-300 hover:text-blue-200 font-semibold">
                            Edit
                          </button>
                          <button type="button" onClick={() => onDelete(r)} className="text-white/60 hover:text-red-200 font-semibold">
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