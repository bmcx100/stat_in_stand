"use client"

import { useSyncExternalStore, useCallback } from "react"
import type { PlaydownData, PlaydownConfig, PlaydownGame } from "@/lib/types"

const STORAGE_KEY = "team-playdowns"

type PlaydownStore = Record<string, PlaydownData>

const EMPTY: PlaydownStore = {}
let cachedRaw: string | null = null
let cachedSnapshot: PlaydownStore = EMPTY

function getSnapshot(): PlaydownStore {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSnapshot = raw ? JSON.parse(raw) : EMPTY
  }
  return cachedSnapshot
}

function getServerSnapshot(): PlaydownStore {
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

function persist(store: PlaydownStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  cachedRaw = null
  emitChange()
}

export function usePlaydowns() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const getPlaydown = useCallback(
    (teamId: string): PlaydownData | null => store[teamId] ?? null,
    [store]
  )

  const setConfig = useCallback((teamId: string, config: PlaydownConfig) => {
    const current = getSnapshot()
    const existing = current[teamId]
    persist({
      ...current,
      [teamId]: { config, games: existing?.games ?? [] },
    })
  }, [])

  const addGame = useCallback((teamId: string, game: PlaydownGame) => {
    const current = getSnapshot()
    const existing = current[teamId]
    if (!existing) return
    persist({
      ...current,
      [teamId]: { ...existing, games: [...existing.games, game] },
    })
  }, [])

  const updateGame = useCallback((teamId: string, gameId: string, updates: Partial<PlaydownGame>) => {
    const current = getSnapshot()
    const existing = current[teamId]
    if (!existing) return
    persist({
      ...current,
      [teamId]: {
        ...existing,
        games: existing.games.map((g) => (g.id === gameId ? { ...g, ...updates } : g)),
      },
    })
  }, [])

  const removeGame = useCallback((teamId: string, gameId: string) => {
    const current = getSnapshot()
    const existing = current[teamId]
    if (!existing) return
    persist({
      ...current,
      [teamId]: {
        ...existing,
        games: existing.games.filter((g) => g.id !== gameId),
      },
    })
  }, [])

  const setGames = useCallback((teamId: string, games: PlaydownGame[]) => {
    const current = getSnapshot()
    const existing = current[teamId]
    if (!existing) return
    persist({
      ...current,
      [teamId]: { ...existing, games },
    })
  }, [])

  const clearPlaydown = useCallback((teamId: string) => {
    const current = { ...getSnapshot() }
    delete current[teamId]
    persist(current)
  }, [])

  return {
    playdowns: store,
    getPlaydown,
    setConfig,
    addGame,
    updateGame,
    removeGame,
    setGames,
    clearPlaydown,
  }
}
