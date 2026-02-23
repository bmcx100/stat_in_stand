import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { parseMhrApiGames } from "@/lib/parsers"

// POST /api/mhr-sync
// Body: { teamId, type: "games" | "rankings" }
//
// ── MHR TOKEN EXTRACTION ─────────────────────────────────────────────────────
//
// MHR protects its data API with a short-lived token rather than exposing data
// directly. The two-step process is:
//
//   Step 1 — Fetch the HTML page (team page or rankings page) with a
//             browser-like User-Agent. MHR may block requests without one.
//
//   Step 2 — Extract the token from the embedded JavaScript. MHR initialises
//             its frontend by calling a global function and passing it a JSON
//             config object inline in the HTML. That object contains "token".
//
//             For a team page, the HTML contains something like:
//               MHRv5.scoresBody({ "token": "abc123xyz", "y": 2025, ... })
//
//             For a rankings page, it looks like:
//               MHRv5.rankings({ "token": "def456uvw", "y": 2025, ... })
//
//   Step 3 — Call the data service endpoint with the token in the
//             X-Mhr-Token request header to get the JSON data.
//
//             Games:    GET /team-info/service/{year}/{teamNbr}
//             Rankings: GET /rank/service?y={year}&a={divAge}&v={divNbr}
//
// REGEX PATTERNS (see fetchMhrToken below):
//   Games:    /MHRv5\.scoresBody\(.*?"token"\s*:\s*"([^"]+)"/s
//   Rankings: /MHRv5\.rankings\(.*?"token"\s*:\s*"([^"]+)"/s
//
//   The `s` (dotAll) flag lets `.` match newlines so the pattern works even if
//   the JSON config object is formatted across multiple lines in the HTML.
//
// WHAT CHANGES EACH SEASON:
//   Nothing automatically — URLs are configured per team in the Configure panel
//   on the Super Admin page and contain the season year (y=). If a team's MHR
//   page URL changes (e.g. new season year), update it in Configure.
//
// IF SYNC BREAKS:
//   The most common cause is MHR renaming their JS initialisation function or
//   changing the token parameter name in their frontend. To diagnose:
//     1. Open the team's MHR page in a browser
//     2. View Page Source (Ctrl+U) and search for "token"
//     3. Find the JS function call containing it — it will look similar to the
//        examples above but may use a different function name
//     4. Update the regex in fetchMhrToken calls below to match the new name
//
// ─────────────────────────────────────────────────────────────────────────────

const MHR_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function currentMhrYear(): number {
  const now = new Date()
  // Hockey season: Aug (month 8) starts new season year
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

async function fetchMhrPage(pageUrl: string, pattern: RegExp): Promise<{ token: string; cookies: string }> {
  const res = await fetch(pageUrl, {
    headers: { "User-Agent": MHR_UA },
  })
  if (!res.ok) throw new Error(`MHR page returned ${res.status}: ${pageUrl}`)
  const cookies = res.headers.getSetCookie?.().map((c) => c.split(";")[0]).join("; ") ?? ""
  const html = await res.text()
  const match = html.match(pattern)
  if (!match?.[1]) throw new Error(`Could not extract MHR token from page — MHR may have updated their frontend`)
  return { token: match[1], cookies }
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}

export async function POST(request: Request) {
  const body = await request.json()
  const { teamId, type } = body

  if (!teamId || !type) {
    return NextResponse.json({ error: "Missing teamId or type" }, { status: 400 })
  }

  const serverSupabase = await createServerClient()
  const { data: { user } } = await serverSupabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { data: adminRow } = await serverSupabase
    .from("team_admins")
    .select("role")
    .eq("user_id", user.id)
    .or(`team_id.eq.${teamId},role.eq.super_admin`)
    .limit(1)
    .single()

  if (!adminRow) {
    return NextResponse.json({ error: "Not authorized for this team" }, { status: 403 })
  }

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const year = currentMhrYear()

  const { data: mhrConfig } = await serviceSupabase
    .from("mhr_config")
    .select("team_nbr, div_nbr, div_age")
    .eq("team_id", teamId)
    .maybeSingle()

  if (!mhrConfig) return NextResponse.json({ error: "MHR not configured — add MHR URLs in Configure on the Super Admin page" }, { status: 404 })

  // ── Games sync ───────────────────────────────────────────
  if (type === "games") {
    if (!mhrConfig.team_nbr) {
      return NextResponse.json({ error: "MHR team number not configured — paste your MHR team page URL in Configure" }, { status: 400 })
    }

    let rawGames: unknown[]
    try {
      const pageUrl = `https://myhockeyrankings.com/team_info.php?y=${year}&t=${mhrConfig.team_nbr}`
      const { token, cookies } = await fetchMhrPage(pageUrl, /MHRv5\.scoresBody\(.*?"token"\s*:\s*"([^"]+)"/s)
      const dataRes = await fetch(
        `https://myhockeyrankings.com/team-info/service/${year}/${mhrConfig.team_nbr}`,
        { headers: { "X-Mhr-Token": token, "User-Agent": MHR_UA, "Referer": pageUrl, "Cookie": cookies } }
      )
      if (!dataRes.ok) {
        const body = await dataRes.text()
        throw new Error(`MHR games API returned ${dataRes.status}: ${body.slice(0, 200)}`)
      }
      rawGames = await dataRes.json()
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 })
    }

    if (!Array.isArray(rawGames) || rawGames.length === 0) {
      return NextResponse.json({ error: "No games returned from MHR API" }, { status: 422 })
    }

    const parsedGames = parseMhrApiGames(rawGames, teamId, mhrConfig.team_nbr)

    const { data: opponents } = await serviceSupabase
      .from("opponents")
      .select("id, full_name")
      .eq("team_id", teamId)

    const opponentRegistry = opponents ?? []

    function findOpponent(rawName: string): { id: string | null; name: string } {
      const needle = normName(rawName)
      const match = opponentRegistry.find((o) => {
        const hay = normName(o.full_name)
        return hay === needle || hay.includes(needle) || needle.includes(hay)
      })
      if (match) return { id: match.id, name: match.full_name }
      return { id: null, name: rawName.trim() }
    }

    let inserted = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const game of parsedGames) {
      const { data: existing } = await serviceSupabase
        .from("games")
        .select("id, played")
        .eq("team_id", teamId)
        .eq("source_game_id", game.sourceGameId)
        .eq("source", "mhr")
        .eq("game_type", game.gameType)
        .maybeSingle()

      if (existing) {
        if (game.played && !existing.played) {
          const { error } = await serviceSupabase
            .from("games")
            .update({
              team_score: game.teamScore,
              opponent_score: game.opponentScore,
              result: game.result,
              played: true,
            })
            .eq("id", existing.id)
          if (error) errors.push(`Update ${game.sourceGameId}: ${error.message}`)
          else updated++
        } else {
          skipped++
        }
      } else {
        const { id: opponentId, name: opponentName } = findOpponent(game.opponent)
        const { error } = await serviceSupabase.from("games").insert({
          team_id: teamId,
          date: game.date,
          time: game.time,
          opponent_id: opponentId,
          opponent_name: opponentName,
          location: game.location,
          team_score: game.teamScore,
          opponent_score: game.opponentScore,
          result: game.result,
          game_type: game.gameType,
          source: "mhr",
          source_game_id: game.sourceGameId,
          played: game.played,
          home: game.home ?? null,
        })
        if (error) errors.push(`Insert ${game.sourceGameId}: ${error.message}`)
        else inserted++
      }
    }

    await serviceSupabase
      .from("mhr_config")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("team_id", teamId)

    return NextResponse.json({ inserted, updated, skipped, errors })
  }

  // ── Rankings sync ────────────────────────────────────────
  if (type === "rankings") {
    if (!mhrConfig.div_nbr || !mhrConfig.div_age) {
      return NextResponse.json({ error: "MHR division not configured — paste your MHR rankings URL in Configure" }, { status: 400 })
    }

    let rawRankings: Array<{ week: number; team_nbr: number; ranking: number }>
    try {
      const pageUrl = `https://myhockeyrankings.com/rank?y=${year}&a=${mhrConfig.div_age}&v=${mhrConfig.div_nbr}`
      const { token, cookies } = await fetchMhrPage(pageUrl, /MHRv5\.rankings\(.*?"token"\s*:\s*"([^"]+)"/s)
      const dataRes = await fetch(
        `https://myhockeyrankings.com/rank/service?y=${year}&a=${mhrConfig.div_age}&v=${mhrConfig.div_nbr}`,
        { headers: { "X-Mhr-Token": token, "User-Agent": MHR_UA, "Referer": pageUrl, "Cookie": cookies } }
      )
      if (!dataRes.ok) {
        const body = await dataRes.text()
        throw new Error(`MHR rankings API returned ${dataRes.status}: ${body.slice(0, 200)}`)
      }
      const rankText = await dataRes.text()
      if (!rankText || rankText.trim().length === 0) {
        throw new Error(`MHR rankings API returned empty response (status ${dataRes.status}, content-type: ${dataRes.headers.get("content-type")})`)
      }
      try {
        rawRankings = JSON.parse(rankText)
      } catch {
        throw new Error(`MHR rankings API returned non-JSON: ${rankText.slice(0, 300)}`)
      }
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 })
    }

    if (!Array.isArray(rawRankings) || rawRankings.length === 0) {
      return NextResponse.json({ error: "No rankings returned from MHR API" }, { status: 422 })
    }

    const week = rawRankings[0]?.week
    if (!week) return NextResponse.json({ error: "Rankings response missing week field" }, { status: 500 })

    const { error: upsertError } = await serviceSupabase
      .from("mhr_rankings")
      .upsert(
        {
          team_id: teamId,
          div_nbr: mhrConfig.div_nbr,
          week,
          rows: rawRankings,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "team_id,week" }
      )

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

    await serviceSupabase
      .from("mhr_config")
      .update({ rankings_last_synced_at: new Date().toISOString() })
      .eq("team_id", teamId)

    const ourRanking = mhrConfig.team_nbr
      ? (rawRankings.find((r) => r.team_nbr === mhrConfig.team_nbr)?.ranking ?? null)
      : null

    return NextResponse.json({ week, teamCount: rawRankings.length, ourRanking })
  }

  return NextResponse.json({ error: "Invalid type — must be 'games' or 'rankings'" }, { status: 400 })
}
