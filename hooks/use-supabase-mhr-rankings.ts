import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { MhrRankingEntry } from "@/lib/types"

export function useSupabaseMhrRankings(teamId: string) {
  const [rankings, setRankings] = useState<MhrRankingEntry[] | null>(null)
  const [latestWeek, setLatestWeek] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("mhr_rankings")
      .select("rows, week")
      .eq("team_id", teamId)
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRankings(data.rows as MhrRankingEntry[])
          setLatestWeek(data.week)
        }
        setLoading(false)
      })
  }, [teamId])

  return { rankings, latestWeek, loading }
}
