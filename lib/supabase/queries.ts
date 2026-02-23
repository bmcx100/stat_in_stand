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

export async function clearGames(supabase: SupabaseClient, teamId: string) {
  const { error } = await supabase.from("games").delete().eq("team_id", teamId)
  return { error }
}

export async function clearGamesByType(supabase: SupabaseClient, teamId: string, gameType: string) {
  const { error } = await supabase.from("games").delete().eq("team_id", teamId).eq("game_type", gameType)
  return { error }
}

// === Standings ===

export async function fetchAllStandings(supabase: SupabaseClient, teamId: string) {
  const { data } = await supabase.from("standings").select("*").eq("team_id", teamId)
  return data ?? []
}

export async function upsertStandings(
  supabase: SupabaseClient,
  teamId: string,
  sourceUrl: string,
  rows: unknown[],
  standingsType = "regular"
) {
  const { error } = await supabase
    .from("standings")
    .upsert(
      { team_id: teamId, source_url: sourceUrl, rows, standings_type: standingsType, updated_at: new Date().toISOString() },
      { onConflict: "team_id,standings_type" }
    )
  return { error }
}

export async function deleteAllStandings(supabase: SupabaseClient, teamId: string) {
  const { error } = await supabase.from("standings").delete().eq("team_id", teamId)
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

// === OWHA config ===

export async function updateTeamOwhaUrl(supabase: SupabaseClient, teamId: string, url: string | null) {
  const { error } = await supabase
    .from("teams")
    .update({ owha_url_regular: url })
    .eq("id", teamId)
  return { error }
}

export async function updateTeamOwhaLastSynced(supabase: SupabaseClient, teamId: string) {
  const { error } = await supabase
    .from("teams")
    .update({ owha_last_synced_at: new Date().toISOString() })
    .eq("id", teamId)
  return { error }
}

export async function updatePlaydownOwha(
  supabase: SupabaseClient,
  teamId: string,
  fields: { owha_event?: boolean; owha_url?: string | null; owha_last_synced_at?: string }
) {
  const { error } = await supabase.from("playdowns").update(fields).eq("team_id", teamId)
  return { error }
}

export async function updateTournamentOwha(
  supabase: SupabaseClient,
  teamId: string,
  tournamentId: string,
  fields: { owha_event?: boolean; owha_url?: string | null; owha_last_synced_at?: string }
) {
  const { error } = await supabase
    .from("tournaments")
    .update(fields)
    .eq("team_id", teamId)
    .eq("tournament_id", tournamentId)
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
