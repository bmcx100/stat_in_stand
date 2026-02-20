import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const { email, teamId } = await request.json()

  if (!email || !teamId) {
    return NextResponse.json({ error: "Email and teamId required" }, { status: 400 })
  }

  // Verify the caller is a super_admin
  const serverSupabase = await createServerClient()
  const { data: { user } } = await serverSupabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { data: callerAdmin } = await serverSupabase
    .from("team_admins")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .limit(1)
    .single()

  if (!callerAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  }

  // Use service role client for admin operations
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check if user already exists
  const { data: { users } } = await serviceSupabase.auth.admin.listUsers()
  const existingUser = users?.find((u) => u.email === email)

  let userId: string

  if (existingUser) {
    userId = existingUser.id
  } else {
    // Invite new user
    const { data: invited, error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email)
    if (inviteError || !invited.user) {
      return NextResponse.json({ error: inviteError?.message || "Failed to invite user" }, { status: 500 })
    }
    userId = invited.user.id
  }

  // Check if already assigned
  const { data: existing } = await serviceSupabase
    .from("team_admins")
    .select("id")
    .eq("user_id", userId)
    .eq("team_id", teamId)
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json({ error: "User already assigned to this team" }, { status: 409 })
  }

  // Create team_admin row
  const { error: insertError } = await serviceSupabase
    .from("team_admins")
    .insert({ user_id: userId, team_id: teamId, role: "team_admin" })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
