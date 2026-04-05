type StatusBadgeVariant = "info" | "success" | "warning" | "neutral"

type StatusBadgeProps = {
  label: string
  variant?: StatusBadgeVariant
  className?: string
}

function variantClass(variant: StatusBadgeVariant) {
  if (variant === "success") return "status-badge--success bg-green-100 text-green-700 border-green-200"
  if (variant === "warning") return "status-badge--warning bg-amber-100 text-amber-700 border-amber-200"
  if (variant === "neutral") return "status-badge--neutral bg-white text-slate-700 border-slate-200"
  return "status-badge--info bg-blue-100 text-blue-700 border-blue-200"
}

export default function StatusBadge({ label, variant = "info", className = "" }: StatusBadgeProps) {
  return (
    <span
      className={[
        "status-badge inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
        variantClass(variant),
        className,
      ].join(" ").trim()}
    >
      {label}
    </span>
  )
}
