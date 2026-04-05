import { getPageBounds } from "../utils/pagination"

type PaginationControlsProps = {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPrevious: () => void
  onNext: () => void
  className?: string
}

export default function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPrevious,
  onNext,
  className = "",
}: PaginationControlsProps) {
  if (totalItems <= itemsPerPage || totalPages <= 1) return null

  const { startItem, endItem } = getPageBounds(currentPage, totalItems, itemsPerPage)

  return (
    <div className={`flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${className}`.trim()}>
      <div className="space-y-0.5">
        <div className="text-sm text-slate-600">
          Page {currentPage} of {totalPages}
        </div>
        <div className="text-xs text-slate-600">
          Showing {startItem}-{endItem} of {totalItems}
        </div>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          onClick={onPrevious}
          disabled={currentPage === 1}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={currentPage === totalPages}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Next
        </button>
      </div>
    </div>
  )
}