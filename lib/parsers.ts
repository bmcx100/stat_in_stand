import type { Game, Opponent, StandingsRow, GameType } from "./types"
import { parseMonth, inferYear } from "./season"

/**
 * Normalize any date string to ISO format (YYYY-MM-DD).
 * Handles formats like "Sun, Feb. 08, 2026", "Feb 8 2026", "2026-02-08", etc.
 */
export function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim()

  const parsed = new Date(raw)
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, "0")
    const d = String(parsed.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  return raw.trim()
}

export function generateGameId(
  teamId: string,
  date: string,
  opponent: string
): string {
  const normalized = `${teamId}-${date}-${opponent.toLowerCase().replace(/\s+/g, "-")}`
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0
  }
  return `g-${Math.abs(hash).toString(36)}`
}

function generateOpponentId(fullName: string, owhaId?: string): string {
  const base = owhaId ? `${fullName}-${owhaId}` : fullName
  const normalized = base.toLowerCase().replace(/\s+/g, "-")
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0
  }
  return `opp-${Math.abs(hash).toString(36)}`
}

/**
 * Parse OWHA team list from pasted text.
 * Format: one team per line, "Team Name #ID"
 * e.g. "Ancaster Avalanche #5045"
 */
export function parseOwhaTeamList(
  text: string,
  ageGroup: string,
  level: string
): Opponent[] {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean)
  const opponents: Opponent[] = []

  for (const line of lines) {
    const match = line.match(/^(.+?)\s*#(\d+)\s*$/)
    if (!match) continue

    const fullName = match[1].trim()
    const owhaId = match[2]

    opponents.push({
      id: generateOpponentId(fullName, owhaId),
      fullName,
      location: "",
      name: "",
      ageGroup,
      level,
      owhaId,
    })
  }

  return opponents
}

/**
 * Match an MHR opponent name against the opponent registry.
 * Returns all opponents whose fullName matches (contains or is contained by).
 */
export function matchOpponent(
  mhrName: string,
  registry: Opponent[]
): Opponent[] {
  const needle = mhrName.toLowerCase().replace(/\s+/g, "")
  return registry.filter((opp) => {
    const hay = opp.fullName.toLowerCase().replace(/\s+/g, "")
    return hay === needle || hay.includes(needle) || needle.includes(hay)
  })
}

/**
 * Parse OWHA standings from pasted text.
 */
export function parseOwhaStandings(text: string): StandingsRow[] {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean)
  const rows: StandingsRow[] = []

  for (const line of lines) {
    const parts = line.split(/\t+|\s{2,}/).map((p) => p.trim()).filter(Boolean)
    if (parts.length < 10) continue
    const gpIdx = parts.findIndex((p) => /^\d+$/.test(p))
    if (gpIdx < 1) continue

    const teamPart = parts.slice(0, gpIdx).join(" ")
    const nums = parts.slice(gpIdx)

    const idMatch = teamPart.match(/#(\d+)/)
    const owhaId = idMatch ? idMatch[1] : ""
    const teamName = teamPart.replace(/#\d+/, "").trim()

    if (nums.length < 12) continue

    rows.push({
      teamName,
      owhaId,
      gp: parseInt(nums[0], 10) || 0,
      w: parseInt(nums[1], 10) || 0,
      l: parseInt(nums[2], 10) || 0,
      t: parseInt(nums[3], 10) || 0,
      otl: parseInt(nums[4], 10) || 0,
      sol: parseInt(nums[5], 10) || 0,
      pts: parseInt(nums[6], 10) || 0,
      gf: parseInt(nums[7], 10) || 0,
      ga: parseInt(nums[8], 10) || 0,
      diff: parseInt(nums[9], 10) || 0,
      pim: parseInt(nums[10], 10) || 0,
      winPct: parseFloat(nums[11]) || 0,
    })
  }

  return rows
}

/**
 * Parse OWHA games from pasted text.
 */
export function parseOwhaGames(
  text: string,
  teamId: string,
  owhaTeamName: string,
  gameType: GameType = "regular"
): Game[] {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean)
  const games: Game[] = []
  const needle = owhaTeamName.toLowerCase().trim()

  for (const line of lines) {
    const parts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean)
    if (parts.length < 5) continue

    const gameNumMatch = parts[0].match(/^(\d+)$/)
    if (!gameNumMatch) continue

    const sourceGameId = gameNumMatch[1]
    let dateStr = ""
    let timeStr = ""
    let location = ""
    let homeRaw = ""
    let visitorRaw = ""

    if (parts.length >= 6) {
      dateStr = parts[1]
      timeStr = parts[2]
      location = parts[3]
      homeRaw = parts[4]
      visitorRaw = parts[5]
    } else if (parts.length === 5) {
      dateStr = parts[1]
      location = parts[2]
      homeRaw = parts[3]
      visitorRaw = parts[4]
    }

    const parseTeamScore = (raw: string) => {
      const scoreMatch = raw.match(/\((\d+)\)\s*$/)
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null
      const name = raw.replace(/\(\d+\)\s*$/, "").trim()
      const idMatch = name.match(/#(\d+)/)
      return { name: name.replace(/#\d+/, "").trim(), id: idMatch?.[1] ?? "", score }
    }

    const home = parseTeamScore(homeRaw)
    const visitor = parseTeamScore(visitorRaw)

    const isHome = home.name.toLowerCase().includes(needle) ||
      home.id === needle
    const isVisitor = visitor.name.toLowerCase().includes(needle) ||
      visitor.id === needle

    if (!isHome && !isVisitor) continue

    const played = home.score !== null && visitor.score !== null
    const opponent = isHome ? (visitor.name || visitorRaw) : (home.name || homeRaw)
    const teamScore = isHome ? home.score : visitor.score
    const opponentScore = isHome ? visitor.score : home.score

    let result: "W" | "L" | "T" | null = null
    if (played && teamScore !== null && opponentScore !== null) {
      if (teamScore > opponentScore) result = "W"
      else if (teamScore < opponentScore) result = "L"
      else result = "T"
    }

    const isoDate = normalizeDate(dateStr)
    const id = generateGameId(teamId, isoDate, opponent)

    games.push({
      id,
      teamId,
      date: isoDate,
      time: timeStr,
      opponent,
      location,
      teamScore,
      opponentScore,
      result,
      gameType,
      source: "owha",
      sourceGameId,
      played,
    })
  }

  return games
}

/**
 * Parse MHR (My Hockey Rankings) game data from pasted text.
 * Data comes as multi-line blocks (one field per line).
 */
export function parseMhrGames(
  text: string,
  teamId: string,
  gameType: GameType = "regular"
): Game[] {
  const lines = text.trim().split("\n").map((l) => l.trim())
  const games: Game[] = []

  const datePattern = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})$/i
  const timePattern = /^\d{1,2}:\d{2}\s*(am|pm)?$/i
  const resultPattern = /^[WLT]$/i
  const scorePattern = /^(\d+)\s*-\s*(\d+)$/

  let i = 0
  while (i < lines.length) {
    const dateMatch = lines[i].match(datePattern)
    if (!dateMatch) {
      i++
      continue
    }

    const monthStr = dateMatch[1]
    const day = parseInt(dateMatch[2], 10)
    const month = parseMonth(monthStr)
    const year = inferYear(month)
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    i++

    const block: string[] = []
    while (i < lines.length && !lines[i].match(datePattern)) {
      if (lines[i] !== "") block.push(lines[i])
      i++
    }

    let timeStr = ""
    let opponent = ""
    let location = ""
    let result: "W" | "L" | "T" | null = null
    let teamScore: number | null = null
    let opponentScore: number | null = null

    for (const line of block) {
      if (timePattern.test(line) && !timeStr) {
        timeStr = line
      } else if (resultPattern.test(line) && result === null) {
        result = line.toUpperCase() as "W" | "L" | "T"
      } else if (scorePattern.test(line)) {
        const m = line.match(scorePattern)!
        teamScore = parseInt(m[1], 10)
        opponentScore = parseInt(m[2], 10)
      } else if (/^(Watch\s+)?at\s+/i.test(line)) {
        location = line.replace(/^(Watch\s+)?at\s+/i, "").trim()
      } else if (line === "Add Rink") {
        // No location — skip
      } else if (!opponent && line.length > 2) {
        opponent = line.replace(/\*+$/, "").trim()
      }
    }

    if (!opponent) continue

    const played = result !== null || (teamScore !== null && opponentScore !== null)

    if (!result && teamScore !== null && opponentScore !== null) {
      if (teamScore > opponentScore) result = "W"
      else if (teamScore < opponentScore) result = "L"
      else result = "T"
    }

    const id = generateGameId(teamId, dateStr, opponent)

    games.push({
      id,
      teamId,
      date: dateStr,
      time: timeStr,
      opponent,
      location,
      teamScore,
      opponentScore,
      result,
      gameType,
      source: "mhr",
      sourceGameId: "",
      played,
    })
  }

  return games
}

export type DuplicateInfo = {
  index: number
  existingGame: Game
  scoreMismatch: boolean
}

function normalizeOpponent(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "")
}

function opponentsMatch(a: string, b: string): boolean {
  const na = normalizeOpponent(a)
  const nb = normalizeOpponent(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

/**
 * Find duplicate games by matching date + opponent name.
 */
export function findDuplicates(
  existing: Game[],
  incoming: Game[]
): DuplicateInfo[] {
  const existingByDate = new Map<string, Game[]>()
  for (const g of existing) {
    const nd = normalizeDate(g.date)
    const list = existingByDate.get(nd) ?? []
    list.push(g)
    existingByDate.set(nd, list)
  }

  const dupes: DuplicateInfo[] = []
  incoming.forEach((g, i) => {
    const sameDateGames = existingByDate.get(normalizeDate(g.date)) ?? []
    const match = sameDateGames.find((e) => opponentsMatch(e.opponent, g.opponent))
    if (match) {
      const scoreMismatch = match.played && g.played &&
        (match.teamScore !== g.teamScore || match.opponentScore !== g.opponentScore)
      dupes.push({ index: i, existingGame: match, scoreMismatch: !!scoreMismatch })
    }
  })

  return dupes
}
