export function getTotalPages(totalItems: number, itemsPerPage: number): number {
  if (itemsPerPage <= 0) return 1
  return Math.max(1, Math.ceil(totalItems / itemsPerPage))
}

export function clampPage(currentPage: number, totalPages: number): number {
  if (!Number.isFinite(currentPage) || currentPage < 1) return 1
  if (!Number.isFinite(totalPages) || totalPages < 1) return 1
  return Math.min(Math.floor(currentPage), Math.floor(totalPages))
}

export function getPageBounds(
  currentPage: number,
  totalItems: number,
  itemsPerPage: number,
): { startItem: number; endItem: number } {
  if (totalItems <= 0 || itemsPerPage <= 0) return { startItem: 0, endItem: 0 }

  const totalPages = getTotalPages(totalItems, itemsPerPage)
  const safePage = clampPage(currentPage, totalPages)
  const startItem = (safePage - 1) * itemsPerPage + 1
  const endItem = Math.min(totalItems, safePage * itemsPerPage)

  return { startItem, endItem }
}

export function paginateItems<T>(items: T[], currentPage: number, itemsPerPage: number): T[] {
  if (!Array.isArray(items) || itemsPerPage <= 0) return []
  if (items.length === 0) return []

  const totalPages = getTotalPages(items.length, itemsPerPage)
  const safePage = clampPage(currentPage, totalPages)
  const start = (safePage - 1) * itemsPerPage
  return items.slice(start, start + itemsPerPage)
}