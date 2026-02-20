import type { SupabaseClient } from "@supabase/supabase-js"

// === Teams ===

export async function fetchTeams(supabase: SupabaseClient, publishedOnly = true) {
  let query = supabase.from("teams").select("*").order("organization")
  if (publishedOnly) query = query.eq("published", true)
  const { data } = await query
  return data ?? []
}

export async function fetchTeamBySlug(supabase: SupabaseClient, slug: string) {
  const { data } = await supabase.from("teams").select("*").eq("slug", slug).single()
  return data
}

// === Games ===

export async function fetchGames(supabase: SupabaseClient, teamId: string) {
  const { data } = await supabase
    .from("games")
    .select("*")
    .eq("team_id", teamId)
    .order("date", { ascending: false })
  return data ?? []
}

export async function insertGames(supabase: SupabaseClient, games: Record<string, unknown>[]) {
  const { data, error } = await supabase.from("games").insert(games).select()
  return { data: data ?? [], error }
}

export async function updateGame(supabase: SupabaseClient, gameId: string, updates: Record<string, unknown>) {
  const { error } = await supabase.from("games").update(updates).eq("id", gameId)
  return { error }
}

export async function deleteGame(supabase: SupabaseClient, gameId: string) {
  const { error } = await supabase.from("games").delete().eq("id", gameId)
  return { error }
}

// === Standings ===

export async function fetchStandings(supabase: SupabaseClient, teamId: string) {
  const { data } = await supabase.from("standings").select("*").eq("team_id", teamId).single()
  return data
}

export async function upsertStandings(
  supabase: SupabaseClient,
  teamId: string,
  sourceUrl: string,
  rows: unknown[]
) {
  const { error } = await supabase
    .from("standings")
    .upsert({ team_id: teamId, source_url: sourceUrl, rows, updated_at: new Date().toISOString() }, { onConflict: "team_id" })
  return { error }
}

// === Opponents ===

export async function fetchOpponents(supabase: SupabaseClient, teamId: string) {
  const { data } = await supabase
    .from("opponents")
    .select("*")
    .eq("team_id", teamId)
    .order("full_name")
  return data ?? []
}

export async function insertOpponents(supabase: SupabaseClient, opponents: Record<string, unknown>[]) {
  const { data, error } = await supabase.from("opponents").insert(opponents).select()
  return { data: data ?? [], error }
}

export async function updateOpponent(supabase: SupabaseClient, opponentId: string, updates: Record<string, unknown>) {
  const { error } = await supabase.from("opponents").update(updates).eq("id", opponentId)
  return { error }
}

export async function deleteOpponent(supabase: SupabaseClient, opponentId: string) {
  const { error } = await supabase.from("opponents").delete().eq("id", opponentId)
  return { error }
}

// === Playdowns ===

export async function fetchPlaydown(supabase: SupabaseClient, teamId: string) {
  const { data } = await supabase.from("playdowns").select("*").eq("team_id", teamId).single()
  return data
}

export async function upsertPlaydown(
  supabase: SupabaseClient,
  teamId: string,
  config: unknown,
  games: unknown[]
) {
  const { error } = await supabase
    .from("playdowns")
    .upsert({ team_id: teamId, config, games, updated_at: new Date().toISOString() }, { onConflict: "team_id" })
  return { error }
}

export async function deletePlaydown(supabase: SupabaseClient, teamId: string) {
  const { error } = await supabase.from("playdowns").delete().eq("team_id", teamId)
  return { error }
}

// === Tournaments ===

export async function fetchTournaments(supabase: SupabaseClient, teamId: string) {
  const { data } = await supabase
    .from("tournaments")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
  return data ?? []
}

export async function fetchTournament(supabase: SupabaseClient, teamId: string, tournamentId: string) {
  const { data } = await supabase
    .from("tournaments")
    .select("*")
    .eq("team_id", teamId)
    .eq("tournament_id", tournamentId)
    .single()
  return data
}

export async function upsertTournament(
  supabase: SupabaseClient,
  teamId: string,
  tournamentId: string,
  config: unknown,
  games: unknown[]
) {
  const { error } = await supabase
    .from("tournaments")
    .upsert(
      { team_id: teamId, tournament_id: tournamentId, config, games, updated_at: new Date().toISOString() },
      { onConflict: "team_id,tournament_id" }
    )
  return { error }
}

export async function deleteTournament(supabase: SupabaseClient, teamId: string, tournamentId: string) {
  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("team_id", teamId)
    .eq("tournament_id", tournamentId)
  return { error }
}
