export type GameType =
  | "unlabeled"
  | "regular"
  | "tournament"
  | "exhibition"
  | "playoffs"
  | "playdowns"
  | "provincials"

export type ImportSource = "owha" | "mhr" | "teamsnap" | "manual"

export type Game = {
  id: string
  teamId: string
  date: string
  time: string
  opponent: string
  location: string
  teamScore: number | null
  opponentScore: number | null
  result: "W" | "L" | "T" | null
  gameType: GameType
  source: ImportSource
  sourceGameId: string
  played: boolean
  home?: boolean
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
}

export type PlaydownConfig = {
  teamId: string
  totalTeams: number
  qualifyingSpots: number
  gamesPerMatchup: number
  teams: PlaydownTeam[]
  teamNames?: string[]  // OWHA loop team names, populated by standings sync
  allTeamsAdvance?: boolean  // true when SubDivName says "All Teams Advance"
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
  resultType?: "regulation" | "overtime" | "shootout"
  homePim?: number
  awayPim?: number
}

export type PlaydownStandingsRow = {
  teamId: string
  teamName: string
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
  qualifies: boolean
  tiedUnresolved: boolean
}

export type PlaydownData = {
  config: PlaydownConfig
  games: PlaydownGame[]
}

export type TiebreakerResolution = {
  teams: [string, string]
  teamNames: [string, string]
  resolvedBy: string
  detail: string
  tiedValues: Record<string, string>
}

export type QualificationStatus = "locked" | "alive" | "out"

export type QualificationRow = PlaydownStandingsRow & {
  maxPts: number
  gamesRemaining: number
  status: QualificationStatus
}

// === Tournaments ===

export type TournamentTeam = {
  id: string
  name: string
  poolId: string
}

export type TournamentPool = {
  id: string
  name: string
  teamIds: string[]
  qualifyingSpots: number
}

export type TiebreakerKey =
  | "wins"
  | "head-to-head"
  | "goal-differential"
  | "goals-allowed"
  | "goals-for"

export type TournamentConfig = {
  id: string
  teamId: string
  name: string
  location: string
  startDate: string
  endDate: string
  pools: TournamentPool[]
  teams: TournamentTeam[]
  gamesPerMatchup: number
  tiebreakerOrder: TiebreakerKey[]
  eliminationEnabled: boolean
  consolationEnabled: boolean
}

export type TournamentRound =
  | "pool"
  | "quarterfinal"
  | "semifinal"
  | "final"
  | "consolation"
  | "bronze"

export type TournamentGame = {
  id: string
  teamId: string
  tournamentId: string
  date: string
  time: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  location: string
  played: boolean
  round: TournamentRound
  poolId?: string
}

export type TournamentStandingsRow = {
  teamId: string
  teamName: string
  poolId: string
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
  qualifies: boolean
  tiedUnresolved: boolean
}

export type TournamentData = {
  config: TournamentConfig
  games: TournamentGame[]
}

// === MHR (MyHockeyRankings) ===

export type MhrRankingEntry = {
  team_nbr: number
  name: string
  ranking: number
  week: number
  difference: number
  gp: number
  wins: number
  losses: number
  ties: number
  gf: number
  ga: number
  rating: number
  sched: number
  agd: number
}
