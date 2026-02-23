import http from "./http"

export type DocumentType = "JOB" | "INVOICE" | "RECEIPT"

export interface Document {
  id: string

  doc_type: DocumentType

  job_id: string | null
  invoice_id: string | null
  receipt_id: string | null

  filename: string
  content_type: string
  size_bytes: number

  storage_provider: string
  storage_key: string
  url: string

  uploaded_by: string
  uploaded_at: string
}

type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

function isPaginated<T>(data: any): data is Paginated<T> {
  return data && typeof data === "object" && Array.isArray(data.results)
}

function normalizeList<T>(data: any): T[] {
  if (isPaginated<T>(data)) return data.results
  return data as T[]
}

/**
 * Official list-by-job endpoint:
 * GET /documents/by_job/?job_id={uuid}
 */
export async function listDocumentsByJob(job_id: string): Promise<Document[]> {
  const res = await http.get("/documents/by_job/", { params: { job_id } })
  return normalizeList<Document>(res.data)
}

/**
 * Upload document:
 * POST /documents/ (multipart)
 *
 * Assumption: backend expects file field name "file"
 * If your backend expects a different name, tell me and I will regenerate.
 */
export async function uploadDocument(input: {
  doc_type: DocumentType
  file: File

  job_id?: string
  invoice_id?: string
  receipt_id?: string
}): Promise<Document> {
  const fd = new FormData()

  fd.append("doc_type", input.doc_type)

  if (input.job_id) fd.append("job_id", input.job_id)
  if (input.invoice_id) fd.append("invoice_id", input.invoice_id)
  if (input.receipt_id) fd.append("receipt_id", input.receipt_id)

  fd.append("file", input.file)

  const res = await http.post("/documents/", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return res.data
}

export async function getDocument(id: string): Promise<Document> {
  const res = await http.get(`/documents/${id}/`)
  return res.data
}

export async function deleteDocument(id: string): Promise<void> {
  await http.delete(`/documents/${id}/`)
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const blobUrl = window.URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = blobUrl
  a.download = filename || "document"
  document.body.appendChild(a)
  a.click()
  a.remove()

  window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 0)
}

/**
 * Download document through authenticated API endpoint:
 * GET /documents/{id}/download/
 */
export async function downloadDocument(input: { id: string; filename: string }): Promise<void> {
  const res = await http.get(`/documents/${input.id}/download/`, { responseType: "blob" })
  triggerBrowserDownload(res.data as Blob, input.filename)
}
