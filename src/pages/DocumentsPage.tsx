import { useEffect, useMemo, useState } from "react"
import type { Job } from "../api/jobs"
import { listJobs } from "../api/jobs"
import type { Invoice } from "../api/invoices"
import { listInvoices } from "../api/invoices"
import type { Receipt } from "../api/receipts"
import { listReceipts } from "../api/receipts"
import type { Document, DocumentType } from "../api/documents"
import { deleteDocument, downloadDocumentByUrl, listDocumentsByJob, uploadDocument } from "../api/documents"
import PaginationControls from "../components/PaginationControls"
import { useAuth } from "../state/auth"

type UploadForm = {
  doc_type: DocumentType
  job_id: string
  invoice_id: string
  receipt_id: string
}

const emptyForm: UploadForm = {
  doc_type: "JOB",
  job_id: "",
  invoice_id: "",
  receipt_id: "",
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
  if (t === "INVOICE") return `${base} bg-blue-50 text-blue-700 border-blue-200`
  if (t === "RECEIPT") return `${base} bg-white text-slate-700 border-slate-200`
  return `${base} bg-white text-slate-800 border-slate-200`
}

export default function DocumentsPage() {
  const { can, roleLabel } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])

  const [selectedJobId, setSelectedJobId] = useState<string>("")
  const [docs, setDocs] = useState<Document[]>([])
  const [jobSearch, setJobSearch] = useState<string>("")
  const [showUploadForm, setShowUploadForm] = useState(false)

  const [loading, setLoading] = useState(true)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [busy, setBusy] = useState(false)

  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const [form, setForm] = useState<UploadForm>(emptyForm)
  const [uploadFiles, setUploadFiles] = useState<Array<File | null>>([null])
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const canWriteDocuments = can("documents.write")

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

  const receiptMap = useMemo(() => {
    const m = new Map<string, Receipt>()
    for (const r of receipts) m.set(String(r.id), r)
    return m
  }, [receipts])

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

  useEffect(() => {
    const selected = jobs.find((j) => String(j.id) === selectedJobId)
    if (selected) setJobSearch(`${selected.file_number} — ${selected.zone}`)
    else if (!selectedJobId) setJobSearch("")
  }, [jobs, selectedJobId])

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

  function onFileAtChange(index: number, file: File | null) {
    setUploadFiles((prev) => prev.map((f, i) => (i === index ? file : f)))
  }

  function onAddMoreFileInput() {
    setUploadFiles((prev) => [...prev, null])
  }

  function onRemoveFileInput(index: number) {
    setUploadFiles((prev) => {
      if (prev.length <= 1) return [null]
      return prev.filter((_, i) => i !== index)
    })
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!canWriteDocuments) {
      setError(`${roleLabel} role has view-only access to documents.`)
      return
    }
    setError("")
    setInfo("")
    setBusy(true)

    try {
      const filesToUpload = uploadFiles.filter((f): f is File => !!f)
      if (!filesToUpload.length) {
        setError("At least one file is required.")
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

      let jobId = form.job_id
      if (form.doc_type === "INVOICE" && form.invoice_id) {
        const invoice = invoiceMap.get(form.invoice_id)
        jobId = invoice?.job ? String(invoice.job) : ""
      } else if (form.doc_type === "RECEIPT" && form.receipt_id) {
        const receipt = receiptMap.get(form.receipt_id)
        if (receipt) {
          const invoice = invoiceMap.get(receipt.invoice)
          jobId = invoice?.job ? String(invoice.job) : ""
        }
      }

      let createdJobId = ""
      for (const file of filesToUpload) {
        const created = await uploadDocument({
          doc_type: form.doc_type,
          file,
          job_id: jobId || undefined,
          invoice_id: form.doc_type === "INVOICE" ? form.invoice_id : undefined,
          receipt_id: form.doc_type === "RECEIPT" ? form.receipt_id : undefined,
        })
        if (!createdJobId && created?.job_id) createdJobId = String(created.job_id)
      }

      setInfo(filesToUpload.length > 1 ? `${filesToUpload.length} files uploaded.` : "Uploaded.")
      setUploadFiles([null])

      const jobToRefresh = jobId || selectedJobId || createdJobId || (form.doc_type === "JOB" ? form.job_id : "")
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
      await downloadDocumentByUrl(d.url, d.filename)
      setInfo("Download started.")
      window.setTimeout(() => setInfo(""), 1200)
    } catch (err: any) {
      setError(extractErrorMessage(err) || "Download failed.")
    } finally {
      setBusy(false)
    }
  }

  function onPreview(d: Document) {
    window.open(d.url, "_blank")
  }

  async function onDelete(d: Document) {
    if (!canWriteDocuments) {
      setError(`${roleLabel} role has view-only access to documents.`)
      return
    }
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

  const filteredJobOptions = useMemo(() => {
    const term = jobSearch.trim().toLowerCase()
    if (!term) return jobs
    return jobs.filter((j) => {
      const label = `${j.file_number} ${j.zone}`.toLowerCase()
      return label.includes(term)
    })
  }, [jobs, jobSearch])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(docs.length / itemsPerPage)), [docs.length])
  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return docs.slice(start, start + itemsPerPage)
  }, [docs, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedJobId])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  return (
    <div className="space-y-6 text-slate-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-blue-700">Documents</h1>
          <p className="mt-1 text-sm text-slate-600">Upload files linked to jobs, invoices, or receipts.</p>
        </div>

        <button
          type="button"
          onClick={async () => {
            await refreshRefs()
            if (selectedJobId) await refreshDocs(selectedJobId)
          }}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="text-sm bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg">{error}</div>
      ) : null}

      {info ? (
        <div className="text-sm bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg">{info}</div>
      ) : null}

      {!canWriteDocuments ? (
        <div className="text-sm bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg">
          Signed in as {roleLabel}. Document uploads and deletes are view-only for this role.
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur p-5">
        <label className="block text-sm font-semibold text-slate-700 mb-1">Job</label>
        <input
          list="documents-job-options"
          className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={jobSearch}
          onChange={(e) => {
            const value = e.target.value
            setJobSearch(value)

            const exactMatch = jobs.find((j) => `${j.file_number} — ${j.zone}`.toLowerCase() === value.toLowerCase())
            setSelectedJobId(exactMatch ? String(exactMatch.id) : "")
          }}
          placeholder="Search and select job..."
          disabled={loading || busy}
        />
        <datalist id="documents-job-options">
          {filteredJobOptions.map((j) => (
            <option key={j.id} value={`${j.file_number} — ${j.zone}`} />
          ))}
        </datalist>
        {selectedJobLabel ? <div className="mt-1 text-xs text-slate-600">{selectedJobLabel}</div> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Upload</h2>
          {canWriteDocuments ? (
            <button
              type="button"
              onClick={() => setShowUploadForm((v) => !v)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition"
            >
              {showUploadForm ? "Hide upload" : "Upload document"}
            </button>
          ) : null}
        </div>

        {showUploadForm && canWriteDocuments ? (
          <form onSubmit={onUpload} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Type</label>
                <select
                  className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Job</label>
                  <select
                    className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Invoice</label>
                  <select
                    className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Receipt</label>
                  <select
                    className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-slate-700">Files</label>
                  <button
                    type="button"
                    onClick={onAddMoreFileInput}
                    disabled={busy}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 transition disabled:opacity-60"
                  >
                    + Add more
                  </button>
                </div>

                <div className="space-y-2">
                  {uploadFiles.map((file, index) => (
                    <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <div className="flex items-center gap-2">
                        <input
                          className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-slate-900 file:font-semibold hover:file:bg-white/15"
                          type="file"
                          onChange={(e) => onFileAtChange(index, e.target.files?.[0] ?? null)}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveFileInput(index)}
                          disabled={busy || uploadFiles.length <= 1}
                          className="px-2 py-1 rounded text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                      {file ? (
                        <div className="mt-1 text-xs text-slate-600">
                          {file.name} • {formatBytes(file.size)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
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
        ) : (
          <div className="p-5 text-sm text-slate-600">
            {canWriteDocuments ? 'Click "Upload document" to add a file.' : "Uploads are disabled for this role."}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">Documents</h2>
            <span className="text-sm text-slate-600">{selectedJobId ? docs.length : ""}</span>
          </div>
        </div>

        {!selectedJobId ? (
          <div className="p-5 text-sm text-slate-600">Select a job.</div>
        ) : loadingDocs ? (
          <div className="p-5 text-sm text-slate-600">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">No documents.</div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {paginatedDocs.map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={typeBadge(d.doc_type)}>{d.doc_type}</span>
                      <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{d.filename}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{formatBytes(d.size_bytes)} • {String(d.uploaded_at).slice(0, 19).replace("T", " ")}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold">
                    <button type="button" onClick={() => onPreview(d)} className="text-green-700 hover:text-green-700">Preview</button>
                    <button type="button" onClick={() => onDownload(d)} disabled={busy} className="text-blue-700 hover:text-blue-800 disabled:opacity-60">Download</button>
                    <button type="button" onClick={() => onDelete(d)} disabled={busy || !canWriteDocuments} className="text-slate-600 hover:text-red-700 disabled:opacity-60">Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <table className="min-w-[720px] w-full text-xs sm:text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Link</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">File</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Size</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Uploaded</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedDocs.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-white transition">
                      <td className="px-4 py-3">
                        <span className={typeBadge(d.doc_type)}>{d.doc_type}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{linkPreview(d)}</td>
                      <td className="px-4 py-3 text-slate-900">
                        <div className="font-semibold">{d.filename}</div>
                        <div className="text-xs text-slate-600">{d.content_type || ""}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatBytes(d.size_bytes)}</td>
                      <td className="px-4 py-3 text-slate-700">{String(d.uploaded_at).slice(0, 19).replace("T", " ")}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => onPreview(d)}
                            className="text-green-700 hover:text-green-700 font-semibold"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => onDownload(d)}
                            disabled={busy}
                            className="text-blue-700 hover:text-blue-800 font-semibold disabled:opacity-60"
                          >
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(d)}
                            disabled={busy || !canWriteDocuments}
                            className="text-slate-600 hover:text-red-700 font-semibold disabled:opacity-60"
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

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={docs.length}
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