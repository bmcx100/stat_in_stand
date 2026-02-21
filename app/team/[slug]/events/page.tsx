"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { useSupabaseTournaments } from "@/hooks/use-supabase-tournaments"
import { isPlaydownExpired } from "@/lib/playdowns"
import { isTournamentExpired, computePoolStandings } from "@/lib/tournaments"

export default function EventsPage() {
  const team = useTeamContext()
  const { playdown, loading: playdownLoading } = useSupabasePlaydowns(team.id)
  const { tournaments, loading: tournamentsLoading } = useSupabaseTournaments(team.id)

  if (playdownLoading || tournamentsLoading) {
    return (
      <div className="dashboard-page">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const hasExpiredPlaydown = playdown && isPlaydownExpired(playdown.config, playdown.games)

  const expiredTournaments = tournaments.filter((t) => isTournamentExpired(t.config))

  const hasAnyEvents = hasExpiredPlaydown || expiredTournaments.length > 0

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">Events</h1>
        <Link href={`/team/${team.slug}`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      {hasAnyEvents ? (
        <div className="dashboard-nav">
          {hasExpiredPlaydown && (
            <Link href={`/team/${team.slug}/playdowns`} className="dashboard-record-card">
              <p className="dashboard-record">—</p>
              <p className="dashboard-record-label">Playdowns</p>
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
              <Link key={t.config.id} href={`/team/${team.slug}/tournaments/${t.config.id}`} className="dashboard-record-card">
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
