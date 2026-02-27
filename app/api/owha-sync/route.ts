import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { GameType } from "@/lib/types"

// ── OWHA API ────────────────────────────────────────────────
//
// OWHA uses two separate API systems depending on game type.
// All URLs are discovered by opening the OWHA division page in a browser,
// opening DevTools → Network tab → filtering by XHR, then reading the
// Request URLs that appear when the page loads.
//
// HOW TO FIND URLS FOR A NEW SEASON:
//   1. Visit the team's OWHA division page (e.g. https://www.owha.on.ca/division/1590/14802/games)
//   2. Open DevTools → Network → XHR
//   3. Reload the page and look for calls to /api/leaguegame/get/...
//   4. The URL segments reveal all the constants below
//
// REGULAR SEASON + PLAYOFFS (CATID != 0 in division URL)
//   Division page URL: https://www.owha.on.ca/division/{CATID}/{DID}/games
//   Games API:         /api/leaguegame/get/{AID}/{SID}/{CATID}/{DID}/{GTID}/{page}/
//   Standings API:     /api/leaguegame/getstandings3cached/{AID}/{SID}/{GTID}/{CATID}/{DID}/0/0
//
//   Known constants (verify each new season via DevTools):
//     AID  = 2788   — OWHA Association ID (likely stable)
//     SID  = 12488  — Season ID (WILL CHANGE each season — check DevTools)
//     GTID = 5069   — Game Type ID for Regular Season
//     GTID = 5387   — Game Type ID for Playoffs (same division URL, different GTID)
//
// PLAYDOWNS (CATID = 0 in division URL — provincial scope)
//   Division page URL: https://www.owha.on.ca/division/0/{DID}/games
//   Games API:         /api/leaguegame/get/{AID}/{SID}/0/{DID}/0/{page}/
//   Standings API:     /api/leaguegame/getstandings3wsdcached/{AID}/{SID}/0/0/{DID}/0
//
//   Known constants (verify each new season via DevTools):
//     AID  = 3617   — Different AID for playdowns (likely stable)
//     SID  = 13359  — Season ID for playdowns (WILL CHANGE each season — check DevTools)
//     GTID = 0      — Playdowns use 0 for game type
//
// SUBDIVISION (LOOP) FILTERING:
//   Playdowns standings return ALL loops in the province.
//   Filter by SDID (SubDivisionID) to isolate your team's loop.
//   Your team's SDID is in the standings response under the "SDID" field.
//   SubDivName contains loop name + qualifying info e.g. "Region C (2 of 4 teams advance)"
//
// IF SYNC BREAKS NEXT SEASON:
//   Most likely cause is SID changed. Open DevTools on any OWHA division page,
//   check the XHR calls, find the new SID value, and update the constants below.
//
// ────────────────────────────────────────────────────────────

const OWHA_REGULAR = { AID: 2788, SID: 12488, GTID_REGULAR: 5069, GTID_PLAYOFFS: 5387 }
const OWHA_PLAYDOWNS = { AID: 3617, SID: 13359, GTID: 0 }

// ── OWHA JSON API types ─────────────────────────────────────

type OwhaApiGame = {
  GID: number | string
  sDate: string        // e.g. "2/15/2026 3:20:00 PM"
  ArenaName: string
  HomeTeamName: string
  AwayTeamName: string
  HomeTID: number | string
  AwayTID: number | string
  homeScore: number | null
  awayScore: number | null
  completed: boolean
  visible: boolean
  OT: boolean
  SO: boolean
  GameTypeName: string
}

// ── Helpers ─────────────────────────────────────────────────

function normName(s: string): string {
  return s
    .replace(/\([^)]*\)/g, "")   // strip parenthetical scores like "(3)"
    .replace(/#\d+/g, "")        // strip #TeamID
    .replace(/[^a-z0-9\s]/gi, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim()
}

function teamMatches(owhaN: string, org: string, name: string): boolean {
  const needle = normName(owhaN)
  const hayFull = normName(`${org} ${name}`)
  return (
    needle === hayFull ||
    needle.includes(hayFull) ||
    hayFull.includes(needle)
  )
}

// Parse "2025-10-05T15:00:00" → { date: "2025-10-05", time: "15:00" }
function parseSDate(sDate: string): { date: string; time: string } {
  if (!sDate) return { date: "", time: "" }
  const [datePart, timePart] = sDate.split("T")
  return {
    date: datePart || "",
    time: timePart ? timePart.slice(0, 5) : "",
  }
}

// Convert a division page URL to the leaguegame API base URL.
// Handles both regular season (CATID != 0) and playdowns (CATID = 0).
// See the OWHA API comment block above if this needs updating next season.
function toApiBaseUrl(url: string): string {
  const m = url.match(/\/division\/(\d+)\/(\d+)/)
  if (!m) return url // already an API URL or unknown format, use as-is
  const [, catId, divisionId] = m
  if (catId === "0") {
    // Playdowns — provincial scope
    const { AID, SID, GTID } = OWHA_PLAYDOWNS
    return `https://www.owha.on.ca/api/leaguegame/get/${AID}/${SID}/0/${divisionId}/${GTID}/`
  }
  // Regular season (use GTID_REGULAR; playoffs uses same URL with GTID_PLAYOFFS — handled separately)
  const { AID, SID, GTID_REGULAR } = OWHA_REGULAR
  return `https://www.owha.on.ca/api/leaguegame/get/${AID}/${SID}/${catId}/${divisionId}/${GTID_REGULAR}/`
}

// Convert a division page URL to the standings API URL.
// See the OWHA API comment block above for URL patterns.
function toStandingsUrl(url: string): string {
  const m = url.match(/\/division\/(\d+)\/(\d+)/)
  if (!m) return url
  const [, catId, divisionId] = m
  if (catId === "0") {
    const { AID, SID } = OWHA_PLAYDOWNS
    return `https://www.owha.on.ca/api/leaguegame/getstandings3wsdcached/${AID}/${SID}/0/0/${divisionId}/0`
  }
  const { AID, SID, GTID_REGULAR } = OWHA_REGULAR
  return `https://www.owha.on.ca/api/leaguegame/getstandings3cached/${AID}/${SID}/${GTID_REGULAR}/${catId}/${divisionId}/0/0`
}

const OWHA_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": "https://www.owha.on.ca/",
}

// Fetch all pages from the OWHA leaguegame JSON API
async function fetchAllOwhaGames(baseUrl: string): Promise<OwhaApiGame[]> {
  const all: OwhaApiGame[] = []
  // Ensure baseUrl ends with /
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`

  for (let page = 0; page < 20; page++) {
    const url = `${base}${page}/`
    let res: Response
    try {
      res = await fetch(url, { headers: OWHA_FETCH_HEADERS, cache: "no-store" })
    } catch (err) {
      throw new Error(`Failed to fetch OWHA API page ${page}: ${String(err)}`)
    }

    if (!res.ok) throw new Error(`OWHA API returned ${res.status} on page ${page}`)

    const data = await res.json()

    // API returns an array; empty array = no more pages
    if (!Array.isArray(data) || data.length === 0) break

    all.push(...data)
  }

  return all
}

// ── Main handler ────────────────────────────────────────────

export async function POST(request: Request) {
  const body = await request.json()
  const { teamId, type, eventType, eventId } = body

  if (!teamId || !type) {
    return NextResponse.json({ error: "teamId and type required" }, { status: 400 })
  }

  // Auth check
  const serverSupabase = await createServerClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: adminRow } = await serverSupabase
    .from("team_admins")
    .select("role")
    .eq("user_id", user.id)
    .or(`team_id.eq.${teamId},role.eq.super_admin`)
    .limit(1)
    .single()

  if (!adminRow) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch team
  const { data: team } = await serviceSupabase
    .from("teams")
    .select("id, organization, name, owha_url_regular")
    .eq("id", teamId)
    .single()

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 })

  // Resolve URL + gameType
  let owhaUrl: string | null = null
  let gameType: GameType = "regular"

  if ((type === "regular" || type === "standings") && !eventType) {
    owhaUrl = team.owha_url_regular
    gameType = "regular"
  } else if (type === "playoffs" || type === "playoffs-standings") {
    owhaUrl = team.owha_url_regular
    gameType = "playoffs"
  } else if (eventType === "playdown") {
    const { data: pd } = await serviceSupabase
      .from("playdowns")
      .select("owha_url")
      .eq("team_id", teamId)
      .single()
    owhaUrl = pd?.owha_url ?? null
    gameType = "playdowns"
  } else if (eventType === "tournament" && eventId) {
    const { data: trn } = await serviceSupabase
      .from("tournaments")
      .select("owha_url")
      .eq("team_id", teamId)
      .eq("tournament_id", eventId)
      .single()
    owhaUrl = trn?.owha_url ?? null
    gameType = "tournament"
  }

  if (!owhaUrl) {
    return NextResponse.json({ error: "No OWHA URL configured for this sync type" }, { status: 400 })
  }

  // ── Playoffs standings sync ──────────────────────────────
  if (type === "playoffs-standings") {
    const m = owhaUrl.match(/\/division\/(\d+)\/(\d+)/)
    if (!m) return NextResponse.json({ error: "Invalid OWHA URL" }, { status: 400 })
    const [, catId, divisionId] = m
    const { AID, SID, GTID_PLAYOFFS } = OWHA_REGULAR
    const standingsUrl = `https://www.owha.on.ca/api/leaguegame/getstandings3cached/${AID}/${SID}/${GTID_PLAYOFFS}/${catId}/${divisionId}/0/0`
    let raw: Record<string, unknown>[]
    try {
      const res = await fetch(standingsUrl, { headers: OWHA_FETCH_HEADERS, cache: "no-store" })
      if (!res.ok) throw new Error(`OWHA standings API returned ${res.status}`)
      raw = await res.json()
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 })
    }
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: "No playoff standings data returned from OWHA API" }, { status: 422 })
    }
    const rows = raw.map((r, i) => ({
      rank: i + 1,
      teamName: String(r.TeamName ?? "").replace(/\([^)]*\)/g, "").replace(/#\d+/g, "").replace(/[A-Z]{3}\d+-\d+/, "").replace(/\bU\d{2,3}[A-Z]{0,2}\b/g, "").replace(/\s+\b(A{1,2}|B{1,2}|C|AE|MD)\b$/i, "").trim(),
      gp: Number(r.GamesPlayed ?? 0),
      w: Number(r.Wins ?? 0),
      l: Number(r.Losses ?? 0),
      t: Number(r.Ties ?? 0),
      otl: Number(r.OTL ?? 0),
      sol: Number(r.SOL ?? 0),
      pts: Number(r.Points ?? 0),
      gf: Number(r.GF ?? 0),
      ga: Number(r.GA ?? 0),
    }))
    const { error: playoffsStandingsError } = await serviceSupabase
      .from("standings")
      .upsert(
        { team_id: teamId, rows, source_url: owhaUrl, standings_type: "playoffs", updated_at: new Date().toISOString() },
        { onConflict: "team_id,standings_type" }
      )
    if (playoffsStandingsError) return NextResponse.json({ error: playoffsStandingsError.message }, { status: 500 })
    return NextResponse.json({ synced: rows.length })
  }

  // ── Standings sync ───────────────────────────────────────
  if (type === "standings") {
    const standingsUrl = toStandingsUrl(owhaUrl)
    let raw: Record<string, unknown>[]
    try {
      const res = await fetch(standingsUrl, { headers: OWHA_FETCH_HEADERS, cache: "no-store" })
      if (!res.ok) throw new Error(`OWHA standings API returned ${res.status}`)
      raw = await res.json()
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 })
    }

    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: "No standings data returned from OWHA API" }, { status: 422 })
    }

    // For playdowns (CATID=0), the standings API returns all loops province-wide.
    // Filter to only our team's loop using SDID, and exclude region-label rows (TID=0).
    let filtered = raw
    let loopTeamNames: string[] = []
    let subDivName = ""
    let qualifyingSpotsFromDiv = 0
    let totalTeamsFromDiv = 0
    let allAdvance = false

    const m = owhaUrl.match(/\/division\/(\d+)\//)
    if (m && m[1] === "0") {
      const ourEntry = raw.find((r) => teamMatches(String(r.TeamName ?? ""), team.organization, team.name))
      if (ourEntry) {
        subDivName = String(ourEntry.SubDivName ?? "")
        const subDivMatch = subDivName.match(/(\d+) of (\d+) teams advance/i)
        const allAdvanceMatch = !subDivMatch && /all teams advance/i.test(subDivName)
        if (subDivMatch) {
          qualifyingSpotsFromDiv = Number(subDivMatch[1])
          totalTeamsFromDiv = Number(subDivMatch[2])
        }
        const ourSDID = String(ourEntry.SDID ?? "")
        if (ourSDID && ourSDID !== "0") {
          const loopEntries = raw.filter((r) => String(r.SDID ?? "") === ourSDID && Number(r.TID ?? 0) !== 0)
          filtered = loopEntries
          loopTeamNames = loopEntries.map((r) =>
            String(r.TeamName ?? "").replace(/\([^)]*\)/g, "").replace(/#\d+/g, "").replace(/[A-Z]{3}\d+-\d+/, "").replace(/\bU\d{2,3}[A-Z]{0,2}\b/g, "").replace(/\s+\b(A{1,2}|B{1,2}|C|AE|MD)\b$/i, "").trim()
          )
          if (allAdvanceMatch && loopEntries.length > 0) {
            totalTeamsFromDiv = loopEntries.length
            qualifyingSpotsFromDiv = loopEntries.length
            allAdvance = true
          }
        }
      }
    }

    const rows = filtered.map((r, i) => ({
      rank: i + 1,
      teamName: String(r.TeamName ?? "").replace(/\([^)]*\)/g, "").replace(/#\d+/g, "").replace(/[A-Z]{3}\d+-\d+/, "").replace(/\bU\d{2,3}[A-Z]{0,2}\b/g, "").replace(/\s+\b(A{1,2}|B{1,2}|C|AE|MD)\b$/i, "").trim(),
      gp: Number(r.GamesPlayed ?? 0),
      w: Number(r.Wins ?? 0),
      l: Number(r.Losses ?? 0),
      t: Number(r.Ties ?? 0),
      otl: Number(r.OTL ?? 0),
      sol: Number(r.SOL ?? 0),
      pts: Number(r.Points ?? 0),
      gf: Number(r.GF ?? 0),
      ga: Number(r.GA ?? 0),
    }))

    const { error } = await serviceSupabase
      .from("standings")
      .upsert(
        { team_id: teamId, rows, source_url: owhaUrl, standings_type: gameType, updated_at: new Date().toISOString() },
        { onConflict: "team_id,standings_type" }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // For playdowns: persist loop metadata into playdowns.config so games sync can use it
    if (loopTeamNames.length > 0) {
      const { data: pd } = await serviceSupabase
        .from("playdowns")
        .select("config, games")
        .eq("team_id", teamId)
        .maybeSingle()
      if (pd) {
        const existing = (pd.config ?? {}) as Record<string, unknown>
        const updatedConfig = {
          ...existing,
          totalTeams: totalTeamsFromDiv || loopTeamNames.length,
          qualifyingSpots: qualifyingSpotsFromDiv || (existing.qualifyingSpots ?? 0),
          gamesPerMatchup: existing.gamesPerMatchup || 1,
          teamNames: loopTeamNames,
          allTeamsAdvance: allAdvance,
        }
        await serviceSupabase.from("playdowns").update({ config: updatedConfig }).eq("team_id", teamId)
      }
      return NextResponse.json({ synced: rows.length, teamNames: loopTeamNames, subDivName, totalTeams: totalTeamsFromDiv, qualifyingSpots: qualifyingSpotsFromDiv })
    }

    return NextResponse.json({ synced: rows.length })
  }

  // ── Games sync ───────────────────────────────────────────

  // Fetch all games from OWHA JSON API
  // Playoffs use the same division URL as regular season but with GTID_PLAYOFFS
  let gamesApiUrl = toApiBaseUrl(owhaUrl)
  if (type === "playoffs") {
    const m = owhaUrl.match(/\/division\/(\d+)\/(\d+)/)
    if (m) {
      const [, catId, divisionId] = m
      const { AID, SID, GTID_PLAYOFFS } = OWHA_REGULAR
      gamesApiUrl = `https://www.owha.on.ca/api/leaguegame/get/${AID}/${SID}/${catId}/${divisionId}/${GTID_PLAYOFFS}/`
    }
  }

  let allGames: OwhaApiGame[]
  try {
    allGames = await fetchAllOwhaGames(gamesApiUrl)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  if (allGames.length === 0) {
    if (type === "playoffs") {
      return NextResponse.json({ inserted: 0, updated: 0, skipped: 0, errors: [] })
    }
    return NextResponse.json({ error: "No games returned from OWHA API — check the URL" }, { status: 422 })
  }

  // For playdowns, the games API returns ALL games province-wide.
  // teamNames in playdowns.config (populated by standings sync) are used to filter to our loop.
  // Standings must be synced first — if teamNames is missing, return an error.
  const debug: Record<string, unknown> = {}

  if (gameType === "playdowns") {
    const { data: pd } = await serviceSupabase
      .from("playdowns")
      .select("config, games")
      .eq("team_id", teamId)
      .maybeSingle()

    const pdConfig = (pd?.config ?? {}) as { teamNames?: string[] }

    if (!pdConfig.teamNames || pdConfig.teamNames.length === 0) {
      return NextResponse.json({
        error: "Sync Standings first to establish the loop teams before syncing games.",
      }, { status: 400 })
    }

    const storedNames = pdConfig.teamNames.map((n) => normName(n))
    const nameInLoop = (raw: string) => {
      const n = normName(raw)
      return storedNames.some((ln) => n.includes(ln) || ln.includes(n))
    }

    // Filter to only games where both teams are in our loop
    const loopGames = allGames.filter((g) => nameInLoop(g.HomeTeamName) && nameInLoop(g.AwayTeamName))
    debug.teamNamesUsed = pdConfig.teamNames
    debug.loopGamesFound = loopGames.length
    if (loopGames.length > 0) {
      allGames = loopGames
    }

    // Save ALL loop games to playdown.games JSONB for the public playdowns page
    const cleanName = (n: string) =>
      n.replace(/\([^)]*\)/g, "").replace(/#\d+/g, "").replace(/[A-Z]{3}\d+-\d+/, "").replace(/\bU\d{2,3}[A-Z]{0,2}\b/g, "").replace(/\s+\b(A{1,2}|B{1,2}|C|AE|MD)\b$/i, "").trim()
    const jsonbGames = loopGames.map((g) => {
      const { date, time } = parseSDate(g.sDate)
      return {
        id: String(g.GID),
        teamId,
        date,
        time,
        homeTeam: cleanName(g.HomeTeamName),
        awayTeam: cleanName(g.AwayTeamName),
        homeScore: g.homeScore ?? null,
        awayScore: g.awayScore ?? null,
        location: g.ArenaName || "",
        played: g.completed === true,
      }
    })
    await serviceSupabase.from("playdowns").update({ games: jsonbGames }).eq("team_id", teamId)
    debug.jsonbGamesSaved = jsonbGames.length

    // Compute gamesPerMatchup from the full schedule and persist it in config
    const teamGameCounts = new Map<string, number>()
    for (const g of jsonbGames) {
      teamGameCounts.set(g.homeTeam, (teamGameCounts.get(g.homeTeam) ?? 0) + 1)
      teamGameCounts.set(g.awayTeam, (teamGameCounts.get(g.awayTeam) ?? 0) + 1)
    }
    if (teamGameCounts.size > 0) {
      const numTeams = pdConfig.teamNames?.length ?? 0
      const maxGamesPerTeam = Math.max(...teamGameCounts.values())
      const computedGamesPerMatchup = numTeams > 1 ? Math.max(1, Math.round(maxGamesPerTeam / (numTeams - 1))) : 1
      await serviceSupabase.from("playdowns")
        .update({ config: { ...pdConfig, gamesPerMatchup: computedGamesPerMatchup } })
        .eq("team_id", teamId)
      debug.gamesPerMatchup = computedGamesPerMatchup
    }
  }

  // Filter to games involving this team.
  // For playdowns: allGames is already pre-filtered to our loop's teams by name (above),
  // so name matching here only picks from that restricted set — no cross-loop contamination.
  // For regular/playoffs: name matching is reliable within a single division.
  const teamGames = allGames.filter(
    (g) =>
      teamMatches(g.HomeTeamName, team.organization, team.name) ||
      teamMatches(g.AwayTeamName, team.organization, team.name)
  )

  debug.teamGamesFound = teamGames.length

  if (teamGames.length === 0) {
    if (type === "playoffs") {
      return NextResponse.json({ inserted: 0, updated: 0, skipped: 0, errors: [] })
    }
    const sampleNames = [...new Set(allGames.slice(0, 50).flatMap((g) => [g.HomeTeamName, g.AwayTeamName]))]
    return NextResponse.json({
      error: `Team "${team.organization} ${team.name}" was not found in the OWHA API response. Check the URL is correct for this team.`,
      debug: { ...debug, totalGamesReturned: allGames.length, sampleTeamNames: sampleNames.slice(0, 20) },
    }, { status: 422 })
  }

  // Fetch existing opponents for this team
  const { data: opponents } = await serviceSupabase
    .from("opponents")
    .select("id, full_name, owha_id")
    .eq("team_id", teamId)

  const opponentRegistry = opponents ?? []

  function findOrBuildOpponent(rawName: string): { id: string | null; name: string } {
    const cleanName = rawName.replace(/\([^)]*\)/g, "").replace(/#\d+/g, "").replace(/\bU\d{2,3}[A-Z]{0,2}\b/g, "").replace(/\s+\b(A{1,2}|B{1,2}|C|AE|MD)\b$/i, "").trim()
    const needle = normName(rawName)
    // Match by #ID if present
    const owhaIdMatch = rawName.match(/#(\d+)/)
    if (owhaIdMatch) {
      const found = opponentRegistry.find((o) => o.owha_id === owhaIdMatch[1])
      if (found) return { id: found.id, name: cleanName }
    }
    // Fuzzy name match
    const normMatch = opponentRegistry.find((o) => {
      const hay = normName(o.full_name)
      return hay === needle || hay.includes(needle) || needle.includes(hay)
    })
    if (normMatch) return { id: normMatch.id, name: normMatch.full_name }
    return { id: null, name: cleanName }
  }

  let inserted = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const g of teamGames) {
    const isHome = teamMatches(g.HomeTeamName, team.organization, team.name)
    const opponentRaw = isHome ? g.AwayTeamName : g.HomeTeamName
    const { id: opponentId, name: opponentName } = findOrBuildOpponent(opponentRaw)

    const teamScore = isHome ? g.homeScore : g.awayScore
    const opponentScore = isHome ? g.awayScore : g.homeScore
    const played = g.completed === true && teamScore !== null && opponentScore !== null

    let result: "W" | "L" | "T" | null = null
    if (played) {
      if (teamScore! > opponentScore!) result = "W"
      else if (teamScore! < opponentScore!) result = "L"
      else result = "T"
    }

    const { date, time } = parseSDate(g.sDate)
    const owhaId = String(g.GID)

    // Check if game already exists
    const { data: existing } = await serviceSupabase
      .from("games")
      .select("id, team_score, opponent_score, played")
      .eq("team_id", teamId)
      .eq("source_game_id", owhaId)
      .eq("source", "owha")
      .eq("game_type", gameType)
      .maybeSingle()

    if (existing) {
      // Update only if scores are newly available
      if (played && !existing.played) {
        const { error } = await serviceSupabase
          .from("games")
          .update({ team_score: teamScore, opponent_score: opponentScore, result, played: true })
          .eq("id", existing.id)
        if (error) {
          errors.push(`Update GID ${owhaId}: ${error.message}`)
        } else {
          updated++
        }
      } else {
        skipped++
      }
    } else {
      // Insert new game
      const { error } = await serviceSupabase.from("games").insert({
        team_id: teamId,
        date,
        time,
        opponent_id: opponentId,
        opponent_name: opponentName,
        location: g.ArenaName || "",
        team_score: teamScore ?? null,
        opponent_score: opponentScore ?? null,
        result,
        game_type: gameType,
        source: "owha",
        source_game_id: owhaId,
        played,
        home: isHome,
      })
      if (error) {
        errors.push(`Insert GID ${owhaId}: ${error.message}`)
      } else {
        inserted++
      }
    }
  }

  // Update last synced timestamp
  const now = new Date().toISOString()
  if (type === "regular") {
    await serviceSupabase.from("teams").update({ owha_last_synced_at: now }).eq("id", teamId)
  } else if (type === "event" && eventType === "playdown") {
    await serviceSupabase.from("playdowns").update({ owha_last_synced_at: now }).eq("team_id", teamId)
  } else if (type === "event" && eventType === "tournament" && eventId) {
    await serviceSupabase
      .from("tournaments")
      .update({ owha_last_synced_at: now })
      .eq("team_id", teamId)
      .eq("tournament_id", eventId)
  }

  return NextResponse.json({ inserted, updated, skipped, errors, debug })
}
