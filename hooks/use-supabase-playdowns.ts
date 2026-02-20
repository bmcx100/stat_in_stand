"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchPlaydown, upsertPlaydown, deletePlaydown as deletePlaydownQuery } from "@/lib/supabase/queries"
import type { PlaydownConfig, PlaydownGame, PlaydownData } from "@/lib/types"

type DbPlaydown = {
  id: string
  team_id: string
  config: PlaydownConfig
  games: PlaydownGame[]
  updated_at: string
}

export function useSupabasePlaydowns(teamId: string | undefined) {
  const [playdown, setPlaydown] = useState<PlaydownData | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!teamId) return
    fetchPlaydown(supabase, teamId).then((data) => {
      if (data) {
        const row = data as DbPlaydown
        setPlaydown({ config: row.config, games: row.games })
      }
      setLoading(false)
    })
  }, [supabase, teamId])

  const setConfig = useCallback(async (config: PlaydownConfig) => {
    if (!teamId) return
    const games = playdown?.games ?? []
    const { error } = await upsertPlaydown(supabase, teamId, config, games)
    if (!error) {
      setPlaydown({ config, games })
    }
  }, [supabase, teamId, playdown])

  const setGames = useCallback(async (games: PlaydownGame[]) => {
    if (!teamId || !playdown) return
    const { error } = await upsertPlaydown(supabase, teamId, playdown.config, games)
    if (!error) {
      setPlaydown({ config: playdown.config, games })
    }
  }, [supabase, teamId, playdown])

  const addGame = useCallback(async (game: PlaydownGame) => {
    if (!playdown) return
    const newGames = [...playdown.games, game]
    await setGames(newGames)
  }, [playdown, setGames])

  const updateGame = useCallback(async (gameId: string, updates: Partial<PlaydownGame>) => {
    if (!playdown) return
    const newGames = playdown.games.map((g) => g.id === gameId ? { ...g, ...updates } : g)
    await setGames(newGames)
  }, [playdown, setGames])

  const removeGame = useCallback(async (gameId: string) => {
    if (!playdown) return
    const newGames = playdown.games.filter((g) => g.id !== gameId)
    await setGames(newGames)
  }, [playdown, setGames])

  const clearPlaydown = useCallback(async () => {
    if (!teamId) return
    const { error } = await deletePlaydownQuery(supabase, teamId)
    if (!error) {
      setPlaydown(null)
    }
  }, [supabase, teamId])

  return { playdown, setConfig, setGames, addGame, updateGame, removeGame, clearPlaydown, loading }
}
