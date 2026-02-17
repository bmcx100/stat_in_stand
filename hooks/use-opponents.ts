"use client"

import { useSyncExternalStore, useCallback } from "react"
import type { Opponent } from "@/lib/types"

const STORAGE_KEY = "opponents"

type OpponentStore = Record<string, Opponent>

const EMPTY: OpponentStore = {}
let cachedRaw: string | null = null
let cachedSnapshot: OpponentStore = EMPTY

function getSnapshot(): OpponentStore {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSnapshot = raw ? JSON.parse(raw) : EMPTY
  }
  return cachedSnapshot
}

function getServerSnapshot(): OpponentStore {
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

function persist(store: OpponentStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  cachedRaw = null
  emitChange()
}

export function useOpponents() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const getAll = useCallback(
    (): Opponent[] => Object.values(store),
    [store]
  )

  const getById = useCallback(
    (id: string): Opponent | null => store[id] ?? null,
    [store]
  )

  const addOpponents = useCallback((opponents: Opponent[]) => {
    const current = getSnapshot()
    const updated = { ...current }
    for (const opp of opponents) {
      updated[opp.id] = opp
    }
    persist(updated)
  }, [])

  const updateOpponent = useCallback((id: string, updates: Partial<Opponent>) => {
    const current = getSnapshot()
    const existing = current[id]
    if (!existing) return
    persist({ ...current, [id]: { ...existing, ...updates } })
  }, [])

  const removeOpponent = useCallback((id: string) => {
    const current = { ...getSnapshot() }
    delete current[id]
    persist(current)
  }, [])

  const clearAll = useCallback(() => {
    persist(EMPTY)
  }, [])

  return { opponents: store, getAll, getById, addOpponents, updateOpponent, removeOpponent, clearAll }
}
