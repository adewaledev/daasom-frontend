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

function badgeClass(tone: BadgeTone) {
  const base = "text-xs font-semibold px-2 py-1 rounded-lg border"
  if (tone === "amber") return `${base} bg-amber-100 text-amber-700 border-amber-200`
  return `${base} bg-blue-100 text-blue-700 border-blue-200`
}

function Tile({ title, description, to, badge, badgeTone = "blue", badgeClassName, disabled }: TileProps) {
  const base = "block rounded-2xl border border-slate-200 bg-white backdrop-blur px-5 py-5 transition"
  const enabled =
    "hover:border-blue-500/40 hover:bg-slate-100 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
  const disabledCls = "opacity-60 pointer-events-none"

  return (
    <Link to={to} className={[base, disabled ? disabledCls : enabled].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {badge ? <span className={`${badgeClass(badgeTone)} ${badgeClassName ?? ""}`.trim()}>{badge}</span> : null}
      </div>
      <p className="mt-2 text-sm text-slate-700 leading-relaxed">{description}</p>
    </Link>
  )
}

export default function HomePage() {
  const [pendingJobCount, setPendingJobCount] = useState<number>(0)

  useEffect(() => {
    let alive = true

    async function loadPending() {
      try {
        const jobs = (await listTrackerJobs()) as TrackerJobRow[]
        const pendingCount = jobs.filter((job) => !job.tracker_completed).length
        if (alive) setPendingJobCount(pendingCount)
      } catch {
        if (alive) setPendingJobCount(0)
      }
    }

    loadPending()
    return () => {
      alive = false
    }
  }, [])

  const trackerBadge = useMemo(() => (pendingJobCount > 0 ? String(pendingJobCount) : undefined), [pendingJobCount])
  const trackerTone: BadgeTone = pendingJobCount > 0 ? "amber" : "blue"

  return (
    <div className="space-y-6">
      <section className="home-hero rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-blue-50 p-6">
        <div className="flex items-center gap-3">
          <span className="inline-block h-3 w-3 rounded-sm bg-blue-600" />
          <h1 className="text-2xl font-semibold text-slate-900 tracking-normal">DAASOM</h1>
        </div>
        <p className="mt-2 text-sm text-slate-700 max-w-2xl leading-relaxed">
          Operations dashboard — select a module to continue.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Tile title="Clients" description="Manage client profiles and status." to="/clients" />
        <Tile title="Jobs" description="Create and manage jobs linked to clients." to="/jobs" />
        <Tile
          title="Tracker"
          description="Milestones and progress per job."
          to="/tracker"
          badge={trackerBadge}
          badgeTone={trackerTone}
          badgeClassName="home-tracker-count"
        />

        <Tile title="Expenses" description="Record operational expenses per job." to="/expenses" />
        <Tile title="Invoices" description="Create, issue, and manage job invoices." to="/invoices" />
        <Tile title="Receipts" description="Record payments against invoices." to="/receipts" />

        <Tile title="Ledger" description="Read-only debits vs credits per job." to="/ledger" />
        <Tile title="Documents" description="Upload and manage files linked to records." to="/documents" />
        <Tile title="Reports" description="Analytics and insights across jobs and finances." to="/reports" />
      </section>
    </div>
  )
}