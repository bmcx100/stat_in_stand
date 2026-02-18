"use client"

import { useSyncExternalStore, useCallback } from "react"
import type { TournamentData, TournamentConfig, TournamentGame } from "@/lib/types"

const STORAGE_KEY = "team-tournaments"

type TournamentStore = Record<string, TournamentData[]>

const EMPTY: TournamentStore = {}
let cachedRaw: string | null = null
let cachedSnapshot: TournamentStore = EMPTY

function getSnapshot(): TournamentStore {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSnapshot = raw ? JSON.parse(raw) : EMPTY
  }
  return cachedSnapshot
}

function getServerSnapshot(): TournamentStore {
  return EMPTY
}

let listeners: Array<() => void> = []

function subscribe(listener: () => void) {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function persist(store: TournamentStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  cachedRaw = null
  emitChange()
}

export function useTournaments() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const getTournaments = useCallback(
    (teamId: string): TournamentData[] => store[teamId] ?? [],
    [store]
  )

  const getTournament = useCallback(
    (teamId: string, tournamentId: string): TournamentData | null => {
      const list = store[teamId] ?? []
      return list.find((t) => t.config.id === tournamentId) ?? null
    },
    [store]
  )

  const addTournament = useCallback((teamId: string, config: TournamentConfig) => {
    const current = getSnapshot()
    const list = current[teamId] ?? []
    persist({
      ...current,
      [teamId]: [...list, { config, games: [] }],
    })
  }, [])

  const updateConfig = useCallback((teamId: string, tournamentId: string, config: TournamentConfig) => {
    const current = getSnapshot()
    const list = current[teamId] ?? []
    persist({
      ...current,
      [teamId]: list.map((t) =>
        t.config.id === tournamentId ? { ...t, config } : t
      ),
    })
  }, [])

  const addGame = useCallback((teamId: string, tournamentId: string, game: TournamentGame) => {
    const current = getSnapshot()
    const list = current[teamId] ?? []
    persist({
      ...current,
      [teamId]: list.map((t) =>
        t.config.id === tournamentId ? { ...t, games: [...t.games, game] } : t
      ),
    })
  }, [])

  const updateGame = useCallback((teamId: string, tournamentId: string, gameId: string, updates: Partial<TournamentGame>) => {
    const current = getSnapshot()
    const list = current[teamId] ?? []
    persist({
      ...current,
      [teamId]: list.map((t) =>
        t.config.id === tournamentId
          ? { ...t, games: t.games.map((g) => (g.id === gameId ? { ...g, ...updates } : g)) }
          : t
      ),
    })
  }, [])

  const removeGame = useCallback((teamId: string, tournamentId: string, gameId: string) => {
    const current = getSnapshot()
    const list = current[teamId] ?? []
    persist({
      ...current,
      [teamId]: list.map((t) =>
        t.config.id === tournamentId
          ? { ...t, games: t.games.filter((g) => g.id !== gameId) }
          : t
      ),
    })
  }, [])

  const setGames = useCallback((teamId: string, tournamentId: string, games: TournamentGame[]) => {
    const current = getSnapshot()
    const list = current[teamId] ?? []
    persist({
      ...current,
      [teamId]: list.map((t) =>
        t.config.id === tournamentId ? { ...t, games } : t
      ),
    })
  }, [])

  const removeTournament = useCallback((teamId: string, tournamentId: string) => {
    const current = getSnapshot()
    const list = current[teamId] ?? []
    const filtered = list.filter((t) => t.config.id !== tournamentId)
    if (filtered.length === 0) {
      const next = { ...current }
      delete next[teamId]
      persist(next)
    } else {
      persist({ ...current, [teamId]: filtered })
    }
  }, [])

  return {
    tournaments: store,
    getTournaments,
    getTournament,
    addTournament,
    updateConfig,
    addGame,
    updateGame,
    removeGame,
    setGames,
    removeTournament,
  }
}
