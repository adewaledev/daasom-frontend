import { useEffect, useMemo, useState } from "react"
import type { Invoice } from "../api/invoices"
import { listInvoices, markInvoicePaid, markInvoicePartial, refreshInvoiceTotals, updateInvoice } from "../api/invoices"
import type { Receipt } from "../api/receipts"
import { createReceipt, deleteReceipt, listReceipts, updateReceipt } from "../api/receipts"
import PaginationControls from "../components/PaginationControls"
import { useAuth } from "../state/auth"
import { nextInvoiceStatusFromReceipts } from "./receiptStatus"

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

function toAmountNumber(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim())
  return Number.isFinite(n) ? n : 0
}

function getExpectedInvoiceTotal(inv: Invoice): number {
  const invoiceAmount = toAmountNumber(inv.invoice_amount)
  if (invoiceAmount > 0) return invoiceAmount
  return toAmountNumber(inv.grand_total)
}

function includesQuery(parts: Array<string | undefined | null>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return parts.some((part) => String(part ?? "").toLowerCase().includes(q))
}

export default function ReceiptsPage() {
  const { can, roleLabel } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [search, setSearch] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showReceiptList, setShowReceiptList] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [editing, setEditing] = useState<Receipt | null>(null)
  const [form, setForm] = useState<ReceiptForm>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [invoiceSearch, setInvoiceSearch] = useState("")
  const canWriteReceipts = can("receipts.write")

  const invoiceMap = useMemo(() => {
    const m = new Map<string, Invoice>()
    for (const inv of invoices) m.set(String(inv.id), inv)
    return m
  }, [invoices])

  const title = useMemo(() => (editing ? "Edit Receipt" : "Create Receipt"), [editing])

  const paidTotalsByInvoice = useMemo(() => {
    const totals = new Map<string, number>()
    for (const receipt of receipts) {
      const invoiceId = String(receipt.invoice)
      totals.set(invoiceId, (totals.get(invoiceId) ?? 0) + toAmountNumber(receipt.amount))
    }
    return totals
  }, [receipts])

  function getInvoiceBalance(inv: Invoice): number {
    const expected = getExpectedInvoiceTotal(inv)
    const paid = paidTotalsByInvoice.get(String(inv.id)) ?? 0
    return Math.max(expected - paid, 0)
  }

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return receipts

    return receipts.filter((r) => {
      const inv = invoiceMap.get(String(r.invoice))
      return includesQuery(
        [
          inv?.invoice_number,
          r.currency,
          formatAmountWithCommas(String(r.amount ?? "")),
          r.payment_date,
          r.method,
          r.reference,
          r.notes,
        ],
        q,
      )
    })
  }, [invoiceMap, receipts, search])

  function invoiceOptionLabel(inv: Invoice): string {
    return `${inv.invoice_number} — ${inv.currency} ${formatAmountWithCommas(String(getExpectedInvoiceTotal(inv)))} — ${inv.status}`
  }

  const filteredInvoiceOptions = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter((inv) => {
      const label = invoiceOptionLabel(inv).toLowerCase()
      const number = String(inv.invoice_number ?? "").toLowerCase()
      const status = String(inv.status ?? "").toLowerCase()
      return label.includes(q) || number.includes(q) || status.includes(q)
    })
  }, [invoiceSearch, invoices])

  const searchSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []

    const suggestions: string[] = []
    const seen = new Set<string>()

    for (const r of receipts) {
      const inv = invoiceMap.get(String(r.invoice))
      const candidates = [
        inv?.invoice_number,
        r.currency,
        formatAmountWithCommas(String(r.amount ?? "")),
        r.payment_date,
        r.method,
        r.reference,
        r.notes,
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
  }, [receipts, invoiceMap, search])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredReceipts.length / itemsPerPage))
  }, [filteredReceipts.length, itemsPerPage])

  const paginatedReceipts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredReceipts.slice(start, start + itemsPerPage)
  }, [filteredReceipts, currentPage, itemsPerPage])

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
    const selectedInvoice = invoiceMap.get(String(x.invoice))
    setShowForm(true)
    setEditing(x)
    setInvoiceSearch(selectedInvoice ? invoiceOptionLabel(selectedInvoice) : "")
    setForm({
      invoice: String(x.invoice),
      amount: formatAmountWithCommas(String(x.amount ?? "")),
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
    setShowForm(false)
  }

  function startCreate() {
    setEditing(null)
    setForm(emptyForm)
    setInvoiceSearch("")
    setShowForm(true)
  }

  function handleInvoiceSearchChange(value: string) {
    setInvoiceSearch(value)

    const exactMatch = invoices.find((inv) => {
      const label = invoiceOptionLabel(inv).toLowerCase()
      const number = String(inv.invoice_number ?? "").toLowerCase()
      const v = value.trim().toLowerCase()
      return label === v || number === v
    })

    setForm((f) => ({ ...f, invoice: exactMatch ? String(exactMatch.id) : "" }))
  }

  async function syncInvoiceStatusFromReceipts(invoiceId: string) {
    const cleanInvoiceId = String(invoiceId).trim()
    if (!cleanInvoiceId) return

    await refreshInvoiceTotals(cleanInvoiceId).catch(() => null)

    const [latestInvoices, latestReceipts] = await Promise.all([listInvoices(), listReceipts()])
    const targetInvoice = latestInvoices.find((inv) => String(inv.id) === cleanInvoiceId)
    if (!targetInvoice) return

    const paidTotal = latestReceipts
      .filter((receipt) => String(receipt.invoice) === cleanInvoiceId)
      .reduce((sum, receipt) => sum + toAmountNumber(receipt.amount), 0)

    const expectedTotal = getExpectedInvoiceTotal(targetInvoice)

    const nextStatus = nextInvoiceStatusFromReceipts(expectedTotal, paidTotal)
    if (nextStatus === "DRAFT") {
      if (targetInvoice.status !== "DRAFT") {
        await updateInvoice(cleanInvoiceId, { status: "DRAFT" })
      }
      return
    }

    if (nextStatus === "PAID") {
      await markInvoicePaid(cleanInvoiceId)
      return
    }

    await markInvoicePartial(cleanInvoiceId)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canWriteReceipts) {
      setError(`${roleLabel} role has view-only access to receipts.`)
      return
    }
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
        amount: normalizeAmountForSubmit(form.amount),
        currency: (form.currency || "NGN").trim(),
        payment_date: form.payment_date,
        method: form.method,
        reference: form.reference,
        notes: form.notes,
      }

      if (editing) {
        const previousInvoiceId = String(editing.invoice)
        await updateReceipt(editing.id, payload)
        await syncInvoiceStatusFromReceipts(previousInvoiceId)
        if (previousInvoiceId !== payload.invoice) {
          await syncInvoiceStatusFromReceipts(String(payload.invoice))
        }
        setInfo("Receipt updated.")
      } else {
        await createReceipt(payload)
        await syncInvoiceStatusFromReceipts(String(payload.invoice))
        setInfo("Receipt created.")
      }

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
    if (!canWriteReceipts) {
      setError(`${roleLabel} role has view-only access to receipts.`)
      return
    }
    const ok = window.confirm("Delete this receipt? This cannot be undone.")
    if (!ok) return

    setError("")
    setInfo("")
    try {
      const invoiceId = String(x.invoice)
      await deleteReceipt(x.id)
      await syncInvoiceStatusFromReceipts(invoiceId)
      setInfo("Receipt deleted.")
      await refreshAll()
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to delete receipt.")
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="text-2xl font-semibold text-blue-300">Receipts</h1>
        <p className="mt-1 text-sm text-white/60">Record payments against invoices.</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 space-y-3">
        <div className="relative w-full md:max-w-xl">
          <input
            className="w-full bg-black/40 text-white border border-white/10 rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search receipts..."
          />

          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch("")
                setShowSuggestions(false)
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition"
              aria-label="Clear receipt search"
            >
              ×
            </button>
          ) : null}

          {showSuggestions && searchSuggestions.length > 0 ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-black/95 shadow-xl">
              {searchSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setSearch(suggestion)
                    setShowSuggestions(false)
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10 transition"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWriteReceipts ? (
            <button
              type="button"
              onClick={showForm ? cancelEdit : startCreate}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              {showForm ? "Hide Form" : "Create Receipt"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setShowReceiptList((v) => !v)}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
          >
            {showReceiptList ? "Hide Receipt List" : "Show Receipt List"}
          </button>

          <button
            type="button"
            onClick={refreshAll}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
          >
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div className="text-sm bg-red-500/10 text-red-200 border border-red-500/20 px-3 py-2 rounded-lg">{error}</div>
      ) : null}

      {info ? (
        <div className="text-sm bg-blue-600/10 text-blue-200 border border-blue-500/20 px-3 py-2 rounded-lg">{info}</div>
      ) : null}

      {!canWriteReceipts ? (
        <div className="text-sm bg-white/5 text-white/75 border border-white/10 px-3 py-2 rounded-lg">
          Signed in as {roleLabel}. Receipts are view-only for this role.
        </div>
      ) : null}

      {showForm && canWriteReceipts ? (
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
                <input
                  list="receipt-invoice-options"
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={invoiceSearch}
                  onChange={(e) => handleInvoiceSearchChange(e.target.value)}
                  placeholder="Search and select invoice..."
                  required
                />
                <datalist id="receipt-invoice-options">
                  {filteredInvoiceOptions.map((inv) => (
                    <option key={inv.id} value={invoiceOptionLabel(inv)} />
                  ))}
                </datalist>
                {form.invoice ? (
                  <div className="mt-1 text-xs text-white/55">
                    {(() => {
                      const inv = invoiceMap.get(String(form.invoice))
                      return inv
                        ? `${inv.invoice_number} • ${inv.currency} ${formatAmountWithCommas(String(getExpectedInvoiceTotal(inv)))} • Balance: ${inv.currency} ${formatAmountWithCommas(String(getInvoiceBalance(inv)))} `
                        : ""
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

              <div>
                <label className="block text-sm font-semibold text-white/80 mb-1">Method</label>
                <input
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={form.method}
                  onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/80 mb-1">Reference</label>
                <input
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Notes</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Receipts</h2>
          <span className="text-sm text-white/60">
            {showReceiptList ? `${filteredReceipts.length} of ${receipts.length}` : `Hidden • ${receipts.length} total`}
          </span>
        </div>

        {!showReceiptList ? (
          <div className="p-5 text-sm text-white/60">Receipt list is hidden. Click "Show Receipt List" to view entries.</div>
        ) : loading ? (
          <div className="p-5 text-sm text-white/60">Loading...</div>
        ) : receipts.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No receipts.</div>
        ) : filteredReceipts.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No receipts match your search.</div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {paginatedReceipts.map((r) => {
                const inv = invoiceMap.get(String(r.invoice))
                return (
                  <div key={r.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-sm font-semibold text-white">{inv ? inv.invoice_number : String(r.invoice)}</div>
                    <div className="mt-1 text-xs text-white/65">{r.payment_date} • {r.method || "No method"}</div>
                    <div className="mt-2 text-sm font-semibold text-white">{r.currency} {formatAmountWithCommas(String(r.amount ?? ""))}</div>
                    {r.reference ? <div className="mt-1 text-xs text-white/60">Ref: {r.reference}</div> : null}
                    <div className="mt-3 flex items-center justify-end gap-3 text-sm font-semibold">
                      {canWriteReceipts ? (
                        <>
                          <button type="button" onClick={() => startEdit(r)} className="text-blue-300 hover:text-blue-200">Edit</button>
                          <button type="button" onClick={() => onDelete(r)} className="text-white/60 hover:text-red-200">Delete</button>
                        </>
                      ) : <span className="text-white/40">View only</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden sm:block overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <table className="min-w-[720px] w-full text-xs sm:text-sm">
                <thead className="bg-black/60 text-white">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Invoice</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Method</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Balance</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Reference</th>
                    <th className="px-4 py-3 text-right font-semibold text-white/90">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedReceipts.map((r) => {
                    const inv = invoiceMap.get(String(r.invoice))
                    return (
                      <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="px-4 py-3 text-white/85">{inv ? inv.invoice_number : String(r.invoice)}</td>
                        <td className="px-4 py-3 text-white/90">
                          {r.currency} {formatAmountWithCommas(String(r.amount ?? ""))}
                        </td>
                        <td className="px-4 py-3 text-white/80">{r.payment_date}</td>
                        <td className="px-4 py-3 text-white/80">{r.method || ""}</td>
                        <td className="px-4 py-3 text-white/80">
                          {inv ? `${inv.currency} ${formatAmountWithCommas(String(getInvoiceBalance(inv)))}` : ""}
                        </td>
                        <td className="px-4 py-3 text-white/80">{r.reference || ""}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-3">
                            {canWriteReceipts ? (
                              <>
                                <button type="button" onClick={() => startEdit(r)} className="text-blue-300 hover:text-blue-200 font-semibold">
                                  Edit
                                </button>
                                <button type="button" onClick={() => onDelete(r)} className="text-white/60 hover:text-red-200 font-semibold">
                                  Delete
                                </button>
                              </>
                            ) : <span className="text-white/40">View only</span>}
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
              totalItems={filteredReceipts.length}
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