import type { Game, Opponent, StandingsRow, GameType, PlaydownGame } from "./types"
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
 * Parse My Hockey Rankings team list from pasted text.
 * Rows contain rank, blank lines, team name (with province suffix), and stats.
 * Only the team name lines are extracted.
 * e.g. "London Devilettes U13 A (ON)"
 */
export function parseMhrTeamList(
  text: string,
  ageGroup: string,
  level: string
): Opponent[] {
  const lines = text.split("\n").map((l) => l.trim())
  const opponents: Opponent[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (!line) continue
    // Skip header row
    if (/^Rank/i.test(line)) continue
    // Skip rank lines (just a number, possibly with tabs)
    if (/^\d+\s*$/.test(line)) continue
    // Skip stats lines (start with a W-L-T record)
    if (/^\d+-\d+-\d+/.test(line)) continue
    // Skip lines that are purely numeric/decimal/whitespace
    if (/^[\d.\s\t]+$/.test(line)) continue
    // Must contain at least 2 words of letters to be a team name
    if (!/[A-Za-z].*[A-Za-z]/.test(line)) continue

    // Strip province suffix e.g. " (ON)"
    // Strip age/level suffix e.g. " U13 A", " U11 BB"
    const fullName = line
      .replace(/\s*\([A-Z]{2,3}\)\s*$/, "")
      .replace(/\s+(U\d+|Atom|Novice|Tyke|Peewee|Bantam|Midget)\b.*/i, "")
      .trim()
    if (!fullName || seen.has(fullName.toLowerCase())) continue
    seen.add(fullName.toLowerCase())

    opponents.push({
      id: generateOpponentId(fullName),
      fullName,
      location: "",
      name: "",
      ageGroup,
      level,
      owhaId: undefined,
    })
  }

  return opponents
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
  // Strip "Curfew in effect" prefix then merge continuation lines
  // (lines not starting with a game number) into the preceding game line
  const rawLines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean)
  const mergedLines: string[] = []
  for (const line of rawLines) {
    const cleaned = line.replace(/^Curfew in effect\t?/i, "").trim()
    if (!cleaned) continue
    if (/^\d+\t/.test(cleaned) || /^\d{5,}/.test(cleaned)) {
      mergedLines.push(cleaned)
    } else if (mergedLines.length > 0) {
      mergedLines[mergedLines.length - 1] += "\t" + cleaned
    }
  }
  const lines = mergedLines
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
  scoreUpdate: boolean
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
      const scoreUpdate = !match.played && g.played
      dupes.push({ index: i, existingGame: match, scoreMismatch: !!scoreMismatch, scoreUpdate })
    }
  })

  return dupes
}

/**
 * Map a TeamSnap game type prefix to our GameType.
 */
function mapTeamsnapGameType(prefix: string): GameType {
  const lower = prefix.toLowerCase().replace(/[-\s]/g, "")
  if (lower.includes("playdown")) return "playdowns"
  if (lower.includes("playoff")) return "playoffs"
  if (lower.includes("semifinal")) return "playoffs"
  if (lower.includes("final")) return "playoffs"
  if (lower.includes("regular")) return "regular"
  if (lower.includes("tournament")) return "tournament"
  if (lower.includes("exhibition")) return "exhibition"
  if (lower.includes("provincial")) return "provincials"
  return "unlabeled"
}

/**
 * Parse TeamSnap game data from pasted text.
 * Tab-separated: Date | Start | End | Arrival | Description | Venue | Address | Score?
 * Address may be multi-line in quotes. Score format: "W 4-0", "L 0-1", "T 2-2".
 * Games always contain "at " or "vs." in the description.
 * Non-game entries (Practice, Fitness Lab, etc.) are filtered out.
 */
export function parseTeamsnapGames(
  text: string,
  teamId: string
): Game[] {
  // Join multi-line quoted addresses into single lines
  const normalized = text.replace(/"([^]*?)"/g, (_, inner) =>
    inner.replace(/\n/g, ", ").replace(/\s{2,}/g, " ").trim()
  )

  const lines = normalized.trim().split("\n").map((l) => l.trim()).filter(Boolean)
  const games: Game[] = []

  // Matches: optional prefix + "at" or "vs."/"vs" + opponent
  // e.g. "at Kanata Rangers", "vs. Cornwall Typhoons",
  //      "Semi-finals vs. Whitby Wolves", "Exhibition vs. M13AAA Olympiques"
  const descPattern = /^(?:(.*?)\s+)?(at|vs\.?)\s+(.+)$/i
  const scorePattern = /^([WLT])\s+(\d+)-(\d+)$/i

  for (const line of lines) {
    const parts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean)
    if (parts.length < 5) continue

    const dateRaw = parts[0]
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateRaw)) continue

    const startTime = parts[1]
    const description = parts[4]
    const venue = parts.length >= 6 ? parts[5] : ""

    const descMatch = description.match(descPattern)
    if (!descMatch) continue

    const prefix = descMatch[1] ?? ""
    const gameType = prefix ? mapTeamsnapGameType(prefix) : "unlabeled"
    const opponent = descMatch[3].trim()

    // Check last part for score
    let teamScore: number | null = null
    let opponentScore: number | null = null
    let result: "W" | "L" | "T" | null = null
    let played = false

    const lastPart = parts[parts.length - 1]
    const scoreMatch = lastPart.match(scorePattern)
    if (scoreMatch) {
      result = scoreMatch[1].toUpperCase() as "W" | "L" | "T"
      const s1 = parseInt(scoreMatch[2], 10)
      const s2 = parseInt(scoreMatch[3], 10)
      // Score is always team-opponent from TeamSnap perspective
      teamScore = s1
      opponentScore = s2
      played = true
    }

    const isoDate = normalizeDate(dateRaw)
    const id = generateGameId(teamId, isoDate, opponent)

    games.push({
      id,
      teamId,
      date: isoDate,
      time: startTime,
      opponent,
      location: venue,
      teamScore,
      opponentScore,
      result,
      gameType,
      source: "teamsnap",
      sourceGameId: "",
      played,
    })
  }

  return games
}

/**
 * Parse OWHA playdown game data into PlaydownGame[].
 * Format: GameID \t DateTime \t Location \t Home#ID(score) \t Away#ID(score)
 * DateTime combines date + time in one field (e.g. "Wed, Feb. 18, 2026 7:45 PM").
 * Some rows wrap to a second line (e.g. "No Curfew") — these get joined back.
 */
export function parsePlaydownGames(
  text: string,
  teamId: string
): { games: PlaydownGame[]; teamNames: string[] } {
  // Pre-process: join continuation lines (lines not starting with a game number)
  const rawLines = text.trim().split("\n")
  const joined: string[] = []
  for (const line of rawLines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^\d+\t/.test(trimmed) || /^\d{4,}/.test(trimmed)) {
      joined.push(trimmed)
    } else if (joined.length > 0) {
      joined[joined.length - 1] += "\t" + trimmed
    }
  }

  const games: PlaydownGame[] = []
  const teamNamesSet = new Set<string>()

  for (const line of joined) {
    const parts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean)
    // Filter out noise like "No Curfew"
    const filtered = parts.filter((p) => !/^no curfew$/i.test(p))
    if (filtered.length < 4) continue

    const gameNumMatch = filtered[0].match(/^(\d+)$/)
    if (!gameNumMatch) continue

    // Home and away are always the last two fields — safe regardless of how
    // many columns precede them (location blank, date/time split, extra cols, etc.)
    const homeRaw = filtered[filtered.length - 2] ?? ""
    const visitorRaw = filtered[filtered.length - 1] ?? ""

    // DateTime: check if filtered[2] looks like a standalone time (separate column)
    let dateTimeRaw = filtered[1]
    if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(filtered[2] ?? "")) {
      dateTimeRaw = filtered[1] + " " + filtered[2]
    }
    const timeMatch = dateTimeRaw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i)
    let timeStr = ""
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10)
      const minutes = timeMatch[2]
      const ampm = timeMatch[3].toUpperCase()
      if (ampm === "PM" && hours !== 12) hours += 12
      if (ampm === "AM" && hours === 12) hours = 0
      timeStr = `${String(hours).padStart(2, "0")}:${minutes}`
    }
    const dateStr = timeMatch
      ? dateTimeRaw.slice(0, timeMatch.index).trim()
      : dateTimeRaw

    // Location is everything between the datetime block and the last two (home/away) fields
    const dateEnd = /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(filtered[2] ?? "") ? 3 : 2
    const location = filtered.slice(dateEnd, filtered.length - 2).join(" ")

    const parseTeamScore = (raw: string) => {
      const scoreMatch = raw.match(/\((\d+)\)\s*$/)
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null
      const name = raw.replace(/\(\d+\)\s*$/, "").replace(/#\d+/, "").trim()
      return { name, score }
    }

    const home = parseTeamScore(homeRaw)
    const visitor = parseTeamScore(visitorRaw)

    if (home.name) teamNamesSet.add(home.name)
    if (visitor.name) teamNamesSet.add(visitor.name)

    const played = home.score !== null && visitor.score !== null
    const isoDate = normalizeDate(dateStr)
    const id = `pd-g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    games.push({
      id,
      teamId,
      date: isoDate,
      time: timeStr,
      homeTeam: home.name,
      awayTeam: visitor.name,
      homeScore: home.score,
      awayScore: visitor.score,
      location,
      played,
    })
  }

  return { games, teamNames: Array.from(teamNamesSet) }
}
