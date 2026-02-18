"use client"

import { use } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { usePlaydowns } from "@/hooks/use-playdowns"
import { useTournaments } from "@/hooks/use-tournaments"
import { computePlaydownStandings, isPlaydownExpired } from "@/lib/playdowns"
import { isTournamentExpired, computePoolStandings } from "@/lib/tournaments"

export default function EventsPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getPlaydown } = usePlaydowns()
  const { getTournaments } = useTournaments()

  if (!team) return null

  const playdown = getPlaydown(teamId)
  const hasExpiredPlaydown = playdown && isPlaydownExpired(playdown.config, playdown.games)

  const expiredTournaments = getTournaments(teamId).filter((t) => isTournamentExpired(t.config))

  const hasAnyEvents = hasExpiredPlaydown || expiredTournaments.length > 0

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">Events</h1>
        <Link href={`/dashboard/${teamId}`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      {hasAnyEvents ? (
        <div className="dashboard-nav">
          {hasExpiredPlaydown && (
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
          )}

          {expiredTournaments.map((t) => {
            const selfTeam = t.config.teams.find((team) => team.id === "self")
            let record = "—"
            if (selfTeam) {
              const poolStandings = computePoolStandings(t.config, t.games, selfTeam.poolId)
              const selfRow = poolStandings.find((r) => r.teamId === "self")
              if (selfRow) record = `${selfRow.w}-${selfRow.l}-${selfRow.t}`
            }
            return (
              <Link key={t.config.id} href={`/dashboard/${teamId}/tournaments/${t.config.id}`} className="dashboard-record-card">
                <p className="dashboard-record">{record}</p>
                <p className="dashboard-record-label">{t.config.name}</p>
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="dashboard-record-label">No events</p>
      )}
    </div>
  )
}
