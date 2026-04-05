import type { ReactNode } from "react"

type ActionBarProps = {
  children: ReactNode
  className?: string
}

export default function ActionBar({ children, className = "" }: ActionBarProps) {
  return (
    <div className={["flex flex-wrap items-center gap-2", className].join(" ").trim()}>
      {children}
    </div>
  )
}
