"use client"

import { useSyncExternalStore, useCallback } from "react"
import type { Game } from "@/lib/types"

const STORAGE_KEY = "team-games"

type GamesStore = Record<string, Game[]>

const EMPTY: GamesStore = {}
let cachedRaw: string | null = null
let cachedSnapshot: GamesStore = EMPTY

function getSnapshot(): GamesStore {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSnapshot = raw ? JSON.parse(raw) : EMPTY
  }
  return cachedSnapshot
}

function getServerSnapshot(): GamesStore {
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

function persist(store: GamesStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  cachedRaw = null
  emitChange()
}

export function useGames() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const getTeamGames = useCallback(
    (teamId: string): Game[] => store[teamId] ?? [],
    [store]
  )

  const addGames = useCallback((teamId: string, games: Game[]) => {
    const current = getSnapshot()
    const existing = current[teamId] ?? []
    const merged = [...existing, ...games]
    persist({ ...current, [teamId]: merged })
  }, [])

  const addGame = useCallback((teamId: string, game: Game) => {
    const current = getSnapshot()
    const existing = current[teamId] ?? []
    persist({ ...current, [teamId]: [...existing, game] })
  }, [])

  const removeGame = useCallback((teamId: string, gameId: string) => {
    const current = getSnapshot()
    const existing = current[teamId] ?? []
    persist({ ...current, [teamId]: existing.filter((g) => g.id !== gameId) })
  }, [])

  const updateGame = useCallback((teamId: string, gameId: string, updates: Partial<Game>) => {
    const current = getSnapshot()
    const existing = current[teamId] ?? []
    persist({
      ...current,
      [teamId]: existing.map((g) => (g.id === gameId ? { ...g, ...updates } : g)),
    })
  }, [])

  const clearTeamGames = useCallback((teamId: string) => {
    const current = { ...getSnapshot() }
    delete current[teamId]
    persist(current)
  }, [])

  return { games: store, getTeamGames, addGames, addGame, removeGame, updateGame, clearTeamGames }
}
