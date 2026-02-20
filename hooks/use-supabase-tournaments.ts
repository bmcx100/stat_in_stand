"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchTournaments, upsertTournament, deleteTournament as deleteTournamentQuery } from "@/lib/supabase/queries"
import type { TournamentConfig, TournamentGame, TournamentData } from "@/lib/types"

type DbTournament = {
  id: string
  team_id: string
  tournament_id: string
  config: TournamentConfig
  games: TournamentGame[]
  updated_at: string
}

function dbToTournament(row: DbTournament): TournamentData {
  return { config: row.config, games: row.games }
}

export function useSupabaseTournaments(teamId: string | undefined) {
  const [tournaments, setTournaments] = useState<TournamentData[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!teamId) return
    fetchTournaments(supabase, teamId).then((data) => {
      setTournaments((data as DbTournament[]).map(dbToTournament))
      setLoading(false)
    })
  }, [supabase, teamId])

  const addTournament = useCallback(async (config: TournamentConfig) => {
    if (!teamId) return
    const { error } = await upsertTournament(supabase, teamId, config.id, config, [])
    if (!error) {
      setTournaments((prev) => [...prev, { config, games: [] }])
    }
  }, [supabase, teamId])

  const updateConfig = useCallback(async (tournamentId: string, config: TournamentConfig) => {
    if (!teamId) return
    const existing = tournaments.find((t) => t.config.id === tournamentId)
    const games = existing?.games ?? []
    const { error } = await upsertTournament(supabase, teamId, tournamentId, config, games)
    if (!error) {
      setTournaments((prev) => prev.map((t) =>
        t.config.id === tournamentId ? { config, games } : t
      ))
    }
  }, [supabase, teamId, tournaments])

  const setGames = useCallback(async (tournamentId: string, games: TournamentGame[]) => {
    if (!teamId) return
    const existing = tournaments.find((t) => t.config.id === tournamentId)
    if (!existing) return
    const { error } = await upsertTournament(supabase, teamId, tournamentId, existing.config, games)
    if (!error) {
      setTournaments((prev) => prev.map((t) =>
        t.config.id === tournamentId ? { ...t, games } : t
      ))
    }
  }, [supabase, teamId, tournaments])

  const addGame = useCallback(async (tournamentId: string, game: TournamentGame) => {
    const existing = tournaments.find((t) => t.config.id === tournamentId)
    if (!existing) return
    await setGames(tournamentId, [...existing.games, game])
  }, [tournaments, setGames])

  const updateGame = useCallback(async (tournamentId: string, gameId: string, updates: Partial<TournamentGame>) => {
    const existing = tournaments.find((t) => t.config.id === tournamentId)
    if (!existing) return
    const newGames = existing.games.map((g) => g.id === gameId ? { ...g, ...updates } : g)
    await setGames(tournamentId, newGames)
  }, [tournaments, setGames])

  const removeGame = useCallback(async (tournamentId: string, gameId: string) => {
    const existing = tournaments.find((t) => t.config.id === tournamentId)
    if (!existing) return
    const newGames = existing.games.filter((g) => g.id !== gameId)
    await setGames(tournamentId, newGames)
  }, [tournaments, setGames])

  const removeTournament = useCallback(async (tournamentId: string) => {
    if (!teamId) return
    const { error } = await deleteTournamentQuery(supabase, teamId, tournamentId)
    if (!error) {
      setTournaments((prev) => prev.filter((t) => t.config.id !== tournamentId))
    }
  }, [supabase, teamId])

  const getTournament = useCallback((tournamentId: string) => {
    return tournaments.find((t) => t.config.id === tournamentId) ?? null
  }, [tournaments])

  return {
    tournaments, addTournament, updateConfig, setGames,
    addGame, updateGame, removeGame, removeTournament, getTournament, loading
  }
}
