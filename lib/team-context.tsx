"use client"

import { createContext, useContext } from "react"
import type { DbTeam } from "@/hooks/use-supabase-teams"

const TeamContext = createContext<DbTeam | null>(null)

export function TeamProvider({ team, children }: { team: DbTeam; children: React.ReactNode }) {
  return <TeamContext.Provider value={team}>{children}</TeamContext.Provider>
}

export function useTeamContext() {
  const team = useContext(TeamContext)
  if (!team) throw new Error("useTeamContext must be used within TeamProvider")
  return team
}
