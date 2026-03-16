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
import type { TrackerJobRow } from "../api/tracker"
import { listTrackerJobs } from "../api/tracker"

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

function pct(n: number): string {
  return n.toFixed(1) + "%"
}

type InsightTone = "neutral" | "good" | "warn" | "risk"
type WalkthroughSectionId = "operations" | "position" | "trend" | "risk" | "performance"

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

function SectionHeader({
  step,
  title,
  description,
  verdict,
  verdictTone = "neutral",
  compact = false,
  open = true,
  onToggle,
}: {
  step: string
  title: string
  description?: string
  verdict?: string
  verdictTone?: InsightTone
  compact?: boolean
  open?: boolean
  onToggle?: () => void
}) {
  const toneClass = {
    neutral: "text-white/80 border-white/10 bg-white/5",
    good: "text-green-200 border-green-500/20 bg-green-600/10",
    warn: "text-amber-200 border-amber-500/20 bg-amber-600/10",
    risk: "text-red-200 border-red-500/20 bg-red-600/10",
  }

  return (
    <div className="group flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/80">{step}</div>
        <h2 className="font-semibold text-white">{title}</h2>
        {description ? <p className="text-xs text-white/55 max-w-3xl">{description}</p> : null}
      </div>
      <div className="flex items-center gap-2 self-start">
        {verdict ? (
          <div className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-opacity ${toneClass[verdictTone]} ${compact ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-100"}`}>
            {verdict}
          </div>
        ) : null}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
          >
            {open ? "Collapse" : "Expand"}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function InsightCard({
  title,
  value,
  tone = "neutral",
  note,
}: {
  title: string
  value: string
  tone?: InsightTone
  note?: string
}) {
  const toneClass = {
    neutral: "text-white",
    good: "text-green-300",
    warn: "text-amber-300",
    risk: "text-red-300",
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="text-xs text-white/55">{title}</div>
      <div className={`mt-1 text-xl font-semibold ${toneClass[tone]}`}>{value}</div>
      {note ? <div className="mt-2 text-xs text-white/45">{note}</div> : null}
    </div>
  )
}

type SeriesPoint = {
  label: string
  value: number
}

type SearchSuggestion = {
  key: string
  value: string
  label: string
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

const JOB_DATE_OVERRIDES_KEY = "jobs_date_overrides_v1"

function getJobLifecycleDate(job: Job, overrides: Record<string, string> = {}): string {
  return overrides[String(job.id)] || job.date || job.created_at
}

function buildMonthRange(startKey: string, endKey: string): string[] {
  if (!startKey || !endKey) return []
  const [sy, sm] = startKey.split("-").map(Number)
  const [ey, em] = endKey.split("-").map(Number)
  if (!sy || !sm || !ey || !em) return []
  const keys: string[] = []
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return keys
}

function isJobActive(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized) return false
  if (["true", "1", "yes", "y", "active", "pending"].includes(normalized)) return true
  if (["false", "0", "no", "n", "inactive", "complete", "completed"].includes(normalized)) return false
  return Boolean(value)
}

function isJobPending(job: Job, trackerCompleted?: boolean): boolean {
  if (trackerCompleted === true) return false
  if (trackerCompleted === false) return true
  const status = String((job as any)?.status ?? "").trim().toLowerCase()

  if (["complete", "completed", "closed", "done", "inactive"].includes(status)) return false
  if (["pending", "active", "open", "in_progress", "in progress"].includes(status)) return true

  return isJobActive(job.is_active)
}

function TrendLineCard({
  title,
  color,
  points,
  valuePrefix,
  valueType = "money",
}: {
  title: string
  color: string
  points: SeriesPoint[]
  valuePrefix: string
  valueType?: "money" | "count"
}) {
  const width = 340
  const height = 140
  const maxValue = Math.max(1, ...points.map((p) => p.value))
  const path = buildLinePath(points, maxValue, width, height)

  const latest = points.length > 0 ? points[points.length - 1].value : 0
  const previous = points.length > 1 ? points[points.length - 2].value : 0
  let pctChange = 0
  if (previous === 0) {
    pctChange = latest === 0 ? 0 : 100
  } else {
    pctChange = ((latest - previous) / Math.abs(previous)) * 100
  }

  const pctText = `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`
  const pctTone = pctChange > 0 ? "text-green-300" : pctChange < 0 ? "text-red-300" : "text-white/60"
  const latestValueText =
    valueType === "count" ? String(Math.round(latest)) : `${valuePrefix} ${money(latest)}`

  return (
    <article className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-white/55">{title}</div>
          <div className="mt-1 text-lg font-semibold text-white">{latestValueText}</div>
        </div>
        <div className={`text-xs font-semibold ${pctTone}`}>{pctText} vs prev month</div>
      </div>

      {points.length === 0 ? (
        <div className="text-sm text-white/60 py-3">No trend data.</div>
      ) : (
        <>
          <div className="rounded-lg border border-white/10 bg-black/40 p-2">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28" preserveAspectRatio="none">
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
              <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point, i) => {
                if (points.length === 1) {
                  const y = height - ((point.value / maxValue) * height || 0)
                  return <circle key={`${point.label}-${i}`} cx={width / 2} cy={y} r="3" fill={color} />
                }
                const x = (i / (points.length - 1)) * width
                const y = height - ((point.value / maxValue) * height || 0)
                return <circle key={`${point.label}-${i}`} cx={x} cy={y} r="2.8" fill={color} />
              })}
            </svg>
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/55">
            <span>{points[0]?.label || "-"}</span>
            <span>{points[points.length - 1]?.label || "-"}</span>
          </div>
        </>
      )}
    </article>
  )
}

export default function ReportPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [trackerJobs, setTrackerJobs] = useState<TrackerJobRow[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showExpenseBreakdown, setShowExpenseBreakdown] = useState(false)
  const [showReceiptBreakdown, setShowReceiptBreakdown] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showDetailText, setShowDetailText] = useState(false)
  const [activeSection, setActiveSection] = useState<WalkthroughSectionId>("operations")
  const [expandedSections, setExpandedSections] = useState<Record<WalkthroughSectionId, boolean>>({
    operations: true,
    position: true,
    trend: false,
    risk: false,
    performance: false,
  })

  const jobDateOverrides = useMemo<Record<string, string>>(() => {
    try {
      const raw = window.localStorage.getItem(JOB_DATE_OVERRIDES_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }, [])

  async function refreshAll() {
    setError("")
    setLoading(true)
    try {
      const [j, c, i, e, r, t] = await Promise.all([
        listJobs(),
        listClients(),
        listInvoices(),
        listExpenses(),
        listReceipts(),
        listTrackerJobs().catch(() => [] as TrackerJobRow[]),
      ])
      setJobs(j)
      setClients(c)
      setInvoices(i)
      setExpenses(e)
      setReceipts(r)
      setTrackerJobs(t)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load data.")
    } finally {
      setLoading(false)
    }
  }

  const trackerCompletionByJobId = useMemo(() => {
    const m = new Map<string, boolean>()
    trackerJobs.forEach((row) => {
      m.set(String(row.job_id), Boolean(row.tracker_completed))
    })
    return m
  }, [trackerJobs])

  useEffect(() => { refreshAll() }, [])

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>()
    clients.forEach((c) => m.set(String(c.id), c))
    return m
  }, [clients])

  const filteredJobs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return jobs

    return jobs.filter((job) => {
      const client = clientMap.get(String(job.client))
      const fileMatch = job.file_number.toLowerCase().includes(term)
      const clientNameMatch = client?.client_name.toLowerCase().includes(term) ?? false
      const clientCodeMatch = client?.client_code?.toLowerCase().includes(term) ?? false
      return fileMatch || clientNameMatch || clientCodeMatch
    })
  }, [jobs, searchTerm, clientMap])

  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return []

    const suggestions: SearchSuggestion[] = []
    const seen = new Set<string>()

    for (const job of jobs) {
      const client = clientMap.get(String(job.client))
      const candidates = [
        { value: job.file_number, label: `File: ${job.file_number}` },
        { value: client?.client_name || "", label: `Client: ${client?.client_name || ""}` },
      ]

      for (const c of candidates) {
        const value = c.value.trim()
        if (!value) continue
        if (!value.toLowerCase().includes(q)) continue
        const key = `${c.label.toLowerCase()}|${value.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        suggestions.push({ key, value, label: c.label })
        if (suggestions.length >= 10) return suggestions
      }
    }

    return suggestions
  }, [searchTerm, jobs, clientMap])

  const filteredJobIds = useMemo(() => {
    return new Set(filteredJobs.map((j) => String(j.id)))
  }, [filteredJobs])

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => filteredJobIds.has(String(inv.job)))
  }, [invoices, filteredJobIds])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => filteredJobIds.has(String(exp.job)))
  }, [expenses, filteredJobIds])

  const filteredInvoiceIds = useMemo(() => {
    return new Set(filteredInvoices.map((inv) => String(inv.id)))
  }, [filteredInvoices])

  const filteredReceipts = useMemo(() => {
    return receipts.filter((rec) => filteredInvoiceIds.has(String(rec.invoice)))
  }, [receipts, filteredInvoiceIds])

  const invoicesByJob = useMemo(() => {
    const m = new Map<string, Invoice[]>()
    filteredInvoices.forEach((inv) => {
      const id = String(inv.job)
      if (!m.has(id)) m.set(id, [])
      m.get(id)!.push(inv)
    })
    return m
  }, [filteredInvoices])

  const expensesByJob = useMemo(() => {
    const m = new Map<string, Expense[]>()
    filteredExpenses.forEach((exp) => {
      const id = String(exp.job)
      if (!m.has(id)) m.set(id, [])
      m.get(id)!.push(exp)
    })
    return m
  }, [filteredExpenses])

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>()
    filteredJobs.forEach((j) => m.set(String(j.id), j))
    return m
  }, [filteredJobs])

  const receiptsByInvoice = useMemo(() => {
    const m = new Map<string, Receipt[]>()
    filteredReceipts.forEach((rec) => {
      const id = String(rec.invoice)
      if (!m.has(id)) m.set(id, [])
      m.get(id)!.push(rec)
    })
    return m
  }, [filteredReceipts])

  const invoiceMap = useMemo(() => {
    const m = new Map<string, Invoice>()
    filteredInvoices.forEach((inv) => m.set(String(inv.id), inv))
    return m
  }, [filteredInvoices])

  const metrics = useMemo(() => {
    let totalInvoiceAmount = 0
    let totalExpenseAmount = 0
    let totalReceiptAmount = 0
    const currencies = new Set<string>()

    filteredInvoices.forEach((inv) => {
      const amt = parseFloat(inv.invoice_amount || inv.grand_total || "0")
      if (Number.isFinite(amt)) totalInvoiceAmount += amt
      if (inv.currency) currencies.add(inv.currency)
    })
    filteredExpenses.forEach((exp) => {
      const amt = parseFloat(exp.amount || "0")
      if (Number.isFinite(amt)) totalExpenseAmount += amt
      if (exp.currency) currencies.add(exp.currency)
    })
    filteredReceipts.forEach((rec) => {
      const amt = parseFloat(rec.amount || "0")
      if (Number.isFinite(amt)) totalReceiptAmount += amt
      if (rec.currency) currencies.add(rec.currency)
    })

    const rawOutstanding = totalInvoiceAmount - totalReceiptAmount
    const outstanding = Math.max(rawOutstanding, 0)
    const overpaid = Math.max(-rawOutstanding, 0)
    const collectionRate = totalInvoiceAmount > 0 ? (totalReceiptAmount / totalInvoiceAmount) * 100 : 0
    const grossMargin = totalInvoiceAmount > 0
      ? ((totalInvoiceAmount - totalExpenseAmount) / totalInvoiceAmount) * 100
      : 0

    return {
      totalInvoiceAmount,
      totalExpenseAmount,
      totalReceiptAmount,
      outstanding,
      overpaid,
      collectionRate,
      grossMargin,
      netRevenue: totalInvoiceAmount - totalExpenseAmount,
      invoiceCount: filteredInvoices.length,
      expenseCount: filteredExpenses.length,
      receiptCount: filteredReceipts.length,
      jobCount: filteredJobs.length,
      currencies: Array.from(currencies),
    }
  }, [filteredInvoices, filteredExpenses, filteredReceipts, filteredJobs])

  // Shared chart month range: first data date across all sources → current month
  const chartMonthRange = useMemo(() => {
    const allKeys: string[] = []
    filteredInvoices.forEach((inv) => { const k = toMonthKey(inv.issued_date || inv.created_at); if (k) allKeys.push(k) })
    filteredExpenses.forEach((exp) => { const k = toMonthKey(exp.expense_date); if (k) allKeys.push(k) })
    filteredReceipts.forEach((rec) => { const k = toMonthKey(rec.payment_date); if (k) allKeys.push(k) })
    filteredJobs.forEach((job) => { const k = toMonthKey(getJobLifecycleDate(job, jobDateOverrides)); if (k) allKeys.push(k) })
    if (!allKeys.length) return []
    const sorted = [...allKeys].sort()
    const now = new Date()
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    return buildMonthRange(sorted[0], nowKey)
  }, [filteredJobs, filteredInvoices, filteredExpenses, filteredReceipts, jobDateOverrides])

  const monthlyTrend = useMemo(() => {
    if (!chartMonthRange.length) return []
    const buckets = new Map(chartMonthRange.map((k) => [k, { invoiced: 0, received: 0, expenses: 0 }]))

    filteredInvoices.forEach((inv) => {
      const k = toMonthKey(inv.issued_date || inv.created_at)
      const b = k ? buckets.get(k) : undefined
      if (b) b.invoiced += parseFloat(inv.invoice_amount || inv.grand_total || "0") || 0
    })
    filteredReceipts.forEach((rec) => {
      const k = toMonthKey(rec.payment_date)
      const b = k ? buckets.get(k) : undefined
      if (b) b.received += parseFloat(rec.amount || "0") || 0
    })
    filteredExpenses.forEach((exp) => {
      const k = toMonthKey(exp.expense_date)
      const b = k ? buckets.get(k) : undefined
      if (b) b.expenses += parseFloat(exp.amount || "0") || 0
    })

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ label: toMonthLabel(key), ...value }))
  }, [filteredInvoices, filteredReceipts, filteredExpenses, chartMonthRange])

  const monthlyCashHealth = useMemo(() => {
    return monthlyTrend.map((p) => ({
      label: p.label,
      revenueBilled: Number(p.invoiced || 0),
      cashReceived: Number(p.received || 0),
      netCashFlow: Number(p.received || 0) - Number(p.expenses || 0),
    }))
  }, [monthlyTrend])

  // Profitability by Job — jobs with any financial activity, sorted by invoiced desc
  const profitabilityRows = useMemo(() => {
    return filteredJobs
      .map((job) => {
        const jobInvoices = invoicesByJob.get(String(job.id)) || []
        const jobExpenses = expensesByJob.get(String(job.id)) || []
        const invoiced = jobInvoices.reduce((s, i) => s + (parseFloat(i.invoice_amount || i.grand_total || "0") || 0), 0)
        const expenseTotal = jobExpenses.reduce((s, e) => s + (parseFloat(e.amount || "0") || 0), 0)
        const received = jobInvoices
          .flatMap((inv) => receiptsByInvoice.get(String(inv.id)) || [])
          .reduce((s, r) => s + (parseFloat(r.amount || "0") || 0), 0)
        const net = invoiced - expenseTotal
        const margin = invoiced > 0 ? (net / invoiced) * 100 : 0
        const collectionRate = invoiced > 0 ? (received / invoiced) * 100 : 0
        const currency = jobInvoices[0]?.currency || jobExpenses[0]?.currency || "NGN"
        return {
          job,
          clientName: clientMap.get(String(job.client))?.client_name || "-",
          invoiced,
          expenseTotal,
          received,
          net,
          margin,
          collectionRate,
          currency,
        }
      })
      .filter((r) => r.invoiced > 0 || r.expenseTotal > 0)
      .sort((a, b) => b.invoiced - a.invoiced)
  }, [filteredJobs, invoicesByJob, expensesByJob, receiptsByInvoice, clientMap])

  // AR Aging — open invoices (ISSUED / PARTIALLY_PAID) bucketed by age
  const arAging = useMemo(() => {
    const now = new Date()
    const buckets: Record<string, { count: number; amount: number }> = {
      "0–30 days": { count: 0, amount: 0 },
      "31–60 days": { count: 0, amount: 0 },
      "61–90 days": { count: 0, amount: 0 },
      "91+ days": { count: 0, amount: 0 },
    }
    const currency = filteredInvoices[0]?.currency || "NGN"
    let totalOutstanding = 0

    filteredInvoices.forEach((inv) => {
      if (inv.status !== "ISSUED" && inv.status !== "PARTIALLY_PAID") return
      const invoiced = parseFloat(inv.invoice_amount || inv.grand_total || "0") || 0
      const received = (receiptsByInvoice.get(String(inv.id)) || [])
        .reduce((s, r) => s + (parseFloat(r.amount || "0") || 0), 0)
      const outstanding = Math.max(invoiced - received, 0)
      if (outstanding <= 0) return

      const issueDate = new Date(inv.issued_date || inv.created_at)
      if (!Number.isFinite(issueDate.getTime())) return
      const ageDays = Math.floor((now.getTime() - issueDate.getTime()) / 86_400_000)
      totalOutstanding += outstanding

      if (ageDays <= 30) { buckets["0–30 days"].count++; buckets["0–30 days"].amount += outstanding }
      else if (ageDays <= 60) { buckets["31–60 days"].count++; buckets["31–60 days"].amount += outstanding }
      else if (ageDays <= 90) { buckets["61–90 days"].count++; buckets["61–90 days"].amount += outstanding }
      else { buckets["91+ days"].count++; buckets["91+ days"].amount += outstanding }
    })

    return { buckets, currency, totalOutstanding }
  }, [filteredInvoices, receiptsByInvoice])

  // Top Clients by Revenue (up to 10)
  const topClients = useMemo(() => {
    const data = new Map<string, {
      clientName: string; jobCount: number; invoiced: number; received: number; currency: string
    }>()

    filteredJobs.forEach((job) => {
      const client = clientMap.get(String(job.client))
      if (!client) return
      const cid = String(job.client)
      if (!data.has(cid)) {
        data.set(cid, { clientName: client.client_name, jobCount: 0, invoiced: 0, received: 0, currency: "NGN" })
      }
      const d = data.get(cid)!
      d.jobCount++
      const jobInvoices = invoicesByJob.get(String(job.id)) || []
      jobInvoices.forEach((inv) => {
        d.invoiced += parseFloat(inv.invoice_amount || inv.grand_total || "0") || 0
        if (inv.currency) d.currency = inv.currency
          ; (receiptsByInvoice.get(String(inv.id)) || []).forEach((r) => {
            d.received += parseFloat(r.amount || "0") || 0
          })
      })
    })

    return [...data.values()]
      .filter((c) => c.invoiced > 0)
      .sort((a, b) => b.invoiced - a.invoiced)
      .slice(0, 10)
  }, [filteredJobs, clientMap, invoicesByJob, receiptsByInvoice])

  // Expense Category Breakdown
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
        const invoice = invoiceMap.get(String(rec.invoice))
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
  }, [filteredReceipts, invoiceMap, jobMap])

  const currency0 = metrics.currencies[0] || "NGN"
  const pendingJobCount = filteredJobs.filter((j) => isJobPending(j, trackerCompletionByJobId.get(String(j.id)))).length
  const completedJobCount = filteredJobs.filter((j) => !isJobPending(j, trackerCompletionByJobId.get(String(j.id)))).length
  const completionRate = metrics.jobCount > 0 ? (completedJobCount / metrics.jobCount) * 100 : 0
  const invoicedJobCount = profitabilityRows.filter((row) => row.invoiced > 0).length
  const unbilledJobCount = Math.max(metrics.jobCount - invoicedJobCount, 0)
  const collectionPendingJobCount = profitabilityRows.filter((row) => row.invoiced > row.received).length
  const overdue61Plus = (arAging.buckets["61–90 days"]?.amount || 0) + (arAging.buckets["91+ days"]?.amount || 0)
  const overdue61PlusCount = (arAging.buckets["61–90 days"]?.count || 0) + (arAging.buckets["91+ days"]?.count || 0)
  const topClientShare = topClients.length > 0 && metrics.totalInvoiceAmount > 0 ? (topClients[0].invoiced / metrics.totalInvoiceAmount) * 100 : 0
  const jobsAtLoss = profitabilityRows.filter((r) => r.net < 0).length
  const zeroCollectionJobs = profitabilityRows.filter((r) => r.invoiced > 0 && r.received === 0).length
  const latestCashHealth = monthlyCashHealth[monthlyCashHealth.length - 1] || { revenueBilled: 0, cashReceived: 0, netCashFlow: 0 }
  const averageJobCollectionRate = profitabilityRows.length > 0
    ? profitabilityRows.reduce((sum, row) => sum + row.collectionRate, 0) / profitabilityRows.length
    : 0

  const operationsVerdict: { text: string; tone: InsightTone } = pendingJobCount === 0 && unbilledJobCount === 0
    ? { text: "Ops clear", tone: "good" }
    : pendingJobCount > completedJobCount
      ? { text: "Open work high", tone: "warn" }
      : unbilledJobCount > 0
        ? { text: "Billing pending", tone: "warn" }
        : { text: "Ops stable", tone: "good" }

  const positionVerdict: { text: string; tone: InsightTone } = metrics.outstanding <= 0
    ? { text: "Position clear", tone: "good" }
    : metrics.collectionRate >= 80
      ? { text: "Collections strong", tone: "good" }
      : metrics.collectionRate >= 50
        ? { text: "Conversion mixed", tone: "warn" }
        : { text: "Collections weak", tone: "risk" }

  const collectionGap = latestCashHealth.revenueBilled - latestCashHealth.cashReceived
  const trendVerdict: { text: string; tone: InsightTone } = latestCashHealth.netCashFlow > 0 && collectionGap <= latestCashHealth.revenueBilled * 0.1
    ? { text: "Cash flow healthy", tone: "good" }
    : latestCashHealth.netCashFlow > 0
      ? { text: "Cash positive, gap remains", tone: "warn" }
      : collectionGap > 0
        ? { text: "Billing outruns cash", tone: "risk" }
        : { text: "Trend stable", tone: "neutral" }

  const riskVerdict: { text: string; tone: InsightTone } = overdue61Plus > 0 || jobsAtLoss > 0
    ? { text: "Active risk flags", tone: "risk" }
    : topClientShare > 50 || zeroCollectionJobs > 0
      ? { text: "Concentration risk", tone: "warn" }
      : { text: "Risk manageable", tone: "good" }

  const performanceVerdict: { text: string; tone: InsightTone } = metrics.netRevenue < 0
    ? { text: "Performance weak", tone: "risk" }
    : averageJobCollectionRate >= 80
      ? { text: "Performance strong", tone: "good" }
      : { text: "Performance uneven", tone: "warn" }

  const walkthroughSteps: Array<{ id: WalkthroughSectionId; short: string }> = [
    { id: "operations", short: "Jobs" },
    { id: "position", short: "Position" },
    { id: "trend", short: "Trend" },
    { id: "risk", short: "Risk" },
    { id: "performance", short: "Performance" },
  ]

  function toggleSection(section: WalkthroughSectionId) {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }))
  }

  function jumpToSection(section: WalkthroughSectionId) {
    setExpandedSections((current) => ({ ...current, [section]: true }))
    setActiveSection(section)
    window.setTimeout(() => {
      document.getElementById(`report-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 0)
  }

  useEffect(() => {
    const ids: WalkthroughSectionId[] = ["operations", "position", "trend", "risk", "performance"]

    function updateActiveSection() {
      let next: WalkthroughSectionId = "operations"
      let bestDistance = Number.POSITIVE_INFINITY

      ids.forEach((id) => {
        const element = document.getElementById(`report-${id}`)
        if (!element) return
        const distance = Math.abs(element.getBoundingClientRect().top - 140)
        if (distance < bestDistance) {
          bestDistance = distance
          next = id
        }
      })

      setActiveSection(next)
    }

    updateActiveSection()
    window.addEventListener("scroll", updateActiveSection, { passive: true })
    return () => window.removeEventListener("scroll", updateActiveSection)
  }, [])

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-blue-300">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-white/60">
            Executive dashboard — financial flow, job lifecycle, profitability, and receivables.
          </p>
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

      {error && (
        <div className="text-sm bg-red-500/10 text-red-200 border border-red-500/20 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by file number or client..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
            className="w-full bg-black/40 text-white border border-white/10 rounded-lg pl-4 pr-10 py-3 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("")
                setShowSuggestions(false)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition text-lg leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}

          {showSuggestions && searchSuggestions.length > 0 ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-black/95 shadow-xl">
              {searchSuggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSearchTerm(s.value)
                    setShowSuggestions(false)
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-white/85 hover:bg-white/10 transition"
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {searchTerm.trim() ? (
          <p className="mt-2 text-xs text-white/55">
            Showing {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"} matching "{searchTerm.trim()}".
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-600/10 via-slate-900/60 to-emerald-600/5 p-5 space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/80">Walkthrough</div>
            <h2 className="mt-1 font-semibold text-white">Read business fast</h2>
            {showDetailText ? (
              <p className="mt-1 text-xs text-white/55 max-w-3xl">Jobs, position, trend, risk, performance.</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/55 sm:grid-cols-5">
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">1. Jobs</div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">2. Position</div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">3. Trend</div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">4. Risk</div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">5. Performance</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <InsightCard
            title="Total Jobs"
            value={String(metrics.jobCount)}
            tone={metrics.jobCount > 0 ? "neutral" : "warn"}
            note={showDetailText ? `${pendingJobCount} pending · ${completedJobCount} complete` : undefined}
          />
          <InsightCard
            title="Pending Workload"
            value={String(pendingJobCount)}
            tone={pendingJobCount > completedJobCount ? "warn" : pendingJobCount > 0 ? "neutral" : "good"}
            note={showDetailText ? `${pct(completionRate)} completion` : undefined}
          />
          <InsightCard
            title="Immediate Job Follow-up"
            value={String(Math.max(unbilledJobCount, collectionPendingJobCount))}
            tone={Math.max(unbilledJobCount, collectionPendingJobCount) > 0 ? "warn" : "good"}
            note={showDetailText ? `${unbilledJobCount} unbilled · ${collectionPendingJobCount} awaiting collection` : undefined}
          />
        </div>
      </section>

      <section className="sticky top-3 z-20 rounded-2xl border border-white/10 bg-[#0b0f16]/85 p-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          {walkthroughSteps.map((item) => {
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => jumpToSection(item.id)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${isActive
                  ? "border-blue-500/30 bg-blue-600 text-white"
                  : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
                  }`}
              >
                {item.short}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setShowDetailText((prev) => !prev)}
            className="ml-auto rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"
          >
            {showDetailText ? "Hide details" : "Show details"}
          </button>
        </div>
      </section>

      <section id="report-operations" className="space-y-4 scroll-mt-24">
        <SectionHeader
          step="Jobs"
          title="Start with operational workload"
          description={showDetailText ? "Track open work, completions, and billing readiness." : undefined}
          verdict={operationsVerdict.text}
          verdictTone={operationsVerdict.tone}
          compact={!showDetailText}
          open={expandedSections.operations}
          onToggle={() => toggleSection("operations")}
        />
        {expandedSections.operations ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Total Jobs</div>
                <div className="mt-1 text-lg font-semibold text-white">{metrics.jobCount}</div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">Current scope.</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Pending Jobs</div>
                <div className="mt-1 text-lg font-semibold text-amber-300">{pendingJobCount}</div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">Still open.</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Completed Jobs</div>
                <div className="mt-1 text-lg font-semibold text-green-300">{completedJobCount}</div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">Tracker complete.</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Completion Rate</div>
                <div className={`mt-1 text-lg font-semibold ${completionRate >= 75 ? "text-green-300" : completionRate >= 40 ? "text-amber-300" : "text-red-300"}`}>{pct(completionRate)}</div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">Completed/total.</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Unbilled Jobs</div>
                <div className={`mt-1 text-lg font-semibold ${unbilledJobCount > 0 ? "text-red-300" : "text-green-300"}`}>{unbilledJobCount}</div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">No invoice yet.</div> : null}
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section id="report-position" className="space-y-4 scroll-mt-24">
        <SectionHeader
          step="Position"
          title="Start with current financial position"
          description={showDetailText ? "Compare billed, received, spent, and outstanding." : undefined}
          verdict={positionVerdict.text}
          verdictTone={positionVerdict.tone}
          compact={!showDetailText}
          open={expandedSections.position}
          onToggle={() => toggleSection("position")}
        />
        {expandedSections.position ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Expected Revenue"
                value={metrics.totalInvoiceAmount}
                currency={currency0}
                color="blue"
                subtext={showDetailText ? `${metrics.invoiceCount} invoice${metrics.invoiceCount !== 1 ? "s" : ""} · total billed` : undefined}
              />
              <StatCard
                label="Actual Revenue"
                value={metrics.totalReceiptAmount}
                currency={currency0}
                color="green"
                subtext={showDetailText ? `${metrics.receiptCount} receipt${metrics.receiptCount !== 1 ? "s" : ""} · ${pct(metrics.collectionRate)} collected` : undefined}
                onClick={() => setShowReceiptBreakdown(true)}
              />
              <StatCard
                label="Total Expenses"
                value={metrics.totalExpenseAmount}
                currency={currency0}
                color="amber"
                subtext={showDetailText ? `${metrics.expenseCount} expense${metrics.expenseCount !== 1 ? "s" : ""}` : undefined}
                onClick={() => setShowExpenseBreakdown(true)}
              />
              <StatCard
                label="Outstanding Balance"
                value={metrics.outstanding}
                currency={currency0}
                color={metrics.outstanding > 0 ? "red" : "green"}
                subtext={showDetailText
                  ? (metrics.outstanding > 0
                    ? "Due from clients"
                    : metrics.overpaid > 0
                      ? `Overpaid by ${currency0} ${money(metrics.overpaid)}`
                      : "All paid")
                  : undefined}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Gross Margin</div>
                <div className={`mt-1 text-lg font-semibold ${metrics.grossMargin >= 0 ? "text-green-300" : "text-red-300"}`}>
                  {pct(metrics.grossMargin)}
                </div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">(Expected − Expenses) ÷ Expected</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Collection Rate</div>
                <div className={`mt-1 text-lg font-semibold ${metrics.collectionRate >= 80 ? "text-green-300" : metrics.collectionRate >= 50 ? "text-amber-300" : "text-red-300"}`}>
                  {pct(metrics.collectionRate)}
                </div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">Actual ÷ Expected</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Total Jobs</div>
                <div className="mt-1 text-lg font-semibold text-white">{metrics.jobCount}</div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">{pendingJobCount} pending · {completedJobCount} complete</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Net Profit</div>
                <div className={`mt-1 text-lg font-semibold ${metrics.netRevenue >= 0 ? "text-green-300" : "text-red-300"}`}>
                  {currency0} {money(metrics.netRevenue)}
                </div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">Actual Revenue − Expenses</div> : null}
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section id="report-trend" className="space-y-4 scroll-mt-24">
        <SectionHeader
          step="Trend"
          title="Then read how money is moving over time"
          description={showDetailText ? "See monthly billing, collections, spend, and cash flow." : undefined}
          verdict={trendVerdict.text}
          verdictTone={trendVerdict.tone}
          compact={!showDetailText}
          open={expandedSections.trend}
          onToggle={() => toggleSection("trend")}
        />
        {expandedSections.trend ? (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-white">Financial Flow Trend</h3>
                {showDetailText ? <p className="text-xs text-white/55 mt-1">Monthly billed, received, and spent.</p> : null}
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <TrendLineCard title="Expenses" color="#f59e0b" valuePrefix={currency0} points={monthlyTrend.map((p) => ({ label: p.label, value: p.expenses }))} />
                <TrendLineCard title="Invoiced" color="#3b82f6" valuePrefix={currency0} points={monthlyTrend.map((p) => ({ label: p.label, value: p.invoiced }))} />
                <TrendLineCard title="Received" color="#22c55e" valuePrefix={currency0} points={monthlyTrend.map((p) => ({ label: p.label, value: p.received }))} />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-white">Cash Health Trend</h3>
                {showDetailText ? <p className="text-xs text-white/55 mt-1">Billed vs received, plus net cash flow.</p> : null}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TrendLineCard title="Revenue Billed" color="#f59e0b" valuePrefix={currency0} points={monthlyCashHealth.map((p) => ({ label: p.label, value: p.revenueBilled }))} />
                <TrendLineCard title="Cash Received" color="#22c55e" valuePrefix={currency0} points={monthlyCashHealth.map((p) => ({ label: p.label, value: p.cashReceived }))} />
                <TrendLineCard title="Net Cash Flow" color="#3b82f6" valuePrefix={currency0} points={monthlyCashHealth.map((p) => ({ label: p.label, value: p.netCashFlow }))} />
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section id="report-risk" className="space-y-4 scroll-mt-24">
        <SectionHeader
          step="Risk"
          title="Next isolate where risk is accumulating"
          description={showDetailText ? "Check overdue receivables and cost concentration." : undefined}
          verdict={riskVerdict.text}
          verdictTone={riskVerdict.tone}
          compact={!showDetailText}
          open={expandedSections.risk}
          onToggle={() => toggleSection("risk")}
        />
        {expandedSections.risk ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Overdue 61+ Days</div>
                <div className={`mt-1 text-lg font-semibold ${overdue61Plus > 0 ? "text-red-300" : "text-green-300"}`}>
                  {arAging.currency} {money(overdue61Plus)}
                </div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">{overdue61PlusCount} invoice{overdue61PlusCount !== 1 ? "s" : ""} overdue</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Client Concentration</div>
                <div className={`mt-1 text-lg font-semibold ${topClientShare > 50 ? "text-red-300" : topClientShare > 30 ? "text-amber-300" : "text-green-300"}`}>
                  {pct(topClientShare)}
                </div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">Top client's revenue share</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Jobs at Loss</div>
                <div className={`mt-1 text-lg font-semibold ${jobsAtLoss > 0 ? "text-red-300" : "text-green-300"}`}>
                  {jobsAtLoss}
                </div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">Expenses exceed invoiced</div> : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-white/60">Uncollected Jobs</div>
                <div className={`mt-1 text-lg font-semibold ${zeroCollectionJobs > 0 ? "text-amber-300" : "text-green-300"}`}>
                  {zeroCollectionJobs}
                </div>
                {showDetailText ? <div className="mt-1 text-xs text-white/45">Invoiced, nothing received</div> : null}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
                <div>
                  <h3 className="font-semibold text-white">Receivables Aging</h3>
                  {showDetailText ? <p className="text-xs text-white/55 mt-1">Outstanding invoices grouped by age.</p> : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-black/60">
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 text-left font-semibold text-white/90">Age</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Invoices</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Amount Due</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(arAging.buckets).map(([label, { count, amount }]) => (
                        <tr key={label} className="border-b border-white/5 hover:bg-white/5 transition">
                          <td className="px-4 py-3 text-white/85">{label}</td>
                          <td className="px-4 py-3 text-right text-white/80">{count}</td>
                          <td className="px-4 py-3 text-right font-semibold text-white">{arAging.currency} {money(amount)}</td>
                          <td className="px-4 py-3 text-right text-white/70">{arAging.totalOutstanding > 0 ? pct((amount / arAging.totalOutstanding) * 100) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/20 bg-white/5">
                        <td className="px-4 py-3 font-semibold text-white">Total</td>
                        <td className="px-4 py-3 text-right font-semibold text-white">{Object.values(arAging.buckets).reduce((s, b) => s + b.count, 0)}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-300">{arAging.currency} {money(arAging.totalOutstanding)}</td>
                        <td className="px-4 py-3 text-right text-white/70">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
                <div>
                  <h3 className="font-semibold text-white">Client Concentration</h3>
                  {showDetailText ? <p className="text-xs text-white/55 mt-1">Revenue share per client — high concentration = dependency risk.</p> : null}
                </div>
                {topClients.length === 0 ? (
                  <div className="text-sm text-white/60 py-4">No client revenue data yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-black/60">
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-3 text-left font-semibold text-white/90">Client</th>
                          <th className="px-4 py-3 text-right font-semibold text-white/90">Invoiced</th>
                          <th className="px-4 py-3 text-right font-semibold text-white/90">Collected</th>
                          <th className="px-4 py-3 text-right font-semibold text-white/90">Revenue Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topClients.slice(0, 5).map(({ clientName, invoiced, received, currency }) => {
                          const share = metrics.totalInvoiceAmount > 0 ? (invoiced / metrics.totalInvoiceAmount) * 100 : 0
                          const collected = invoiced > 0 ? (received / invoiced) * 100 : 0
                          return (
                            <tr key={clientName} className="border-b border-white/5 hover:bg-white/5 transition">
                              <td className="px-4 py-3 font-semibold text-white">{clientName}</td>
                              <td className="px-4 py-3 text-right text-white/85">{currency} {money(invoiced)}</td>
                              <td className={`px-4 py-3 text-right font-semibold ${collected >= 80 ? "text-green-300" : collected >= 40 ? "text-amber-300" : "text-red-300"}`}>
                                {pct(collected)}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold ${share > 50 ? "text-red-300" : share > 30 ? "text-amber-300" : "text-white/70"}`}>
                                {pct(share)}
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
          </>
        ) : null}
      </section>

      <section id="report-performance" className="space-y-4 scroll-mt-24">
        <SectionHeader
          step="Performance"
          title="Finish with who and what is performing"
          description={showDetailText ? "Identify profitable jobs and strongest clients." : undefined}
          verdict={performanceVerdict.text}
          verdictTone={performanceVerdict.tone}
          compact={!showDetailText}
          open={expandedSections.performance}
          onToggle={() => toggleSection("performance")}
        />
        {expandedSections.performance ? (
          <>
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-white">Profitability by Job</h3>
                {showDetailText ? <p className="text-xs text-white/55 mt-1">Jobs with activity, sorted by invoiced amount.</p> : null}
              </div>
              {profitabilityRows.length === 0 ? (
                <div className="text-sm text-white/60 py-4">No jobs with financial activity yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-black/60">
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 text-left font-semibold text-white/90">File #</th>
                        <th className="px-4 py-3 text-left font-semibold text-white/90">Client</th>
                        <th className="px-4 py-3 text-left font-semibold text-white/90">Zone</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Invoiced</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Expenses</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Net</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Margin</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitabilityRows.map(({ job, clientName, invoiced, expenseTotal, net, margin, collectionRate, currency }) => (
                        <tr key={job.id} className="border-b border-white/5 hover:bg-white/5 transition">
                          <td className="px-4 py-3 font-semibold text-white">{job.file_number}</td>
                          <td className="px-4 py-3 text-white/80">{clientName}</td>
                          <td className="px-4 py-3 text-white/70">{job.zone}</td>
                          <td className="px-4 py-3 text-right text-white/90">{currency} {money(invoiced)}</td>
                          <td className="px-4 py-3 text-right text-amber-200">{currency} {money(expenseTotal)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${net >= 0 ? "text-green-200" : "text-red-200"}`}>
                            {currency} {money(net)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold ${margin >= 30 ? "text-green-300" : margin >= 0 ? "text-amber-300" : "text-red-300"
                              }`}
                          >
                            {pct(margin)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold ${collectionRate >= 100
                              ? "text-green-300"
                              : collectionRate > 0
                                ? "text-amber-300"
                                : "text-white/40"
                              }`}
                          >
                            {pct(collectionRate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-white">Top Clients by Revenue</h3>
                {showDetailText ? <p className="text-xs text-white/55 mt-1">Top 10 by invoiced amount.</p> : null}
              </div>
              {topClients.length === 0 ? (
                <div className="text-sm text-white/60 py-4">No client revenue data yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-black/60">
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 text-left font-semibold text-white/90">#</th>
                        <th className="px-4 py-3 text-left font-semibold text-white/90">Client</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Jobs</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Invoiced</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Received</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Outstanding</th>
                        <th className="px-4 py-3 text-right font-semibold text-white/90">Collection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClients.map(({ clientName, jobCount, invoiced, received, currency }, i) => {
                        const outstanding = Math.max(invoiced - received, 0)
                        const collection = invoiced > 0 ? (received / invoiced) * 100 : 0
                        return (
                          <tr key={clientName} className="border-b border-white/5 hover:bg-white/5 transition">
                            <td className="px-4 py-3 text-white/40">{i + 1}</td>
                            <td className="px-4 py-3 font-semibold text-white">{clientName}</td>
                            <td className="px-4 py-3 text-right text-white/80">{jobCount}</td>
                            <td className="px-4 py-3 text-right text-white/90">{currency} {money(invoiced)}</td>
                            <td className="px-4 py-3 text-right text-green-200">{currency} {money(received)}</td>
                            <td className="px-4 py-3 text-right text-red-200">{currency} {money(outstanding)}</td>
                            <td
                              className={`px-4 py-3 text-right font-semibold ${collection >= 100
                                ? "text-green-300"
                                : collection >= 50
                                  ? "text-amber-300"
                                  : "text-red-300"
                                }`}
                            >
                              {pct(collection)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>

      {/* Expense Breakdown Modal */}
      {showExpenseBreakdown && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-2xl border border-white/10 bg-black text-white">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Expenses Breakdown</h2>
                <p className="text-xs text-white/60 mt-1">
                  Total: {currency0} {money(metrics.totalExpenseAmount)} · {metrics.expenseCount} records
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
              <div className="p-5 text-sm text-white/60">No expenses to display.</div>
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
      )}

      {/* Receipt Breakdown Modal */}
      {showReceiptBreakdown && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-2xl border border-white/10 bg-black text-white">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Receipts Breakdown</h2>
                <p className="text-xs text-white/60 mt-1">
                  Total: {currency0} {money(metrics.totalReceiptAmount)} · {metrics.receiptCount} records
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
              <div className="p-5 text-sm text-white/60">No receipts to display.</div>
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
      )}
    </div>
  )
}
