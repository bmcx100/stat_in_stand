"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { useGames } from "@/hooks/use-games"
import { useOpponents } from "@/hooks/use-opponents"
import type { Game, GameType } from "@/lib/types"

const GAME_TYPES: Array<{ value: GameType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "unlabeled", label: "Unlabeled" },
  { value: "regular", label: "Regular" },
  { value: "tournament", label: "Tournament" },
  { value: "exhibition", label: "Exhibition" },
  { value: "playoffs", label: "Playoffs" },
  { value: "playdowns", label: "Playdowns" },
  { value: "provincials", label: "Provincials" },
]

function ResultBadge({ result }: { result: Game["result"] }) {
  if (!result) return null
  const cls = result === "W" ? "result-badge-w"
    : result === "L" ? "result-badge-l"
    : "result-badge-t"
  return <span className={`result-badge ${cls}`}>{result}</span>
}

function LastTenSummary({ games }: { games: Game[] }) {
  const lastTen = games.slice(0, 10)
  if (lastTen.length === 0) return null

  const w = lastTen.filter((g) => g.result === "W").length
  const l = lastTen.filter((g) => g.result === "L").length
  const t = lastTen.filter((g) => g.result === "T").length

  return (
    <div className="last-ten-summary">
      <span className="last-ten-label">Last {lastTen.length} Games</span>
      <span className="last-ten-record">{w}-{l}-{t}</span>
      <div className="last-ten-dots">
        {lastTen.map((g) => {
          const color = g.result === "W" ? "result-badge-w"
            : g.result === "L" ? "result-badge-l"
            : "result-badge-t"
          return <span key={g.id} className={`last-ten-dot ${color}`} />
        })}
      </div>
    </div>
  )
}

export default function ResultsPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getTeamGames } = useGames()
  const { getById } = useOpponents()
  const [filter, setFilter] = useState<GameType | "all">("all")

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

  if (!team) return null

  const allPlayed = getTeamGames(teamId)
    .filter((g) => g.played)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filtered = allPlayed
    .filter((g) => filter === "all" || g.gameType === filter)

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <Link href={`/dashboard/${teamId}`} className="back-link">
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <h1 className="page-title">All Games</h1>
      </div>

      <LastTenSummary games={allPlayed} />

      <div className="filter-bar">
        <select
          className="game-form-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as GameType | "all")}
        >
          {GAME_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="dashboard-record-label">No results yet</p>
      ) : (
        <div className="dashboard-nav">
          {filtered.map((game) => (
            <div key={game.id} className="game-list-item">
              <div>
                <p className="text-sm font-medium">{opponentDisplay(game)}</p>
                <p className="text-xs text-muted-foreground">{game.date}</p>
                {game.location && (
                  <p className="text-xs text-muted-foreground">{game.location}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">
                  {game.teamScore} - {game.opponentScore}
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  <ResultBadge result={game.result} />
                  <span className="game-type-badge">{game.gameType}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
