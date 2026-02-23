import { createClient } from "@supabase/supabase-js"
import type { AppMode } from "@/app/admin/mode/page"

export async function getAppMode(): Promise<AppMode> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "app_mode")
    .single()

  return (data?.value as AppMode) ?? "playdowns"
}
