import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import HomePage from "./HomePage"

const {
  listTrackerJobsMock,
  listInvoicesMock,
  listReceiptsMock,
  listExpensesMock,
} = vi.hoisted(() => ({
  listTrackerJobsMock: vi.fn(),
  listInvoicesMock: vi.fn(),
  listReceiptsMock: vi.fn(),
  listExpensesMock: vi.fn(),
}))

vi.mock("../api/tracker", () => ({
  listTrackerJobs: listTrackerJobsMock,
}))

vi.mock("../api/invoices", () => ({
  listInvoices: listInvoicesMock,
}))

vi.mock("../api/receipts", () => ({
  listReceipts: listReceiptsMock,
}))

vi.mock("../api/expenses", () => ({
  listExpenses: listExpensesMock,
}))

describe("HomePage attention metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    listTrackerJobsMock.mockResolvedValue([
      {
        job_id: "job-001",
        file_number: "FILE-001",
        client_code: "C01",
        client_name: "Acme",
        zone: "DUTY",
        tracker_completed: false,
        tracker_entries: [],
      },
      {
        job_id: "job-002",
        file_number: "FILE-002",
        client_code: "C02",
        client_name: "Beta",
        zone: "FREE",
        tracker_completed: false,
        tracker_entries: [
          {
            id: "entry-1",
            entry_date: "2026-01-01",
            progress_report: "FILE_OPENED",
            next_step: "follow up",
          },
        ],
      },
      {
        job_id: "job-003",
        file_number: "FILE-003",
        client_code: "C03",
        client_name: "Gamma",
        zone: "DUTY",
        tracker_completed: true,
        tracker_entries: [
          {
            id: "entry-2",
            entry_date: "2026-03-30",
            progress_report: "CLEARED",
            next_step: "done",
          },
        ],
      },
    ])

    listInvoicesMock.mockResolvedValue([
      {
        id: "inv-1",
        job: "job-001",
        invoice_number: "INV-001",
        currency: "NGN",
        expenses_total: "0",
        addons_total: "0",
        grand_total: "1000",
        invoice_amount: "1000",
        status: "ISSUED",
        issued_date: "2026-03-01",
        due_date: "2026-03-10",
        notes: "",
        created_at: "2026-03-01T10:00:00Z",
        updated_at: "2026-03-01T10:00:00Z",
      },
      {
        id: "inv-2",
        job: "job-002",
        invoice_number: "INV-002",
        currency: "NGN",
        expenses_total: "0",
        addons_total: "0",
        grand_total: "2000",
        invoice_amount: "2000",
        status: "PARTIALLY_PAID",
        issued_date: "2026-03-01",
        due_date: "2026-03-20",
        notes: "",
        created_at: "2026-03-01T10:00:00Z",
        updated_at: "2026-03-01T10:00:00Z",
      },
    ])

    listReceiptsMock.mockResolvedValue([
      {
        id: "rec-1",
        invoice: "inv-2",
        amount: "500",
        currency: "NGN",
        payment_date: "2026-03-05",
        method: "TRANSFER",
        reference: "R1",
        notes: "",
        created_at: "2026-03-05T10:00:00Z",
      },
    ])

    listExpensesMock.mockResolvedValue([
      {
        id: "exp-1",
        job: "job-001",
        category: "Operations",
        description: "Ops",
        amount: "300",
        currency: "NGN",
        expense_date: "2026-03-02",
        status: "SUBMITTED",
        created_at: "2026-03-02T10:00:00Z",
        updated_at: "2026-03-02T10:00:00Z",
      },
    ])
  })

  it("renders actionable attention cards with derived values", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    )

    await waitFor(() => expect(listTrackerJobsMock).toHaveBeenCalled())

    expect(screen.getByText("Pending Closures")).toBeTruthy()
    expect(screen.getByText("Overdue Invoices")).toBeTruthy()
    expect(screen.getByText("Expense Approvals Pending")).toBeTruthy()
    expect(screen.getByText("Uncollected Invoices")).toBeTruthy()

    // Values derived from the mocked data.
    expect(screen.getAllByText("2").length).toBeGreaterThan(0)
    expect(screen.getAllByText("1").length).toBeGreaterThan(0)
  })
})
