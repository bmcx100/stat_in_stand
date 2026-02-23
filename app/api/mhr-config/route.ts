import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// PATCH /api/mhr-config
// Body: { teamId, mhr_games_url?, mhr_rankings_url? }
// Parses MHR URLs to extract numeric IDs and upserts into the mhr_config table.
// Uses a separate table (not columns on teams) to avoid PostgREST schema cache issues.

export async function PATCH(request: Request) {
  const body = await request.json()
  const { teamId, mhr_games_url, mhr_rankings_url } = body

  if (!teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 })
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

  // Parse MHR Games URL → extract team_nbr (t= param)
  let team_nbr: number | null = null
  if (mhr_games_url) {
    try {
      const url = new URL(mhr_games_url)
      const t = parseInt(url.searchParams.get("t") ?? "", 10)
      if (!isNaN(t)) team_nbr = t
    } catch { /* invalid URL — leave null */ }
  }

  // Parse MHR Rankings URL → extract div_nbr (v= param) + div_age (a= param)
  let div_nbr: number | null = null
  let div_age: string | null = null
  if (mhr_rankings_url) {
    try {
      const url = new URL(mhr_rankings_url)
      const v = parseInt(url.searchParams.get("v") ?? "", 10)
      if (!isNaN(v)) div_nbr = v
      div_age = url.searchParams.get("a") || null
    } catch { /* invalid URL — leave null */ }
  }

  const { error } = await serviceSupabase
    .from("mhr_config")
    .upsert(
      { team_id: teamId, team_nbr, div_nbr, div_age },
      { onConflict: "team_id" }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, team_nbr, div_nbr, div_age })
}
