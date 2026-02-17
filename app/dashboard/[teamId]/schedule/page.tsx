"use client"

import { use } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { useGames } from "@/hooks/use-games"
import { useOpponents } from "@/hooks/use-opponents"
import type { Game } from "@/lib/types"

export default function SchedulePage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getTeamGames } = useGames()
  const { getById } = useOpponents()

  if (!team) return null

  function opponentDisplay(game: Game): string {
    if (game.opponentId) {
      const opp = getById(game.opponentId)
      if (opp) {
        if (opp.location && opp.name) return `${opp.location} ${opp.name}`
        return opp.fullName
      }
    }
    return game.opponent
  }

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = getTeamGames(teamId)
    .filter((g) => !g.played && g.date >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <Link href={`/dashboard/${teamId}`} className="back-link">
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <h1 className="page-title">Schedule</h1>
      </div>

      {upcoming.length === 0 ? (
        <p className="dashboard-record-label">No upcoming games</p>
      ) : (
        <div className="dashboard-nav">
          {upcoming.map((game) => (
            <div key={game.id} className="game-list-item">
              <div>
                <p className="text-sm font-medium">{opponentDisplay(game)}</p>
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
