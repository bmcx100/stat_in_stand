"use client"

import { use } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { usePlaydowns } from "@/hooks/use-playdowns"
import { computePlaydownStandings, isPlaydownExpired } from "@/lib/playdowns"

export default function PastEventsPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getPlaydown } = usePlaydowns()

  if (!team) return null

  const playdown = getPlaydown(teamId)
  const hasExpiredPlaydown = playdown && isPlaydownExpired(playdown.config, playdown.games)

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">Past Events</h1>
        <Link href={`/dashboard/${teamId}`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      {hasExpiredPlaydown ? (
        <div className="dashboard-nav">
          <Link href={`/dashboard/${teamId}/playdowns`} className="dashboard-record-card">
            <p className="dashboard-record">
              {(() => {
                const standings = computePlaydownStandings(playdown.config, playdown.games)
                const self = standings.find((r) => r.teamId === "self")
                return self ? `${self.w}-${self.l}-${self.t}` : "—"
              })()}
            </p>
            <p className="dashboard-record-label">
              Playdowns
            </p>
          </Link>
        </div>
      ) : (
        <p className="dashboard-record-label">No past events</p>
      )}
    </div>
  )
}
