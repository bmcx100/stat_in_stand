export type GameType =
  | "unlabeled"
  | "regular"
  | "tournament"
  | "exhibition"
  | "playoffs"
  | "playdowns"
  | "provincials"

export type ImportSource = "owha" | "mhr" | "manual"

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
