import type { ReactNode } from "react"

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export default function PageHeader({ title, description, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={["flex items-start justify-between gap-4", className].join(" ").trim()}>
      <div>
        <h1 className="text-2xl font-semibold">
          <span className="text-blue-700">{title}</span>
        </h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}
