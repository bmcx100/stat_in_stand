import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { normalizeDate } from "@/lib/parsers"
import type { GameType } from "@/lib/types"

// ── HTML parsing helpers ────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "").trim())
}

function anchorText(html: string): string {
  const m = html.match(/<a[^>]*>([\s\S]*?)<\/a>/)
  return m ? stripTags(m[1]) : stripTags(html)
}

function parseTeam(raw: string): { name: string; score: number | null } {
  const m = raw.match(/^(.*?)\s+\((\d+)\)\s*$/)
  if (m) return { name: m[1].trim(), score: parseInt(m[2], 10) }
  return { name: raw.trim(), score: null }
}

function extractTime(dateStr: string): string {
  const m = dateStr.match(/(\d+:\d+\s*[AP]M)/i)
  if (!m) return ""
  // Convert "11:30 AM" → "11:30", "1:30 PM" → "13:30"
  const parts = m[1].match(/(\d+):(\d+)\s*([AP]M)/i)
  if (!parts) return m[1]
  let h = parseInt(parts[1], 10)
  const min = parts[2]
  const meridiem = parts[3].toUpperCase()
  if (meridiem === "PM" && h !== 12) h += 12
  if (meridiem === "AM" && h === 12) h = 0
  return `${String(h).padStart(2, "0")}:${min}`
}

type ParsedGame = {
  owhaId: string
  date: string
  time: string
  location: string
  homeName: string
  homeScore: number | null
  visitorName: string
  visitorScore: number | null
}

function parseOwhaTable(html: string): ParsedGame[] {
  const tbodyMatch = html.match(/<tbody[^>]*aria-live[^>]*>([\s\S]*?)<\/tbody>/)
  if (!tbodyMatch) return []

  const games: ParsedGame[] = []

  for (const rowMatch of tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1])
    if (cells.length < 5) continue

    const owhaId = stripTags(cells[0])
    const dateParts = cells[1].split(/<br\s*\/?>/i)
    const rawDate = stripTags(dateParts[0])
    const date = normalizeDate(rawDate)
    const time = extractTime(rawDate)
    const location = anchorText(cells[2])
    const { name: homeName, score: homeScore } = parseTeam(anchorText(cells[3]))
    const { name: visitorName, score: visitorScore } = parseTeam(anchorText(cells[4]))

    games.push({ owhaId, date, time, location, homeName, homeScore, visitorName, visitorScore })
  }

  return games
}

// ── Team name matching ──────────────────────────────────────

function normName(s: string): string {
  return s
    .replace(/#\d+/g, "")
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

  // Fetch OWHA page
  let html: string
  try {
    const res = await fetch(owhaUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    })
    if (!res.ok) {
      return NextResponse.json({ error: `OWHA returned ${res.status}` }, { status: 502 })
    }
    html = await res.text()
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch OWHA page: ${String(err)}` }, { status: 502 })
  }

  const parsed = parseOwhaTable(html)
  if (parsed.length === 0) {
    return NextResponse.json({ error: "No games found on OWHA page — check URL or page structure" }, { status: 422 })
  }

  // Filter to games involving this team
  const teamGames = parsed.filter(
    (g) =>
      teamMatches(g.homeName, team.organization, team.name) ||
      teamMatches(g.visitorName, team.organization, team.name)
  )

  if (teamGames.length === 0) {
    return NextResponse.json({
      error: `Team "${team.organization} ${team.name}" was not found on this OWHA page. Check the URL is correct for this team.`,
    }, { status: 422 })
  }

  // Fetch existing opponents for this team
  const { data: opponents } = await serviceSupabase
    .from("opponents")
    .select("id, full_name, owha_id")
    .eq("team_id", teamId)

  const opponentRegistry = opponents ?? []

  function findOrBuildOpponent(owhaName: string): { id: string | null; name: string } {
    const needle = normName(owhaName)
    // Match by owha_id if present (name format "Team Name #1234")
    const owhaIdMatch = owhaName.match(/#(\d+)/)
    if (owhaIdMatch) {
      const found = opponentRegistry.find((o) => o.owha_id === owhaIdMatch[1])
      if (found) return { id: found.id, name: owhaName.replace(/#\d+/, "").trim() }
    }
    // Fuzzy name match
    const normMatch = opponentRegistry.find((o) => {
      const hay = normName(o.full_name)
      return hay === needle || hay.includes(needle) || needle.includes(hay)
    })
    if (normMatch) return { id: normMatch.id, name: normMatch.full_name }
    return { id: null, name: owhaName.replace(/#\d+/, "").trim() }
  }

  let inserted = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const g of teamGames) {
    const isHome = teamMatches(g.homeName, team.organization, team.name)
    const opponentRaw = isHome ? g.visitorName : g.homeName
    const { id: opponentId, name: opponentName } = findOrBuildOpponent(opponentRaw)

    const teamScore = isHome ? g.homeScore : g.visitorScore
    const opponentScore = isHome ? g.visitorScore : g.homeScore
    const played = teamScore !== null && opponentScore !== null
    let result: "W" | "L" | "T" | null = null
    if (played) {
      if (teamScore! > opponentScore!) result = "W"
      else if (teamScore! < opponentScore!) result = "L"
      else result = "T"
    }

    // Check if this OWHA game already exists for this team
    const { data: existing } = await serviceSupabase
      .from("games")
      .select("id, team_score, opponent_score")
      .eq("team_id", teamId)
      .eq("source_game_id", g.owhaId)
      .eq("source", "owha")
      .maybeSingle()

    if (existing) {
      // Only update if scores are newly available and not already set
      if (played && (existing.team_score === null || existing.opponent_score === null)) {
        const { error } = await serviceSupabase
          .from("games")
          .update({ team_score: teamScore, opponent_score: opponentScore, result, played: true })
          .eq("id", existing.id)
        if (error) {
          errors.push(`Update ${g.owhaId}: ${error.message}`)
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
        date: g.date,
        time: g.time,
        opponent_id: opponentId,
        opponent_name: opponentName,
        location: g.location,
        team_score: teamScore,
        opponent_score: opponentScore,
        result,
        game_type: gameType,
        source: "owha",
        source_game_id: g.owhaId,
        played,
      })
      if (error) {
        errors.push(`Insert ${g.owhaId}: ${error.message}`)
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
