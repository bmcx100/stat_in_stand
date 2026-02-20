"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchTeams, fetchTeamBySlug } from "@/lib/supabase/queries"

export type DbTeam = {
  id: string
  slug: string
  organization: string
  name: string
  age_group: string
  level: string
  banner_url: string | null
  published: boolean
  created_at: string
}

export function useTeams() {
  const [teams, setTeams] = useState<DbTeam[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchTeams(supabase).then((data) => {
      setTeams(data as DbTeam[])
      setLoading(false)
    })
  }, [supabase])

  return { teams, loading }
}

export function useTeam(slug: string) {
  const [team, setTeam] = useState<DbTeam | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchTeamBySlug(supabase, slug).then((data) => {
      setTeam(data as DbTeam | null)
      setLoading(false)
    })
  }, [supabase, slug])

  return { team, loading }
}
