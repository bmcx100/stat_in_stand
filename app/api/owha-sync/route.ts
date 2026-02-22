import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { GameType } from "@/lib/types"

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
  const hayName = normName(name)
  return (
    needle === hayFull ||
    needle === hayName ||
    needle.includes(hayName) ||
    hayName.includes(needle) ||
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

// Fetch all pages from the OWHA leaguegame JSON API
async function fetchAllOwhaGames(baseUrl: string): Promise<OwhaApiGame[]> {
  const all: OwhaApiGame[] = []
  // Ensure baseUrl ends with /
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`

  for (let page = 0; page < 20; page++) {
    const url = `${base}${page}/`
    let res: Response
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/javascript, */*",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": "https://www.owha.on.ca/",
        },
        cache: "no-store",
      })
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

  if (type === "regular") {
    owhaUrl = team.owha_url_regular
    gameType = "regular"
  } else if (type === "event" && eventType && eventId) {
    if (eventType === "playdown") {
      const { data: pd } = await serviceSupabase
        .from("playdowns")
        .select("owha_url")
        .eq("team_id", teamId)
        .single()
      owhaUrl = pd?.owha_url ?? null
      gameType = "playdowns"
    } else if (eventType === "tournament") {
      const { data: trn } = await serviceSupabase
        .from("tournaments")
        .select("owha_url")
        .eq("team_id", teamId)
        .eq("tournament_id", eventId)
        .single()
      owhaUrl = trn?.owha_url ?? null
      gameType = "tournament"
    }
  }

  if (!owhaUrl) {
    return NextResponse.json({ error: "No OWHA URL configured for this sync type" }, { status: 400 })
  }

  // Fetch all games from OWHA JSON API
  let allGames: OwhaApiGame[]
  try {
    allGames = await fetchAllOwhaGames(owhaUrl)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  if (allGames.length === 0) {
    return NextResponse.json({ error: "No games returned from OWHA API — check the URL" }, { status: 422 })
  }

  // Filter to games involving this team
  const teamGames = allGames.filter(
    (g) =>
      teamMatches(g.HomeTeamName, team.organization, team.name) ||
      teamMatches(g.AwayTeamName, team.organization, team.name)
  )

  if (teamGames.length === 0) {
    return NextResponse.json({
      error: `Team "${team.organization} ${team.name}" was not found in the OWHA API response. Check the URL is correct for this team.`,
    }, { status: 422 })
  }

  // Fetch existing opponents for this team
  const { data: opponents } = await serviceSupabase
    .from("opponents")
    .select("id, full_name, owha_id")
    .eq("team_id", teamId)

  const opponentRegistry = opponents ?? []

  function findOrBuildOpponent(rawName: string): { id: string | null; name: string } {
    const cleanName = rawName.replace(/\([^)]*\)/g, "").replace(/#\d+/g, "").trim()
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

  return NextResponse.json({ inserted, updated, skipped, errors })
}
