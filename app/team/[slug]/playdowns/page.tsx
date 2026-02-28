"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, AlertCircle } from "lucide-react"
import MatricivesContent from "./matricives-content"
import { useTeamContext } from "@/lib/team-context"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import { computePlaydownStandings, computeQualificationStatus, detectTiebreakerResolutions, isAllTeamsAdvance } from "@/lib/playdowns"
import type { PlaydownConfig, PlaydownGame, PlaydownStandingsRow, StandingsRow } from "@/lib/types"
import type { Game } from "@/lib/types"

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}

function owhaGamesToPlaydownGames(owhaGames: Game[], config: PlaydownConfig): PlaydownGame[] {
  return owhaGames
    .filter((g) => g.played)
    .map((g): PlaydownGame | null => {
      const needle = normName(g.opponent)
      const oppTeam = config.teams.find((t) => {
        if (t.id === "self") return false
        const hay = normName(t.name)
        return hay === needle || hay.includes(needle) || needle.includes(hay)
      })
      if (!oppTeam) return null
      const isHome = g.home !== false
      return {
        id: g.id,
        teamId: "self",
        date: g.date,
        time: g.time ?? "",
        homeTeam: isHome ? "self" : oppTeam.id,
        awayTeam: isHome ? oppTeam.id : "self",
        homeScore: isHome ? g.teamScore : g.opponentScore,
        awayScore: isHome ? g.opponentScore : g.teamScore,
        location: g.location ?? "",
        played: true,
      }
    })
    .filter((g): g is PlaydownGame => g !== null)
}

function owhaStandingsToPlaydownRows(
  rows: StandingsRow[],
  orgName: string,
  teamName: string
): PlaydownStandingsRow[] {
  return rows.map((r, i) => {
    const n = normName(r.teamName)
    const fullName = normName(`${orgName} ${teamName}`)
    const isSelf = n === fullName || n.includes(fullName) || fullName.includes(n)
    return {
      teamId: isSelf ? "self" : `owha-${i}`,
      teamName: r.teamName,
      gp: r.gp, w: r.w, l: r.l, t: r.t,
      otl: r.otl ?? 0, sol: r.sol ?? 0,
      pts: r.pts,
      gf: r.gf ?? 0, ga: r.ga ?? 0,
      diff: (r.gf ?? 0) - (r.ga ?? 0),
      pim: 0,
      winPct: r.gp > 0 ? r.w / r.gp : 0,
      qualifies: false,
      tiedUnresolved: false,
    }
  })
}

export default function PlaydownsPage() {
  const team = useTeamContext()
  const { playdown, loading } = useSupabasePlaydowns(team.id)
  const { games: allGames, loading: gamesLoading } = useSupabaseGames(team.id)
  const { standingsMap, loading: standingsLoading } = useSupabaseStandings(team.id)
  const [tab, setTab] = useState<"graphs" | "standings" | "schedule" | "simulator">("graphs")
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [expandedCols, setExpandedCols] = useState(false)

  if (loading || gamesLoading || standingsLoading) {
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

  if (isAllTeamsAdvance(config)) {
    return (
      <div className="dashboard-page">
        <div className="sub-page-header">
          <h1 className="page-title">Playdowns</h1>
          <Link href={`/team/${team.slug}`} className="back-link">
            Back
            <ArrowLeft className="size-4" />
          </Link>
        </div>
        <div className="playdown-auto-advance-card">
          <p className="playdown-auto-advance-title">{team.name}</p>
          <p className="playdown-auto-advance-msg">All Teams Advance</p>
          <p className="playdown-auto-advance-detail">
            {config.totalTeams} teams in loop — no games required
          </p>
        </div>
      </div>
    )
  }

  // ── OWHA mode: standings sync has populated teamNames in config ───────────
  // Use synced OWHA standings + playdown.games JSONB (all loop games) directly.
  const isOwhaMode = (config.teamNames?.length ?? 0) > 0
  if (isOwhaMode) {
    const owhaRows = standingsMap["playdowns"]?.rows ?? []
    const playdownStandings = owhaStandingsToPlaydownRows(owhaRows, team.organization, team.name)
    const totalTeams = config.teamNames?.length || config.totalTeams || owhaRows.length
    const qualifyingSpots = config.qualifyingSpots || 0
    // Count total games per team (played + scheduled) from the JSONB schedule.
    // This is reliable regardless of how many games have been played so far.
    const gameCountByTeam = new Map<string, number>()
    for (const g of games) {
      gameCountByTeam.set(g.homeTeam, (gameCountByTeam.get(g.homeTeam) ?? 0) + 1)
      gameCountByTeam.set(g.awayTeam, (gameCountByTeam.get(g.awayTeam) ?? 0) + 1)
    }
    const maxScheduledGames = gameCountByTeam.size > 0 ? Math.max(...gameCountByTeam.values()) : 0
    const gamesPerMatchup = maxScheduledGames > 0 && totalTeams > 1
      ? Math.max(1, Math.round(maxScheduledGames / (totalTeams - 1)))
      : Math.max(1, config.gamesPerMatchup || 1)
    const syntheticConfig: PlaydownConfig = {
      teamId: team.id, totalTeams, qualifyingSpots, gamesPerMatchup, teams: [],
    }
    const qualification = computeQualificationStatus(playdownStandings, syntheticConfig)
    const statusCounts = {
      locked: qualification.filter((r) => r.status === "locked").length,
      alive: qualification.filter((r) => r.status === "alive").length,
      out: qualification.filter((r) => r.status === "out").length,
    }
    const totalGamesPerTeam = (totalTeams - 1) * gamesPerMatchup
    const totalMaxPts = totalGamesPerTeam * 2
    const maxScale = Math.max(totalMaxPts, 1)
    const cutoffPts = qualifyingSpots > 0 && qualification.length >= qualifyingSpots
      ? qualification[qualifyingSpots - 1].pts : 0
    const totalGroupPts = totalTeams * (totalTeams - 1) * gamesPerMatchup
    const clinchPts = qualifyingSpots > 0 && totalTeams > qualifyingSpots
      ? Math.floor(totalGroupPts / (totalTeams - qualifyingSpots + 1)) + 1 : totalMaxPts
    const allZeroPoints = qualification.every((r) => r.pts === 0)
    const today = new Date().toISOString().slice(0, 10)
    const completed = games.filter((g) => g.played).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const upcoming = games.filter((g) => !g.played && g.date >= today).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const filteredCompleted = selectedTeamId
      ? completed.filter((g) => g.homeTeam === selectedTeamId || g.awayTeam === selectedTeamId)
      : completed
    const filteredUpcoming = selectedTeamId
      ? upcoming.filter((g) => g.homeTeam === selectedTeamId || g.awayTeam === selectedTeamId)
      : upcoming

    return (
      <div className="dashboard-page">
        <div className="sub-page-header">
          <h1 className="page-title">Playdowns</h1>
          <Link href={`/team/${team.slug}`} className="back-link">Back<ArrowLeft className="size-4" /></Link>
        </div>
        {config.teamNames && (
          <p className="text-sm text-center font-bold">
            {totalTeams} Teams · Top {qualifyingSpots} qualify · {totalGamesPerTeam} games each
          </p>
        )}
        <div className="import-tabs playdown-tabs">
          <button className="import-tab" data-active={tab === "graphs"} onClick={() => setTab("graphs")}>Graphs</button>
          <button className="import-tab" data-active={tab === "standings"} onClick={() => setTab("standings")}>Standings</button>
          <button className="import-tab" data-active={tab === "schedule"} onClick={() => setTab("schedule")}>Schedule</button>
          <button className="import-tab" data-active={tab === "simulator"} onClick={() => setTab("simulator")}>Simulator</button>
        </div>

        {tab === "standings" && (
          <>
            {playdownStandings.length > 0 && (
              <div className="overflow-x-auto">
                <table className="standings-table">
                  <thead><tr>
                    <th></th><th>Team</th><th>PTS</th><th>GP</th><th>W</th><th>L</th><th>T</th>
                    {expandedCols && <><th>OTL</th><th>SOL</th><th>GF</th><th>GA</th><th>DIFF</th></>}
                    <th className="playdown-expand-col" onClick={() => setExpandedCols(!expandedCols)} />
                  </tr></thead>
                  <tbody>
                    {(() => {
                      const N = playdownStandings.length
                      const midIdx = Math.ceil(N / 2) - 1
                      const isEven = N % 2 === 0
                      return playdownStandings.map((row, i) => (
                        <tr
                          key={row.teamId}
                          className={`standings-row standings-row-clickable ${row.teamId === "self" ? "playdown-self-row" : ""} ${i === qualifyingSpots - 1 ? "playdown-cutoff" : ""} ${selectedTeamId === row.teamName ? "playdown-row-selected" : ""}`}
                          onClick={() => setSelectedTeamId(selectedTeamId === row.teamName ? null : row.teamName)}
                        >
                          <td><span className={`text-xs font-bold ${row.qualifies ? "text-green-600" : "text-muted-foreground"}`}>{i + 1}</span></td>
                          <td>
                            <span className="playdown-team-name">
                              <span className="playdown-team-location">{row.teamName.split(/\s+/).slice(0, -1).join(" ") || row.teamName}</span>
                              <span className="playdown-team-mascot">{row.teamName.includes(" ") ? row.teamName.split(/\s+/).slice(-1)[0] : ""}</span>
                            </span>
                          </td>
                          <td className="font-bold">{row.pts}</td>
                          <td>{row.gp}/{totalGamesPerTeam}</td><td>{row.w}</td><td>{row.l}</td><td>{row.t}</td>
                          {expandedCols && <><td>{row.otl}</td><td>{row.sol}</td><td>{row.gf}</td><td>{row.ga}</td><td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td></>}
                          <td className={`playdown-expand-col ${i === midIdx ? (isEven ? "playdown-expand-icon-bottom" : "playdown-expand-icon-center") : ""}`} onClick={(e) => { e.stopPropagation(); setExpandedCols(!expandedCols) }}>
                            {i === midIdx && <span className="playdown-expand-btn">{expandedCols ? "−" : "+"}</span>}
                          </td>
                        </tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
            )}
            {completed.length > 0 && (
              <>
                <h2 className="text-sm font-semibold">
                  Results{selectedTeamId ? ` — ${selectedTeamId}` : ""}
                </h2>
                <div className="dashboard-nav">
                  {filteredCompleted.map((g) => (
                    <div key={g.id} className="game-list-item">
                      <div>
                        <p className="text-sm font-medium">{g.homeTeam} vs {g.awayTeam}</p>
                        <p className="text-xs text-muted-foreground">{g.date}{g.time ? ` at ${g.time}` : ""}</p>
                        {g.location && <p className="text-xs text-muted-foreground">{g.location}</p>}
                      </div>
                      <p className="text-sm font-bold">{g.homeScore} - {g.awayScore}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "schedule" && (
          <>
            {upcoming.length > 0 && (
              <>
                <h2 className="text-sm font-semibold">
                  Upcoming{selectedTeamId ? ` — ${selectedTeamId}` : ""}
                </h2>
                <div className="dashboard-nav">
                  {filteredUpcoming.map((g) => (
                    <div key={g.id} className="game-list-item">
                      <div>
                        <p className="text-sm font-medium">{g.homeTeam} vs {g.awayTeam}</p>
                        <p className="text-xs text-muted-foreground">{g.date}{g.time ? ` at ${g.time}` : ""}</p>
                        {g.location && <p className="text-xs text-muted-foreground">{g.location}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {upcoming.length === 0 && (
              <p className="dashboard-record-label">No upcoming games.</p>
            )}
          </>
        )}

        {tab === "graphs" && qualification.length > 0 && !allZeroPoints && (
          <>
            <div className="qual-standings-list">
              <div className="qual-standings-heading">
                <p className="qual-standings-header"># | Team Name | Record</p>
                <div className="qual-legend">
                  <span className="qual-legend-item"><span className="qual-legend-swatch" data-color="realized" /> Realized</span>
                  <span className="qual-legend-sep">/</span>
                  <span className="qual-legend-item"><span className="qual-legend-swatch" data-color="potential" /> Potential</span>
                  <span className="qual-legend-sep">/</span>
                  <span className="qual-legend-item"><span className="qual-legend-swatch" data-color="max" /> Max</span>
                </div>
              </div>
              {qualification.map((row, i) => {
                const fillWidth = maxScale > 0 ? (row.pts / maxScale) * 100 : 0
                const potentialWidth = maxScale > 0 ? (row.maxPts / maxScale) * 100 : 0
                const tiedGroup = qualification
                  .map((r, idx) => ({ r, rank: idx + 1 }))
                  .filter((x) => x.r.pts === row.pts)
                const isTied = tiedGroup.length > 1
                const tiedLabel = tiedGroup.map((x) => x.rank).join("/")
                return (
                  <div key={row.teamId} className={`qual-standings-row ${row.teamId === "self" ? "playdown-self-row" : ""}`}>
                    <div className="qual-standings-top">
                      <div className="qual-standings-left">
                        <span className="qual-standings-rank">{i + 1}</span>
                        <span className="qual-standings-name">{row.teamName}</span>
                      </div>
                      <div className="qual-standings-right">
                        <span className="qual-standings-record">{row.w}-{row.l}-{row.t}</span>
                        <span className="qual-standings-games">{row.gp}/{row.gp + row.gamesRemaining} games</span>
                      </div>
                    </div>
                    <div className="qual-standings-bottom">
                      <div className="qual-progress-wrap">
                        <div className="qual-progress-track">
                          <div className="qual-progress-potential" style={{ width: `${potentialWidth}%` }} />
                          <div className="qual-progress-fill" data-status={row.status} style={{ width: `${fillWidth}%` }} />
                        </div>
                        <span className="qual-progress-label">{row.pts}/{row.maxPts}/{totalMaxPts} pts</span>
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
            <div className="qual-number-line-wrap">
              <div className="qual-number-line">
                <div className="qual-clinch-zone" style={{ left: `${(clinchPts / maxScale) * 100}%`, width: `${((maxScale - clinchPts) / maxScale) * 100}%` }} />
                <div className="qual-cutoff-line" style={{ left: `${(cutoffPts / maxScale) * 100}%` }} />
                <span className="qual-zone-label" data-zone="outside">Out</span>
                <span className="qual-zone-label" data-zone="qualifying">Locked Zone</span>
                {(() => {
                  const seen = new Set<number>()
                  return qualification.map((row, i) => {
                    if (row.pts === 0 || seen.has(row.pts)) return null
                    const group = qualification
                      .map((r, idx) => ({ r, rank: idx + 1 }))
                      .filter((x) => x.r.pts === row.pts)
                    group.forEach((x) => seen.add(x.r.pts))
                    const label = group.map((x) => x.rank).join("/")
                    const isTied = group.length > 1
                    const tooltipLines = group.map((x) => `${x.r.teamName}: ${x.r.pts} pts (${x.r.w}-${x.r.l}-${x.r.t})`).join("\n")
                    return (
                      <div key={row.teamId} className="qual-team-dot-wrap" style={{ left: `${(row.pts / maxScale) * 100}%` }}>
                        <div className={`qual-team-dot ${isTied ? "qual-team-dot-tied" : ""}`} data-status={row.status}>{label}</div>
                        <div className="qual-team-tooltip">{tooltipLines}</div>
                      </div>
                    )
                  })
                })()}
                {Array.from({ length: maxScale + 1 }, (_, n) => (
                  <span key={n} className="qual-axis-tick" style={{ left: `${(n / maxScale) * 100}%` }}>{n}</span>
                ))}
              </div>
            </div>
            <div className="qual-status-strip">
              <div className="qual-status-segment" data-status="out"><span className="qual-status-count">{statusCounts.out}</span><span className="qual-status-label">OUT</span></div>
              <div className="qual-status-segment" data-status="alive"><span className="qual-status-count">{statusCounts.alive}</span><span className="qual-status-label">ALIVE</span></div>
              <div className="qual-status-segment" data-status="locked"><span className="qual-status-count">{statusCounts.locked}</span><span className="qual-status-label">LOCKED</span></div>
            </div>
          </>
        )}
        {tab === "graphs" && allZeroPoints && (
          <p className="dashboard-record-label">No points recorded yet.</p>
        )}

        {tab === "simulator" && <MatricivesContent />}
      </div>
    )
  }
  // ── End OWHA mode ─────────────────────────────────────────

  // Merge manually-entered bracket games with OWHA-synced games from the games table.
  // OWHA games are converted to PlaydownGame format by matching opponent names to config.teams.
  const owhaPlaydownGames = allGames.filter((g) => g.gameType === "playdowns")
  const convertedOwhaGames = owhaGamesToPlaydownGames(owhaPlaydownGames, config)
  // Deduplicate: only add converted games whose IDs aren't already in the JSONB blob
  const existingIds = new Set(games.map((g) => g.id))
  const mergedGames = [...games, ...convertedOwhaGames.filter((g) => !existingIds.has(g.id))]
  const standings = computePlaydownStandings(config, mergedGames)
  const qualification = computeQualificationStatus(standings, config)
  const statusCounts = {
    locked: qualification.filter((r) => r.status === "locked").length,
    alive: qualification.filter((r) => r.status === "alive").length,
    out: qualification.filter((r) => r.status === "out").length,
  }
  const teamCount = config.teams.length || config.totalTeams
  const totalMaxPts = (teamCount - 1) * config.gamesPerMatchup * 2
  const maxScale = Math.max(totalMaxPts, 1)
  const cutoffPts = config.qualifyingSpots > 0 && qualification.length >= config.qualifyingSpots
    ? qualification[config.qualifyingSpots - 1].pts
    : 0
  const totalGroupPts = teamCount * (teamCount - 1) * config.gamesPerMatchup
  const clinchPts = config.qualifyingSpots > 0 && teamCount > config.qualifyingSpots
    ? Math.floor(totalGroupPts / (teamCount - config.qualifyingSpots + 1)) + 1 : totalMaxPts
  const completed = mergedGames
    .filter((g) => g.played)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const allZeroPoints = qualification.every((r) => r.pts === 0)
  const anyZeroGamesPlayed = standings.some((r) => r.gp === 0)
  const tiebreakers = anyZeroGamesPlayed ? [] : detectTiebreakerResolutions(standings, mergedGames)

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = mergedGames
    .filter((g) => !g.played && g.date >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  function teamName(id: string): string {
    const t = config.teams.find((t) => t.id === id)
    return t?.name ?? id
  }

  const filteredCompleted = selectedTeamId
    ? completed.filter((g) => g.homeTeam === selectedTeamId || g.awayTeam === selectedTeamId)
    : completed

  const filteredUpcoming = selectedTeamId
    ? upcoming.filter((g) => g.homeTeam === selectedTeamId || g.awayTeam === selectedTeamId)
    : upcoming

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

      <div className="import-tabs playdown-tabs">
        <button className="import-tab" data-active={tab === "graphs"} onClick={() => setTab("graphs")}>
          Graphs
        </button>
        <button className="import-tab" data-active={tab === "standings"} onClick={() => setTab("standings")}>
          Standings
        </button>
        <button className="import-tab" data-active={tab === "schedule"} onClick={() => setTab("schedule")}>
          Schedule
        </button>
        <button className="import-tab" data-active={tab === "simulator"} onClick={() => setTab("simulator")}>
          Simulator
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
                      {expandedCols && <><th>OTL</th><th>SOL</th><th>GF</th><th>GA</th><th>DIFF</th><th>PIM</th><th>Win%</th></>}
                      <th className="playdown-expand-col" onClick={() => setExpandedCols(!expandedCols)} />
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const N = standings.length
                      const midIdx = Math.ceil(N / 2) - 1
                      const isEven = N % 2 === 0
                      return standings.map((row, i) => (
                        <tr
                          key={row.teamId}
                          className={`standings-row standings-row-clickable ${row.teamId === "self" ? "playdown-self-row" : ""} ${i === config.qualifyingSpots - 1 ? "playdown-cutoff" : ""} ${selectedTeamId === row.teamId ? "playdown-row-selected" : ""}`}
                          onClick={() => setSelectedTeamId(selectedTeamId === row.teamId ? null : row.teamId)}
                        >
                          <td>
                            <span className={`text-xs font-bold ${row.qualifies ? "text-green-600" : "text-muted-foreground"}`}>
                              {i + 1}
                            </span>
                          </td>
                          <td>
                            <span className="qual-name-cell">
                              {(() => {
                                const n = row.teamName || teamName(row.teamId)
                                return (
                                  <span className="playdown-team-name">
                                    <span className="playdown-team-location">{n.split(/\s+/).slice(0, -1).join(" ") || n}</span>
                                    <span className="playdown-team-mascot">{n.includes(" ") ? n.split(/\s+/).slice(-1)[0] : ""}</span>
                                  </span>
                                )
                              })()}
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
                          {expandedCols && <><td>{row.otl}</td><td>{row.sol}</td><td>{row.gf}</td><td>{row.ga}</td><td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td><td>{row.pim}</td><td>{(row.winPct * 100).toFixed(1)}%</td></>}
                          <td className={`playdown-expand-col ${i === midIdx ? (isEven ? "playdown-expand-icon-bottom" : "playdown-expand-icon-center") : ""}`} onClick={(e) => { e.stopPropagation(); setExpandedCols(!expandedCols) }}>
                            {i === midIdx && <span className="playdown-expand-btn">{expandedCols ? "−" : "+"}</span>}
                          </td>
                        </tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
          )}

          {/* Completed Games */}
          {(completed.length > 0 || selectedTeamId) && (
            <>
              <h2 className="text-sm font-semibold">
                Results{selectedTeamId ? ` — ${teamName(selectedTeamId)}` : ""}
              </h2>
              {filteredCompleted.length === 0 ? (
                <p className="dashboard-record-label">No Results Available</p>
              ) : (
                <div className="dashboard-nav">
                  {filteredCompleted.map((game) => (
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
              )}
            </>
          )}
        </>
      )}

      {tab === "schedule" && (
        <>
          {/* Upcoming Games */}
          {(upcoming.length > 0 || selectedTeamId) && (
            <>
              <h2 className="text-sm font-semibold">
                Upcoming{selectedTeamId ? ` — ${teamName(selectedTeamId)}` : ""}
              </h2>
              {filteredUpcoming.length === 0 ? (
                <p className="dashboard-record-label">No upcoming games.</p>
              ) : (
                <div className="dashboard-nav">
                  {filteredUpcoming.map((game) => (
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
              )}
            </>
          )}

          {upcoming.length === 0 && !selectedTeamId && (
            <p className="dashboard-record-label">No upcoming games.</p>
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
            <p className="qual-standings-header"># | Team Name | Record</p>
            <div className="qual-legend">
              <span className="qual-legend-item"><span className="qual-legend-swatch" data-color="realized" /> Realized</span>
              <span className="qual-legend-item"><span className="qual-legend-swatch" data-color="potential" /> Potential</span>
              <span className="qual-legend-item"><span className="qual-legend-swatch" data-color="max" /> Max</span>
            </div>
            {qualification.map((row, i) => {
              const fillWidth = maxScale > 0 ? (row.pts / maxScale) * 100 : 0
              const potentialWidth = maxScale > 0 ? (row.maxPts / maxScale) * 100 : 0
              const tiedGroup = qualification
                .map((r, idx) => ({ r, rank: idx + 1 }))
                .filter((x) => x.r.pts === row.pts)
              const isTied = tiedGroup.length > 1
              const tiedLabel = tiedGroup.map((x) => x.rank).join("/")
              return (
                <div key={row.teamId} className={`qual-standings-row ${row.teamId === "self" ? "playdown-self-row" : ""} ${selectedTeamId === row.teamId ? "qual-standings-row-selected" : ""}`}>
                  <div className="qual-standings-top">
                    <div className="qual-standings-left">
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
                    </div>
                    <div className="qual-standings-right">
                      <span className="qual-standings-record">{row.w}-{row.l}-{row.t}</span>
                      <span className="qual-standings-games">{row.gp}/{row.gp + row.gamesRemaining} games</span>
                    </div>
                  </div>
                  <div className="qual-standings-bottom">
                    <div className="qual-progress-wrap">
                      <div className="qual-progress-track">
                        <div className="qual-progress-potential" style={{ width: `${potentialWidth}%` }} />
                        <div className="qual-progress-fill" data-status={row.status} style={{ width: `${fillWidth}%` }} />
                      </div>
                      <span className="qual-progress-label">{row.pts}/{row.maxPts}/{totalMaxPts} pts</span>
                    </div>
                    <span className="qual-standings-divider" />
                    <span className={`qual-status-badge ${isTied ? "qual-status-badge-tied" : ""}`} data-status={row.status}>
                      {isTied ? tiedLabel : row.status === "locked" ? "IN" : row.status === "out" ? "OUT" : "ALIVE"}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Qualification Number Line */}
          <div className="qual-number-line-wrap">
            <div className="qual-number-line">
              <div className="qual-clinch-zone" style={{ left: `${maxScale > 0 ? (clinchPts / maxScale) * 100 : 0}%`, width: `${maxScale > 0 ? ((maxScale - clinchPts) / maxScale) * 100 : 0}%` }} />
              <div
                className="qual-cutoff-line"
                style={{ left: `${(cutoffPts / maxScale) * 100}%` }}
              />
              <span className="qual-zone-label" data-zone="outside">Out</span>
              <span className="qual-zone-label" data-zone="qualifying">Locked Zone</span>
              {(() => {
                const seen = new Set<number>()
                return qualification.map((row, i) => {
                  if (row.pts === 0 || seen.has(row.pts)) return null
                  const group = qualification
                    .map((r, idx) => ({ r, rank: idx + 1 }))
                    .filter((x) => x.r.pts === row.pts)
                  group.forEach((x) => seen.add(x.r.pts))
                  const label = group.map((x) => x.rank).join("/")
                  const isTied = group.length > 1
                  const tooltipLines = group.map((x) => `${x.r.teamName || teamName(x.r.teamId)}: ${x.r.pts} pts (${x.r.w}-${x.r.l}-${x.r.t})`).join("\n")
                  return (
                    <div key={row.teamId} className="qual-team-dot-wrap" style={{ left: `${maxScale > 0 ? (row.pts / maxScale) * 100 : 0}%` }}>
                      <div className={`qual-team-dot ${isTied ? "qual-team-dot-tied" : ""}`} data-status={row.status}>{label}</div>
                      <div className="qual-team-tooltip">{tooltipLines}</div>
                    </div>
                  )
                })
              })()}
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

      {tab === "simulator" && <MatricivesContent />}
    </div>
  )
}
