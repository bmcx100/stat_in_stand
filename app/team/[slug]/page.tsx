"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Archive } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { useSupabaseTournaments } from "@/hooks/use-supabase-tournaments"
import { useSupabaseMhrRankings } from "@/hooks/use-supabase-mhr-rankings"
import { isPlaydownExpired, isAllTeamsAdvance, computePlaydownStandings, computeQualificationStatus } from "@/lib/playdowns"
import { isTournamentExpired } from "@/lib/tournaments"
import { formatEventDate } from "@/lib/home-cards"
import type { PlaydownConfig, PlaydownStandingsRow, StandingsRow } from "@/lib/types"

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
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

export default function Dashboard() {
  const team = useTeamContext()
  const { games, loading: gamesLoading } = useSupabaseGames(team.id)
  const { standingsMap } = useSupabaseStandings(team.id)
  const standings = standingsMap["regular"]
  const { playdown } = useSupabasePlaydowns(team.id)
  const { tournaments } = useSupabaseTournaments(team.id)
  const { rankings: mhrRankings } = useSupabaseMhrRankings(team.id)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const scheduleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const parent = page.parentElement
    if (!parent) return
    parent.style.overflow = "hidden"
    parent.style.display = "flex"
    parent.style.flexDirection = "column"
    return () => {
      parent.style.overflow = ""
      parent.style.display = ""
      parent.style.flexDirection = ""
    }
  }, [])

  useEffect(() => {
    const el = scheduleRef.current
    if (!el) return

    function check() {
      setCanScrollUp(el!.scrollTop > 2)
      setCanScrollDown(el!.scrollTop + el!.clientHeight < el!.scrollHeight - 2)
    }

    const raf = requestAnimationFrame(check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [gamesLoading])

  if (gamesLoading) {
    return (
      <div className="dashboard-page">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const played = games.filter((g) => g.played)
  const wins = played.filter((g) => g.result === "W").length
  const losses = played.filter((g) => g.result === "L").length
  const ties = played.filter((g) => g.result === "T").length

  const teamRow = standings?.rows.find((r) => {
    const needle = `${team.organization} ${team.name}`.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
    const hay = r.teamName.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
    return hay === needle || hay.includes(needle) || needle.includes(hay)
  })

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = games
    .filter((g) => !g.played && g.date >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const playdownGamesFromTable = games.filter((g) => g.gameType === "playdowns" && g.played)
  const hasPlaydownGames = games.some((g) => g.gameType === "playdowns")
  const playdownAutoAdvance = playdown && isAllTeamsAdvance(playdown.config)
  const showPlaydownCard = playdownAutoAdvance || (playdown && playdown.config.teams.length > 0) || hasPlaydownGames

  const isOwhaMode = playdown && (playdown.config.teamNames?.length ?? 0) > 0
  const playdownHasTeams = playdown && playdown.config.teams.length > 0

  let playdownStandings: PlaydownStandingsRow[] | null = null
  let playdownSyntheticConfig: PlaydownConfig | null = null

  if (isOwhaMode && playdown) {
    const owhaRows = standingsMap["playdowns"]?.rows ?? []
    playdownStandings = owhaStandingsToPlaydownRows(owhaRows, team.organization, team.name)
    const totalTeams = playdown.config.teamNames?.length || playdown.config.totalTeams || owhaRows.length
    const qualifyingSpots = playdown.config.qualifyingSpots || 0
    const gameCountByTeam = new Map<string, number>()
    for (const g of playdown.games) {
      gameCountByTeam.set(g.homeTeam, (gameCountByTeam.get(g.homeTeam) ?? 0) + 1)
      gameCountByTeam.set(g.awayTeam, (gameCountByTeam.get(g.awayTeam) ?? 0) + 1)
    }
    const maxScheduledGames = gameCountByTeam.size > 0 ? Math.max(...gameCountByTeam.values()) : 0
    const gamesPerMatchup = maxScheduledGames > 0 && totalTeams > 1
      ? Math.max(1, Math.round(maxScheduledGames / (totalTeams - 1)))
      : Math.max(1, playdown.config.gamesPerMatchup || 1)
    playdownSyntheticConfig = {
      teamId: team.id, totalTeams, qualifyingSpots, gamesPerMatchup, teams: [],
    }
  } else if (playdownHasTeams && playdown) {
    playdownStandings = computePlaydownStandings(playdown.config, playdown.games)
    playdownSyntheticConfig = playdown.config
  }

  const playdownSelf = playdownStandings?.find((r) => r.teamId === "self") ?? null
  const playdownQualRows = playdownStandings && playdownSyntheticConfig
    ? computeQualificationStatus(playdownStandings, playdownSyntheticConfig)
    : null
  const playdownSelfQual = playdownQualRows?.find((r) => r.teamId === "self") ?? null
  const playdownStatus = playdownSelfQual?.status
    ?? (playdownSelf?.qualifies ? "locked" : null)

  const playdownAllGames = games.filter((g) => g.gameType === "playdowns")
  const playdownLastGame = [...playdownAllGames]
    .filter((g) => g.played)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  const playdownNextGame = [...playdownAllGames]
    .filter((g) => !g.played && g.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  const playdownStatusCounts = playdownQualRows
    ? {
        out: playdownQualRows.filter((r) => r.status === "out").length,
        alive: playdownQualRows.filter((r) => r.status === "alive").length,
        locked: playdownQualRows.filter((r) => r.status === "locked").length,
      }
    : null

  const playdownTableRecord = {
    w: playdownGamesFromTable.filter((g) => g.result === "W").length,
    l: playdownGamesFromTable.filter((g) => g.result === "L").length,
    t: playdownGamesFromTable.filter((g) => g.result === "T").length,
  }

  const hasExpiredTournaments = tournaments.some((t) => isTournamentExpired(t.config))

  function getProvincialRank(name: string): number | null {
    if (!mhrRankings) return null
    const needle = normName(name)
    const entry = mhrRankings.find((r) => {
      const hay = normName(r.name)
      return hay === needle || hay.includes(needle) || needle.includes(hay)
    })
    return entry?.ranking ?? null
  }

  const showPastEvents = (playdown && isPlaydownExpired(playdown.config, playdown.games)) || hasExpiredTournaments

  return (
    <div ref={pageRef} className="dashboard-page dashboard-page-full">
      <Link href={`/team/${team.slug}/events`} className="dashboard-section-heading dashboard-section-link">Events</Link>

      {showPlaydownCard && playdownAutoAdvance && (
        <Link href={`/team/${team.slug}/events`} className="dashboard-event-card">
          <div className="dashboard-event-card-row">
            <div className="dashboard-event-info">
              <p className="dashboard-event-label">Playdowns</p>
              <p className="dashboard-event-meta">All Teams Advance</p>
            </div>
          </div>
        </Link>
      )}
      {showPlaydownCard && !playdownAutoAdvance && (
        <Link href={`/team/${team.slug}/events`} className="dashboard-event-card dashboard-event-card-detail">
          <div className="dashboard-event-card-row">
            <div className="dashboard-event-info">
              <p className="dashboard-event-label">Playdowns</p>
              <p className="dashboard-event-meta">
                {playdown?.config.qualifyingSpots && playdown?.config.totalTeams
                  ? `${playdown.config.qualifyingSpots} of ${playdown.config.totalTeams} Teams`
                  : playdown?.config.totalTeams ? `${playdown.config.totalTeams} Teams` : ""}
                {playdown?.config.totalTeams && playdown?.config.gamesPerMatchup
                  ? ` · ${(playdown.config.totalTeams - 1) * playdown.config.gamesPerMatchup} Games`
                  : ""}
                {playdownStatus
                  ? ` · ${playdownStatus === "locked" ? "Locked" : playdownStatus === "out" ? "Out" : "Alive"}`
                  : ""}
              </p>
            </div>
            <p className="dashboard-event-record">
              {playdownSelf
              ? `${playdownSelf.w}-${playdownSelf.l}-${playdownSelf.t}`
              : `${playdownTableRecord.w}-${playdownTableRecord.l}-${playdownTableRecord.t}`}
            </p>
          </div>
          {playdownLastGame && (
            <p className="team-event-detail-line">
              <span className="team-event-detail-key">Last</span>
              <span className="team-event-detail-val">
                {playdownLastGame.result} {playdownLastGame.teamScore ?? "–"}–{playdownLastGame.opponentScore ?? "–"} vs {playdownLastGame.opponent}{(() => { const r = getProvincialRank(playdownLastGame.opponent); return r ? ` #${r}` : "" })()}
              </span>
            </p>
          )}
          {playdownNextGame && (
            <p className="team-event-detail-line">
              <span className="team-event-detail-key">Next</span>
              <span className="team-event-detail-val">
                {playdownNextGame.opponent}{(() => { const r = getProvincialRank(playdownNextGame.opponent); return r ? ` #${r}` : "" })()} · {formatEventDate(playdownNextGame.date, playdownNextGame.time ?? "")}
              </span>
            </p>
          )}
          {playdownStatusCounts && (
            <div className="qual-status-strip team-event-status-strip">
              <div className="qual-status-segment" data-status="out">
                <span className="qual-status-count">{playdownStatusCounts.out}</span>
                <span className="qual-status-label">OUT</span>
              </div>
              <div className="qual-status-segment" data-status="alive">
                <span className="qual-status-count">{playdownStatusCounts.alive}</span>
                <span className="qual-status-label">ALIVE</span>
              </div>
              <div className="qual-status-segment" data-status="locked">
                <span className="qual-status-count">{playdownStatusCounts.locked}</span>
                <span className="qual-status-label">LOCKED</span>
              </div>
            </div>
          )}
        </Link>
      )}

      {showPastEvents && (
        <div className="dashboard-nav">
          <Link href={`/team/${team.slug}/events`} className="dashboard-nav-link">
            <Archive className="size-4" />
            Past Events
          </Link>
        </div>
      )}

      <Link href={`/team/${team.slug}/schedule`} className="dashboard-section-heading dashboard-section-link">Schedule</Link>
      <div className="dashboard-schedule-wrap">
        <div className={`scroll-fade-top ${canScrollUp ? "scroll-fade-visible" : ""}`} />
        <div className={`scroll-fade-bottom ${canScrollDown ? "scroll-fade-visible" : ""}`} />
        <div
          ref={scheduleRef}
          className="dashboard-schedule-list"
          onScroll={(e) => {
            const el = e.currentTarget
            setCanScrollUp(el.scrollTop > 2)
            setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2)
          }}
        >
          {upcoming.length === 0 ? (
            <p className="dashboard-record-label">No upcoming games</p>
          ) : (
            <div className="dashboard-nav">
              {upcoming.map((game) => {
                const pRank = getProvincialRank(game.opponent)
                return (
                <Link
                  key={game.id}
                  href={`/team/${team.slug}/schedule?game=${game.id}`}
                  className="game-list-item game-list-clickable"
                >
                  <div>
                    <p className="text-sm font-medium">{game.opponent}{pRank && <span className="opponent-rank"> #{pRank}</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      {game.date}{game.time ? ` at ${game.time}` : ""}
                    </p>
                    {game.location && (
                      <p className="text-xs text-muted-foreground">{game.location}</p>
                    )}
                  </div>
                  <span className="game-type-badge">{game.gameType}</span>
                </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Link href={`/team/${team.slug}/results`} className="dashboard-section-heading dashboard-section-link">Results</Link>
      <div className="dashboard-records">
        <Link href={`/team/${team.slug}/results`} className="dashboard-record-card">
          <p className="dashboard-record">{wins}-{losses}-{ties}</p>
          <p className="dashboard-record-label">All Games</p>
        </Link>

        {teamRow && (
          <Link href={`/team/${team.slug}/standings`} className="dashboard-record-card">
            <p className="dashboard-record">{teamRow.w}-{teamRow.l}-{teamRow.t}</p>
            <p className="dashboard-record-label">Regular Season</p>
          </Link>
        )}
      </div>

    </div>
  )
}
