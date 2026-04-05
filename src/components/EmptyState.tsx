type EmptyStateProps = {
  message: string
  className?: string
}

export default function EmptyState({ message, className = "" }: EmptyStateProps) {
  return (
    <div className={["p-5 text-sm text-slate-600", className].join(" ").trim()}>
      {message}
    </div>
  )
}
