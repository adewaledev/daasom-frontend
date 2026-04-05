import type { ReactNode } from "react"

type ListHeaderProps = {
  title: string
  meta?: string
  action?: ReactNode
}

export default function ListHeader({ title, meta, action }: ListHeaderProps) {
  return (
    <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {action ?? (meta ? <span className="text-sm text-slate-600">{meta}</span> : null)}
    </div>
  )
}
