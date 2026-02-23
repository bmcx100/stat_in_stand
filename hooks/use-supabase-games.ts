"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchGames, insertGames, updateGame as updateGameQuery, deleteGame as deleteGameQuery, clearGames as clearGamesQuery, clearGamesByType as clearGamesByTypeQuery } from "@/lib/supabase/queries"
import type { Game } from "@/lib/types"

type DbGame = {
  id: string
  team_id: string
  date: string
  time: string
  opponent_name: string
  location: string
  team_score: number | null
  opponent_score: number | null
  result: string | null
  game_type: string
  source: string
  source_game_id: string
  played: boolean
  home: boolean | null
  created_at: string
}

function dbToGame(row: DbGame): Game {
  return {
    id: row.id,
    teamId: row.team_id,
    date: row.date,
    time: row.time || "",
    opponent: row.opponent_name,
    location: row.location || "",
    teamScore: row.team_score,
    opponentScore: row.opponent_score,
    result: row.result as Game["result"],
    gameType: row.game_type as Game["gameType"],
    source: row.source as Game["source"],
    sourceGameId: row.source_game_id || "",
    played: row.played,
    home: row.home ?? undefined,
  }
}

function gameToDb(game: Partial<Game> & { teamId: string }) {
  return {
    team_id: game.teamId,
    date: game.date,
    time: game.time || "",
    opponent_name: game.opponent || "",
    location: game.location || "",
    team_score: game.teamScore ?? null,
    opponent_score: game.opponentScore ?? null,
    result: game.result || null,
    game_type: game.gameType || "regular",
    source: game.source || "manual",
    source_game_id: game.sourceGameId || "",
    played: game.played ?? false,
    home: game.home ?? null,
  }
}

export function useSupabaseGames(teamId: string | undefined) {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!teamId) return
    fetchGames(supabase, teamId).then((data) => {
      setGames((data as DbGame[]).map(dbToGame))
      setLoading(false)
    })
  }, [supabase, teamId])

  const addGames = useCallback(async (newGames: Partial<Game>[]) => {
    if (!teamId) return
    const rows = newGames.map((g) => gameToDb({ ...g, teamId }))
    const { data } = await insertGames(supabase, rows)
    if (data.length > 0) {
      setGames((prev) => [...(data as DbGame[]).map(dbToGame), ...prev])
    }
  }, [supabase, teamId])

  const updateGame = useCallback(async (gameId: string, updates: Partial<Game>) => {
    const dbUpdates: Record<string, unknown> = {}
    if (updates.teamScore !== undefined) dbUpdates.team_score = updates.teamScore
    if (updates.opponentScore !== undefined) dbUpdates.opponent_score = updates.opponentScore
    if (updates.result !== undefined) dbUpdates.result = updates.result
    if (updates.played !== undefined) dbUpdates.played = updates.played
    if (updates.gameType !== undefined) dbUpdates.game_type = updates.gameType
    if (updates.opponent !== undefined) dbUpdates.opponent_name = updates.opponent
    if (updates.location !== undefined) dbUpdates.location = updates.location
    if (updates.time !== undefined) dbUpdates.time = updates.time
    if (updates.date !== undefined) dbUpdates.date = updates.date
    if (updates.home !== undefined) dbUpdates.home = updates.home ?? null

    const { error } = await updateGameQuery(supabase, gameId, dbUpdates)
    if (!error) {
      setGames((prev) => prev.map((g) => g.id === gameId ? { ...g, ...updates } : g))
    }
  }, [supabase])

  const removeGame = useCallback(async (gameId: string) => {
    const { error } = await deleteGameQuery(supabase, gameId)
    if (!error) {
      setGames((prev) => prev.filter((g) => g.id !== gameId))
    }
  }, [supabase])

  const clearGames = useCallback(async () => {
    if (!teamId) return
    const { error } = await clearGamesQuery(supabase, teamId)
    if (!error) {
      setGames([])
    }
  }, [supabase, teamId])

  const clearByType = useCallback(async (gameType: string) => {
    if (!teamId) return
    const { error } = await clearGamesByTypeQuery(supabase, teamId, gameType)
    if (!error) {
      setGames((prev) => prev.filter((g) => g.gameType !== gameType))
    }
  }, [supabase, teamId])

  return { games, addGames, updateGame, removeGame, clearGames, clearByType, loading }
}
