import { describe, expect, it } from "vitest"
import { clampPage, getPageBounds, getTotalPages, paginateItems } from "./pagination"

describe("pagination utils", () => {
  it("computes total pages with minimum of 1", () => {
    expect(getTotalPages(0, 10)).toBe(1)
    expect(getTotalPages(1, 10)).toBe(1)
    expect(getTotalPages(10, 10)).toBe(1)
    expect(getTotalPages(11, 10)).toBe(2)
  })

  it("clamps page numbers safely", () => {
    expect(clampPage(-2, 5)).toBe(1)
    expect(clampPage(0, 5)).toBe(1)
    expect(clampPage(2.9, 5)).toBe(2)
    expect(clampPage(8, 5)).toBe(5)
  })

  it("calculates start/end bounds correctly", () => {
    expect(getPageBounds(1, 25, 10)).toEqual({ startItem: 1, endItem: 10 })
    expect(getPageBounds(2, 25, 10)).toEqual({ startItem: 11, endItem: 20 })
    expect(getPageBounds(3, 25, 10)).toEqual({ startItem: 21, endItem: 25 })
  })

  it("returns zero bounds for empty lists", () => {
    expect(getPageBounds(1, 0, 10)).toEqual({ startItem: 0, endItem: 0 })
  })

  it("slices page data safely", () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1)

    expect(paginateItems(items, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(paginateItems(items, 2, 10)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(paginateItems(items, 3, 10)).toEqual([21, 22, 23, 24, 25])
    expect(paginateItems(items, 99, 10)).toEqual([21, 22, 23, 24, 25])
  })
})