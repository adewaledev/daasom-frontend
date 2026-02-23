import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { listJobMilestones } from "../api/jobMilestones"
import type { JobMilestone } from "../api/jobMilestones"

type BadgeTone = "blue" | "amber"

type TileProps = {
  title: string
  description: string
  to: string
  badge?: string
  badgeTone?: BadgeTone
  disabled?: boolean
}

function badgeClass(tone: BadgeTone) {
  const base = "text-xs font-semibold px-2 py-1 rounded-lg border"
  if (tone === "amber") return `${base} bg-amber-500/10 text-amber-200 border-amber-500/20`
  return `${base} bg-blue-600/15 text-blue-200 border-blue-500/20`
}

function Tile({ title, description, to, badge, badgeTone = "blue", disabled }: TileProps) {
  const base = "block rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-5 transition"
  const enabled =
    "hover:border-blue-500/40 hover:bg-white/7 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
  const disabledCls = "opacity-60 pointer-events-none"

  return (
    <Link to={to} className={[base, disabled ? disabledCls : enabled].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {badge ? <span className={badgeClass(badgeTone)}>{badge}</span> : null}
      </div>
      <p className="mt-2 text-sm text-white/70 leading-relaxed">{description}</p>
      <div className="mt-4 text-sm font-semibold text-blue-300">Open</div>
    </Link>
  )
}

export default function HomePage() {
  const [pendingJobCount, setPendingJobCount] = useState<number>(0)

  useEffect(() => {
    let alive = true

    async function loadPending() {
      try {
        const ms = (await listJobMilestones()) as JobMilestone[]
        const jobIds = new Set<string>()
        for (const m of ms) {
          if (m.status === "PENDING" && m.job) jobIds.add(String(m.job))
        }
        if (alive) setPendingJobCount(jobIds.size)
      } catch {
        if (alive) setPendingJobCount(0)
      }
    }

    loadPending()
    return () => {
      alive = false
    }
  }, [])

  const trackerBadge = useMemo(() => (pendingJobCount > 0 ? `${pendingJobCount} pending` : "Ready"), [pendingJobCount])
  const trackerTone: BadgeTone = pendingJobCount > 0 ? "amber" : "blue"

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-black via-black to-blue-950/40 p-6">
        <div className="flex items-center gap-3">
          <span className="inline-block h-3 w-3 rounded-sm bg-blue-600" />
          <h1 className="text-2xl font-semibold text-white tracking-wide">DAASOM</h1>
        </div>
        <p className="mt-2 text-sm text-white/70 max-w-2xl leading-relaxed">
          Operations dashboard — select a module to continue.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Tile title="Clients" description="Manage client profiles and status." to="/clients" badge="Ready" />
        <Tile title="Jobs" description="Create and manage jobs linked to clients." to="/jobs" badge="Ready" />
        <Tile title="Tracker" description="Milestones and progress per job." to="/tracker" badge={trackerBadge} badgeTone={trackerTone} />

        <Tile title="Expenses" description="Record operational expenses per job." to="/expenses" badge="Ready" />
        <Tile title="Invoices" description="Create, issue, and manage job invoices." to="/invoices" badge="Ready" />
        <Tile title="Receipts" description="Record payments against invoices." to="/receipts" badge="Ready" />

        <Tile title="Ledger" description="Read-only debits vs credits per job." to="/ledger" badge="Ready" />
        <Tile title="Documents" description="Upload and manage files linked to records." to="/documents" badge="Ready" />
      </section>
    </div>
  )
}