import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
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

export default function HomePage() {
  const [pendingJobCount, setPendingJobCount] = useState<number>(0)
  const [totalTrackerJobs, setTotalTrackerJobs] = useState<number>(0)

  useEffect(() => {
    let alive = true

    async function loadPending() {
      try {
        const jobs = (await listTrackerJobs()) as TrackerJobRow[]
        const pendingCount = jobs.filter((job) => !job.tracker_completed).length
        if (alive) {
          setPendingJobCount(pendingCount)
          setTotalTrackerJobs(jobs.length)
        }
      } catch {
        if (alive) {
          setPendingJobCount(0)
          setTotalTrackerJobs(0)
        }
      }
    }

    loadPending()
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
              Live view of workflow execution, billing momentum, and collection posture. Start with high-priority actions, then move into full module management.
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

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Tile
            title="Tracker"
            description={pendingJobCount > 0 ? "Resolve pending milestones and close out active workflow jobs." : "Review completed milestones and confirm no new pending tasks."}
            to="/tracker"
            badge={trackerBadge}
            badgeTone={trackerTone}
            badgeClassName="home-tracker-count"
          />
          <Tile
            title="Invoices"
            description="Issue fresh invoices, refresh totals, and close gaps on outstanding billings."
            to="/invoices"
            badge="Finance"
            badgeTone="blue"
          />
          <Tile
            title="Receipts"
            description="Capture collections quickly and maintain accurate cash-in visibility."
            to="/receipts"
            badge="Cash"
            badgeTone="blue"
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