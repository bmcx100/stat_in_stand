"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"

export default function SchedulePage() {
  const team = useTeamContext()
  const { games, loading } = useSupabaseGames(team.id)

  if (loading) {
    return (
      <div className="dashboard-page">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = games
    .filter((g) => !g.played && g.date >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">Schedule</h1>
        <Link href={`/team/${team.slug}`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <p className="dashboard-record-label">No upcoming games</p>
      ) : (
        <div className="dashboard-nav">
          {upcoming.map((game) => (
            <div key={game.id} className="game-list-item">
              <div>
                <p className="text-sm font-medium">{game.opponent}</p>
                <p className="text-xs text-muted-foreground">
                  {game.date}{game.time ? ` at ${game.time}` : ""}
                </p>
                {game.location && (
                  <p className="text-xs text-muted-foreground">{game.location}</p>
                )}
              </div>
              <span className="game-type-badge">{game.gameType}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
