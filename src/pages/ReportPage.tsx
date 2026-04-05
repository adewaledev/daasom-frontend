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
import AlertBanner from "../components/AlertBanner"
import PageHeader from "../components/PageHeader"
import PaginationControls from "../components/PaginationControls"
import SearchPanel from "../components/SearchPanel"
import SurfaceCard from "../components/SurfaceCard"

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
  const cardClass = "bg-white border-slate-200"
  const valueColorMap = {
    blue: "text-blue-700",
    green: "text-emerald-700",
    amber: "text-amber-700",
    purple: "text-violet-700",
    red: "text-rose-700",
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left rounded-xl border ${cardClass} px-4 py-3 hover:bg-slate-50 transition`}
      >
        <div className="text-xs font-medium text-slate-600">{label}</div>
        <div className={`mt-1 text-lg font-semibold ${valueColorMap[color]}`}>
          {currency} {money(value)}
        </div>
        {subtext && <div className="mt-1 text-xs text-slate-600">{subtext}</div>}
      </button>
    )
  }

  return (
    <div className={`rounded-xl border ${cardClass} px-4 py-3`}>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${valueColorMap[color]}`}>
        {currency} {money(value)}
      </div>
      {subtext && <div className="mt-1 text-xs text-slate-600">{subtext}</div>}
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
    neutral: "text-slate-700 border-slate-200 bg-white",
    good: "text-green-700 border-green-200 bg-green-50",
    warn: "text-amber-700 border-amber-200 bg-amber-50",
    risk: "text-red-700 border-red-200 bg-red-50",
  }

  return (
    <div className="group flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700/80">{step}</div>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {description ? <p className="text-xs text-slate-600 max-w-3xl">{description}</p> : null}
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
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {open ? "Collapse" : "Expand"}
          </button>
        ) : null}
      </div>
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
  const pctTone = pctChange > 0 ? "text-emerald-700" : pctChange < 0 ? "text-rose-700" : "text-slate-600"
  const latestValueText =
    valueType === "count" ? String(Math.round(latest)) : `${valuePrefix} ${money(latest)}`

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-slate-600">{title}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{latestValueText}</div>
        </div>
        <div className={`text-xs font-semibold ${pctTone}`}>{pctText} vs prev month</div>
      </div>

      {points.length === 0 ? (
        <div className="text-sm text-slate-600 py-3">No trend data.</div>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28" preserveAspectRatio="none">
              {[0.25, 0.5, 0.75, 1].map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  y1={height - height * tick}
                  x2={width}
                  y2={height - height * tick}
                  stroke="rgba(148,163,184,0.35)"
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
          <div className="flex items-center justify-between text-[11px] text-slate-600">
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
  const [concentrationPage, setConcentrationPage] = useState(1)
  const [profitabilityPage, setProfitabilityPage] = useState(1)
  const [topClientsPage, setTopClientsPage] = useState(1)
  const [expenseBreakdownPage, setExpenseBreakdownPage] = useState(1)
  const [receiptBreakdownPage, setReceiptBreakdownPage] = useState(1)
  const itemsPerPage = 10

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

  // Top Clients by Revenue
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

  const concentrationTotalPages = useMemo(() => Math.max(1, Math.ceil(topClients.length / itemsPerPage)), [topClients.length])
  const profitabilityTotalPages = useMemo(() => Math.max(1, Math.ceil(profitabilityRows.length / itemsPerPage)), [profitabilityRows.length])
  const topClientsTotalPages = useMemo(() => Math.max(1, Math.ceil(topClients.length / itemsPerPage)), [topClients.length])
  const expenseBreakdownTotalPages = useMemo(() => Math.max(1, Math.ceil(expenseBreakdownRows.length / itemsPerPage)), [expenseBreakdownRows.length])
  const receiptBreakdownTotalPages = useMemo(() => Math.max(1, Math.ceil(receiptBreakdownRows.length / itemsPerPage)), [receiptBreakdownRows.length])

  const paginatedConcentrationClients = useMemo(() => {
    const start = (concentrationPage - 1) * itemsPerPage
    return topClients.slice(start, start + itemsPerPage)
  }, [topClients, concentrationPage])

  const paginatedProfitabilityRows = useMemo(() => {
    const start = (profitabilityPage - 1) * itemsPerPage
    return profitabilityRows.slice(start, start + itemsPerPage)
  }, [profitabilityRows, profitabilityPage])

  const paginatedTopClients = useMemo(() => {
    const start = (topClientsPage - 1) * itemsPerPage
    return topClients.slice(start, start + itemsPerPage)
  }, [topClients, topClientsPage])

  const paginatedExpenseBreakdownRows = useMemo(() => {
    const start = (expenseBreakdownPage - 1) * itemsPerPage
    return expenseBreakdownRows.slice(start, start + itemsPerPage)
  }, [expenseBreakdownRows, expenseBreakdownPage])

  const paginatedReceiptBreakdownRows = useMemo(() => {
    const start = (receiptBreakdownPage - 1) * itemsPerPage
    return receiptBreakdownRows.slice(start, start + itemsPerPage)
  }, [receiptBreakdownRows, receiptBreakdownPage])

  useEffect(() => {
    setConcentrationPage(1)
    setProfitabilityPage(1)
    setTopClientsPage(1)
    setExpenseBreakdownPage(1)
    setReceiptBreakdownPage(1)
  }, [searchTerm])

  useEffect(() => {
    if (concentrationPage > concentrationTotalPages) setConcentrationPage(concentrationTotalPages)
  }, [concentrationPage, concentrationTotalPages])

  useEffect(() => {
    if (profitabilityPage > profitabilityTotalPages) setProfitabilityPage(profitabilityTotalPages)
  }, [profitabilityPage, profitabilityTotalPages])

  useEffect(() => {
    if (topClientsPage > topClientsTotalPages) setTopClientsPage(topClientsTotalPages)
  }, [topClientsPage, topClientsTotalPages])

  useEffect(() => {
    if (expenseBreakdownPage > expenseBreakdownTotalPages) setExpenseBreakdownPage(expenseBreakdownTotalPages)
  }, [expenseBreakdownPage, expenseBreakdownTotalPages])

  useEffect(() => {
    if (receiptBreakdownPage > receiptBreakdownTotalPages) setReceiptBreakdownPage(receiptBreakdownTotalPages)
  }, [receiptBreakdownPage, receiptBreakdownTotalPages])

  useEffect(() => {
    if (showExpenseBreakdown) setExpenseBreakdownPage(1)
  }, [showExpenseBreakdown])

  useEffect(() => {
    if (showReceiptBreakdown) setReceiptBreakdownPage(1)
  }, [showReceiptBreakdown])

  const currency0 = metrics.currencies[0] || "NGN"
  const pendingJobCount = filteredJobs.filter((j) => isJobPending(j, trackerCompletionByJobId.get(String(j.id)))).length
  const completedJobCount = filteredJobs.filter((j) => !isJobPending(j, trackerCompletionByJobId.get(String(j.id)))).length
  const completionRate = metrics.jobCount > 0 ? (completedJobCount / metrics.jobCount) * 100 : 0
  const invoicedJobCount = profitabilityRows.filter((row) => row.invoiced > 0).length
  const unbilledJobCount = Math.max(metrics.jobCount - invoicedJobCount, 0)
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
    { id: "operations", short: "Operations" },
    { id: "position", short: "Position" },
    { id: "trend", short: "Trend" },
    { id: "risk", short: "Risk" },
    { id: "performance", short: "Performance" },
  ]

  function jumpToSection(section: WalkthroughSectionId) {
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
    <div className="space-y-6 text-slate-800">
      {/* Header */}
      <PageHeader
        title="Reports & Analytics"
        description="Executive view of operating throughput, cash position, profitability, and receivables risk."
        actions={(
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        )}
      />

      {error && (
        <AlertBanner tone="error" message={error} className="rounded-lg" />
      )}

      <SearchPanel className="p-5">
        <div className="relative">
          <input
            type="text"
            aria-label="Search report by file number or client"
            placeholder="Search by file number or client..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
            className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg pl-4 pr-10 py-3 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("")
                setShowSuggestions(false)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-700 transition text-lg leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}

          {showSuggestions && searchSuggestions.length > 0 ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
              {searchSuggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSearchTerm(s.value)
                    setShowSuggestions(false)
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 transition"
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {searchTerm.trim() ? (
          <p className="mt-2 text-xs text-slate-600">
            Showing {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"} matching "{searchTerm.trim()}".
          </p>
        ) : null}
      </SearchPanel>

      <section className="sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/90 p-2 sm:top-3 sm:p-3 backdrop-blur-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {walkthroughSteps.map((item) => {
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => jumpToSection(item.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition sm:px-3 sm:py-2 sm:text-xs ${isActive
                  ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
              >
                {item.short}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setShowDetailText((prev) => !prev)}
            className="w-full sm:w-auto sm:ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {showDetailText ? "Hide details" : "Show details"}
          </button>
        </div>
      </section>

      <section id="report-operations" className="space-y-5 scroll-mt-24">
        <SectionHeader
          step="Operations"
          title="Operational Throughput"
          description={showDetailText ? "Monitor open workload, completion velocity, and billing readiness." : undefined}
          verdict={operationsVerdict.text}
          verdictTone={operationsVerdict.tone}
          compact={!showDetailText}
        />
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Total Work Orders</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{metrics.jobCount}</div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">Current operational scope.</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Open Work Orders</div>
              <div className="mt-1 text-lg font-semibold text-amber-700">{pendingJobCount}</div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">Awaiting completion.</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Completed Work Orders</div>
              <div className="mt-1 text-lg font-semibold text-emerald-700">{completedJobCount}</div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">Closed in tracker workflow.</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Completion Rate</div>
              <div className={`mt-1 text-lg font-semibold ${completionRate >= 75 ? "text-emerald-700" : completionRate >= 40 ? "text-amber-700" : "text-rose-700"}`}>{pct(completionRate)}</div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">Completed/total.</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Unbilled Jobs</div>
              <div className={`mt-1 text-lg font-semibold ${unbilledJobCount > 0 ? "text-rose-700" : "text-emerald-700"}`}>{unbilledJobCount}</div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">No invoice yet.</div> : null}
            </div>
          </div>
        </>
      </section>

      <section id="report-position" className="space-y-5 scroll-mt-24">
        <SectionHeader
          step="Position"
          title="Current Financial Position"
          description={showDetailText ? "Compare billed value, collected cash, operating spend, and outstanding exposure." : undefined}
          verdict={positionVerdict.text}
          verdictTone={positionVerdict.tone}
          compact={!showDetailText}
        />
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Billed Revenue"
              value={metrics.totalInvoiceAmount}
              currency={currency0}
              color="blue"
              subtext={showDetailText ? `${metrics.invoiceCount} invoice${metrics.invoiceCount !== 1 ? "s" : ""} · gross billed value` : undefined}
            />
            <StatCard
              label="Collected Revenue"
              value={metrics.totalReceiptAmount}
              currency={currency0}
              color="green"
              subtext={showDetailText ? `${metrics.receiptCount} receipt${metrics.receiptCount !== 1 ? "s" : ""} · ${pct(metrics.collectionRate)} realization` : undefined}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Gross Margin</div>
              <div className={`mt-1 text-lg font-semibold ${metrics.grossMargin >= 0 ? "text-green-700" : "text-red-700"}`}>
                {pct(metrics.grossMargin)}
              </div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">(Expected − Expenses) ÷ Expected</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Collection Rate</div>
              <div className={`mt-1 text-lg font-semibold ${metrics.collectionRate >= 80 ? "text-green-700" : metrics.collectionRate >= 50 ? "text-amber-700" : "text-red-700"}`}>
                {pct(metrics.collectionRate)}
              </div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">Actual ÷ Expected</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Total Jobs</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{metrics.jobCount}</div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">{pendingJobCount} pending · {completedJobCount} complete</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Net Profit</div>
              <div className={`mt-1 text-lg font-semibold ${metrics.netRevenue >= 0 ? "text-green-700" : "text-red-700"}`}>
                {currency0} {money(metrics.netRevenue)}
              </div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">Actual Revenue − Expenses</div> : null}
            </div>
          </div>
        </>
      </section>

      <section id="report-trend" className="space-y-5 scroll-mt-24">
        <SectionHeader
          step="Trend"
          title="Financial Movement Over Time"
          description={showDetailText ? "Track monthly billings, collections, spend profile, and net cash trajectory." : undefined}
          verdict={trendVerdict.text}
          verdictTone={trendVerdict.tone}
          compact={!showDetailText}
        />
        <>
          <div className="rounded-2xl border border-slate-200 bg-white backdrop-blur p-5 space-y-5">
            <div>
              <h3 className="font-semibold text-slate-900">Financial Flow Trend</h3>
              {showDetailText ? <p className="text-xs text-slate-600 mt-1">Monthly billings, collections, and operating cost profile.</p> : null}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <TrendLineCard title="Operating Expenses" color="#f59e0b" valuePrefix={currency0} points={monthlyTrend.map((p) => ({ label: p.label, value: p.expenses }))} />
              <TrendLineCard title="Revenue Billed" color="#3b82f6" valuePrefix={currency0} points={monthlyTrend.map((p) => ({ label: p.label, value: p.invoiced }))} />
              <TrendLineCard title="Cash Collected" color="#22c55e" valuePrefix={currency0} points={monthlyTrend.map((p) => ({ label: p.label, value: p.received }))} />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white backdrop-blur p-5 space-y-5">
            <div>
              <h3 className="font-semibold text-slate-900">Cash Health Trend</h3>
              {showDetailText ? <p className="text-xs text-slate-600 mt-1">Billed vs received, plus net cash flow.</p> : null}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TrendLineCard title="Revenue Billed" color="#f59e0b" valuePrefix={currency0} points={monthlyCashHealth.map((p) => ({ label: p.label, value: p.revenueBilled }))} />
              <TrendLineCard title="Cash Received" color="#22c55e" valuePrefix={currency0} points={monthlyCashHealth.map((p) => ({ label: p.label, value: p.cashReceived }))} />
              <TrendLineCard title="Net Cash Flow" color="#3b82f6" valuePrefix={currency0} points={monthlyCashHealth.map((p) => ({ label: p.label, value: p.netCashFlow }))} />
            </div>
          </div>
        </>
      </section>

      <section id="report-risk" className="space-y-5 scroll-mt-24">
        <SectionHeader
          step="Risk"
          title="Risk Exposure"
          description={showDetailText ? "Assess overdue receivables, client concentration, and loss pockets." : undefined}
          verdict={riskVerdict.text}
          verdictTone={riskVerdict.tone}
          compact={!showDetailText}
        />
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Overdue 61+ Days</div>
              <div className={`mt-1 text-lg font-semibold ${overdue61Plus > 0 ? "text-red-700" : "text-green-700"}`}>
                {arAging.currency} {money(overdue61Plus)}
              </div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">{overdue61PlusCount} invoice{overdue61PlusCount !== 1 ? "s" : ""} overdue</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Client Concentration</div>
              <div className={`mt-1 text-lg font-semibold ${topClientShare > 50 ? "text-red-700" : topClientShare > 30 ? "text-amber-700" : "text-green-700"}`}>
                {pct(topClientShare)}
              </div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">Top client's revenue share</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Jobs at Loss</div>
              <div className={`mt-1 text-lg font-semibold ${jobsAtLoss > 0 ? "text-red-700" : "text-green-700"}`}>
                {jobsAtLoss}
              </div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">Expenses exceed invoiced</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-600">Uncollected Jobs</div>
              <div className={`mt-1 text-lg font-semibold ${zeroCollectionJobs > 0 ? "text-amber-700" : "text-green-700"}`}>
                {zeroCollectionJobs}
              </div>
              {showDetailText ? <div className="mt-1 text-xs text-slate-600">Invoiced, nothing received</div> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur p-5 space-y-5">
              <div>
                <h3 className="font-semibold text-slate-900">Receivables Aging</h3>
                {showDetailText ? <p className="text-xs text-slate-600 mt-1">Outstanding invoices grouped by age.</p> : null}
              </div>
              <div className="space-y-3 md:hidden">
                {Object.entries(arAging.buckets).map(([label, { count, amount }]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-600">{label}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{arAging.currency} {money(amount)}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-700">
                      <span>{count} invoice{count !== 1 ? "s" : ""}</span>
                      <span>{arAging.totalOutstanding > 0 ? pct((amount / arAging.totalOutstanding) * 100) : "—"}</span>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-white/15 bg-white p-3">
                  <div className="text-xs text-slate-600">Total Outstanding</div>
                  <div className="mt-1 text-sm font-semibold text-red-700">{arAging.currency} {money(arAging.totalOutstanding)}</div>
                </div>
              </div>
              <div className="hidden md:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="min-w-[680px] w-full text-xs sm:text-sm">
                  <thead className="bg-slate-100">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Age</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-900">Invoices</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-900">Amount Due</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-900">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(arAging.buckets).map(([label, { count, amount }]) => (
                      <tr key={label} className="border-b border-slate-100 hover:bg-white transition">
                        <td className="px-4 py-3 text-slate-800">{label}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{count}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{arAging.currency} {money(amount)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{arAging.totalOutstanding > 0 ? pct((amount / arAging.totalOutstanding) * 100) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/20 bg-white">
                      <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{Object.values(arAging.buckets).reduce((s, b) => s + b.count, 0)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-700">{arAging.currency} {money(arAging.totalOutstanding)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur p-5 space-y-5">
              <div>
                <h3 className="font-semibold text-slate-900">Client Concentration</h3>
                {showDetailText ? <p className="text-xs text-slate-600 mt-1">Revenue share per client — high concentration = dependency risk.</p> : null}
              </div>
              {topClients.length === 0 ? (
                <div className="text-sm text-slate-600 py-4">No client revenue data yet.</div>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {paginatedConcentrationClients.map(({ clientName, invoiced, received, currency }) => {
                      const share = metrics.totalInvoiceAmount > 0 ? (invoiced / metrics.totalInvoiceAmount) * 100 : 0
                      const collected = invoiced > 0 ? (received / invoiced) * 100 : 0
                      return (
                        <div key={clientName} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-sm font-semibold text-slate-900">{clientName}</div>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                            <span>Invoiced</span>
                            <span className="text-slate-800">{currency} {money(invoiced)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                            <span>Collected</span>
                            <span className={`${collected >= 80 ? "text-green-700" : collected >= 40 ? "text-amber-700" : "text-red-700"}`}>{pct(collected)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                            <span>Revenue Share</span>
                            <span className={`${share > 50 ? "text-red-700" : share > 30 ? "text-amber-700" : "text-slate-700"}`}>{pct(share)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="hidden md:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                    <table className="min-w-[680px] w-full text-xs sm:text-sm">
                      <thead className="bg-slate-100">
                        <tr className="border-b border-slate-200">
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Client</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">Invoiced</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">Collected</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">Revenue Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedConcentrationClients.map(({ clientName, invoiced, received, currency }) => {
                          const share = metrics.totalInvoiceAmount > 0 ? (invoiced / metrics.totalInvoiceAmount) * 100 : 0
                          const collected = invoiced > 0 ? (received / invoiced) * 100 : 0
                          return (
                            <tr key={clientName} className="border-b border-slate-100 hover:bg-white transition">
                              <td className="px-4 py-3 font-semibold text-slate-900">{clientName}</td>
                              <td className="px-4 py-3 text-right text-slate-800">{currency} {money(invoiced)}</td>
                              <td className={`px-4 py-3 text-right font-semibold ${collected >= 80 ? "text-green-700" : collected >= 40 ? "text-amber-700" : "text-red-700"}`}>
                                {pct(collected)}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold ${share > 50 ? "text-red-700" : share > 30 ? "text-amber-700" : "text-slate-700"}`}>
                                {pct(share)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <PaginationControls
                    currentPage={concentrationPage}
                    totalPages={concentrationTotalPages}
                    totalItems={topClients.length}
                    itemsPerPage={itemsPerPage}
                    onPrevious={() => setConcentrationPage((page) => Math.max(1, page - 1))}
                    onNext={() => setConcentrationPage((page) => Math.min(concentrationTotalPages, page + 1))}
                    className="px-0 pb-0"
                  />
                </>
              )}
            </section>
          </div>
        </>
      </section>

      <section id="report-performance" className="space-y-5 scroll-mt-24">
        <SectionHeader
          step="Performance"
          title="Performance Attribution"
          description={showDetailText ? "Identify high-performing jobs and top-contributing clients." : undefined}
          verdict={performanceVerdict.text}
          verdictTone={performanceVerdict.tone}
          compact={!showDetailText}
        />
        <>
          <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur p-5 space-y-5">
            <div>
              <h3 className="font-semibold text-slate-900">Profitability by Job</h3>
              {showDetailText ? <p className="text-xs text-slate-600 mt-1">Jobs with activity, sorted by invoiced amount.</p> : null}
            </div>
            {profitabilityRows.length === 0 ? (
              <div className="text-sm text-slate-600 py-4">No jobs with financial activity yet.</div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {paginatedProfitabilityRows.map(({ job, clientName, invoiced, expenseTotal, net, margin, collectionRate, currency }) => (
                    <div key={job.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{job.file_number}</div>
                          <div className="text-xs text-slate-600">{clientName} · {job.zone}</div>
                        </div>
                        <div className={`text-sm font-semibold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>{currency} {money(net)}</div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <div className="text-slate-600">Invoiced</div>
                          <div className="mt-0.5 text-slate-900">{currency} {money(invoiced)}</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <div className="text-slate-600">Expenses</div>
                          <div className="mt-0.5 text-amber-700">{currency} {money(expenseTotal)}</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <div className="text-slate-600">Margin</div>
                          <div className={`mt-0.5 ${margin >= 30 ? "text-green-700" : margin >= 0 ? "text-amber-700" : "text-red-700"}`}>{pct(margin)}</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <div className="text-slate-600">Collected</div>
                          <div className={`mt-0.5 ${collectionRate >= 100 ? "text-green-700" : collectionRate > 0 ? "text-amber-700" : "text-slate-600"}`}>{pct(collectionRate)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <table className="min-w-[760px] w-full text-xs sm:text-sm">
                    <thead className="bg-slate-100">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-900">File #</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-900">Client</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-900">Zone</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Invoiced</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Expenses</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Net</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Margin</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProfitabilityRows.map(({ job, clientName, invoiced, expenseTotal, net, margin, collectionRate, currency }) => (
                        <tr key={job.id} className="border-b border-slate-100 hover:bg-white transition">
                          <td className="px-4 py-3 font-semibold text-slate-900">{job.file_number}</td>
                          <td className="px-4 py-3 text-slate-700">{clientName}</td>
                          <td className="px-4 py-3 text-slate-700">{job.zone}</td>
                          <td className="px-4 py-3 text-right text-slate-900">{currency} {money(invoiced)}</td>
                          <td className="px-4 py-3 text-right text-amber-700">{currency} {money(expenseTotal)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>
                            {currency} {money(net)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold ${margin >= 30 ? "text-green-700" : margin >= 0 ? "text-amber-700" : "text-red-700"
                              }`}
                          >
                            {pct(margin)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold ${collectionRate >= 100
                              ? "text-green-700"
                              : collectionRate > 0
                                ? "text-amber-700"
                                : "text-slate-600"
                              }`}
                          >
                            {pct(collectionRate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  currentPage={profitabilityPage}
                  totalPages={profitabilityTotalPages}
                  totalItems={profitabilityRows.length}
                  itemsPerPage={itemsPerPage}
                  onPrevious={() => setProfitabilityPage((page) => Math.max(1, page - 1))}
                  onNext={() => setProfitabilityPage((page) => Math.min(profitabilityTotalPages, page + 1))}
                  className="px-0 pb-0"
                />
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur p-5 space-y-5">
            <div>
              <h3 className="font-semibold text-slate-900">Top Clients by Revenue</h3>
              {showDetailText ? <p className="text-xs text-slate-600 mt-1">Clients ranked by invoiced amount.</p> : null}
            </div>
            {topClients.length === 0 ? (
              <div className="text-sm text-slate-600 py-4">No client revenue data yet.</div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {paginatedTopClients.map(({ clientName, jobCount, invoiced, received, currency }, i) => {
                    const outstanding = Math.max(invoiced - received, 0)
                    const collection = invoiced > 0 ? (received / invoiced) * 100 : 0
                    const rank = (topClientsPage - 1) * itemsPerPage + i + 1
                    return (
                      <div key={clientName} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">{rank}. {clientName}</div>
                          <div className="text-xs text-slate-600">{jobCount} jobs</div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                            <div className="text-slate-600">Invoiced</div>
                            <div className="mt-0.5 text-slate-900">{currency} {money(invoiced)}</div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                            <div className="text-slate-600">Received</div>
                            <div className="mt-0.5 text-green-700">{currency} {money(received)}</div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                            <div className="text-slate-600">Outstanding</div>
                            <div className="mt-0.5 text-red-700">{currency} {money(outstanding)}</div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                            <div className="text-slate-600">Collection</div>
                            <div className={`mt-0.5 ${collection >= 100 ? "text-green-700" : collection >= 50 ? "text-amber-700" : "text-red-700"}`}>{pct(collection)}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="hidden md:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <table className="min-w-[760px] w-full text-xs sm:text-sm">
                    <thead className="bg-slate-100">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-900">#</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-900">Client</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Jobs</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Invoiced</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Received</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Outstanding</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Collection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTopClients.map(({ clientName, jobCount, invoiced, received, currency }, i) => {
                        const outstanding = Math.max(invoiced - received, 0)
                        const collection = invoiced > 0 ? (received / invoiced) * 100 : 0
                        const rank = (topClientsPage - 1) * itemsPerPage + i + 1
                        return (
                          <tr key={clientName} className="border-b border-slate-100 hover:bg-white transition">
                            <td className="px-4 py-3 text-slate-600">{rank}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">{clientName}</td>
                            <td className="px-4 py-3 text-right text-slate-700">{jobCount}</td>
                            <td className="px-4 py-3 text-right text-slate-900">{currency} {money(invoiced)}</td>
                            <td className="px-4 py-3 text-right text-green-700">{currency} {money(received)}</td>
                            <td className="px-4 py-3 text-right text-red-700">{currency} {money(outstanding)}</td>
                            <td
                              className={`px-4 py-3 text-right font-semibold ${collection >= 100
                                ? "text-green-700"
                                : collection >= 50
                                  ? "text-amber-700"
                                  : "text-red-700"
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
                <PaginationControls
                  currentPage={topClientsPage}
                  totalPages={topClientsTotalPages}
                  totalItems={topClients.length}
                  itemsPerPage={itemsPerPage}
                  onPrevious={() => setTopClientsPage((page) => Math.max(1, page - 1))}
                  onNext={() => setTopClientsPage((page) => Math.min(topClientsTotalPages, page + 1))}
                  className="px-0 pb-0"
                />
              </>
            )}
          </section>
        </>
      </section>

      {/* Expense Breakdown Modal */}
      {showExpenseBreakdown && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900">
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 flex items-start gap-3 justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Expenses Breakdown</h2>
                <p className="text-xs text-slate-600 mt-1">
                  Total: {currency0} {money(metrics.totalExpenseAmount)} · {metrics.expenseCount} records
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExpenseBreakdown(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
              >
                Close
              </button>
            </div>
            {expenseBreakdownRows.length === 0 ? (
              <div className="p-5 text-sm text-slate-600">No expenses to display.</div>
            ) : (
              <div className="overflow-auto max-h-[74vh] p-5 space-y-5">
                <table className="min-w-[900px] w-full text-xs sm:text-sm">
                  <thead className="bg-white text-slate-900 sticky top-0">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">File #</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Zone</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Category</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Description</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-900">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedExpenseBreakdownRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-white transition">
                        <td className="px-4 py-3 text-slate-700">{row.expense_date}</td>
                        <td className="px-4 py-3 text-slate-900 font-semibold">{row.fileNumber}</td>
                        <td className="px-4 py-3 text-slate-700">{row.zone}</td>
                        <td className="px-4 py-3 text-slate-800">{row.category}</td>
                        <td className="px-4 py-3 text-slate-700">{row.description || ""}</td>
                        <td className="px-4 py-3 text-slate-700">{row.status}</td>
                        <td className="px-4 py-3 text-right text-slate-900 font-semibold">
                          {row.currency} {money(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls
                  currentPage={expenseBreakdownPage}
                  totalPages={expenseBreakdownTotalPages}
                  totalItems={expenseBreakdownRows.length}
                  itemsPerPage={itemsPerPage}
                  onPrevious={() => setExpenseBreakdownPage((page) => Math.max(1, page - 1))}
                  onNext={() => setExpenseBreakdownPage((page) => Math.min(expenseBreakdownTotalPages, page + 1))}
                  className="px-0 py-0"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receipt Breakdown Modal */}
      {showReceiptBreakdown && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900">
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 flex items-start gap-3 justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Receipts Breakdown</h2>
                <p className="text-xs text-slate-600 mt-1">
                  Total: {currency0} {money(metrics.totalReceiptAmount)} · {metrics.receiptCount} records
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptBreakdown(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
              >
                Close
              </button>
            </div>
            {receiptBreakdownRows.length === 0 ? (
              <div className="p-5 text-sm text-slate-600">No receipts to display.</div>
            ) : (
              <div className="overflow-auto max-h-[74vh] p-5 space-y-5">
                <table className="min-w-[900px] w-full text-xs sm:text-sm">
                  <thead className="bg-white text-slate-900 sticky top-0">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">File #</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Zone</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Invoice</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Method</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900">Reference</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-900">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReceiptBreakdownRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-white transition">
                        <td className="px-4 py-3 text-slate-700">{row.payment_date}</td>
                        <td className="px-4 py-3 text-slate-900 font-semibold">{row.fileNumber}</td>
                        <td className="px-4 py-3 text-slate-700">{row.zone}</td>
                        <td className="px-4 py-3 text-slate-800">{row.invoiceNumber}</td>
                        <td className="px-4 py-3 text-slate-700">{row.method || ""}</td>
                        <td className="px-4 py-3 text-slate-700">{row.reference || ""}</td>
                        <td className="px-4 py-3 text-right text-slate-900 font-semibold">
                          {row.currency} {money(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls
                  currentPage={receiptBreakdownPage}
                  totalPages={receiptBreakdownTotalPages}
                  totalItems={receiptBreakdownRows.length}
                  itemsPerPage={itemsPerPage}
                  onPrevious={() => setReceiptBreakdownPage((page) => Math.max(1, page - 1))}
                  onNext={() => setReceiptBreakdownPage((page) => Math.min(receiptBreakdownTotalPages, page + 1))}
                  className="px-0 py-0"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
