import { useEffect, useMemo, useState } from "react"
import type { Job } from "../api/jobs"
import { listJobs } from "../api/jobs"
import type { Invoice } from "../api/invoices"
import { listInvoices } from "../api/invoices"
import type { Receipt } from "../api/receipts"
import { listReceipts } from "../api/receipts"
import type { Document, DocumentType } from "../api/documents"
import { deleteDocument, downloadDocument, listDocumentsByJob, uploadDocument } from "../api/documents"

type UploadForm = {
  doc_type: DocumentType
  job_id: string
  invoice_id: string
  receipt_id: string
  file: File | null
}

const emptyForm: UploadForm = {
  doc_type: "JOB",
  job_id: "",
  invoice_id: "",
  receipt_id: "",
  file: null,
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return ""
  const units = ["B", "KB", "MB", "GB"]
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function typeBadge(t: DocumentType) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border"
  if (t === "INVOICE") return `${base} bg-blue-600/10 text-blue-200 border-blue-500/20`
  if (t === "RECEIPT") return `${base} bg-white/5 text-white/70 border-white/10`
  return `${base} bg-white/5 text-white/85 border-white/10`
}

export default function DocumentsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])

  const [selectedJobId, setSelectedJobId] = useState<string>("")
  const [docs, setDocs] = useState<Document[]>([])

  const [loading, setLoading] = useState(true)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [busy, setBusy] = useState(false)

  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [form, setForm] = useState<UploadForm>(emptyForm)

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>()
    for (const j of jobs) m.set(String(j.id), j)
    return m
  }, [jobs])

  const invoiceMap = useMemo(() => {
    const m = new Map<string, Invoice>()
    for (const inv of invoices) m.set(String(inv.id), inv)
    return m
  }, [invoices])

  async function refreshRefs() {
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const [j, inv, r] = await Promise.all([
        listJobs(),
        listInvoices().catch(() => [] as Invoice[]),
        listReceipts().catch(() => [] as Receipt[]),
      ])
      setJobs(j)
      setInvoices(inv)
      setReceipts(r)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load data.")
    } finally {
      setLoading(false)
    }
  }

  async function refreshDocs(jobId: string) {
    setError("")
    setInfo("")
    setLoadingDocs(true)
    try {
      const d = await listDocumentsByJob(jobId)
      const sorted = [...d].sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)))
      setDocs(sorted)
      if (!sorted.length) setInfo("No documents for this job.")
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Failed to load documents.")
      setDocs([])
    } finally {
      setLoadingDocs(false)
    }
  }

  useEffect(() => {
    refreshRefs()
  }, [])

  useEffect(() => {
    if (selectedJobId) refreshDocs(selectedJobId)
    else setDocs([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId])

  function linkPreview(d: Document) {
    if (d.doc_type === "JOB" && d.job_id) {
      const j = jobMap.get(String(d.job_id))
      return j ? `${j.file_number} • ${j.zone}` : ""
    }
    if (d.doc_type === "INVOICE" && d.invoice_id) {
      const inv = invoiceMap.get(String(d.invoice_id))
      return inv ? inv.invoice_number : ""
    }
    if (d.doc_type === "RECEIPT" && d.receipt_id) {
      return `Receipt ${String(d.receipt_id).slice(0, 8)}…`
    }
    return ""
  }

  function onDocTypeChange(t: DocumentType) {
    setForm((f) => ({
      ...f,
      doc_type: t,
      job_id: t === "JOB" ? (f.job_id || selectedJobId) : "",
      invoice_id: t === "INVOICE" ? f.invoice_id : "",
      receipt_id: t === "RECEIPT" ? f.receipt_id : "",
    }))
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setInfo("")
    setBusy(true)

    try {
      if (!form.file) {
        setError("File is required.")
        return
      }
      if (form.doc_type === "JOB" && !form.job_id) {
        setError("Job is required.")
        return
      }
      if (form.doc_type === "INVOICE" && !form.invoice_id) {
        setError("Invoice is required.")
        return
      }
      if (form.doc_type === "RECEIPT" && !form.receipt_id) {
        setError("Receipt is required.")
        return
      }

      const created = await uploadDocument({
        doc_type: form.doc_type,
        file: form.file,
        job_id: form.doc_type === "JOB" ? form.job_id : undefined,
        invoice_id: form.doc_type === "INVOICE" ? form.invoice_id : undefined,
        receipt_id: form.doc_type === "RECEIPT" ? form.receipt_id : undefined,
      })

      setInfo("Uploaded.")
      setForm((f) => ({ ...f, file: null }))

      const jobToRefresh = selectedJobId || created.job_id || (form.doc_type === "JOB" ? form.job_id : "")
      if (jobToRefresh) {
        if (!selectedJobId) setSelectedJobId(String(jobToRefresh))
        await refreshDocs(String(jobToRefresh))
      }

      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Upload failed.")
    } finally {
      setBusy(false)
    }
  }



  async function onDownload(d: Document) {
    setError("")
    setInfo("")
    setBusy(true)
    try {
      await downloadDocument({ id: d.id, url: d.url, filename: d.filename })
      setInfo("Download started.")
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Download failed.")
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(d: Document) {
    const ok = window.confirm(`Delete "${d.filename}"?`)
    if (!ok) return

    setError("")
    setInfo("")
    setBusy(true)
    try {
      await deleteDocument(d.id)
      setInfo("Deleted.")
      if (selectedJobId) await refreshDocs(selectedJobId)
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Delete failed.")
    } finally {
      setBusy(false)
    }
  }

  const selectedJobLabel = useMemo(() => {
    if (!selectedJobId) return ""
    const j = jobMap.get(selectedJobId)
    return j ? `${j.file_number} • ${j.zone}` : selectedJobId
  }, [jobMap, selectedJobId])

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-blue-300">Documents</h1>
          <p className="mt-1 text-sm text-white/60">Upload files linked to jobs, invoices, or receipts.</p>
        </div>

        <button
          type="button"
          onClick={async () => {
            await refreshRefs()
            if (selectedJobId) await refreshDocs(selectedJobId)
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

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <label className="block text-sm font-semibold text-white/80 mb-1">Job</label>
        <select
          className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          disabled={loading || busy}
        >
          <option value="">Select job</option>
          {jobs.map((j) => (
            <option key={j.id} value={String(j.id)}>
              {j.file_number} — {j.zone}
            </option>
          ))}
        </select>
        {selectedJobLabel ? <div className="mt-1 text-xs text-white/55">{selectedJobLabel}</div> : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">Upload</h2>
        </div>

        <form onSubmit={onUpload} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1">Type</label>
              <select
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.doc_type}
                onChange={(e) => onDocTypeChange(e.target.value as DocumentType)}
                disabled={busy}
              >
                <option value="JOB">JOB</option>
                <option value="INVOICE">INVOICE</option>
                <option value="RECEIPT">RECEIPT</option>
              </select>
            </div>

            {form.doc_type === "JOB" ? (
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-white/80 mb-1">Job</label>
                <select
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={form.job_id}
                  onChange={(e) => setForm((f) => ({ ...f, job_id: e.target.value }))}
                  disabled={busy}
                >
                  <option value="">Select job</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={String(j.id)}>
                      {j.file_number} — {j.zone}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {form.doc_type === "INVOICE" ? (
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-white/80 mb-1">Invoice</label>
                <select
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={form.invoice_id}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_id: e.target.value }))}
                  disabled={busy}
                >
                  <option value="">Select invoice</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={String(inv.id)}>
                      {inv.invoice_number} — {inv.currency} {inv.grand_total}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {form.doc_type === "RECEIPT" ? (
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-white/80 mb-1">Receipt</label>
                <select
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={form.receipt_id}
                  onChange={(e) => setForm((f) => ({ ...f, receipt_id: e.target.value }))}
                  disabled={busy}
                >
                  <option value="">Select receipt</option>
                  {receipts.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.currency} {r.amount} — {r.payment_date}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-white/80 mb-1">File</label>
              <input
                className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:font-semibold hover:file:bg-white/15"
                type="file"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
                disabled={busy}
              />
              {form.file ? (
                <div className="mt-1 text-xs text-white/55">
                  {form.file.name} • {formatBytes(form.file.size)}
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-60"
            >
              {busy ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Documents</h2>
          <span className="text-sm text-white/60">{selectedJobId ? docs.length : ""}</span>
        </div>

        {!selectedJobId ? (
          <div className="p-5 text-sm text-white/60">Select a job.</div>
        ) : loadingDocs ? (
          <div className="p-5 text-sm text-white/60">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="p-5 text-sm text-white/60">No documents.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-white">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Link</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">File</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Size</th>
                  <th className="px-4 py-3 text-left font-semibold text-white/90">Uploaded</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/90">Actions</th>
                </tr>
              </thead>

              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-3">
                      <span className={typeBadge(d.doc_type)}>{d.doc_type}</span>
                    </td>
                    <td className="px-4 py-3 text-white/80">{linkPreview(d)}</td>
                    <td className="px-4 py-3 text-white/90">
                      <div className="font-semibold">{d.filename}</div>
                      <div className="text-xs text-white/60">{d.content_type || ""}</div>
                    </td>
                    <td className="px-4 py-3 text-white/70">{formatBytes(d.size_bytes)}</td>
                    <td className="px-4 py-3 text-white/70">{String(d.uploaded_at).slice(0, 19).replace("T", " ")}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onDownload(d)}
                          disabled={busy}
                          className="text-blue-300 hover:text-blue-200 font-semibold disabled:opacity-60"
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(d)}
                          disabled={busy}
                          className="text-white/60 hover:text-red-200 font-semibold disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}