import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import JobsPage from "./JobsPage"

const {
  listClientsMock,
  listJobsMock,
  listTrackerJobsMock,
} = vi.hoisted(() => ({
  listClientsMock: vi.fn(),
  listJobsMock: vi.fn(),
  listTrackerJobsMock: vi.fn(),
}))

vi.mock("../api/clients", () => ({
  listClients: listClientsMock,
}))

vi.mock("../api/jobs", () => ({
  listJobs: listJobsMock,
  createJob: vi.fn(),
  updateJob: vi.fn(),
}))

vi.mock("../api/tracker", () => ({
  listTrackerJobs: listTrackerJobsMock,
}))

vi.mock("../state/auth", () => ({
  useAuth: () => ({
    can: () => true,
    roleLabel: "Admin",
  }),
}))

function createJob(index: number, zone: "DUTY" | "FREE") {
  const padded = String(index).padStart(3, "0")
  return {
    id: `job-${padded}`,
    client: 1,
    zone,
    date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
    file_number: `FILE-${padded}`,
    quantity: 1,
    bl_awb: "",
    weight_kg: "",
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
    created_at: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T12:00:00Z`,
    updated_at: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T12:00:00Z`,
  }
}

describe("JobsPage interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    listClientsMock.mockResolvedValue([
      {
        id: 1,
        client_code: "CL001",
        client_prefix: "CL",
        client_name: "Acme Client",
        is_active: true,
      },
    ])

    const dutyJobs = Array.from({ length: 12 }, (_, i) => createJob(i + 1, "DUTY"))
    const freeJobs = Array.from({ length: 12 }, (_, i) => createJob(i + 13, "FREE"))
    listJobsMock.mockResolvedValue([...dutyJobs, ...freeJobs])

    listTrackerJobsMock.mockResolvedValue([])
  })

  it("paginates jobs list and moves to next page", async () => {
    render(<JobsPage />)

    await waitFor(() => expect(listJobsMock).toHaveBeenCalled())

    fireEvent.click(screen.getByRole("button", { name: "View Jobs" }))

    expect(screen.getAllByText("Page 1 of 3").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Showing 1-10 of 24").length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole("button", { name: "Next" })[0])

    await waitFor(() => {
      expect(screen.getAllByText("Page 2 of 3").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Showing 11-20 of 24").length).toBeGreaterThan(0)
    })
  })

  it("resets to first page when zone filter changes", async () => {
    render(<JobsPage />)

    await waitFor(() => expect(listJobsMock).toHaveBeenCalled())

    fireEvent.click(screen.getByRole("button", { name: "View Jobs" }))

    fireEvent.change(screen.getAllByDisplayValue("View: All Zones")[0], {
      target: { value: "DUTY" },
    })

    await waitFor(() => {
      expect(screen.getAllByText("Page 1 of 2").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Showing 1-10 of 12").length).toBeGreaterThan(0)
    })
  })
})