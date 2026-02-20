"use client"

import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import { useSupabaseOpponents } from "@/hooks/use-supabase-opponents"

export default function AdminTeamHub() {
  const team = useTeamContext()
  const { games, loading: gamesLoading } = useSupabaseGames(team.id)
  const { standings } = useSupabaseStandings(team.id)
  const { opponents } = useSupabaseOpponents(team.id)

  if (gamesLoading) {
    return <p className="text-muted-foreground">Loading...</p>
  }

  const played = games.filter((g) => g.played)
  const wins = played.filter((g) => g.result === "W").length
  const losses = played.filter((g) => g.result === "L").length
  const ties = played.filter((g) => g.result === "T").length

  return (
    <div className="flex flex-col gap-4">
      <h1 className="admin-section-title">{team.organization} {team.name}</h1>

      <div className="dashboard-records">
        <div className="dashboard-record-card">
          <p className="dashboard-record">{wins}-{losses}-{ties}</p>
          <p className="dashboard-record-label">Record</p>
        </div>
        <div className="dashboard-record-card">
          <p className="dashboard-record">{games.length}</p>
          <p className="dashboard-record-label">Total Games</p>
        </div>
        <div className="dashboard-record-card">
          <p className="dashboard-record">{opponents.length}</p>
          <p className="dashboard-record-label">Opponents</p>
        </div>
        <div className="dashboard-record-card">
          <p className="dashboard-record">{standings ? standings.rows.length : 0}</p>
          <p className="dashboard-record-label">Standings Rows</p>
        </div>
      </div>
    </div>
  )
}
