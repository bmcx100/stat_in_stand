"use client"

import { useSyncExternalStore, useCallback } from "react"
import type { StandingsData } from "@/lib/types"

const STORAGE_KEY = "team-standings"

type StandingsStore = Record<string, StandingsData>

const EMPTY: StandingsStore = {}
let cachedRaw: string | null = null
let cachedSnapshot: StandingsStore = EMPTY

function getSnapshot(): StandingsStore {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSnapshot = raw ? JSON.parse(raw) : EMPTY
  }
  return cachedSnapshot
}

function getServerSnapshot(): StandingsStore {
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

function persist(store: StandingsStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  cachedRaw = null
  emitChange()
}

export function useStandings() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const getStandings = useCallback(
    (teamId: string): StandingsData | null => store[teamId] ?? null,
    [store]
  )

  const setStandings = useCallback((teamId: string, data: StandingsData) => {
    const current = getSnapshot()
    persist({ ...current, [teamId]: data })
  }, [])

  const clearTeamStandings = useCallback((teamId: string) => {
    const current = { ...getSnapshot() }
    delete current[teamId]
    persist(current)
  }, [])

  return { standings: store, getStandings, setStandings, clearTeamStandings }
}
