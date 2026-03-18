import { useEffect, useMemo, useState } from "react"
import type { Job } from "../api/jobs"
import { listJobs } from "../api/jobs"
import PaginationControls from "../components/PaginationControls"
import type { LedgerDirection, LedgerEntry } from "../api/ledger"
import { listLedger } from "../api/ledger"

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

function dirBadge(direction: LedgerDirection) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border"
  if (direction === "CREDIT") return `${base} bg-green-500/10 text-green-200 border-green-500/20`
  return `${base} bg-amber-500/10 text-amber-200 border-amber-500/20`
}

function typeBadge(entryType: LedgerEntry["entry_type"]) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border"
  if (entryType === "RECEIPT") return `${base} bg-blue-600/10 text-blue-200 border-blue-500/20`
  return `${base} bg-white/5 text-white/75 border-white/10`
}

function money(n: number) {
  if (!Number.isFinite(n)) return "0.00"
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function LedgerPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>(
    () => sessionStorage.getItem("ledger_selected_job") ?? "",
  )

  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>()
    for (const j of jobs) m.set(String(j.id), j)
    return m
  }, [jobs])

  const selectedJob = useMemo(() => jobMap.get(selectedJobId) ?? null, [jobMap, selectedJobId])

  function parseAmt(raw: string | number | undefined | null): number {
    const n = Number(String(raw ?? "").replace(/,/g, "").trim())
    return Number.isFinite(n) ? n : 0
  }

  const totals = useMemo(() => {
    let debit = 0
    let credit = 0
    // track first-seen currency per key so mixed currencies don't silently combine
    const currencies = new Set<string>()

    for (const e of entries) {
      if (e.currency) currencies.add(e.currency)
      const amt = parseAmt(e.amount)
      if (!amt) continue
      if (e.direction === "DEBIT") debit += amt
      else credit += amt
    }

    // profit/loss = income received (credit) minus costs incurred (debit)
    const balance = credit - debit
    const currency = [...currencies][0] || "NGN"
    const multiCurrency = currencies.size > 1
    return { debit, credit, balance, currency, multiCurrency }
  }, [entries])

  // pre-compute running P&L per row (CREDIT increases profit, DEBIT decreases)
  const entriesWithRunning = useMemo(() => {
    let running = 0
    return entries.map((e) => {
      const amt = parseAmt(e.amount)
      if (e.direction === "CREDIT") running += amt
      else running -= amt
      return { ...e, _running: running }
    })
  }, [entries])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(entriesWithRunning.length / itemsPerPage)), [entriesWithRunning.length])
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return entriesWithRunning.slice(start, start + itemsPerPage)
  }, [entriesWithRunning, currentPage])

  async function refreshJobs() {
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const j = await listJobs()
      setJobs(j)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load jobs.")
    } finally {
      setLoading(false)
    }
  }

  async function refreshEntries(jobId: string) {
    setError("")
    setInfo("")
    setLoadingEntries(true)
    try {
      const data = await listLedger({ job_id: jobId })
      const sorted = [...data].sort((a, b) => {
        const ad = a.event_date.localeCompare(b.event_date)
        if (ad !== 0) return ad
        return String(a.created_at).localeCompare(String(b.created_at))
      })
      setEntries(sorted)
      if (!sorted.length) setInfo("No ledger entries for this job.")
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load ledger.")
      setEntries([])
    } finally {
      setLoadingEntries(false)
    }
  }

  useEffect(() => {
    refreshJobs()
  }, [])

  useEffect(() => {
    if (selectedJobId) refreshEntries(selectedJobId)
    else setEntries([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedJobId])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-blue-300">Ledger</h1>
          <p className="mt-1 text-sm text-white/60">Debits (expenses) and credits (receipts) per job.</p>
        </div>

        <button
          type="button"
          onClick={() => {
            refreshJobs()
            if (selectedJobId) refreshEntries(selectedJobId)
          }}
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

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-white/80 mb-1">Job</label>
            <select
              className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={selectedJobId}
              onChange={(e) => {
                const id = e.target.value
                setSelectedJobId(id)
                if (id) sessionStorage.setItem("ledger_selected_job", id)
                else sessionStorage.removeItem("ledger_selected_job")
              }}
              disabled={loading}
            >
              <option value="">Select job</option>
              {jobs.map((j) => (
                <option key={j.id} value={String(j.id)}>
                  {j.file_number} — {j.zone}
                </option>
              ))}
            </select>
            {selectedJob ? (
              <div className="mt-1 text-xs text-white/55">
                {selectedJob.file_number} • {selectedJob.zone}
              </div>
            ) : null}
          </div>

          <div className="text-sm text-white/80">
            <div className="text-xs text-white/60">Currency</div>
            <div className="mt-1 font-semibold">{totals.currency}</div>
            <div className="mt-2 text-xs text-white/60">Rows</div>
            <div className="mt-1 font-semibold">{entries.length}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <div className="text-xs text-white/60">Total Debit</div>
            <div className="mt-1 text-base font-semibold text-white">
              {totals.currency} {money(totals.debit)}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <div className="text-xs text-white/60">Total Credit</div>
            <div className="mt-1 text-base font-semibold text-white">
              {totals.currency} {money(totals.credit)}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <div className="text-xs text-white/60">Profit / Loss</div>
            <div
              className={`mt-1 text-base font-semibold ${totals.balance >= 0 ? "text-green-300" : "text-red-300"
                }`}
            >
              {totals.balance < 0 ? "-" : ""}{totals.currency} {money(Math.abs(totals.balance))}
            </div>
            <div className="mt-0.5 text-xs text-white/50">
              {totals.balance > 0
                ? "Profit"
                : totals.balance < 0
                  ? "Loss"
                  : "Break even"}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Entries</h2>
          {loadingEntries ? <span className="text-sm text-white/60">Loading…</span> : null}
        </div>

        {!selectedJobId ? (
          <div className="p-5 text-sm text-white/60">Select a job.</div>
        ) : loadingEntries ? (
          <div className="p-5 text-sm text-white/60">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No entries.</div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {paginatedEntries.map((e) => (
                <div key={e.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{e.event_date}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={typeBadge(e.entry_type)}>{e.entry_type}</span>
                        <span className={dirBadge(e.direction)}>{e.direction}</span>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-white">{e.currency} {money(parseAmt(e.amount))}</div>
                  </div>
                  {e.description ? <div className="mt-2 text-xs text-white/70">{e.description}</div> : null}
                  <div className={`mt-2 text-xs font-semibold ${e._running >= 0 ? "text-green-300" : "text-red-300"}`}>
                    Running P/L: {e._running < 0 ? "-" : ""}{e.currency} {money(Math.abs(e._running))}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <table className="min-w-[720px] w-full text-xs sm:text-sm">
                <thead className="bg-black/60 text-white">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Direction</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Description</th>
                    <th className="px-4 py-3 text-left font-semibold text-white/90">Invoice</th>
                    <th className="px-4 py-3 text-right font-semibold text-white/90">Amount</th>
                    <th className="px-4 py-3 text-right font-semibold text-white/90">Running P&amp;L</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedEntries.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-white/80">{e.event_date}</td>
                      <td className="px-4 py-3">
                        <span className={typeBadge(e.entry_type)}>{e.entry_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={dirBadge(e.direction)}>{e.direction}</span>
                      </td>
                      <td className="px-4 py-3 text-white/90">{e.description || ""}</td>
                      <td className="px-4 py-3 text-white/70">{e.invoice_id ? String(e.invoice_id) : ""}</td>
                      <td className="px-4 py-3 text-right text-white/90 font-semibold">
                        {e.currency} {money(parseAmt(e.amount))}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${e._running >= 0 ? "text-green-300" : "text-red-300"
                          }`}
                      >
                        {e._running < 0 ? "-" : ""}{e.currency} {money(Math.abs(e._running))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={entriesWithRunning.length}
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