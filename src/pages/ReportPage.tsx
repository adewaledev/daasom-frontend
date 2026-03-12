import { useEffect, useMemo, useState } from "react"
import type { Job } from "../api/jobs"
import { listJobs } from "../api/jobs"
import type { Invoice } from "../api/invoices"
import { listInvoices } from "../api/invoices"
import type { Expense } from "../api/expenses"
import { listExpenses } from "../api/expenses"
import type { Receipt } from "../api/receipts"
import { listReceipts } from "../api/receipts"
import type { Client } from "../api/clients"
import { listClients } from "../api/clients"

function extractErrorMessage(err: any): string {
  if (!err?.response?.status) return "Network error. Backend may be unavailable."
  const data = err.response.data
  if (typeof data === "string") return data
  if (data?.detail) return String(data.detail)
  if (data && typeof data === "object") {
    const parts = Object.entries(data)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
      .filter(Boolean)
    return parts.length ? parts.join(" | ") : "Request failed"
  }
  return `Request failed (HTTP ${err.response.status})`
}

function money(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n
  if (!Number.isFinite(num)) return "0.00"
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatCard({
  label,
  value,
  currency = "",
  subtext,
  color = "blue",
  onClick,
}: {
  label: string
  value: string | number
  currency?: string
  subtext?: string
  color?: "blue" | "green" | "amber" | "purple" | "red"
  onClick?: () => void
}) {
  const colorMap = {
    blue: "bg-blue-600/10 border-blue-500/20 text-blue-200",
    green: "bg-green-600/10 border-green-500/20 text-green-200",
    amber: "bg-amber-600/10 border-amber-500/20 text-amber-200",
    purple: "bg-purple-600/10 border-purple-500/20 text-purple-200",
    red: "bg-red-600/10 border-red-500/20 text-red-200",
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left rounded-xl border border-white/10 ${colorMap[color]} px-4 py-3 hover:bg-white/10 transition`}
      >
        <div className="text-xs text-white/60">{label}</div>
        <div className="mt-1 text-lg font-semibold text-white">
          {currency} {money(value)}
        </div>
        {subtext && <div className="mt-1 text-xs text-white/50">{subtext}</div>}
      </button>
    )
  }

  return (
    <div className={`rounded-xl border border-white/10 ${colorMap[color]} px-4 py-3`}>
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">
        {currency} {money(value)}
      </div>
      {subtext && <div className="mt-1 text-xs text-white/50">{subtext}</div>}
    </div>
  )
}

type SeriesPoint = {
  label: string
  value: number
}

function buildLinePath(points: SeriesPoint[], maxValue: number, width: number, height: number): string {
  if (!points.length) return ""
  if (points.length === 1) {
    const y = height - ((points[0].value / maxValue) * height || 0)
    return `M 0 ${y} L ${width} ${y}`
  }

  const stepX = width / (points.length - 1)
  return points
    .map((point, i) => {
      const x = i * stepX
      const y = height - ((point.value / maxValue) * height || 0)
      return `${i === 0 ? "M" : "L"} ${x} ${y}`
    })
    .join(" ")
}

function toMonthKey(rawDate: string | null | undefined): string {
  if (!rawDate) return ""
  const parsed = new Date(rawDate)
  if (!Number.isFinite(parsed.getTime())) return ""
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function toMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  if (!year || !month) return monthKey
  const parsed = new Date(Number(year), Number(month) - 1, 1)
  return parsed.toLocaleString(undefined, { month: "short", year: "2-digit" })
}

function TrendLineChart({
  title,
  subtitle,
  points,
  series,
}: {
  title: string
  subtitle: string
  points: Array<{ label: string;[key: string]: string | number }>
  series: Array<{ key: string; label: string; color: string }>
}) {
  const width = 900
  const height = 260

  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => series.map((s) => Number(point[s.key] ?? 0))),
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="text-xs text-white/55 mt-1">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
          {series.map((s) => (
            <div key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="text-sm text-white/60 py-3">No time-series data available for current filters.</div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[640px] w-full h-48" preserveAspectRatio="none">
              {[0.25, 0.5, 0.75, 1].map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  y1={height - height * tick}
                  x2={width}
                  y2={height - height * tick}
                  stroke="rgba(255,255,255,0.12)"
                  strokeDasharray="4 6"
                  strokeWidth="1"
                />
              ))}

              {series.map((s) => {
                const path = buildLinePath(
                  points.map((p) => ({ label: p.label, value: Number(p[s.key] ?? 0) })),
                  maxValue,
                  width,
                  height,
                )

                return (
                  <path
                    key={s.key}
                    d={path}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )
              })}
            </svg>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {points.map((point) => (
              <div key={point.label} className="rounded-lg border border-white/10 bg-black/25 px-2 py-2">
                <div className="text-[11px] text-white/55">{point.label}</div>
                {series.map((s) => (
                  <div key={s.key} className="text-xs mt-1" style={{ color: s.color }}>
                    {s.label}: {money(Number(point[s.key] ?? 0))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function TrendBarChart({
  title,
  subtitle,
  points,
  series,
}: {
  title: string
  subtitle: string
  points: Array<{ label: string;[key: string]: string | number }>
  series: Array<{ key: string; label: string; color: string }>
}) {
  const chartWidth = 900
  const chartHeight = 260
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => series.map((s) => Number(point[s.key] ?? 0))),
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="text-xs text-white/55 mt-1">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
          {series.map((s) => (
            <div key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="text-sm text-white/60 py-3">No time-series data available for current filters.</div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 overflow-x-auto">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-[640px] w-full h-52" preserveAspectRatio="none">
              {[0.25, 0.5, 0.75, 1].map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  y1={chartHeight - chartHeight * tick}
                  x2={chartWidth}
                  y2={chartHeight - chartHeight * tick}
                  stroke="rgba(255,255,255,0.12)"
                  strokeDasharray="4 6"
                  strokeWidth="1"
                />
              ))}

              {points.map((point, pointIndex) => {
                const groupWidth = chartWidth / points.length
                const gapBetweenGroups = groupWidth * 0.18
                const innerGroupWidth = groupWidth - gapBetweenGroups
                const barGap = innerGroupWidth * 0.08
                const barWidth = (innerGroupWidth - barGap * (series.length - 1)) / series.length
                const groupStartX = pointIndex * groupWidth + gapBetweenGroups / 2

                return series.map((s, seriesIndex) => {
                  const value = Number(point[s.key] ?? 0)
                  const barHeight = (value / maxValue) * chartHeight
                  const x = groupStartX + seriesIndex * (barWidth + barGap)
                  const y = chartHeight - barHeight

                  return (
                    <rect
                      key={`${point.label}-${s.key}`}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(barHeight, 1)}
                      rx="2"
                      fill={s.color}
                    />
                  )
                })
              })}
            </svg>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {points.map((point) => (
              <div key={point.label} className="rounded-lg border border-white/10 bg-black/25 px-2 py-2">
                <div className="text-[11px] text-white/55">{point.label}</div>
                {series.map((s) => (
                  <div key={s.key} className="text-xs mt-1" style={{ color: s.color }}>
                    {s.label}: {Number(point[s.key] ?? 0)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

type JobStatus = "PENDING" | "COMPLETE"

export default function ReportPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [jobStatusFilter, setJobStatusFilter] = useState<"all" | JobStatus>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showExpenseBreakdown, setShowExpenseBreakdown] = useState(false)
  const [showReceiptBreakdown, setShowReceiptBreakdown] = useState(false)

  async function refreshAll() {
    setError("")
    setLoading(true)
    try {
      const [j, c, i, e, r] = await Promise.all([listJobs(), listClients(), listInvoices(), listExpenses(), listReceipts()])
      setJobs(j)
      setClients(c)
      setInvoices(i)
      setExpenses(e)
      setReceipts(r)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  // Client map for quick lookup
  const clientMap = useMemo(() => {
    const m = new Map<string, Client>()
    clients.forEach((c) => m.set(String(c.id), c))
    return m
  }, [clients])

  // Filtered jobs (applies both status and search filters)
  const filteredJobs = useMemo(() => {
    let result = jobs

    // Apply status filter
    if (jobStatusFilter !== "all") {
      const statusMap: Record<JobStatus, boolean> = {
        PENDING: true,
        COMPLETE: false,
      }
      result = result.filter((j) => j.is_active === statusMap[jobStatusFilter])
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim()
      result = result.filter((job) => {
        const fileNumberMatch = job.file_number.toLowerCase().includes(term)
        const zoneMatch = job.zone.toLowerCase().includes(term)
        const client = clientMap.get(String(job.client))
        const clientNameMatch = client?.client_name.toLowerCase().includes(term) ?? false
        return fileNumberMatch || zoneMatch || clientNameMatch
      })
    }

    return result
  }, [jobs, jobStatusFilter, searchTerm, clientMap])

  const searchSuggestions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return []

    const suggestions: string[] = []
    const seen = new Set<string>()

    for (const job of jobs) {
      const client = clientMap.get(String(job.client))
      const candidates = [
        job.file_number,
        job.zone,
        client?.client_name,
        client?.client_code,
      ]
      for (const c of candidates) {
        const val = String(c ?? "").trim()
        if (!val || !val.toLowerCase().includes(q)) continue
        if (seen.has(val.toLowerCase())) continue
        seen.add(val.toLowerCase())
        suggestions.push(val)
        if (suggestions.length >= 10) return suggestions
      }
    }

    return suggestions
  }, [searchTerm, jobs, clientMap])

  // Track filtered job IDs for quick lookup
  const filteredJobIds = useMemo(() => {
    return new Set(filteredJobs.map((j) => String(j.id)))
  }, [filteredJobs])

  // Filter data based on selected jobs
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => filteredJobIds.has(String(inv.job)))
  }, [invoices, filteredJobIds])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => filteredJobIds.has(String(exp.job)))
  }, [expenses, filteredJobIds])

  const filteredReceipts = useMemo(() => {
    const filteredInvIds = new Set(filteredInvoices.map((i) => String(i.id)))
    return receipts.filter((rec) => filteredInvIds.has(String(rec.invoice)))
  }, [receipts, filteredInvoices])

  // Build filtered maps
  const filteredInvoicesByJob = useMemo(() => {
    const m = new Map<string, Invoice[]>()
    filteredInvoices.forEach((inv) => {
      const jobId = String(inv.job)
      if (!m.has(jobId)) m.set(jobId, [])
      m.get(jobId)!.push(inv)
    })
    return m
  }, [filteredInvoices])

  const filteredExpensesByJob = useMemo(() => {
    const m = new Map<string, Expense[]>()
    filteredExpenses.forEach((exp) => {
      const jobId = String(exp.job)
      if (!m.has(jobId)) m.set(jobId, [])
      m.get(jobId)!.push(exp)
    })
    return m
  }, [filteredExpenses])

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>()
    jobs.forEach((j) => m.set(String(j.id), j))
    return m
  }, [jobs])

  const filteredReceiptsByInvoice = useMemo(() => {
    const m = new Map<string, Receipt[]>()
    filteredReceipts.forEach((rec) => {
      const invId = String(rec.invoice)
      if (!m.has(invId)) m.set(invId, [])
      m.get(invId)!.push(rec)
    })
    return m
  }, [filteredReceipts])

  const filteredInvoiceMap = useMemo(() => {
    const m = new Map<string, Invoice>()
    filteredInvoices.forEach((inv) => m.set(String(inv.id), inv))
    return m
  }, [filteredInvoices])

  // Computed metrics (based on filtered data for whole page)
  const metrics = useMemo(() => {
    let totalInvoiceAmount = 0
    let totalExpenseAmount = 0
    let totalReceiptAmount = 0
    let draftInvoices = 0
    let issuedInvoices = 0
    let partialInvoices = 0
    let paidInvoices = 0
    let voidInvoices = 0
    let draftExpenses = 0
    let submittedExpenses = 0
    let approvedExpenses = 0
    const currencies = new Set<string>()

    filteredInvoices.forEach((inv) => {
      const amt = parseFloat(inv.invoice_amount || inv.grand_total || "0")
      if (Number.isFinite(amt)) totalInvoiceAmount += amt
      currencies.add(inv.currency)
      if (inv.status === "DRAFT") draftInvoices++
      else if (inv.status === "ISSUED") issuedInvoices++
      else if (inv.status === "PARTIALLY_PAID") partialInvoices++
      else if (inv.status === "PAID") paidInvoices++
      else if (inv.status === "VOID") voidInvoices++
    })

    filteredExpenses.forEach((exp) => {
      const amt = parseFloat(exp.amount || "0")
      if (Number.isFinite(amt)) totalExpenseAmount += amt
      currencies.add(exp.currency)
      if (exp.status === "DRAFT") draftExpenses++
      else if (exp.status === "SUBMITTED") submittedExpenses++
      else if (exp.status === "APPROVED") approvedExpenses++
    })

    filteredReceipts.forEach((rec) => {
      const amt = parseFloat(rec.amount || "0")
      if (Number.isFinite(amt)) totalReceiptAmount += amt
      currencies.add(rec.currency)
    })

    const rawOutstanding = totalInvoiceAmount - totalReceiptAmount
    const outstanding = Math.max(rawOutstanding, 0)
    const overpaid = Math.max(-rawOutstanding, 0)

    return {
      totalInvoiceAmount,
      totalExpenseAmount,
      totalReceiptAmount,
      outstanding,
      overpaid,
      invoices: {
        draft: draftInvoices,
        issued: issuedInvoices,
        partial: partialInvoices,
        paid: paidInvoices,
        void: voidInvoices,
        total: filteredInvoices.length,
      },
      expenses: {
        draft: draftExpenses,
        submitted: submittedExpenses,
        approved: approvedExpenses,
        total: filteredExpenses.length,
      },
      receipts: {
        total: filteredReceipts.length,
      },
      currencies: Array.from(currencies),
    }
  }, [filteredInvoices, filteredExpenses, filteredReceipts])

  // Job summaries
  const jobSummaries = useMemo(() => {
    return filteredJobs.map((job) => {
      const jobInvoices = filteredInvoicesByJob.get(String(job.id)) || []
      const jobExpenses = filteredExpensesByJob.get(String(job.id)) || []

      let invoicedAmount = 0
      let receivedAmount = 0
      let jobExpenseAmount = 0

      jobInvoices.forEach((inv) => {
        const amt = parseFloat(inv.invoice_amount || inv.grand_total || "0")
        if (Number.isFinite(amt)) invoicedAmount += amt
      })

      jobExpenses.forEach((exp) => {
        const amt = parseFloat(exp.amount || "0")
        if (Number.isFinite(amt)) jobExpenseAmount += amt
      })

      jobInvoices.forEach((inv) => {
        const invReceipts = filteredReceiptsByInvoice.get(String(inv.id)) || []
        invReceipts.forEach((rec) => {
          const amt = parseFloat(rec.amount || "0")
          if (Number.isFinite(amt)) receivedAmount += amt
        })
      })

      return {
        job,
        invoiceCount: jobInvoices.length,
        invoicedAmount,
        expenseCount: jobExpenses.length,
        expenseAmount: jobExpenseAmount,
        receivedAmount,
        paidStatus: receivedAmount >= invoicedAmount ? "PAID" : receivedAmount > 0 ? "PARTIAL" : "UNPAID",
        currency: jobInvoices[0]?.currency || jobExpenses[0]?.currency || "NGN",
      }
    })
  }, [filteredJobs, filteredInvoicesByJob, filteredExpensesByJob, filteredReceiptsByInvoice])

  const expenseBreakdownRows = useMemo(() => {
    return [...filteredExpenses]
      .sort((a, b) => String(b.expense_date).localeCompare(String(a.expense_date)))
      .map((exp) => {
        const job = jobMap.get(String(exp.job))
        return {
          id: exp.id,
          expense_date: exp.expense_date,
          category: exp.category,
          description: exp.description,
          amount: exp.amount,
          currency: exp.currency,
          status: exp.status,
          fileNumber: job?.file_number || "-",
          zone: job?.zone || "-",
        }
      })
  }, [filteredExpenses, jobMap])

  const receiptBreakdownRows = useMemo(() => {
    return [...filteredReceipts]
      .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))
      .map((rec) => {
        const invoice = filteredInvoiceMap.get(String(rec.invoice))
        const job = invoice ? jobMap.get(String(invoice.job)) : undefined
        return {
          id: rec.id,
          payment_date: rec.payment_date,
          method: rec.method,
          reference: rec.reference,
          amount: rec.amount,
          currency: rec.currency,
          invoiceNumber: invoice?.invoice_number || "-",
          fileNumber: job?.file_number || "-",
          zone: job?.zone || "-",
        }
      })
  }, [filteredReceipts, filteredInvoiceMap, jobMap])

  const monthlyTrend = useMemo(() => {
    const buckets = new Map<string, {
      invoiced: number
      received: number
      expenses: number
      invoiceCount: number
      receiptCount: number
      expenseCount: number
    }>()

    function ensureBucket(monthKey: string) {
      if (!monthKey) return null
      if (!buckets.has(monthKey)) {
        buckets.set(monthKey, {
          invoiced: 0,
          received: 0,
          expenses: 0,
          invoiceCount: 0,
          receiptCount: 0,
          expenseCount: 0,
        })
      }
      return buckets.get(monthKey)!
    }

    filteredInvoices.forEach((inv) => {
      const monthKey = toMonthKey(inv.issued_date || inv.created_at)
      const bucket = ensureBucket(monthKey)
      if (!bucket) return
      bucket.invoiced += Number.parseFloat(inv.invoice_amount || inv.grand_total || "0") || 0
      bucket.invoiceCount += 1
    })

    filteredReceipts.forEach((rec) => {
      const monthKey = toMonthKey(rec.payment_date)
      const bucket = ensureBucket(monthKey)
      if (!bucket) return
      bucket.received += Number.parseFloat(rec.amount || "0") || 0
      bucket.receiptCount += 1
    })

    filteredExpenses.forEach((exp) => {
      const monthKey = toMonthKey(exp.expense_date)
      const bucket = ensureBucket(monthKey)
      if (!bucket) return
      bucket.expenses += Number.parseFloat(exp.amount || "0") || 0
      bucket.expenseCount += 1
    })

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, value]) => ({
        label: toMonthLabel(key),
        ...value,
      }))
  }, [filteredInvoices, filteredReceipts, filteredExpenses])

  const monthlyJobTrend = useMemo(() => {
    const buckets = new Map<string, {
      totalJobs: number
      pendingJobs: number
      completedJobs: number
    }>()

    function ensureBucket(monthKey: string) {
      if (!monthKey) return null
      if (!buckets.has(monthKey)) {
        buckets.set(monthKey, {
          totalJobs: 0,
          pendingJobs: 0,
          completedJobs: 0,
        })
      }
      return buckets.get(monthKey)!
    }

    filteredJobs.forEach((job) => {
      const monthKey = toMonthKey(job.created_at)
      const bucket = ensureBucket(monthKey)
      if (!bucket) return

      bucket.totalJobs += 1
      if (job.is_active) bucket.pendingJobs += 1
      else bucket.completedJobs += 1
    })

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, value]) => ({
        label: toMonthLabel(key),
        ...value,
      }))
  }, [filteredJobs])

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-blue-300">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-white/60">Executive dashboard with job, expense, invoice and receipt summaries.</p>
        </div>

        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="text-sm bg-red-500/10 text-red-200 border border-red-500/20 px-3 py-2 rounded-lg">{error}</div>
      )}

      {/* Search Bar */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by file number or client name..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
            className="w-full bg-black/40 text-white border border-white/10 rounded-lg pl-4 pr-9 py-3 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => { setSearchTerm(""); setShowSuggestions(false) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition text-lg leading-none"
              aria-label="Clear search"
            >×</button>
          ) : null}
          {showSuggestions && searchSuggestions.length > 0 ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-black/95 shadow-xl">
              {searchSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSearchTerm(s); setShowSuggestions(false) }}
                  className="w-full px-4 py-2.5 text-left text-sm text-white/85 hover:bg-white/10 transition"
                >{s}</button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Key Metrics Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Invoiced"
          value={metrics.totalInvoiceAmount}
          currency={metrics.currencies[0] || "NGN"}
          color="blue"
          subtext={`${metrics.invoices.total} invoices`}
        />
        <StatCard
          label="Total Received"
          value={metrics.totalReceiptAmount}
          currency={metrics.currencies[0] || "NGN"}
          color="green"
          subtext={`${metrics.receipts.total} receipts`}
          onClick={() => setShowReceiptBreakdown(true)}
        />
        <StatCard
          label="Total Expenses"
          value={metrics.totalExpenseAmount}
          currency={metrics.currencies[0] || "NGN"}
          color="amber"
          subtext={`${metrics.expenses.total} expenses`}
          onClick={() => setShowExpenseBreakdown(true)}
        />
        <StatCard
          label="Outstanding Balance"
          value={metrics.outstanding}
          currency={metrics.currencies[0] || "NGN"}
          color={metrics.outstanding > 0 ? "red" : "green"}
          subtext={
            metrics.outstanding > 0
              ? "Due from clients"
              : metrics.overpaid > 0
                ? `Overpaid by ${metrics.currencies[0] || "NGN"} ${money(metrics.overpaid)}`
                : "All paid"
          }
        />
      </section>

      <TrendLineChart
        title="Financial Flow Trend"
        subtitle="Recommended time-series view for revenue, collections, and cost movement over the last 6 months."
        points={monthlyTrend}
        series={[
          { key: "invoiced", label: "Invoiced", color: "#3b82f6" },
          { key: "received", label: "Received", color: "#22c55e" },
          { key: "expenses", label: "Expenses", color: "#f59e0b" },
        ]}
      />

      <TrendBarChart
        title="Job Lifecycle Trend"
        subtitle="Recommended time-series view of total jobs, pending jobs, and completed jobs over the last 6 months."
        points={monthlyJobTrend}
        series={[
          { key: "totalJobs", label: "Total Jobs", color: "#60a5fa" },
          { key: "pendingJobs", label: "Pending", color: "#fbbf24" },
          { key: "completedJobs", label: "Completed", color: "#34d399" },
        ]}
      />

      {/* Job Summary Dashboard */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Job Summary</h2>
          <div className="flex gap-2">
            {["all", "PENDING", "COMPLETE"].map((status) => (
              <button
                key={status}
                onClick={() => setJobStatusFilter(status as any)}
                className={`px-3 py-1 rounded-lg text-sm font-semibold transition ${jobStatusFilter === status
                  ? "bg-blue-600 text-white"
                  : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                  }`}
              >
                {status === "all" ? "All" : status === "PENDING" ? "Active" : "Complete"}
              </button>
            ))}
          </div>
        </div>

        {jobSummaries.length === 0 ? (
          <div className="text-sm text-white/60 py-4">No jobs match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">File #</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Invoices</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Invoiced Amount</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Expenses</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Received</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobSummaries.map((summary) => (
                  <tr key={summary.job.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-3 font-semibold text-white">{summary.job.file_number}</td>
                    <td className="px-4 py-3 text-white/80">{summary.job.zone}</td>
                    <td className="px-4 py-3 text-white/80">{summary.invoiceCount}</td>
                    <td className="px-4 py-3 text-right text-white/90 font-semibold">
                      {summary.currency} {money(summary.invoicedAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-white/80">{summary.expenseCount}</td>
                    <td className="px-4 py-3 text-right text-white/90 font-semibold">
                      {summary.currency} {money(summary.receivedAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${summary.paidStatus === "PAID"
                          ? "bg-green-600/10 text-green-200 border border-green-500/20"
                          : summary.paidStatus === "PARTIAL"
                            ? "bg-amber-600/10 text-amber-200 border border-amber-500/20"
                            : "bg-red-600/10 text-red-200 border border-red-500/20"
                          }`}
                      >
                        {summary.paidStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Expenses per Job */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <h2 className="font-semibold text-white mb-4">Expenses per Job</h2>

        {filteredJobs.length === 0 ? (
          <div className="text-sm text-white/60 py-4">No jobs match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">File #</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Count</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Draft</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Submitted</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Approved</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const jobExpenses = filteredExpensesByJob.get(String(job.id)) || []
                  const currency = jobExpenses[0]?.currency || "NGN"
                  const status = {
                    DRAFT: jobExpenses.filter((e) => e.status === "DRAFT").length,
                    SUBMITTED: jobExpenses.filter((e) => e.status === "SUBMITTED").length,
                    APPROVED: jobExpenses.filter((e) => e.status === "APPROVED").length,
                  }
                  const total = jobExpenses.reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0)

                  return (
                    <tr key={job.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 font-semibold text-white">{job.file_number}</td>
                      <td className="px-4 py-3 text-white/80">{job.zone}</td>
                      <td className="px-4 py-3 text-right text-white/80">{jobExpenses.length}</td>
                      <td className="px-4 py-3 text-right text-blue-200 font-semibold">{status.DRAFT}</td>
                      <td className="px-4 py-3 text-right text-purple-200 font-semibold">{status.SUBMITTED}</td>
                      <td className="px-4 py-3 text-right text-green-200 font-semibold">{status.APPROVED}</td>
                      <td className="px-4 py-3 text-right text-white/90 font-semibold">
                        {currency} {money(total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invoices per Job */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <h2 className="font-semibold text-white mb-4">Invoices per Job</h2>

        {filteredJobs.length === 0 ? (
          <div className="text-sm text-white/60 py-4">No jobs match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">File #</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Count</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Draft</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Issued</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Partial</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Paid</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const jobInvoices = filteredInvoicesByJob.get(String(job.id)) || []
                  const currency = jobInvoices[0]?.currency || "NGN"
                  const status = {
                    DRAFT: jobInvoices.filter((i) => i.status === "DRAFT").length,
                    ISSUED: jobInvoices.filter((i) => i.status === "ISSUED").length,
                    PARTIAL: jobInvoices.filter((i) => i.status === "PARTIALLY_PAID").length,
                    PAID: jobInvoices.filter((i) => i.status === "PAID").length,
                  }
                  const total = jobInvoices.reduce((sum, i) => sum + parseFloat(i.invoice_amount || i.grand_total || "0"), 0)

                  return (
                    <tr key={job.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 font-semibold text-white">{job.file_number}</td>
                      <td className="px-4 py-3 text-white/80">{job.zone}</td>
                      <td className="px-4 py-3 text-right text-white/80">{jobInvoices.length}</td>
                      <td className="px-4 py-3 text-right text-blue-200 font-semibold">{status.DRAFT}</td>
                      <td className="px-4 py-3 text-right text-purple-200 font-semibold">{status.ISSUED}</td>
                      <td className="px-4 py-3 text-right text-amber-200 font-semibold">{status.PARTIAL}</td>
                      <td className="px-4 py-3 text-right text-green-200 font-semibold">{status.PAID}</td>
                      <td className="px-4 py-3 text-right text-white/90 font-semibold">
                        {currency} {money(total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Receipts per Job */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <h2 className="font-semibold text-white mb-4">Receipts per Job</h2>

        {filteredJobs.length === 0 ? (
          <div className="text-sm text-white/60 py-4">No jobs match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">File #</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Receipt Count</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Total Received</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Total Invoiced</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const jobInvoices = filteredInvoicesByJob.get(String(job.id)) || []
                  const jobReceipts = jobInvoices.flatMap((inv) => filteredReceiptsByInvoice.get(String(inv.id)) || [])
                  const currency = jobInvoices[0]?.currency || "NGN"

                  const totalInvoiced = jobInvoices.reduce((sum, i) => sum + parseFloat(i.invoice_amount || i.grand_total || "0"), 0)
                  const totalReceived = jobReceipts.reduce((sum, r) => sum + parseFloat(r.amount || "0"), 0)

                  return (
                    <tr key={job.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 font-semibold text-white">{job.file_number}</td>
                      <td className="px-4 py-3 text-white/80">{job.zone}</td>
                      <td className="px-4 py-3 text-right text-white/80">{jobReceipts.length}</td>
                      <td className="px-4 py-3 text-right text-white/90 font-semibold">
                        {currency} {money(totalReceived)}
                      </td>
                      <td className="px-4 py-3 text-right text-white/90 font-semibold">
                        {currency} {money(totalInvoiced)}
                      </td>
                      <td className="px-4 py-3 text-right text-white/90 font-semibold">
                        {currency} {money(Math.max(totalInvoiced - totalReceived, 0))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Currency Breakdown */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <h2 className="font-semibold text-white mb-4">Currency Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {metrics.currencies.map((currency) => {
            const currencyInvoices = filteredInvoices.filter((i) => i.currency === currency)
            const currencyExpenses = filteredExpenses.filter((e) => e.currency === currency)
            const currencyReceipts = filteredReceipts.filter((r) => r.currency === currency)

            const invoiceTotal = currencyInvoices.reduce((sum, i) => sum + parseFloat(i.invoice_amount || i.grand_total || "0"), 0)
            const expenseTotal = currencyExpenses.reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0)
            const receiptTotal = currencyReceipts.reduce((sum, r) => sum + parseFloat(r.amount || "0"), 0)

            return (
              <div key={currency} className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-2">
                <div className="font-semibold text-white">{currency}</div>
                <div className="text-xs text-white/60">Invoiced</div>
                <div className="font-semibold text-white">{currency} {money(invoiceTotal)}</div>
                <div className="mt-2 text-xs text-white/60">Expenses</div>
                <div className="font-semibold text-white">{currency} {money(expenseTotal)}</div>
                <div className="mt-2 text-xs text-white/60">Received</div>
                <div className="font-semibold text-white">{currency} {money(receiptTotal)}</div>
              </div>
            )
          })}
        </div>
      </section>

      {showExpenseBreakdown ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-2xl border border-white/10 bg-black text-white">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Expenses Breakdown</h2>
                <p className="text-xs text-white/60 mt-1">
                  Total: {metrics.currencies[0] || "NGN"} {money(metrics.totalExpenseAmount)} • Draft: {metrics.expenses.draft} • Submitted: {metrics.expenses.submitted} • Approved: {metrics.expenses.approved}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExpenseBreakdown(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
              >
                Close
              </button>
            </div>

            {expenseBreakdownRows.length === 0 ? (
              <div className="p-5 text-sm text-white/60">No expenses to display for current filters.</div>
            ) : (
              <div className="overflow-auto max-h-[70vh]">
                <table className="min-w-full text-sm">
                  <thead className="bg-black/80 text-white sticky top-0">
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">File #</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Category</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Description</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-white/90">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseBreakdownRows.map((row) => (
                      <tr key={row.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="px-4 py-3 text-white/80">{row.expense_date}</td>
                        <td className="px-4 py-3 text-white font-semibold">{row.fileNumber}</td>
                        <td className="px-4 py-3 text-white/70">{row.zone}</td>
                        <td className="px-4 py-3 text-white/85">{row.category}</td>
                        <td className="px-4 py-3 text-white/70">{row.description || ""}</td>
                        <td className="px-4 py-3 text-white/80">{row.status}</td>
                        <td className="px-4 py-3 text-right text-white font-semibold">
                          {row.currency} {money(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showReceiptBreakdown ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-2xl border border-white/10 bg-black text-white">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Receipts Breakdown</h2>
                <p className="text-xs text-white/60 mt-1">
                  Total: {metrics.currencies[0] || "NGN"} {money(metrics.totalReceiptAmount)} • Count: {metrics.receipts.total}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptBreakdown(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition"
              >
                Close
              </button>
            </div>

            {receiptBreakdownRows.length === 0 ? (
              <div className="p-5 text-sm text-white/60">No receipts to display for current filters.</div>
            ) : (
              <div className="overflow-auto max-h-[70vh]">
                <table className="min-w-full text-sm">
                  <thead className="bg-black/80 text-white sticky top-0">
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">File #</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Invoice</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Method</th>
                      <th className="px-4 py-3 text-left font-semibold text-white/90">Reference</th>
                      <th className="px-4 py-3 text-right font-semibold text-white/90">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptBreakdownRows.map((row) => (
                      <tr key={row.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="px-4 py-3 text-white/80">{row.payment_date}</td>
                        <td className="px-4 py-3 text-white font-semibold">{row.fileNumber}</td>
                        <td className="px-4 py-3 text-white/70">{row.zone}</td>
                        <td className="px-4 py-3 text-white/85">{row.invoiceNumber}</td>
                        <td className="px-4 py-3 text-white/70">{row.method || ""}</td>
                        <td className="px-4 py-3 text-white/70">{row.reference || ""}</td>
                        <td className="px-4 py-3 text-right text-white font-semibold">
                          {row.currency} {money(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
