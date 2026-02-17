"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { usePlaydowns } from "@/hooks/use-playdowns"
import { computePlaydownStandings, computeQualificationStatus } from "@/lib/playdowns"

export default function PlaydownsPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getPlaydown } = usePlaydowns()
  const [tab, setTab] = useState<"standings" | "graphs">("standings")

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
  const qualification = computeQualificationStatus(standings, config)
  const statusCounts = {
    locked: qualification.filter((r) => r.status === "locked").length,
    alive: qualification.filter((r) => r.status === "alive").length,
    out: qualification.filter((r) => r.status === "out").length,
  }
  const maxScale = Math.max(...qualification.map((r) => r.maxPts), 1)
  const cutoffPts = qualification.length >= config.qualifyingSpots
    ? qualification[config.qualifyingSpots - 1].pts
    : 0

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
        <h1 className="page-title">Playdowns</h1>
        <Link href={`/dashboard/${teamId}`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      <p className="text-sm text-center text-muted-foreground">
        {config.totalTeams} Teams - {config.qualifyingSpots} Qualifiers - {config.gamesPerMatchup} Games per Matchup
      </p>

      <div className="import-tabs">
        <button className="import-tab" data-active={tab === "standings"} onClick={() => setTab("standings")}>
          Standings / Schedule
        </button>
        <button className="import-tab" data-active={tab === "graphs"} onClick={() => setTab("graphs")}>
          Graphs
        </button>
      </div>

      {tab === "standings" && (
        <>
          {/* Standings */}
          {standings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="standings-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Team</th>
                    <th>PTS</th>
                    <th>GP</th>
                    <th>W</th>
                    <th>L</th>
                    <th>T</th>
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
                      <td className="font-medium">{row.teamName || teamName(row.teamId)}</td>
                      <td className="font-bold">{row.pts}</td>
                      <td>{row.gp}</td>
                      <td>{row.w}</td>
                      <td>{row.l}</td>
                      <td>{row.t}</td>
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
        </>
      )}

      {tab === "graphs" && qualification.length > 0 && (
        <>
          {/* Status Counter Strip */}
          <div className="qual-status-strip">
            <div className="qual-status-segment" data-status="out">
              <span className="qual-status-count">{statusCounts.out}</span>
              <span className="qual-status-label">OUT</span>
            </div>
            <div className="qual-status-segment" data-status="alive">
              <span className="qual-status-count">{statusCounts.alive}</span>
              <span className="qual-status-label">ALIVE</span>
            </div>
            <div className="qual-status-segment" data-status="locked">
              <span className="qual-status-count">{statusCounts.locked}</span>
              <span className="qual-status-label">LOCKED</span>
            </div>
          </div>

          {/* Standings with Progress Bars */}
          <div className="qual-standings-list">
            {qualification.map((row, i) => {
              const barWidth = maxScale > 0 ? (row.maxPts / maxScale) * 100 : 0
              const fillWidth = row.maxPts > 0 ? (row.pts / row.maxPts) * 100 : 0
              return (
                <div key={row.teamId} className={`qual-standings-row ${row.teamId === "self" ? "playdown-self-row" : ""}`}>
                  <div className="qual-standings-info">
                    <span className="qual-standings-rank">{i + 1}</span>
                    <span className="qual-standings-name">{row.teamName || teamName(row.teamId)}</span>
                    <span className="qual-standings-record">{row.w}-{row.l}-{row.t}</span>
                  </div>
                  <div className="qual-progress-wrap">
                    <div className="qual-progress-track" style={{ width: `${barWidth}%` }}>
                      <div className="qual-progress-fill" data-status={row.status} style={{ width: `${fillWidth}%` }} />
                    </div>
                    <span className="qual-progress-label">{row.pts}/{row.maxPts}</span>
                  </div>
                  <span className="qual-status-badge" data-status={row.status}>
                    {row.status === "locked" ? "IN" : row.status === "out" ? "OUT" : "ALIVE"}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Qualification Number Line */}
          <div className="qual-number-line-wrap">
            <div className="qual-number-line">
              <div
                className="qual-cutoff-line"
                style={{ left: `${(cutoffPts / maxScale) * 100}%` }}
              />
              <span className="qual-zone-label" data-zone="outside">Outside</span>
              <span className="qual-zone-label" data-zone="qualifying">Qualifying Zone</span>
              {qualification.map((row, i) => (
                <div
                  key={row.teamId}
                  className="qual-team-dot-wrap"
                  style={{ left: `${maxScale > 0 ? (row.pts / maxScale) * 100 : 0}%` }}
                >
                  <div className="qual-team-dot" data-status={row.status}>
                    {i + 1}
                  </div>
                  <div className="qual-team-tooltip">
                    {row.teamName || teamName(row.teamId)}: {row.pts} pts ({row.w}-{row.l}-{row.t})
                  </div>
                </div>
              ))}
              <span className="qual-axis-label" data-pos="start">0</span>
              <span className="qual-axis-label" data-pos="end">{maxScale}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
