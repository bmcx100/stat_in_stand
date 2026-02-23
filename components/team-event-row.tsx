"use client"

import Link from "next/link"
import { ChevronDown } from "lucide-react"
import type { ActiveEvent } from "@/hooks/use-home-card-data"
import { formatEventDate } from "@/lib/home-cards"

type Props = {
  event: ActiveEvent
  expanded: boolean
  onToggle: () => void
}

export function TeamEventRow({ event, expanded, onToggle }: Props) {
  const { label, collapsedSummary, lastGame, nextGame, opponentStanding, h2h, detailPath } = event

  const lastLine = lastGame
    ? `${lastGame.result} ${lastGame.team_score ?? "–"}–${lastGame.opponent_score ?? "–"} vs ${lastGame.opponent_name}`
    : null

  const nextDateStr = nextGame ? formatEventDate(nextGame.date, nextGame.time) : null

  const h2hStr = (h2h.w + h2h.l + h2h.t) > 0
    ? `${h2h.w}-${h2h.l}-${h2h.t}`
    : null

  return (
    <div className={`team-event-row${expanded ? " team-event-row-open" : ""}`}>
      <button className="team-event-row-header" onClick={onToggle}>
        <span className="team-event-row-left">
          <span className="team-event-label">{label}</span>
          <span className="team-event-summary">{collapsedSummary}</span>
        </span>
        <ChevronDown className={`team-event-chevron${expanded ? " team-event-chevron-open" : ""}`} />
      </button>

      <div className="team-event-detail">
        <div className="team-event-detail-inner">
          {lastLine && (
            <p className="team-event-detail-line">
              <span className="team-event-detail-key">Last</span>
              <span className="team-event-detail-val">{lastLine}</span>
            </p>
          )}
          {nextGame && (
            <>
              <p className="team-event-detail-line">
                <span className="team-event-detail-key">Next</span>
                <span className="team-event-detail-val">
                  {nextGame.opponent_name}{nextDateStr ? ` · ${nextDateStr}` : ""}
                </span>
              </p>
              {opponentStanding && (
                <p className="team-event-detail-sub">
                  {opponentStanding.position}th of {opponentStanding.total} · {opponentStanding.record}
                </p>
              )}
            </>
          )}
          {h2hStr && (
            <p className="team-event-detail-line">
              <span className="team-event-detail-key">Series</span>
              <span className="team-event-detail-val">{h2hStr}</span>
            </p>
          )}
          {event.statusCounts && (
            <div className="qual-status-strip team-event-status-strip">
              <div className="qual-status-segment" data-status="out">
                <span className="qual-status-count">{event.statusCounts.out}</span>
                <span className="qual-status-label">OUT</span>
              </div>
              <div className="qual-status-segment" data-status="alive">
                <span className="qual-status-count">{event.statusCounts.alive}</span>
                <span className="qual-status-label">ALIVE</span>
              </div>
              <div className="qual-status-segment" data-status="locked">
                <span className="qual-status-count">{event.statusCounts.locked}</span>
                <span className="qual-status-label">LOCKED</span>
              </div>
            </div>
          )}
          <Link href={detailPath} className="team-event-link">
            Details ↗
          </Link>
        </div>
      </div>
    </div>
  )
}
