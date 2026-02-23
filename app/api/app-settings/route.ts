import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function PATCH(request: Request) {
  const body = await request.json()
  const { key, value } = body

  if (!key || !value) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 })
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

  const { error } = await serviceSupabase
    .from("app_settings")
    .upsert({ key, value }, { onConflict: "key" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await serviceSupabase
    .from("app_settings")
    .select("key, value")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings: Record<string, string> = {}
  for (const row of data ?? []) settings[row.key] = row.value

  return NextResponse.json(settings)
}
