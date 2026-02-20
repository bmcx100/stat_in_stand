"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchOpponents, insertOpponents, updateOpponent as updateOpponentQuery, deleteOpponent as deleteOpponentQuery } from "@/lib/supabase/queries"
import type { Opponent } from "@/lib/types"

type DbOpponent = {
  id: string
  team_id: string
  full_name: string
  location: string
  name: string
  age_group: string
  level: string
  owha_id: string | null
  created_at: string
}

function dbToOpponent(row: DbOpponent): Opponent {
  return {
    id: row.id,
    fullName: row.full_name,
    location: row.location,
    name: row.name,
    ageGroup: row.age_group,
    level: row.level,
    owhaId: row.owha_id ?? undefined,
  }
}

export function useSupabaseOpponents(teamId: string | undefined) {
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!teamId) return
    fetchOpponents(supabase, teamId).then((data) => {
      setOpponents((data as DbOpponent[]).map(dbToOpponent))
      setLoading(false)
    })
  }, [supabase, teamId])

  const addOpponents = useCallback(async (newOpponents: Partial<Opponent>[]) => {
    if (!teamId) return
    const rows = newOpponents.map((o) => ({
      team_id: teamId,
      full_name: o.fullName || "",
      location: o.location || "",
      name: o.name || "",
      age_group: o.ageGroup || "",
      level: o.level || "",
      owha_id: o.owhaId || null,
    }))
    const { data } = await insertOpponents(supabase, rows)
    if (data.length > 0) {
      setOpponents((prev) => [...prev, ...(data as DbOpponent[]).map(dbToOpponent)])
    }
  }, [supabase, teamId])

  const updateOpponent = useCallback(async (opponentId: string, updates: Partial<Opponent>) => {
    const dbUpdates: Record<string, unknown> = {}
    if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName
    if (updates.location !== undefined) dbUpdates.location = updates.location
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.ageGroup !== undefined) dbUpdates.age_group = updates.ageGroup
    if (updates.level !== undefined) dbUpdates.level = updates.level
    if (updates.owhaId !== undefined) dbUpdates.owha_id = updates.owhaId || null

    const { error } = await updateOpponentQuery(supabase, opponentId, dbUpdates)
    if (!error) {
      setOpponents((prev) => prev.map((o) => o.id === opponentId ? { ...o, ...updates } : o))
    }
  }, [supabase])

  const removeOpponent = useCallback(async (opponentId: string) => {
    const { error } = await deleteOpponentQuery(supabase, opponentId)
    if (!error) {
      setOpponents((prev) => prev.filter((o) => o.id !== opponentId))
    }
  }, [supabase])

  const getById = useCallback((id: string) => {
    return opponents.find((o) => o.id === id)
  }, [opponents])

  return { opponents, addOpponents, updateOpponent, removeOpponent, getById, loading }
}
