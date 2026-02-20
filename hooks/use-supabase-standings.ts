"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchStandings, upsertStandings } from "@/lib/supabase/queries"
import type { StandingsData } from "@/lib/types"

type DbStandings = {
  id: string
  team_id: string
  source_url: string
  rows: StandingsData["rows"]
  updated_at: string
}

function dbToStandings(row: DbStandings): StandingsData {
  return {
    teamId: row.team_id,
    sourceUrl: row.source_url,
    rows: row.rows,
  }
}

export function useSupabaseStandings(teamId: string | undefined) {
  const [standings, setStandings] = useState<StandingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!teamId) return
    fetchStandings(supabase, teamId).then((data) => {
      setStandings(data ? dbToStandings(data as DbStandings) : null)
      setLoading(false)
    })
  }, [supabase, teamId])

  const setStandingsData = useCallback(async (sourceUrl: string, rows: StandingsData["rows"]) => {
    if (!teamId) return
    const { error } = await upsertStandings(supabase, teamId, sourceUrl, rows)
    if (!error) {
      setStandings({ teamId, sourceUrl, rows })
    }
  }, [supabase, teamId])

  return { standings, setStandings: setStandingsData, loading }
}
