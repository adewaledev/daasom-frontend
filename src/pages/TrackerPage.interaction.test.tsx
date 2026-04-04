import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import TrackerPage from "./TrackerPage"

const {
  listTrackerJobsMock,
  listTrackerEntriesMock,
  listTrackerOptionsMock,
} = vi.hoisted(() => ({
  listTrackerJobsMock: vi.fn(),
  listTrackerEntriesMock: vi.fn(),
  listTrackerOptionsMock: vi.fn(),
}))

vi.mock("../api/tracker", () => ({
  listTrackerJobs: listTrackerJobsMock,
  listTrackerEntries: listTrackerEntriesMock,
  listTrackerOptions: listTrackerOptionsMock,
  createTrackerEntry: vi.fn(),
  updateTrackerEntry: vi.fn(),
  deleteTrackerEntry: vi.fn(),
  markTrackerCompleted: vi.fn(),
  reopenTracker: vi.fn(),
}))

vi.mock("../state/auth", () => ({
  useAuth: () => ({
    can: () => true,
    roleLabel: "Admin",
  }),
}))

describe("TrackerPage interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    listTrackerJobsMock.mockResolvedValue([
      {
        job_id: "job-001",
        file_number: "FILE-001",
        client_code: "CL001",
        client_name: "Acme Client",
        zone: "DUTY",
        tracker_completed: false,
        tracker_completed_at: null,
        tracker_completed_by: null,
        tracker_entries: [],
      },
    ])

    listTrackerOptionsMock.mockResolvedValue({
      progress_report_options: ["FILE_OPENED", "CLEARED"],
      next_step_options: ["FOLLOW_UP"],
    })

    listTrackerEntriesMock.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        id: `entry-${i + 1}`,
        entry_date: `2026-03-${String(i + 1).padStart(2, "0")}`,
        progress_report: "FILE_OPENED",
        next_step: `note-${i + 1}`,
        created_at: `2026-03-${String(i + 1).padStart(2, "0")}T08:00:00Z`,
        updated_at: `2026-03-${String(i + 1).padStart(2, "0")}T08:00:00Z`,
      }))
    )
  })

  it("paginates tracker entries inside job modal", async () => {
    render(<TrackerPage />)

    await waitFor(() => expect(listTrackerJobsMock).toHaveBeenCalled())

    fireEvent.click(screen.getByRole("button", { name: "All Jobs" }))
    fireEvent.click(screen.getAllByRole("button", { name: "View" })[0])

    await waitFor(() => expect(listTrackerEntriesMock).toHaveBeenCalledWith("job-001"))

    expect(screen.getByText("Page 1 of 2")).toBeTruthy()
    expect(screen.getByText("Showing 1-10 of 15")).toBeTruthy()
    expect(screen.queryByText("note-12")).toBeNull()

    const modal = screen.getByText("FILE-001 — Acme Client").closest("div")
    expect(modal).toBeTruthy()

    const nextButton = within(document.body).getByRole("button", { name: "Next" })
    fireEvent.click(nextButton)

    expect(screen.getByText("Page 2 of 2")).toBeTruthy()
    expect(screen.getByText("Showing 11-15 of 15")).toBeTruthy()
    expect(screen.getByText("note-12")).toBeTruthy()
  })
})