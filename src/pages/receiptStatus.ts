import type { InvoiceStatus } from "../api/invoices"

export function nextInvoiceStatusFromReceipts(expectedTotal: number, paidTotal: number): InvoiceStatus {
  if (paidTotal <= 0) return "DRAFT"
  if (expectedTotal > 0 && paidTotal >= expectedTotal) return "PAID"
  return "PARTIALLY_PAID"
}
