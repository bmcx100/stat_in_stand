"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchAllStandings, upsertStandings, deleteAllStandings } from "@/lib/supabase/queries"
import type { StandingsData } from "@/lib/types"

type DbStandings = {
  id: string
  team_id: string
  source_url: string
  standings_type: string
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
  const [standingsMap, setStandingsMap] = useState<Record<string, StandingsData>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!teamId) return
    fetchAllStandings(supabase, teamId).then((rows) => {
      const map: Record<string, StandingsData> = {}
      for (const row of rows as DbStandings[]) {
        map[row.standings_type] = dbToStandings(row)
      }
      setStandingsMap(map)
      setLoading(false)
    })
  }, [supabase, teamId])

  const setStandingsData = useCallback(async (
    sourceUrl: string,
    rows: StandingsData["rows"],
    standingsType = "regular"
  ) => {
    if (!teamId) return
    const { error } = await upsertStandings(supabase, teamId, sourceUrl, rows, standingsType)
    if (!error) {
      setStandingsMap((prev) => ({
        ...prev,
        [standingsType]: { teamId, sourceUrl, rows },
      }))
    }
  }, [supabase, teamId])

  const clearAll = useCallback(async () => {
    if (!teamId) return
    const { error } = await deleteAllStandings(supabase, teamId)
    if (!error) setStandingsMap({})
  }, [supabase, teamId])

  return { standingsMap, setStandings: setStandingsData, clearAll, loading }
}
