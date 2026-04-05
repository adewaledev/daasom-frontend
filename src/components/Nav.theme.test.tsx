import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import Nav from "./Nav"

vi.mock("../state/auth", () => ({
  useAuth: () => ({
    logout: vi.fn(),
  }),
}))

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: "(prefers-color-scheme: dark)",
      addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => listeners.delete(cb),
    })),
  })
}

describe("Nav theme preference", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    document.documentElement.classList.remove("dark")
  })

  it("applies saved dark mode and allows switching to light", async () => {
    window.localStorage.setItem("theme", "dark")
    mockMatchMedia(false)

    render(
      <MemoryRouter>
        <Nav />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true)
    })

    const themeSelect = screen.getAllByLabelText("Theme mode")[0]
    fireEvent.change(themeSelect, { target: { value: "light" } })

    expect(window.localStorage.getItem("theme")).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })
})
