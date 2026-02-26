"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { computePlaydownStandings } from "@/lib/playdowns"
import { formatEventDate } from "@/lib/home-cards"
import type { Game, StandingsRow, PlaydownStandingsRow } from "@/lib/types"

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}

function findOpponentStanding(opponent: string, rows: StandingsRow[]): StandingsRow | null {
  const needle = normName(opponent)
  return rows.find((r) => {
    const hay = normName(r.teamName)
    return hay === needle || hay.includes(needle) || needle.includes(hay)
  }) ?? null
}

function findOpponentPlaydownStanding(opponent: string, rows: PlaydownStandingsRow[]): PlaydownStandingsRow | null {
  const needle = normName(opponent)
  return rows.find((r) => {
    const hay = normName(r.teamName)
    return hay === needle || hay.includes(needle) || needle.includes(hay)
  }) ?? null
}

function getH2H(games: Game[], opponent: string, gameType: string) {
  const matchups = games.filter((g) => g.played && g.opponent === opponent && g.gameType === gameType)
  return {
    w: matchups.filter((g) => g.result === "W").length,
    l: matchups.filter((g) => g.result === "L").length,
    t: matchups.filter((g) => g.result === "T").length,
  }
}

export default function SchedulePage() {
  const team = useTeamContext()
  const { games, loading } = useSupabaseGames(team.id)
  const { standingsMap, loading: standingsLoading } = useSupabaseStandings(team.id)
  const { playdown, loading: playdownLoading } = useSupabasePlaydowns(team.id)
  const searchParams = useSearchParams()
  const [expandedGameId, setExpandedGameId] = useState<string | null>(
    searchParams.get("game")
  )

  if (loading || standingsLoading || playdownLoading) {
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

  const playdownStandings = playdown && playdown.config.teams.length > 0
    ? computePlaydownStandings(playdown.config, playdown.games)
    : null

  // OWHA mode standings for playdowns
  const owhaPlaydownRows = standingsMap["playdowns"]?.rows ?? []
  const isOwhaMode = playdown && (playdown.config.teamNames?.length ?? 0) > 0

  function getOpponentInfo(game: Game) {
    const type = game.gameType
    let standingLine: string | null = null

    if (type === "playdowns") {
      if (isOwhaMode && owhaPlaydownRows.length > 0) {
        const row = findOpponentStanding(game.opponent, owhaPlaydownRows)
        if (row) {
          standingLine = `${row.w}-${row.l}-${row.t} (${row.pts} pts)`
        }
      } else if (playdownStandings) {
        const row = findOpponentPlaydownStanding(game.opponent, playdownStandings)
        if (row) {
          standingLine = `${row.w}-${row.l}-${row.t} (${row.pts} pts)`
        }
      }
    } else if (type === "regular" || type === "playoffs") {
      const rows = standingsMap[type]?.rows ?? []
      const row = findOpponentStanding(game.opponent, rows)
      if (row) {
        standingLine = `${row.w}-${row.l}-${row.t} (${row.pts} pts)`
      }
    }

    const h2h = getH2H(games, game.opponent, type)
    const h2hTotal = h2h.w + h2h.l + h2h.t

    return { standingLine, h2h, h2hTotal }
  }

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
          {upcoming.map((game) => {
            const expanded = expandedGameId === game.id
            const info = expanded ? getOpponentInfo(game) : null

            return (
              <div key={game.id}>
                <button
                  className="game-list-item game-list-clickable"
                  onClick={() => setExpandedGameId(expanded ? null : game.id)}
                >
                  <div>
                    <p className="text-sm font-medium">{game.opponent}</p>
                    {!expanded && (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {game.date}{game.time ? ` at ${game.time}` : ""}
                        </p>
                        {game.location && (
                          <p className="text-xs text-muted-foreground">{game.location}</p>
                        )}
                      </>
                    )}
                  </div>
                  <span className="game-type-badge">{game.gameType}</span>
                </button>
                {expanded && (
                  <div className="schedule-expanded">
                    <p className="schedule-expanded-line">{formatEventDate(game.date, game.time)}</p>
                    {game.location && (
                      <p className="schedule-expanded-line">{game.location}</p>
                    )}
                    {info?.standingLine && (
                      <p className="schedule-expanded-line">Their record: {info.standingLine}</p>
                    )}
                    {info && info.h2hTotal > 0 && (
                      <p className="schedule-expanded-line">vs Us: {info.h2h.w}-{info.h2h.l}-{info.h2h.t}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
