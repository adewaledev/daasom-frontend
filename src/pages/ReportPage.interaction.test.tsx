import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ReportPage from "./ReportPage"

const {
  listJobsMock,
  listInvoicesMock,
  listExpensesMock,
  listReceiptsMock,
  listClientsMock,
  listTrackerJobsMock,
} = vi.hoisted(() => ({
  listJobsMock: vi.fn(),
  listInvoicesMock: vi.fn(),
  listExpensesMock: vi.fn(),
  listReceiptsMock: vi.fn(),
  listClientsMock: vi.fn(),
  listTrackerJobsMock: vi.fn(),
}))

vi.mock("../api/jobs", () => ({
  listJobs: listJobsMock,
}))

vi.mock("../api/invoices", () => ({
  listInvoices: listInvoicesMock,
}))

vi.mock("../api/expenses", () => ({
  listExpenses: listExpensesMock,
}))

vi.mock("../api/receipts", () => ({
  listReceipts: listReceiptsMock,
}))

vi.mock("../api/clients", () => ({
  listClients: listClientsMock,
}))

vi.mock("../api/tracker", () => ({
  listTrackerJobs: listTrackerJobsMock,
}))

function pad(n: number) {
  return String(n).padStart(2, "0")
}

describe("ReportPage interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    listClientsMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        client_code: `C${pad(i + 1)}`,
        client_prefix: "C",
        client_name: `Client ${i + 1}`,
        is_active: true,
      }))
    )

    listJobsMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: `job-${i + 1}`,
        client: i + 1,
        zone: "DUTY",
        date: `2026-03-${pad(i + 1)}`,
        file_number: `FILE-${pad(i + 1)}`,
        quantity: 1,
        bl_awb: "",
        weight_kg: null,
        container_40ft: 0,
        container_20ft: 0,
        others: "",
        description: "",
        container_number: "",
        transit_days: null,
        port: "",
        vessel: "",
        duty_amount: null,
        refund_amount: null,
        is_active: true,
        created_at: `2026-03-${pad(i + 1)}T12:00:00Z`,
        updated_at: `2026-03-${pad(i + 1)}T12:00:00Z`,
      }))
    )

    listInvoicesMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: `inv-${i + 1}`,
        job: `job-${i + 1}`,
        invoice_number: `INV-${pad(i + 1)}`,
        currency: "NGN",
        expenses_total: "0",
        addons_total: "0",
        grand_total: String((i + 1) * 1000),
        invoice_amount: String((i + 1) * 1000),
        status: "ISSUED",
        issued_date: `2026-03-${pad(i + 1)}`,
        due_date: `2026-04-${pad(i + 1)}`,
        notes: "",
        created_at: `2026-03-${pad(i + 1)}T09:00:00Z`,
        updated_at: `2026-03-${pad(i + 1)}T09:00:00Z`,
      }))
    )

    listExpensesMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: `exp-${i + 1}`,
        job: `job-${i + 1}`,
        category: "Operations",
        description: `Expense ${i + 1}`,
        amount: String((i + 1) * 200),
        currency: "NGN",
        expense_date: `2026-03-${pad(i + 1)}`,
        status: "APPROVED",
        created_at: `2026-03-${pad(i + 1)}T10:00:00Z`,
        updated_at: `2026-03-${pad(i + 1)}T10:00:00Z`,
      }))
    )

    listReceiptsMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: `rec-${i + 1}`,
        invoice: `inv-${i + 1}`,
        amount: String((i + 1) * 500),
        currency: "NGN",
        payment_date: `2026-03-${pad(i + 1)}`,
        method: "TRANSFER",
        reference: `REF-${i + 1}`,
        notes: "",
        created_at: `2026-03-${pad(i + 1)}T11:00:00Z`,
      }))
    )

    listTrackerJobsMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        job_id: `job-${i + 1}`,
        tracker_completed: false,
      }))
    )
  })

  it("paginates top clients table", async () => {
    render(<ReportPage />)

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled()
      expect(listClientsMock).toHaveBeenCalled()
      expect(listInvoicesMock).toHaveBeenCalled()
      expect(listExpensesMock).toHaveBeenCalled()
      expect(listReceiptsMock).toHaveBeenCalled()
      expect(listTrackerJobsMock).toHaveBeenCalled()
    })

    const topClientsHeading = await screen.findByRole("heading", { name: "Top Clients by Revenue" })
    const topClientsSection = topClientsHeading.closest("section")
    expect(topClientsSection).toBeTruthy()

    expect(within(topClientsSection!).getByText("Page 1 of 2")).toBeTruthy()
    expect(within(topClientsSection!).getByText("Showing 1-10 of 12")).toBeTruthy()
    expect(within(topClientsSection!).queryByText(/11\. Client 2/i)).toBeNull()

    fireEvent.click(within(topClientsSection!).getByRole("button", { name: "Next" }))

    await waitFor(() => {
      expect(within(topClientsSection!).getByText("Page 2 of 2")).toBeTruthy()
      expect(within(topClientsSection!).getByText("Showing 11-12 of 12")).toBeTruthy()
      expect(within(topClientsSection!).getByText("11. Client 2")).toBeTruthy()
    })
  })

  it("paginates expenses breakdown modal", async () => {
    render(<ReportPage />)

    await waitFor(() => expect(listExpensesMock).toHaveBeenCalled())

    fireEvent.click((await screen.findAllByRole("button", { name: /Total Expenses/i }))[0])

    const expenseModalTitle = await screen.findByRole("heading", { name: "Expenses Breakdown" })
    const expenseModalNode = expenseModalTitle.closest("div.w-full.max-w-6xl")
    expect(expenseModalNode).toBeTruthy()
    if (!(expenseModalNode instanceof HTMLElement)) throw new Error("Expected expense modal container")
    const expenseModal = expenseModalNode

    expect(within(expenseModal).getByText("Page 1 of 2")).toBeTruthy()
    expect(within(expenseModal).getByText("Showing 1-10 of 12")).toBeTruthy()
    expect(within(expenseModal).queryByText("Expense 1")).toBeNull()

    fireEvent.click(within(expenseModal).getByRole("button", { name: "Next" }))

    await waitFor(() => {
      expect(within(expenseModal).getByText("Page 2 of 2")).toBeTruthy()
      expect(within(expenseModal).getByText("Showing 11-12 of 12")).toBeTruthy()
      expect(within(expenseModal).getByText("Expense 1")).toBeTruthy()
    })
  })

  it("paginates receipts breakdown modal", async () => {
    render(<ReportPage />)

    await waitFor(() => expect(listReceiptsMock).toHaveBeenCalled())

    fireEvent.click((await screen.findAllByRole("button", { name: /Collected Revenue/i }))[0])

    const receiptsModalTitle = await screen.findByRole("heading", { name: "Receipts Breakdown" })
    const receiptsModalNode = receiptsModalTitle.closest("div.w-full.max-w-6xl")
    expect(receiptsModalNode).toBeTruthy()
    if (!(receiptsModalNode instanceof HTMLElement)) throw new Error("Expected receipts modal container")
    const receiptsModal = receiptsModalNode

    expect(within(receiptsModal).getByText("Page 1 of 2")).toBeTruthy()
    expect(within(receiptsModal).getByText("Showing 1-10 of 12")).toBeTruthy()
    expect(within(receiptsModal).queryByText("REF-1")).toBeNull()

    fireEvent.click(within(receiptsModal).getByRole("button", { name: "Next" }))

    await waitFor(() => {
      expect(within(receiptsModal).getByText("Page 2 of 2")).toBeTruthy()
      expect(within(receiptsModal).getByText("Showing 11-12 of 12")).toBeTruthy()
      expect(within(receiptsModal).getByText("REF-1")).toBeTruthy()
    })
  })
})