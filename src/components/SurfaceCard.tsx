import type { ElementType, ReactNode } from "react"

type SurfaceCardProps = {
  children: ReactNode
  className?: string
  as?: ElementType
}

export default function SurfaceCard({ children, className = "", as }: SurfaceCardProps) {
  const Tag: ElementType = as || "section"
  return (
    <Tag className={["rounded-2xl border border-slate-200 bg-white backdrop-blur", className].join(" ").trim()}>
      {children}
    </Tag>
  )
}
