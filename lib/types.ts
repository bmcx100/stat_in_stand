export type GameType =
  | "unlabeled"
  | "regular"
  | "tournament"
  | "exhibition"
  | "playoffs"
  | "playdowns"
  | "provincials"

export type ImportSource = "owha" | "mhr" | "teamsnap" | "manual"

export type Opponent = {
  id: string
  fullName: string
  location: string
  name: string
  ageGroup: string
  level: string
  owhaId?: string
  notes?: string
}

export type Game = {
  id: string
  teamId: string
  date: string
  time: string
  opponent: string
  opponentId?: string
  location: string
  teamScore: number | null
  opponentScore: number | null
  result: "W" | "L" | "T" | null
  gameType: GameType
  source: ImportSource
  sourceGameId: string
  played: boolean
  tournamentName?: string
}

export type StandingsRow = {
  teamName: string
  owhaId: string
  gp: number
  w: number
  l: number
  t: number
  otl: number
  sol: number
  pts: number
  gf: number
  ga: number
  diff: number
  pim: number
  winPct: number
}

export type StandingsData = {
  teamId: string
  sourceUrl: string
  rows: StandingsRow[]
}

// === Playdowns ===

export type PlaydownTeam = {
  id: string
  name: string
  opponentId?: string
}

export type PlaydownConfig = {
  teamId: string
  totalTeams: number
  qualifyingSpots: number
  gamesPerMatchup: number
  teams: PlaydownTeam[]
}

export type PlaydownGame = {
  id: string
  teamId: string
  date: string
  time: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  location: string
  played: boolean
}

export type PlaydownStandingsRow = {
  teamId: string
  teamName: string
  gp: number
  w: number
  l: number
  t: number
  pts: number
  gf: number
  ga: number
  diff: number
  qualifies: boolean
}

export type PlaydownData = {
  config: PlaydownConfig
  games: PlaydownGame[]
}
