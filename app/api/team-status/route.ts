import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export type StatusColor = "green" | "yellow" | "red" | "grey"

export type TeamStatus = {
  regular: StatusColor
  playoffs: StatusColor
  playdowns: StatusColor
  mhrGames: StatusColor
  mhrRankings: StatusColor
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}

function teamNameMatches(rowName: string, org: string, name: string): boolean {
  const needle = norm(`${org} ${name}`)
  const hay = norm(rowName)
  return hay === needle || hay.includes(needle) || needle.includes(hay)
}

export async function POST(request: Request) {
  const body = await request.json()
  const { teamIds } = body

  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    return NextResponse.json({ error: "teamIds required" }, { status: 400 })
  }

  const serverSupabase = await createServerClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: adminRow } = await serverSupabase
    .from("team_admins")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .limit(1)
    .single()

  if (!adminRow) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [
    { data: teams },
    { data: playdowns },
    { data: mhrConfigs },
    { data: standings },
    { data: games },
  ] = await Promise.all([
    serviceSupabase
      .from("teams")
      .select("id, organization, name, owha_url_regular, owha_last_synced_at")
      .in("id", teamIds),
    serviceSupabase
      .from("playdowns")
      .select("team_id, owha_url, owha_last_synced_at")
      .in("team_id", teamIds),
    serviceSupabase
      .from("mhr_config")
      .select("team_id, team_nbr, div_nbr, last_synced_at, rankings_last_synced_at")
      .in("team_id", teamIds),
    serviceSupabase
      .from("standings")
      .select("team_id, standings_type, rows")
      .in("team_id", teamIds),
    serviceSupabase
      .from("games")
      .select("team_id, game_type, result, played")
      .in("team_id", teamIds)
      .eq("played", true),
  ])

  const result: Record<string, TeamStatus> = {}

  for (const teamId of teamIds) {
    const team = teams?.find((t) => t.id === teamId)
    const playdown = playdowns?.find((p) => p.team_id === teamId)
    const mhr = mhrConfigs?.find((m) => m.team_id === teamId)
    const teamStandings = standings?.filter((s) => s.team_id === teamId) ?? []
    const teamGames = games?.filter((g) => g.team_id === teamId) ?? []

    // Regular season
    let regular: StatusColor = "grey"
    if (team?.owha_url_regular) {
      if (!team.owha_last_synced_at) {
        regular = "red"
      } else {
        const regularStandings = teamStandings.find((s) => s.standings_type === "regular")
        const regularGames = teamGames.filter((g) => g.game_type === "regular")
        const gW = regularGames.filter((g) => g.result === "W").length
        const gL = regularGames.filter((g) => g.result === "L").length
        const gT = regularGames.filter((g) => g.result === "T").length
        const gGP = regularGames.length
        if (regularStandings?.rows && team) {
          const rows = regularStandings.rows as Array<{ teamName: string; w: number; l: number; t: number; gp: number }>
          const myRow = rows.find((r) => teamNameMatches(r.teamName, team.organization, team.name))
          if (myRow && (myRow.w !== gW || myRow.l !== gL || myRow.t !== gT || myRow.gp !== gGP)) {
            regular = "yellow"
          } else {
            regular = "green"
          }
        } else {
          regular = "green"
        }
      }
    }

    // Playoffs — uses same URL as regular, no dedicated sync timestamp
    const playoffs: StatusColor = team?.owha_url_regular ? "green" : "grey"

    // Playdowns
    let playdowns_status: StatusColor = "grey"
    if (playdown?.owha_url) {
      playdowns_status = playdown.owha_last_synced_at ? "green" : "red"
    }

    // MHR Games
    let mhrGames: StatusColor = "grey"
    if (mhr?.team_nbr) {
      mhrGames = mhr.last_synced_at ? "green" : "red"
    }

    // MHR Rankings
    let mhrRankings: StatusColor = "grey"
    if (mhr?.div_nbr) {
      mhrRankings = mhr.rankings_last_synced_at ? "green" : "red"
    }

    result[teamId] = { regular, playoffs, playdowns: playdowns_status, mhrGames, mhrRankings }
  }

  return NextResponse.json(result)
}
