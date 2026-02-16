"use client"

import { useSyncExternalStore, useCallback } from "react"

const STORAGE_KEY = "favorite-teams"

const EMPTY: string[] = []
let cachedRaw: string | null = null
let cachedSnapshot: string[] = EMPTY

function getSnapshot(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSnapshot = raw ? JSON.parse(raw) : EMPTY
  }
  return cachedSnapshot
}

function getServerSnapshot(): string[] {
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

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggleFavorite = useCallback((id: string) => {
    const current = getSnapshot()
    const next = current.includes(id)
      ? current.filter((f) => f !== id)
      : [...current, id]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    cachedRaw = null
    emitChange()
  }, [])

  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites]
  )

  return { favorites, toggleFavorite, isFavorite }
}
