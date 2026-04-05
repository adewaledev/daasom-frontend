import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { listExpenses } from "../api/expenses"
import type { Expense } from "../api/expenses"
import { listInvoices } from "../api/invoices"
import type { Invoice } from "../api/invoices"
import { listReceipts } from "../api/receipts"
import type { Receipt } from "../api/receipts"
import { listTrackerJobs } from "../api/tracker"
import type { TrackerJobRow } from "../api/tracker"

type BadgeTone = "blue" | "amber"

type TileProps = {
  title: string
  description: string
  to: string
  badge?: string
  badgeTone?: BadgeTone
  badgeClassName?: string
  disabled?: boolean
}

type KpiCardProps = {
  label: string
  value: string
  note: string
  accent: "blue" | "amber" | "green"
}

type AttentionCardProps = {
  title: string
  value: string
  note: string
  to: string
  cta: string
  tone: "amber" | "blue"
}

function badgeClass(tone: BadgeTone) {
  const base = "text-xs font-semibold px-2 py-1 rounded-lg border"
  if (tone === "amber") return `${base} bg-amber-100 text-amber-700 border-amber-200`
  return `${base} bg-blue-100 text-blue-700 border-blue-200`
}

function Tile({ title, description, to, badge, badgeTone = "blue", badgeClassName, disabled }: TileProps) {
  const base = "group block rounded-2xl border border-slate-200 bg-white backdrop-blur px-5 py-5 shadow-sm transition duration-200"
  const enabled =
    "hover:-translate-y-0.5 hover:border-blue-500/40 hover:bg-slate-50 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
  const disabledCls = "opacity-60 pointer-events-none"

  return (
    <Link to={to} className={[base, disabled ? disabledCls : enabled].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900 transition group-hover:text-blue-800">{title}</h3>
        {badge ? <span className={`${badgeClass(badgeTone)} ${badgeClassName ?? ""}`.trim()}>{badge}</span> : null}
      </div>
      <p className="mt-2 text-sm text-slate-700 leading-relaxed">{description}</p>
    </Link>
  )
}

function accentClass(accent: KpiCardProps["accent"]) {
  if (accent === "amber") return "bg-amber-50 text-amber-700 border-amber-200"
  if (accent === "green") return "bg-green-50 text-green-700 border-green-200"
  return "bg-blue-50 text-blue-700 border-blue-200"
}

function KpiCard({ label, value, note, accent }: KpiCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{label}</p>
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${accentClass(accent)}`}>
          Live
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{note}</p>
    </article>
  )
}

function AttentionCard({ title, value, note, to, cta, tone }: AttentionCardProps) {
  const toneClass = tone === "amber"
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-blue-50 text-blue-700 border-blue-200"

  return (
    <Link
      to={to}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-500/40 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900 transition group-hover:text-blue-800">{title}</h3>
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${toneClass}`}>
          {value}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-700 leading-relaxed">{note}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-blue-700">{cta}</p>
    </Link>
  )
}

export default function HomePage() {
  const [pendingJobCount, setPendingJobCount] = useState<number>(0)
  const [totalTrackerJobs, setTotalTrackerJobs] = useState<number>(0)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])

  useEffect(() => {
    let alive = true

    async function loadSnapshot() {
      try {
        const [jobs, invoiceRows, receiptRows, expenseRows] = await Promise.all([
          listTrackerJobs() as Promise<TrackerJobRow[]>,
          listInvoices(),
          listReceipts(),
          listExpenses(),
        ])
        const pendingCount = jobs.filter((job) => !job.tracker_completed).length
        if (alive) {
          setPendingJobCount(pendingCount)
          setTotalTrackerJobs(jobs.length)
          setInvoices(invoiceRows)
          setReceipts(receiptRows)
          setExpenses(expenseRows)
        }
      } catch {
        if (alive) {
          setPendingJobCount(0)
          setTotalTrackerJobs(0)
          setInvoices([])
          setReceipts([])
          setExpenses([])
        }
      }
    }

    loadSnapshot()
    return () => {
      alive = false
    }
  }, [])

  const trackerBadge = useMemo(() => (pendingJobCount > 0 ? String(pendingJobCount) : undefined), [pendingJobCount])
  const trackerTone: BadgeTone = pendingJobCount > 0 ? "amber" : "blue"
  const completedTrackerJobs = Math.max(0, totalTrackerJobs - pendingJobCount)
  const completionRateText = totalTrackerJobs > 0
    ? `${Math.round((completedTrackerJobs / totalTrackerJobs) * 100)}%`
    : "0%"
  const overdueInvoiceCount = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const receiptTotalsByInvoice = new Map<string, number>()
    for (const receipt of receipts) {
      const invoiceId = String(receipt.invoice)
      const amount = Number(receipt.amount ?? 0)
      receiptTotalsByInvoice.set(invoiceId, (receiptTotalsByInvoice.get(invoiceId) ?? 0) + (Number.isFinite(amount) ? amount : 0))
    }

    return invoices.filter((invoice) => {
      if (invoice.status === "PAID" || invoice.status === "VOID") return false
      const due = invoice.due_date ? new Date(invoice.due_date) : null
      if (!due || !Number.isFinite(due.getTime())) return false

      const invoiceAmount = Number(invoice.invoice_amount ?? invoice.grand_total ?? 0)
      const billed = Number.isFinite(invoiceAmount) ? invoiceAmount : 0
      const received = receiptTotalsByInvoice.get(String(invoice.id)) ?? 0
      const outstanding = billed - received

      return due.getTime() < startOfToday.getTime() && outstanding > 0
    }).length
  }, [invoices, receipts])
  const uncollectedInvoiceCount = useMemo(() => {
    const receiptTotalsByInvoice = new Map<string, number>()
    for (const receipt of receipts) {
      const invoiceId = String(receipt.invoice)
      const amount = Number(receipt.amount ?? 0)
      receiptTotalsByInvoice.set(invoiceId, (receiptTotalsByInvoice.get(invoiceId) ?? 0) + (Number.isFinite(amount) ? amount : 0))
    }

    return invoices.filter((invoice) => {
      if (!(invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID")) return false
      const invoiceAmount = Number(invoice.invoice_amount ?? invoice.grand_total ?? 0)
      const billed = Number.isFinite(invoiceAmount) ? invoiceAmount : 0
      const received = receiptTotalsByInvoice.get(String(invoice.id)) ?? 0
      return billed - received > 0
    }).length
  }, [invoices, receipts])
  const pendingExpenseApprovalsCount = useMemo(
    () => expenses.filter((expense) => expense.status === "SUBMITTED").length,
    [expenses]
  )
  const snapshotTime = useMemo(
    () =>
      new Date().toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  )
  const trackerState = pendingJobCount > 0 ? "Needs attention" : "On track"
  const trackerStateNote = pendingJobCount > 0
    ? `${pendingJobCount} job${pendingJobCount === 1 ? "" : "s"} currently pending completion.`
    : "All tracker jobs currently marked as completed."

  return (
    <div className="space-y-6">
      <section className="home-hero relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-blue-50 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-blue-200/35 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-slate-300/20 blur-2xl" />
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />
              Operations cockpit
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 tracking-normal sm:text-3xl">Today at Daasom</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-700 leading-relaxed sm:text-[0.95rem]">
              Monitor pending tracker items, billing progress, and receipts in one place. Resolve urgent tasks first, then continue into each operational module.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-600">Last snapshot: {snapshotTime}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/jobs"
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:shadow"
            >
              Create Job
            </Link>
            <Link
              to="/tracker"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 hover:shadow"
            >
              Open Tracker
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pending Tracker Jobs"
          value={String(pendingJobCount)}
          note={pendingJobCount > 0 ? "Outstanding items requiring closure." : "No pending tracker items."}
          accent={pendingJobCount > 0 ? "amber" : "green"}
        />
        <KpiCard label="Tracker Status" value={trackerState} note={trackerStateNote} accent={pendingJobCount > 0 ? "amber" : "green"} />
        <KpiCard
          label="Completed Tracker Jobs"
          value={String(completedTrackerJobs)}
          note={totalTrackerJobs > 0 ? `${completedTrackerJobs} out of ${totalTrackerJobs} tracker jobs are closed.` : "No tracker jobs recorded yet."}
          accent={completedTrackerJobs > 0 ? "green" : "blue"}
        />
        <KpiCard
          label="Completion Rate"
          value={completionRateText}
          note={totalTrackerJobs > 0 ? "Share of tracker jobs currently marked as completed." : "Rate becomes available once jobs are tracked."}
          accent={pendingJobCount > 0 ? "amber" : "green"}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Needs Attention</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            Immediate priorities
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AttentionCard
            title="Pending Closures"
            value={String(pendingJobCount)}
            note={pendingJobCount > 0
              ? "Jobs still open in tracker. Close active milestones to reduce operational backlog."
              : "No pending closures at the moment."}
            to="/tracker"
            cta="Review pending jobs"
            tone="amber"
          />
          <AttentionCard
            title="Overdue Invoices"
            value={String(overdueInvoiceCount)}
            note={overdueInvoiceCount > 0
              ? "Invoices past due date with unpaid balance still outstanding."
              : "No overdue invoices currently detected."}
            to="/invoices"
            cta="Follow up collections"
            tone={overdueInvoiceCount > 0 ? "amber" : "blue"}
          />
          <AttentionCard
            title="Expense Approvals Pending"
            value={String(pendingExpenseApprovalsCount)}
            note={pendingExpenseApprovalsCount > 0
              ? "Submitted expenses waiting for approval and posting."
              : "No submitted expenses are awaiting approval."}
            to="/expenses"
            cta="Review expense queue"
            tone={pendingExpenseApprovalsCount > 0 ? "amber" : "blue"}
          />
          <AttentionCard
            title="Uncollected Invoices"
            value={String(uncollectedInvoiceCount)}
            note={uncollectedInvoiceCount > 0
              ? "Issued invoices still carrying an unpaid balance."
              : "All issued invoices are fully collected."}
            to="/receipts"
            cta="Post collections"
            tone={uncollectedInvoiceCount > 0 ? "amber" : "blue"}
          />
        </div>
      </section>

      <section className="pb-1">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Explore Modules</h2>
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Full workspace access</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Tile title="Clients" description="Manage client profiles and status." to="/clients" />
          <Tile title="Jobs" description="Create and manage jobs linked to clients." to="/jobs" />
          <Tile title="Tracker" description="Milestones and progress per job." to="/tracker" badge={trackerBadge} badgeTone={trackerTone} badgeClassName="home-tracker-count" />

          <Tile title="Expenses" description="Record operational expenses per job." to="/expenses" />
          <Tile title="Invoices" description="Create, issue, and manage job invoices." to="/invoices" />
          <Tile title="Receipts" description="Record payments against invoices." to="/receipts" />

          <Tile title="Ledger" description="Read-only debits vs credits per job." to="/ledger" />
          <Tile title="Documents" description="Upload and manage files linked to records." to="/documents" />
          <Tile title="Reports" description="Analytics and insights across jobs and finances." to="/reports" />
        </div>
      </section>
    </div>
  )
}