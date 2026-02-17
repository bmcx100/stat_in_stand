"use client"

import { use } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { usePlaydowns } from "@/hooks/use-playdowns"
import { computePlaydownStandings } from "@/lib/playdowns"

export default function PlaydownsPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getPlaydown } = usePlaydowns()

  if (!team) return null

  const playdown = getPlaydown(teamId)

  if (!playdown) {
    return (
      <div className="dashboard-page">
        <div className="sub-page-header">
          <h1 className="page-title">Playdowns</h1>
          <Link href={`/dashboard/${teamId}`} className="back-link">
            Back
            <ArrowLeft className="size-4" />
          </Link>
        </div>
        <p className="dashboard-record-label">No playdowns configured yet.</p>
      </div>
    )
  }

  const { config, games } = playdown
  const standings = computePlaydownStandings(config, games)

  const completed = games
    .filter((g) => g.played)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = games
    .filter((g) => !g.played && g.date >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  function teamName(id: string): string {
    const t = config.teams.find((t) => t.id === id)
    return t?.name ?? id
  }

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <Link href={`/dashboard/${teamId}`} className="back-link">
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <h1 className="page-title">Playdowns</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        {config.teams.length} teams — top {config.qualifyingSpots} qualify for Provincials
        {config.gamesPerMatchup > 1 && ` — ${config.gamesPerMatchup} games per matchup`}
      </p>

      {/* Standings */}
      {standings.length > 0 && (
        <div className="playdown-standings-wrap">
          <table className="standings-table">
            <thead>
              <tr>
                <th></th>
                <th>Team</th>
                <th>GP</th>
                <th>W</th>
                <th>L</th>
                <th>T</th>
                <th>PTS</th>
                <th>GF</th>
                <th>GA</th>
                <th>DIFF</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr
                  key={row.teamId}
                  className={`standings-row ${row.teamId === "self" ? "playdown-self-row" : ""} ${i === config.qualifyingSpots - 1 ? "playdown-cutoff" : ""}`}
                >
                  <td>
                    <span className={`text-xs font-bold ${row.qualifies ? "text-green-600" : "text-muted-foreground"}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td>{row.teamName}</td>
                  <td>{row.gp}</td>
                  <td>{row.w}</td>
                  <td>{row.l}</td>
                  <td>{row.t}</td>
                  <td className="font-bold">{row.pts}</td>
                  <td>{row.gf}</td>
                  <td>{row.ga}</td>
                  <td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Completed Games */}
      {completed.length > 0 && (
        <>
          <h2 className="text-sm font-semibold">Results</h2>
          <div className="dashboard-nav">
            {completed.map((game) => (
              <div key={game.id} className="game-list-item">
                <div>
                  <p className="text-sm font-medium">
                    {teamName(game.homeTeam)} vs {teamName(game.awayTeam)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {game.date}{game.time ? ` at ${game.time}` : ""}
                  </p>
                  {game.location && (
                    <p className="text-xs text-muted-foreground">{game.location}</p>
                  )}
                </div>
                <p className="text-sm font-bold">
                  {game.homeScore} - {game.awayScore}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upcoming Games */}
      {upcoming.length > 0 && (
        <>
          <h2 className="text-sm font-semibold">Upcoming</h2>
          <div className="dashboard-nav">
            {upcoming.map((game) => (
              <div key={game.id} className="game-list-item">
                <div>
                  <p className="text-sm font-medium">
                    {teamName(game.homeTeam)} vs {teamName(game.awayTeam)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {game.date}{game.time ? ` at ${game.time}` : ""}
                  </p>
                  {game.location && (
                    <p className="text-xs text-muted-foreground">{game.location}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {completed.length === 0 && upcoming.length === 0 && (
        <p className="dashboard-record-label">No playdown games scheduled yet.</p>
      )}
    </div>
  )
}
