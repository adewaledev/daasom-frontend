type AlertTone = "error" | "info" | "neutral"

type AlertBannerProps = {
  message: string
  tone?: AlertTone
  className?: string
}

function toneClass(tone: AlertTone) {
  if (tone === "error") return "bg-red-50 text-red-700 border-red-200"
  if (tone === "info") return "bg-blue-50 text-blue-700 border-blue-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

export default function AlertBanner({ message, tone = "neutral", className = "" }: AlertBannerProps) {
  const role = tone === "error" ? "alert" : "status"
  const live = tone === "error" ? "assertive" : "polite"

  return (
    <div
      role={role}
      aria-live={live}
      className={[
        "rounded-xl border px-3 py-2 text-sm",
        toneClass(tone),
        className,
      ].join(" ").trim()}
    >
      {message}
    </div>
  )
}
