import type { PlaydownConfig, PlaydownGame, QualificationStatus } from "./types"
import { computePlaydownStandings, computeQualificationStatus } from "./playdowns"

// ── Types ─────────────────────────────────────────────────────────────────────

export type GameRow = {
  id: string
  team_id: string
  date: string        // "YYYY-MM-DD"
  time: string
  opponent_name: string
  result: "W" | "L" | "T" | null
  team_score: number | null
  opponent_score: number | null
  game_type: string
  played: boolean
}

export type StandingsJsonRow = {
  teamName: string
  w: number
  l: number
  t: number
  gp: number
  pts?: number
  gf?: number
  ga?: number
  otl?: number
}

export type Record3 = { w: number; l: number; t: number }
export type Record4 = Record3 & { gp: number }

export const ACTIVE_GAME_TYPES = new Set(["regular", "playoffs", "playdowns", "tournament"])

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}

function nameMatches(a: string, b: string): boolean {
  const na = norm(a)
  const nb = norm(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

// ── Event detection ───────────────────────────────────────────────────────────

/**
 * Returns the set of game types with at least one game within ±windowDays of today.
 */
export function detectActiveEvents(
  games: GameRow[],
  teamId: string,
  windowDays = 7
): Set<string> {
  const now = new Date()
  const pastCutoff = new Date(now)
  pastCutoff.setDate(pastCutoff.getDate() - windowDays)
  const futureCutoff = new Date(now)
  futureCutoff.setDate(futureCutoff.getDate() + windowDays)

  const active = new Set<string>()
  for (const g of games) {
    if (g.team_id !== teamId) continue
    if (!ACTIVE_GAME_TYPES.has(g.game_type)) continue
    const d = new Date(g.date + "T00:00:00")
    if (d >= pastCutoff && d <= futureCutoff) {
      active.add(g.game_type)
    }
  }
  return active
}

// ── Rankings ──────────────────────────────────────────────────────────────────

/**
 * Finds a team's ranking from the MHR rankings rows array.
 */
export function lookupRanking(
  teamNbr: number | null | undefined,
  rankRows: Array<{ team_nbr: number; ranking: number }>
): number | null {
  if (teamNbr == null) return null
  return rankRows.find((r) => r.team_nbr === teamNbr)?.ranking ?? null
}

// ── Games ─────────────────────────────────────────────────────────────────────

/**
 * Counts W/L/T/GP for played games of a specific type for a team.
 */
export function buildRecordFromGames(
  games: GameRow[],
  teamId: string,
  gameType: string
): Record4 {
  const filtered = games.filter(
    (g) => g.team_id === teamId && g.game_type === gameType && g.played
  )
  return {
    w: filtered.filter((g) => g.result === "W").length,
    l: filtered.filter((g) => g.result === "L").length,
    t: filtered.filter((g) => g.result === "T").length,
    gp: filtered.length,
  }
}

/**
 * Head-to-head record against a specific opponent (by fuzzy name match).
 */
export function getH2H(
  games: GameRow[],
  teamId: string,
  gameType: string,
  opponentName: string
): Record3 {
  const filtered = games.filter((g) => {
    if (g.team_id !== teamId || g.game_type !== gameType || !g.played) return false
    return nameMatches(g.opponent_name, opponentName)
  })
  return {
    w: filtered.filter((g) => g.result === "W").length,
    l: filtered.filter((g) => g.result === "L").length,
    t: filtered.filter((g) => g.result === "T").length,
  }
}

/**
 * Most recently played game of a given type for a team.
 */
export function getLastGame(
  games: GameRow[],
  teamId: string,
  gameType: string
): GameRow | null {
  const played = games.filter(
    (g) => g.team_id === teamId && g.game_type === gameType && g.played
  )
  if (played.length === 0) return null
  return [...played].sort((a, b) => b.date.localeCompare(a.date))[0]
}

/**
 * Next upcoming (unplayed) game of a given type for a team.
 */
export function getNextGame(
  games: GameRow[],
  teamId: string,
  gameType: string
): GameRow | null {
  const today = new Date().toISOString().split("T")[0]
  const upcoming = games.filter(
    (g) => g.team_id === teamId && g.game_type === gameType && !g.played && g.date >= today
  )
  if (upcoming.length === 0) return null
  return [...upcoming].sort((a, b) => a.date.localeCompare(b.date))[0]
}

/**
 * Formats a game date + time into a readable string: "Sat Mar 1 · 7:00pm"
 */
export function formatEventDate(date: string, time: string): string {
  const d = new Date(date + "T00:00:00")
  const dayStr = d.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  if (!time || time.trim() === "") return dayStr
  return `${dayStr} · ${time}`
}

// ── Standings ─────────────────────────────────────────────────────────────────

/**
 * Finds our team's position in a standings rows array (1-indexed).
 */
export function getStandingsPosition(
  teamOrg: string,
  teamName: string,
  rows: StandingsJsonRow[]
): { position: number; total: number } | null {
  const needle = norm(`${teamOrg} ${teamName}`)
  const idx = rows.findIndex((r) => nameMatches(r.teamName, needle))
  if (idx === -1) return null
  return { position: idx + 1, total: rows.length }
}

/**
 * Finds an opponent's position + record in a standings rows array.
 */
export function getOpponentStanding(
  opponentName: string,
  rows: StandingsJsonRow[]
): { position: number; total: number; record: string } | null {
  const idx = rows.findIndex((r) => nameMatches(r.teamName, opponentName))
  if (idx === -1) return null
  const row = rows[idx]
  return {
    position: idx + 1,
    total: rows.length,
    record: `${row.w}-${row.l}-${row.t}`,
  }
}

// ── Playdowns ─────────────────────────────────────────────────────────────────

export type PlaydownContext = {
  position: number
  total: number
  record: Record3
  status: QualificationStatus
}

/**
 * Derives a team's playdown context (position, record, qualification status)
 * from the stored playdown config and games.
 */
export function getPlaydownContext(
  teamOrg: string,
  teamName: string,
  config: PlaydownConfig,
  games: PlaydownGame[]
): PlaydownContext | null {
  if (!config.teams || config.teams.length === 0) return null

  const standings = computePlaydownStandings(config, games)
  const qualification = computeQualificationStatus(standings, config)

  const needle = norm(`${teamOrg} ${teamName}`)
  const idx = qualification.findIndex((r) => nameMatches(r.teamName, needle))
  if (idx === -1) return null

  const row = qualification[idx]
  return {
    position: idx + 1,
    total: qualification.length,
    record: { w: row.w, l: row.l, t: row.t },
    status: row.status,
  }
}
