"use client"

import { useState } from "react"

type Props = {
  ranking: number | null
  rankingLabel: string | null
  rankingUrl: string | null
}

export function RankingBadge({ ranking, rankingLabel, rankingUrl }: Props) {
  const [open, setOpen] = useState(false)

  if (ranking === null) return null

  return (
    <div className="ranking-badge-wrap">
      <button
        className="ranking-badge"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={rankingLabel ?? `Ranked #${ranking}`}
      >
        #{ranking}
      </button>
      {open && rankingLabel && (
        <div className="ranking-badge-tooltip">
          <span className="ranking-badge-tooltip-label">{rankingLabel}</span>
          {rankingUrl && (
            <a
              href={rankingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ranking-badge-tooltip-link"
              onClick={(e) => e.stopPropagation()}
            >
              View full rankings ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}
