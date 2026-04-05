import type { ReactNode } from "react"
import SurfaceCard from "./SurfaceCard"

type SearchPanelProps = {
  children: ReactNode
  className?: string
}

export default function SearchPanel({ children, className = "" }: SearchPanelProps) {
  return (
    <SurfaceCard className={["p-4 space-y-3", className].join(" ").trim()}>
      {children}
    </SurfaceCard>
  )
}
