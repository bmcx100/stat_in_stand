"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { DbTeam } from "@/hooks/use-supabase-teams"
import type { AppMode } from "@/app/admin/mode/page"
import type { TournamentConfig, TournamentGame, PlaydownConfig, PlaydownGame } from "@/lib/types"
import {
  detectActiveEvents,
  lookupRanking,
  buildRecordFromGames,
  getH2H,
  getLastGame,
  getNextGame,
  getOpponentStanding,
  getStandingsPosition,
  getPlaydownContext,
  type GameRow,
  type StandingsJsonRow,
} from "@/lib/home-cards"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActiveEvent = {
  gameType: string
  label: string
  collapsedSummary: string
  lastGame: GameRow | null
  nextGame: GameRow | null
  opponentStanding: { position: number; total: number; record: string } | null
  h2h: { w: number; l: number; t: number }
  detailPath: string
}

export type HomeCardData = {
  ranking: number | null
  rankingUrl: string | null
  rankingLabel: string | null
  activeEvents: ActiveEvent[]
  fallbackMode: AppMode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function windowBounds(days = 7): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - days)
  const to = new Date(now)
  to.setDate(to.getDate() + days)
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useHomeCardData(teams: DbTeam[]): Map<string, HomeCardData> {
  const [data, setData] = useState<Map<string, HomeCardData>>(new Map())
  const supabase = createClient()

  useEffect(() => {
    if (teams.length === 0) return

    const teamIds = teams.map((t) => t.id)
    const { from, to } = windowBounds(7)

    async function load() {
      const [
        { data: windowGames },
        { data: allStandings },
        { data: mhrConfigs },
        { data: mhrRankings },
        { data: tournamentsRows },
        { data: playdownsRows },
        appSettingsRes,
      ] = await Promise.all([
        supabase
          .from("games")
          .select("id, team_id, date, time, opponent_name, result, team_score, opponent_score, game_type, played")
          .in("team_id", teamIds)
          .in("game_type", ["regular", "playoffs", "playdowns", "tournament"])
          .gte("date", from)
          .lte("date", to),
        supabase
          .from("standings")
          .select("team_id, standings_type, rows")
          .in("team_id", teamIds),
        supabase
          .from("mhr_config")
          .select("team_id, team_nbr, div_nbr, div_age")
          .in("team_id", teamIds),
        supabase
          .from("mhr_rankings")
          .select("team_id, rows, synced_at")
          .in("team_id", teamIds)
          .order("synced_at", { ascending: false }),
        supabase
          .from("tournaments")
          .select("team_id, tournament_id, config, games")
          .in("team_id", teamIds),
        supabase
          .from("playdowns")
          .select("team_id, config, games")
          .in("team_id", teamIds),
        fetch("/api/app-settings").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ])

      const fallbackMode: AppMode =
        (appSettingsRes?.app_mode as AppMode | undefined) ?? "playdowns"

      // Keep only the most recent mhr_rankings row per team
      const latestRankingByTeam = new Map<string, { rows: Array<{ team_nbr: number; ranking: number }>; synced_at: string }>()
      for (const row of mhrRankings ?? []) {
        if (!latestRankingByTeam.has(row.team_id)) {
          latestRankingByTeam.set(row.team_id, { rows: row.rows as Array<{ team_nbr: number; ranking: number }>, synced_at: row.synced_at })
        }
      }

      const games = (windowGames ?? []) as GameRow[]
      const result = new Map<string, HomeCardData>()

      for (const team of teams) {
        const mhrConfig = mhrConfigs?.find((m) => m.team_id === team.id)
        const rankingRows = latestRankingByTeam.get(team.id)?.rows ?? []
        const ranking = lookupRanking(mhrConfig?.team_nbr ?? null, rankingRows)

        // Rankings URL + label
        let rankingUrl: string | null = null
        let rankingLabel: string | null = null
        if (mhrConfig?.div_nbr && mhrConfig?.div_age) {
          const year = new Date().getFullYear()
          rankingUrl = `https://myhockeyrankings.com/rank?y=${year}&a=${mhrConfig.div_age}&v=${mhrConfig.div_nbr}`
          rankingLabel = `#${ranking} in Ontario — ${team.age_group.toUpperCase()} ${team.level.toUpperCase()}`
        }

        // Active event types for this team
        const activeTypes = detectActiveEvents(games, team.id, 7)

        // Standings lookup helpers
        const standingsByType = new Map<string, StandingsJsonRow[]>()
        for (const s of allStandings ?? []) {
          if (s.team_id === team.id) {
            standingsByType.set(s.standings_type, s.rows as StandingsJsonRow[])
          }
        }

        // Playdown data
        const playdownRow = playdownsRows?.find((p) => p.team_id === team.id)

        // Active tournaments (by date overlap with window)
        const teamTournaments = (tournamentsRows ?? []).filter((t) => t.team_id === team.id)
        const activeTournaments = teamTournaments.filter((t) => {
          const cfg = t.config as TournamentConfig
          return cfg.startDate <= to && cfg.endDate >= from
        })

        // Build event rows
        const activeEvents: ActiveEvent[] = []

        // ── Tournament rows (one per active tournament) ──────────────────────
        for (const tRow of activeTournaments) {
          const cfg = tRow.config as TournamentConfig
          const tGames = (tRow.games as TournamentGame[]) ?? []
          const label = cfg.name || "Tournament"

          // Pool record from tournament games JSONB
          const poolGames = tGames.filter((g) => g.played && g.round === "pool")
          const tW = poolGames.filter((g) => {
            if (g.homeScore == null || g.awayScore == null) return false
            const homeWin = g.homeTeam === team.id && g.homeScore > g.awayScore
            const awayWin = g.awayTeam === team.id && g.awayScore > g.homeScore
            return homeWin || awayWin
          }).length
          const tL = poolGames.filter((g) => {
            if (g.homeScore == null || g.awayScore == null) return false
            const homeLoss = g.homeTeam === team.id && g.homeScore < g.awayScore
            const awayLoss = g.awayTeam === team.id && g.awayScore < g.homeScore
            return homeLoss || awayLoss
          }).length

          // Find which pool our team is in
          let poolName: string | null = null
          for (const pool of cfg.pools ?? []) {
            if (pool.teamIds?.some((tid) => tid === team.id)) {
              poolName = pool.name
              break
            }
          }
          const poolPart = poolName ? `${poolName} · ` : ""
          const collapsedSummary = `${poolPart}${tW}-${tL}`

          // Next game from tournament JSONB
          const todayStr = new Date().toISOString().split("T")[0]
          const nextTGame = [...tGames]
            .filter((g) => !g.played && g.date >= todayStr)
            .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null

          // Last game from tournament JSONB
          const lastTGame = [...tGames]
            .filter((g) => g.played)
            .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null

          // Convert to GameRow shape for lastGame/nextGame display
          const toGameRow = (tg: TournamentGame | null, isPlayed: boolean): GameRow | null => {
            if (!tg) return null
            const oppTeam = cfg.teams?.find((t) =>
              (isPlayed ? (tg.homeTeam === team.id ? tg.awayTeam : tg.homeTeam) : (tg.homeTeam === team.id ? tg.awayTeam : tg.homeTeam)) === t.id
            )
            return {
              id: tg.id,
              team_id: team.id,
              date: tg.date,
              time: tg.time ?? "",
              opponent_name: oppTeam?.name ?? "Opponent",
              result: null,
              team_score: null,
              opponent_score: null,
              game_type: "tournament",
              played: isPlayed,
            }
          }

          activeEvents.push({
            gameType: "tournament",
            label,
            collapsedSummary,
            lastGame: toGameRow(lastTGame, true),
            nextGame: toGameRow(nextTGame, false),
            opponentStanding: null,
            h2h: { w: 0, l: 0, t: 0 },
            detailPath: `/team/${team.slug}/events`,
          })
        }

        // ── Playoffs ──────────────────────────────────────────────────────────
        if (activeTypes.has("playoffs")) {
          const record = buildRecordFromGames(games, team.id, "playoffs")
          const standingRows = standingsByType.get("playoffs") ?? []
          const pos = getStandingsPosition(team.organization, team.name, standingRows)
          const posPart = pos ? ` · ${pos.position}${ordinal(pos.position)} of ${pos.total}` : ""
          const collapsedSummary = `${record.w}-${record.l}${posPart}`

          const lastGame = getLastGame(games, team.id, "playoffs")
          const nextGame = getNextGame(games, team.id, "playoffs")
          const opp = nextGame?.opponent_name
          const oppStanding = opp ? getOpponentStanding(opp, standingRows) : null
          const h2h = opp ? getH2H(games, team.id, "playoffs", opp) : { w: 0, l: 0, t: 0 }

          activeEvents.push({
            gameType: "playoffs",
            label: "Playoffs",
            collapsedSummary,
            lastGame,
            nextGame,
            opponentStanding: oppStanding,
            h2h,
            detailPath: `/team/${team.slug}/standings`,
          })
        }

        // ── Playdowns ─────────────────────────────────────────────────────────
        if (activeTypes.has("playdowns")) {
          const record = buildRecordFromGames(games, team.id, "playdowns")
          let collapsedSummary = `${record.w}-${record.l}`

          let playdownContext = null
          if (playdownRow) {
            const cfg = playdownRow.config as PlaydownConfig
            const pgames = playdownRow.games as PlaydownGame[]
            playdownContext = getPlaydownContext(team.organization, team.name, cfg, pgames)
            if (playdownContext) {
              const statusLabel =
                playdownContext.status === "locked" ? "Locked" :
                playdownContext.status === "out" ? "Out" : "Alive"
              collapsedSummary = `${statusLabel} · ${record.w}-${record.l} · ${playdownContext.position}${ordinal(playdownContext.position)} of ${playdownContext.total}`
            }
          }

          const lastGame = getLastGame(games, team.id, "playdowns")
          const nextGame = getNextGame(games, team.id, "playdowns")
          const opp = nextGame?.opponent_name
          const h2h = opp ? getH2H(games, team.id, "playdowns", opp) : { w: 0, l: 0, t: 0 }

          activeEvents.push({
            gameType: "playdowns",
            label: "Playdowns",
            collapsedSummary,
            lastGame,
            nextGame,
            opponentStanding: null,
            h2h,
            detailPath: `/team/${team.slug}/playdowns`,
          })
        }

        // ── Regular season ────────────────────────────────────────────────────
        if (activeTypes.has("regular")) {
          const record = buildRecordFromGames(games, team.id, "regular")
          const standingRows = standingsByType.get("regular") ?? []
          const pos = getStandingsPosition(team.organization, team.name, standingRows)
          const posPart = pos ? ` · ${pos.position}${ordinal(pos.position)} of ${pos.total}` : ""
          const collapsedSummary = `${record.w}-${record.l}-${record.t}${posPart}`

          const lastGame = getLastGame(games, team.id, "regular")
          const nextGame = getNextGame(games, team.id, "regular")
          const opp = nextGame?.opponent_name
          const oppStanding = opp ? getOpponentStanding(opp, standingRows) : null
          const h2h = opp ? getH2H(games, team.id, "regular", opp) : { w: 0, l: 0, t: 0 }

          activeEvents.push({
            gameType: "regular",
            label: "Regular",
            collapsedSummary,
            lastGame,
            nextGame,
            opponentStanding: oppStanding,
            h2h,
            detailPath: `/team/${team.slug}/standings`,
          })
        }

        result.set(team.id, {
          ranking,
          rankingUrl,
          rankingLabel,
          activeEvents,
          fallbackMode,
        })
      }

      setData(result)
    }

    load()
  }, [teams.map((t) => t.id).join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  return data
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
