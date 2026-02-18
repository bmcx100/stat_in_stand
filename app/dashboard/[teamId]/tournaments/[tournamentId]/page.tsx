"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { useTournaments } from "@/hooks/use-tournaments"
import {
  computePoolStandings,
  computeAllPoolStandings,
  detectTournamentTiebreakerResolutions,
  computeTournamentQualificationStatus,
} from "@/lib/tournaments"
import type { TournamentStandingsRow } from "@/lib/types"

export default function TournamentPage({
  params,
}: {
  params: Promise<{ teamId: string; tournamentId: string }>
}) {
  const { teamId, tournamentId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getTournament } = useTournaments()
  const [tab, setTab] = useState<"standings" | "graphs">("standings")
  const [activePool, setActivePool] = useState("")

  if (!team) return null

  const data = getTournament(teamId, tournamentId)

  if (!data) {
    return (
      <div className="dashboard-page">
        <div className="sub-page-header">
          <h1 className="page-title">Tournament</h1>
          <Link href={`/dashboard/${teamId}`} className="back-link">
            Back
            <ArrowLeft className="size-4" />
          </Link>
        </div>
        <p className="dashboard-record-label">Tournament not found.</p>
      </div>
    )
  }

  const { config, games } = data
  const allStandings = computeAllPoolStandings(config, games)

  // Default to first pool
  const currentPoolId = activePool || config.pools[0]?.id || ""
  const currentPool = config.pools.find((p) => p.id === currentPoolId)
  const poolStandings = allStandings.get(currentPoolId) ?? []
  const poolTiebreakers = detectTournamentTiebreakerResolutions(poolStandings, games, config.tiebreakerOrder)
  const poolQualification = currentPool
    ? computeTournamentQualificationStatus(poolStandings, config, currentPool)
    : []

  const totalMaxPts = currentPool
    ? (currentPool.teamIds.length - 1) * config.gamesPerMatchup * 2
    : 0
  const maxScale = Math.max(totalMaxPts, 1)
  const cutoffPts = poolQualification.length >= (currentPool?.qualifyingSpots ?? 0)
    ? poolQualification[(currentPool?.qualifyingSpots ?? 1) - 1]?.pts ?? 0
    : 0
  const statusCounts = {
    locked: poolQualification.filter((r) => r.status === "locked").length,
    alive: poolQualification.filter((r) => r.status === "alive").length,
    out: poolQualification.filter((r) => r.status === "out").length,
  }

  const poolGames = games.filter((g) => g.round === "pool" && g.poolId === currentPoolId)
  const elimGames = games.filter((g) => g.round !== "pool")

  const completed = poolGames
    .filter((g) => g.played)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = poolGames
    .filter((g) => !g.played && g.date >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  function teamName(id: string): string {
    const t = config.teams.find((t) => t.id === id)
    return t?.name ?? id
  }

  const tiebreakerLabels = config.tiebreakerOrder.map((key) => {
    const labels: Record<string, string> = {
      "wins": "Number of wins",
      "head-to-head": "Head-to-head record",
      "goal-differential": "Goal differential (GF - GA)",
      "goals-allowed": "Fewest goals allowed",
      "goals-for": "Most goals for",
    }
    return { label: labels[key] ?? key, key }
  })

  const tiebreakerKeyToResolvedLabel: Record<string, string> = {
    "wins": "Wins",
    "head-to-head": "Head-to-Head",
    "goal-differential": "Goal Differential",
    "goals-allowed": "Fewest Goals Allowed",
    "goals-for": "Most Goals For",
  }

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">{config.name}</h1>
        <Link href={`/dashboard/${teamId}`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        {config.location}
        {config.startDate && ` — ${config.startDate}`}
        {config.endDate && ` to ${config.endDate}`}
      </p>

      {/* Pool Tabs */}
      {config.pools.length > 1 && (
        <div className="import-tabs">
          {config.pools.map((pool) => (
            <button
              key={pool.id}
              className="import-tab"
              data-active={currentPoolId === pool.id}
              onClick={() => setActivePool(pool.id)}
            >
              {pool.name}
            </button>
          ))}
        </div>
      )}

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
          <p className="text-sm text-center font-bold">
            {currentPool?.name} — {currentPool?.teamIds.length} Teams — Top {currentPool?.qualifyingSpots} Qualify
          </p>

          {/* Standings */}
          {poolStandings.length > 0 && (
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
                  {poolStandings.map((row, i) => (
                    <tr
                      key={row.teamId}
                      className={`standings-row ${row.teamId === "self" ? "playdown-self-row" : ""} ${currentPool && i === currentPool.qualifyingSpots - 1 ? "playdown-cutoff" : ""}`}
                    >
                      <td>
                        <span className={`text-xs font-bold ${row.qualifies ? "text-green-600" : "text-muted-foreground"}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="font-medium">
                        <span className="qual-name-cell">
                          {row.teamName || teamName(row.teamId)}
                          {row.tiedUnresolved && (
                            <span className="qual-tie-warn-wrap">
                              <AlertCircle className="qual-tie-warn-icon" />
                              <span className="qual-tie-warn-tooltip">
                                Tie cannot be resolved with available tiebreakers
                              </span>
                            </span>
                          )}
                        </span>
                      </td>
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

          {/* Elimination Games */}
          {elimGames.length > 0 && (
            <>
              <h2 className="text-sm font-semibold">Elimination Round</h2>
              <div className="dashboard-nav">
                {elimGames.map((game) => (
                  <div key={game.id} className="game-list-item">
                    <div>
                      <p className="text-sm font-medium">
                        {teamName(game.homeTeam)} vs {teamName(game.awayTeam)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {game.round.charAt(0).toUpperCase() + game.round.slice(1)}
                        {game.date ? ` — ${game.date}` : ""}
                        {game.time ? ` at ${game.time}` : ""}
                      </p>
                      {game.location && (
                        <p className="text-xs text-muted-foreground">{game.location}</p>
                      )}
                    </div>
                    {game.played && (
                      <p className="text-sm font-bold">
                        {game.homeScore} - {game.awayScore}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {completed.length === 0 && upcoming.length === 0 && elimGames.length === 0 && (
            <p className="dashboard-record-label">No games scheduled yet.</p>
          )}
        </>
      )}

      {tab === "graphs" && poolQualification.length > 0 && (
        <>
          {/* Tiebreaker Cards */}
          {poolTiebreakers.length > 0 && (
            <div className="qual-tiebreaker-section">
              {poolTiebreakers.map((tb, i) => (
                <details key={i} className="qual-tiebreaker-card">
                  <summary className="qual-tiebreaker-summary">
                    <div className="qual-tiebreaker-badge">Tiebreaker Used</div>
                    <p className="qual-tiebreaker-teams">{tb.teamNames[0]} vs {tb.teamNames[1]}</p>
                  </summary>
                  <p className="qual-tiebreaker-resolved">Resolved by: <strong>{tb.resolvedBy}</strong></p>
                  <p className="qual-tiebreaker-detail">{tb.detail}</p>
                  <div className="qual-tiebreaker-rules">
                    <p className="qual-tiebreaker-rules-title">Tiebreaker Order:</p>
                    <ol className="qual-tiebreaker-rules-list">
                      {tiebreakerLabels.map((rule) => {
                        const resolvedLabel = tiebreakerKeyToResolvedLabel[rule.key] ?? rule.key
                        return (
                          <li key={rule.key} className={resolvedLabel === tb.resolvedBy ? "qual-tiebreaker-highlight" : ""}>
                            {tb.tiedValues[resolvedLabel] ? `${rule.label}: ${tb.tiedValues[resolvedLabel]}` : rule.label}
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* Standings with Progress Bars */}
          <div className="qual-standings-list">
            <p className="qual-standings-header"># | Team Name | Record | Games Played / Games Remaining</p>
            {poolQualification.map((row, i) => {
              const fillWidth = maxScale > 0 ? (row.pts / maxScale) * 100 : 0
              const potentialWidth = maxScale > 0 ? (row.maxPts / maxScale) * 100 : 0
              return (
                <div key={row.teamId} className={`qual-standings-row ${row.teamId === "self" ? "playdown-self-row" : ""}`}>
                  <div className="qual-standings-top">
                    <span className="qual-standings-rank">{i + 1}</span>
                    <span className="qual-standings-name">
                      {row.teamName || teamName(row.teamId)}
                      {row.tiedUnresolved && (
                        <span className="qual-tie-warn-wrap">
                          <AlertCircle className="qual-tie-warn-icon" />
                          <span className="qual-tie-warn-tooltip">
                            Tie cannot be resolved with available tiebreakers
                          </span>
                        </span>
                      )}
                    </span>
                    <span className="qual-standings-record">{row.w}-{row.l}-{row.t}</span>
                    <span className="qual-standings-games">{row.gp}/{row.gp + row.gamesRemaining}</span>
                  </div>
                  <div className="qual-standings-bottom">
                    <div className="qual-progress-wrap">
                      <div className="qual-progress-track">
                        <div className="qual-progress-potential" style={{ width: `${potentialWidth}%` }} />
                        <div className="qual-progress-fill" data-status={row.status} style={{ width: `${fillWidth}%` }} />
                      </div>
                      <span className="qual-progress-label">{row.pts}/{totalMaxPts} pts</span>
                    </div>
                    <span className="qual-standings-divider" />
                    <span className="qual-status-badge" data-status={row.status}>
                      {row.status === "locked" ? "IN" : row.status === "out" ? "OUT" : "ALIVE"}
                    </span>
                  </div>
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
              {poolQualification.map((row, i) => {
                const sameGroup = poolQualification.filter((r) => r.pts === row.pts)
                const groupIdx = sameGroup.findIndex((r) => r.teamId === row.teamId)
                const reversedIdx = sameGroup.length - 1 - groupIdx
                const offset = (reversedIdx - (sameGroup.length - 1) / 2) * 30
                return (
                  <div
                    key={row.teamId}
                    className="qual-team-dot-wrap"
                    style={{ left: `${maxScale > 0 ? (row.pts / maxScale) * 100 : 0}%`, marginLeft: `${offset}px` }}
                  >
                    <div className="qual-team-dot" data-status={row.status}>
                      {i + 1}
                    </div>
                    <div className="qual-team-tooltip">
                      {row.teamName || teamName(row.teamId)}: {row.pts} pts ({row.w}-{row.l}-{row.t})
                    </div>
                  </div>
                )
              })}
              {Array.from({ length: maxScale + 1 }, (_, n) => (
                <span
                  key={n}
                  className="qual-axis-tick"
                  style={{ left: `${maxScale > 0 ? (n / maxScale) * 100 : 0}%` }}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>

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
        </>
      )}
    </div>
  )
}
