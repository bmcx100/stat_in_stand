"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { computePlaydownStandings, computeQualificationStatus, detectTiebreakerResolutions } from "@/lib/playdowns"

export default function PlaydownsPage() {
  const team = useTeamContext()
  const { playdown, loading } = useSupabasePlaydowns(team.id)
  const [tab, setTab] = useState<"standings" | "graphs">("graphs")

  if (loading) {
    return (
      <div className="dashboard-page">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!playdown) {
    return (
      <div className="dashboard-page">
        <div className="sub-page-header">
          <h1 className="page-title">Playdowns</h1>
          <Link href={`/team/${team.slug}`} className="back-link">
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
  const totalMaxPts = (config.totalTeams - 1) * config.gamesPerMatchup * 2
  const maxScale = Math.max(totalMaxPts, 1)
  const cutoffPts = qualification.length >= config.qualifyingSpots
    ? qualification[config.qualifyingSpots - 1].pts
    : 0
  const tiebreakers = detectTiebreakerResolutions(standings, games)

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
        <Link href={`/team/${team.slug}`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      <p className="text-sm text-center font-bold">
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
                    <th>OTL</th>
                    <th>SOL</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>DIFF</th>
                    <th>PIM</th>
                    <th>Win%</th>
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
                      <td className="font-medium">
                        <span className="qual-name-cell">
                          {row.teamName || teamName(row.teamId)}
                          {row.tiedUnresolved && (
                            <span className="qual-tie-warn-wrap">
                              <AlertCircle className="qual-tie-warn-icon" />
                              <span className="qual-tie-warn-tooltip">
                                Cannot be calculated with current info !!!
                                <br />5. Most periods won in round-robin play
                                <br />6. Fewest penalty minutes in round-robin play
                                <br />7. First goal scored in the series
                                <br />8. Flip of a coin
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
                      <td>{row.otl}</td>
                      <td>{row.sol}</td>
                      <td>{row.gf}</td>
                      <td>{row.ga}</td>
                      <td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                      <td>{row.pim}</td>
                      <td>{(row.winPct * 100).toFixed(1)}%</td>
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
          {/* Tiebreaker Cards */}
          {tiebreakers.length > 0 && (
            <div className="qual-tiebreaker-section">
              {tiebreakers.map((tb, i) => (
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
                      {[
                        { label: "Number of wins", key: "Wins" },
                        { label: "Head-to-head record", key: "Head-to-Head" },
                        { label: "Goal differential (GF - GA)", key: "Goal Differential" },
                        { label: "Fewest goals allowed", key: "Fewest Goals Allowed" },
                        { label: "Most periods won *", key: "" },
                        { label: "Fewest penalty minutes *", key: "" },
                        { label: "First goal scored in series *", key: "" },
                        { label: "Flip of a coin *", key: "" },
                      ].map((rule) => (
                        <li key={rule.label} className={rule.key === tb.resolvedBy ? "qual-tiebreaker-highlight" : ""}>
                          {rule.key && tb.tiedValues[rule.key] ? `${rule.label}: ${tb.tiedValues[rule.key]}` : rule.label}
                        </li>
                      ))}
                    </ol>
                    <p className="qual-tiebreaker-note">* Cannot be calculated with current data</p>
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* Standings with Progress Bars */}
          <div className="qual-standings-list">
            <p className="qual-standings-header"># | Team Name | Record | Games Played / Games Remaining</p>
            {qualification.map((row, i) => {
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
                            Cannot be calculated with current info !!!
                            <br />5. Most periods won in round-robin play
                            <br />6. Fewest penalty minutes in round-robin play
                            <br />7. First goal scored in the series
                            <br />8. Flip of a coin
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
              {qualification.map((row, i) => {
                const sameGroup = qualification.filter((r) => r.pts === row.pts)
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
