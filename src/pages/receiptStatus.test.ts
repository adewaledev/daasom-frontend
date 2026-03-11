import { describe, expect, it } from "vitest"
import { nextInvoiceStatusFromReceipts } from "./receiptStatus"

describe("nextInvoiceStatusFromReceipts", () => {
  it("returns DRAFT when paid total is zero", () => {
    expect(nextInvoiceStatusFromReceipts(1000, 0)).toBe("DRAFT")
  })

  it("returns DRAFT when paid total is negative/invalid scenario", () => {
    expect(nextInvoiceStatusFromReceipts(1000, -5)).toBe("DRAFT")
  })

  it("returns PARTIALLY_PAID when paid total is below invoice total", () => {
    expect(nextInvoiceStatusFromReceipts(1000, 400)).toBe("PARTIALLY_PAID")
  })

  it("returns PAID when paid total equals invoice total", () => {
    expect(nextInvoiceStatusFromReceipts(1000, 1000)).toBe("PAID")
  })

  it("returns PAID when paid total exceeds invoice total", () => {
    expect(nextInvoiceStatusFromReceipts(1000, 1200)).toBe("PAID")
  })
})
