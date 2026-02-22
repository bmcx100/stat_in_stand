import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// PATCH /api/owha-config
// Body: { teamId, owha_url_regular } | { teamId, tournamentId, owha_event, owha_url } | { teamId, type: "playdown", owha_event, owha_url }
// Uses service role to bypass super_admin-only RLS on teams table.

export async function PATCH(request: Request) {
  const body = await request.json()
  const { teamId } = body

  if (!teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 })
  }

  const serverSupabase = await createServerClient()
  const { data: { user } } = await serverSupabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // Verify the caller is an admin for this team (or super_admin)
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

  // Team regular season URL
  if ("owha_url_regular" in body) {
    const { error } = await serviceSupabase
      .from("teams")
      .update({ owha_url_regular: body.owha_url_regular || null })
      .eq("id", teamId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Playdown OWHA config
  if (body.type === "playdown") {
    const { error } = await serviceSupabase
      .from("playdowns")
      .update({ owha_event: body.owha_event ?? false, owha_url: body.owha_url || null })
      .eq("team_id", teamId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Tournament OWHA config
  if (body.tournamentId) {
    const { error } = await serviceSupabase
      .from("tournaments")
      .update({ owha_event: body.owha_event ?? false, owha_url: body.owha_url || null })
      .eq("team_id", teamId)
      .eq("tournament_id", body.tournamentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
}
