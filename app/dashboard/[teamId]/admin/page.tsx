"use client"

import { use, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Plus, Download, Upload, Trash2, X, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TEAMS } from "@/lib/teams"
import { useGames } from "@/hooks/use-games"
import { useStandings } from "@/hooks/use-standings"
import { useOpponents } from "@/hooks/use-opponents"
import {
  parseOwhaStandings,
  parseOwhaGames,
  parseMhrGames,
  parseOwhaTeamList,
  parseTeamsnapGames,
  parsePlaydownGames,
  matchOpponent,
  findDuplicates,
} from "@/lib/parsers"
import type { DuplicateInfo } from "@/lib/parsers"
import { downloadBackup, restoreBackup } from "@/lib/backup"
import { usePlaydowns } from "@/hooks/use-playdowns"
import { useTournaments } from "@/hooks/use-tournaments"
import { computePlaydownStandings } from "@/lib/playdowns"
import { computePoolStandings } from "@/lib/tournaments"
import type { Game, GameType, Opponent, StandingsRow, PlaydownConfig, PlaydownGame, PlaydownTeam, TournamentConfig, TournamentGame, TournamentTeam, TournamentPool, TiebreakerKey } from "@/lib/types"

type AdminTab = "config" | "data"
type ConfigSubTab = "events" | "blank"
type EventsSubTab = "tournaments" | "playdowns" | "playoffs"
type DataSubTab = "import" | "edit" | "backup"
type EditSubTab = "games" | "opponents"
type ImportTab = "owha-standings" | "owha-games" | "mhr-games" | "teamsnap-games" | "owha-teams"

const GAME_TYPE_OPTIONS: Array<{ value: GameType; label: string }> = [
  { value: "unlabeled", label: "Unlabeled" },
  { value: "regular", label: "Regular Season" },
  { value: "tournament", label: "Tournament" },
  { value: "exhibition", label: "Exhibition" },
  { value: "playoffs", label: "Playoffs" },
  { value: "playdowns", label: "Playdowns" },
  { value: "provincials", label: "Provincials" },
]

// === Opponents Tab ===

function ManualAddOpponent({ onAdd }: { onAdd: (opp: Opponent) => void }) {
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState("")
  const [location, setLocation] = useState("")
  const [name, setName] = useState("")
  const [owhaId, setOwhaId] = useState("")
  const [notes, setNotes] = useState("")

  function handleSubmit() {
    if (!fullName.trim()) return
    const id = `opp-manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    onAdd({
      id,
      fullName: fullName.trim(),
      location: location.trim(),
      name: name.trim(),
      ageGroup: "",
      level: "",
      owhaId: owhaId.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    setFullName("")
    setLocation("")
    setName("")
    setOwhaId("")
    setNotes("")
    setOpen(false)
  }

  if (!open) {
    return (
      <button className="dashboard-nav-link" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add Opponent Manually
      </button>
    )
  }

  return (
    <div className="import-preview">
      <p className="text-sm font-medium">Add New Opponent</p>
      <div className="mt-2 flex flex-col gap-2">
        <input
          type="text"
          className="game-form-input"
          placeholder="Full Name *"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <input
          type="text"
          className="game-form-input"
          placeholder="Location (city/area)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <input
          type="text"
          className="game-form-input"
          placeholder="Team Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          className="game-form-input"
          placeholder="OWHA ID (optional)"
          value={owhaId}
          onChange={(e) => setOwhaId(e.target.value)}
        />
        <input
          type="text"
          className="game-form-input"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={!fullName.trim()}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

function OpponentsTab() {
  const { getAll, addOpponents, updateOpponent, removeOpponent, clearAll } = useOpponents()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const opponents = getAll().sort((a, b) => a.fullName.localeCompare(b.fullName))

  const nameCounts = new Map<string, number>()
  for (const opp of opponents) {
    nameCounts.set(opp.fullName, (nameCounts.get(opp.fullName) ?? 0) + 1)
  }

  return (
    <>
      <div className="flex gap-2">
        <ManualAddOpponent onAdd={(opp) => addOpponents([opp])} />
        {opponents.length > 0 && (
          !confirmClearAll ? (
            <button
              className="dashboard-nav-link text-destructive"
              onClick={() => setConfirmClearAll(true)}
            >
              <Trash2 className="size-4" />
              Clear All Opponents
            </button>
          ) : (
            <div className="import-preview">
              <p className="text-sm font-medium">
                Remove all {opponents.length} opponents from registry?
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { clearAll(); setConfirmClearAll(false) }}
                >
                  Yes, Clear All
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmClearAll(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )
        )}
      </div>

      {opponents.length === 0 ? (
        <p className="dashboard-record-label">No opponents in registry.</p>
      ) : (
      <div className="games-table-wrap">
      <table className="games-table">
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Location</th>
            <th>Name</th>
            <th>OWHA ID</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {opponents.map((opp) => {
            const isDupe = (nameCounts.get(opp.fullName) ?? 0) > 1
            return (
              <tr key={opp.id} className={isDupe ? "bg-yellow-50 dark:bg-yellow-950/30" : ""}>
                <td>
                  <span className="text-xs font-medium">
                    {opp.fullName}
                    {isDupe && <span className="text-yellow-600"> (multiple)</span>}
                  </span>
                </td>
                <td>
                  <input
                    type="text"
                    className="games-table-input"
                    placeholder="City/Area"
                    defaultValue={opp.location}
                    onBlur={(e) => {
                      if (e.target.value !== opp.location) {
                        updateOpponent(opp.id, { location: e.target.value.trim() })
                      }
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="games-table-input"
                    placeholder="Team Name"
                    defaultValue={opp.name}
                    onBlur={(e) => {
                      if (e.target.value !== opp.name) {
                        updateOpponent(opp.id, { name: e.target.value.trim() })
                      }
                    }}
                  />
                </td>
                <td>
                  <span className="text-xs text-muted-foreground">
                    {opp.owhaId ?? "—"}
                  </span>
                </td>
                <td>
                  <input
                    type="text"
                    className="games-table-input"
                    placeholder="—"
                    defaultValue={opp.notes ?? ""}
                    onBlur={(e) => {
                      const val = e.target.value.trim() || undefined
                      if (val !== (opp.notes ?? undefined)) {
                        updateOpponent(opp.id, { notes: val })
                      }
                    }}
                  />
                </td>
                <td>
                  {confirmDeleteId === opp.id ? (
                    <div className="flex gap-1">
                      <button
                        className="games-table-delete"
                        onClick={() => { removeOpponent(opp.id); setConfirmDeleteId(null) }}
                        title="Confirm delete"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </button>
                      <button
                        className="games-table-delete"
                        onClick={() => setConfirmDeleteId(null)}
                        title="Cancel"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="games-table-delete"
                      onClick={() => setConfirmDeleteId(opp.id)}
                      title="Delete opponent"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
      )}
    </>
  )
}

// === Games Tab ===

function GamesTab({ teamId }: { teamId: string }) {
  const { getTeamGames, updateGame, removeGame } = useGames()
  const { getById } = useOpponents()
  const { getTournaments } = useTournaments()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const tournamentNames = getTournaments(teamId).map((t) => t.config.name)

  const games = getTeamGames(teamId)
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  function handleUpdate(gameId: string, updates: Partial<Game>) {
    updateGame(teamId, gameId, updates)
  }

  function handleDelete(gameId: string) {
    removeGame(teamId, gameId)
    setConfirmDeleteId(null)
  }

  function opponentDisplay(game: Game): string {
    if (game.opponentId) {
      const opp = getById(game.opponentId)
      if (opp) {
        if (opp.location && opp.name) return `${opp.location} ${opp.name}`
        return opp.fullName
      }
    }
    return game.opponent
  }

  return (
    <>
      <Link href={`/dashboard/${teamId}/add-game`} className="dashboard-nav-link">
        <Plus className="size-4" />
        Add Game Manually
      </Link>

      {games.length === 0 ? (
        <p className="dashboard-record-label">No games yet</p>
      ) : (
        <div className="games-table-wrap">
          <table className="games-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opponent</th>
                <th>Loc</th>
                <th>Score</th>
                <th>R</th>
                <th>Type</th>
                <th>Tournament</th>
                <th>Src</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr key={game.id}>
                  <td>
                    <input
                      type="date"
                      className="games-table-input"
                      defaultValue={game.date}
                      onBlur={(e) => {
                        if (e.target.value !== game.date) {
                          handleUpdate(game.id, { date: e.target.value })
                        }
                      }}
                    />
                  </td>
                  <td>
                    <span className="text-xs">{opponentDisplay(game)}</span>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="games-table-input"
                      defaultValue={game.location}
                      onBlur={(e) => {
                        if (e.target.value !== game.location) {
                          handleUpdate(game.id, { location: e.target.value })
                        }
                      }}
                    />
                  </td>
                  <td>
                    <span className="whitespace-nowrap">
                      {game.played
                        ? `${game.teamScore}-${game.opponentScore}`
                        : "—"}
                    </span>
                  </td>
                  <td>
                    <span className={
                      game.result === "W" ? "result-badge result-badge-w"
                        : game.result === "L" ? "result-badge result-badge-l"
                        : game.result === "T" ? "result-badge result-badge-t"
                        : ""
                    }>
                      {game.result ?? "—"}
                    </span>
                  </td>
                  <td>
                    <select
                      className="games-table-select"
                      defaultValue={game.gameType}
                      onChange={(e) => {
                        handleUpdate(game.id, { gameType: e.target.value as GameType })
                      }}
                    >
                      {GAME_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {game.gameType === "tournament" && tournamentNames.length > 0 ? (
                      <select
                        className="games-table-select"
                        value={game.tournamentName ?? ""}
                        onChange={(e) => {
                          const val = e.target.value || undefined
                          handleUpdate(game.id, { tournamentName: val })
                        }}
                      >
                        <option value="">—</option>
                        {tournamentNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="games-table-input"
                        placeholder="—"
                        defaultValue={game.tournamentName ?? ""}
                        onBlur={(e) => {
                          const val = e.target.value.trim() || undefined
                          if (val !== (game.tournamentName ?? undefined)) {
                            handleUpdate(game.id, { tournamentName: val })
                          }
                        }}
                      />
                    )}
                  </td>
                  <td>
                    <span className="game-type-badge">{game.source}</span>
                  </td>
                  <td>
                    {confirmDeleteId === game.id ? (
                      <div className="flex gap-1">
                        <button
                          className="games-table-delete"
                          onClick={() => handleDelete(game.id)}
                          title="Confirm delete"
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </button>
                        <button
                          className="games-table-delete"
                          onClick={() => setConfirmDeleteId(null)}
                          title="Cancel"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="games-table-delete"
                        onClick={() => setConfirmDeleteId(game.id)}
                        title="Delete game"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// === Data Management Tab ===

function DataTab({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { clearTeamGames } = useGames()
  const { clearTeamStandings } = useStandings()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)

  return (
    <>
      <div className="dashboard-nav">
        <button className="dashboard-nav-link" onClick={() => downloadBackup()}>
          <Download className="size-4" />
          Backup All Data
        </button>
        <button
          className="dashboard-nav-link"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-4" />
          Restore from Backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const result = await restoreBackup(file)
            if (result.success) {
              setRestoreMsg("Backup restored. Reload the page to see changes.")
            } else {
              setRestoreMsg(result.error ?? "Restore failed")
            }
            e.target.value = ""
          }}
        />
      </div>

      {restoreMsg && (
        <div className="import-preview">
          <p className="text-sm">{restoreMsg}</p>
          {restoreMsg.includes("Reload") && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
              Reload Now
            </Button>
          )}
        </div>
      )}

      <div className="dashboard-nav">
        {!confirmClear ? (
          <button
            className="dashboard-nav-link text-destructive"
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="size-4" />
            Clear Team Data
          </button>
        ) : (
          <div className="import-preview">
            <p className="text-sm font-medium">
              Remove all games and standings for {teamName}?
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  clearTeamGames(teamId)
                  clearTeamStandings(teamId)
                  setConfirmClear(false)
                }}
              >
                Yes, Clear
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// === MHR Opponent Matching ===

type MhrMatchState = {
  gameIndex: number
  mhrName: string
  matches: Opponent[]
  resolved: boolean
  opponentId?: string
  newOpponent?: Partial<Opponent>
}

function MhrMatchResolver({
  state,
  onResolve,
}: {
  state: MhrMatchState
  onResolve: (opponentId: string) => void
}) {
  if (state.matches.length > 1) {
    return (
      <div className="import-preview">
        <p className="text-xs font-medium">
          Multiple matches for &quot;{state.mhrName}&quot; — pick one:
        </p>
        <div className="mt-1 flex flex-col gap-1">
          {state.matches.map((opp) => (
            <button
              key={opp.id}
              className="text-left text-xs rounded border px-2 py-1 hover:bg-accent"
              onClick={() => onResolve(opp.id)}
            >
              {opp.fullName} {opp.owhaId ? `#${opp.owhaId}` : ""}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return null
}

function MhrUnmatchedResolver({
  mhrName,
  onMapExisting,
  onCreateNew,
}: {
  mhrName: string
  onMapExisting: (opponentId: string) => void
  onCreateNew: (opp: Opponent) => void
}) {
  const { getAll } = useOpponents()
  const [mode, setMode] = useState<"choose" | "existing" | "new">("choose")
  const [search, setSearch] = useState("")
  const [location, setLocation] = useState("")
  const [name, setName] = useState("")
  const [notes, setNotes] = useState("")

  const allOpponents = getAll().sort((a, b) => a.fullName.localeCompare(b.fullName))
  const filtered = search
    ? allOpponents.filter((o) =>
        o.fullName.toLowerCase().includes(search.toLowerCase())
      )
    : allOpponents

  function handleCreateNew() {
    const id = `opp-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    onCreateNew({
      id,
      fullName: mhrName,
      location,
      name,
      ageGroup: "",
      level: "",
      notes: notes || undefined,
    })
  }

  if (mode === "choose") {
    return (
      <div className="import-preview">
        <p className="text-xs font-medium">
          No auto-match for &quot;{mhrName}&quot;
        </p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("existing")}>
            Map to existing
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("new")}>
            Add as new
          </Button>
        </div>
      </div>
    )
  }

  if (mode === "existing") {
    return (
      <div className="import-preview">
        <p className="text-xs font-medium">
          Map &quot;{mhrName}&quot; to existing opponent:
        </p>
        <input
          type="text"
          className="games-table-input mt-2"
          placeholder="Search opponents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-1 flex flex-col gap-1" style={{ maxHeight: "150px", overflowY: "auto" }}>
          {filtered.map((opp) => (
            <button
              key={opp.id}
              className="text-left text-xs rounded border px-2 py-1 hover:bg-accent"
              onClick={() => onMapExisting(opp.id)}
            >
              {opp.fullName} {opp.owhaId ? `#${opp.owhaId}` : ""}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground">No opponents found</p>
          )}
        </div>
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setMode("choose")}>
          Back
        </Button>
      </div>
    )
  }

  return (
    <div className="import-preview">
      <p className="text-xs font-medium">
        Add &quot;{mhrName}&quot; as new opponent:
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <input
          type="text"
          className="games-table-input"
          placeholder="Location (city/area)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <input
          type="text"
          className="games-table-input"
          placeholder="Team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          className="games-table-input"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleCreateNew}>
            Save Opponent
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("choose")}>
            Back
          </Button>
        </div>
      </div>
    </div>
  )
}

// === Import Data Tab ===

function ImportDataTab({
  teamId,
  teamOrganization,
  teamAgeGroup,
  teamLevel,
}: {
  teamId: string
  teamOrganization: string
  teamAgeGroup: string
  teamLevel: string
}) {
  const { getTeamGames, addGames, updateGame } = useGames()
  const { setStandings } = useStandings()
  const { getAll, addOpponents } = useOpponents()

  const [activeTab, setActiveTab] = useState<ImportTab>("teamsnap-games")
  const [pasteText, setPasteText] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [gameType, setGameType] = useState<GameType>("regular")
  const [parsedStandings, setParsedStandings] = useState<StandingsRow[] | null>(null)
  const [parsedGames, setParsedGames] = useState<Game[] | null>(null)
  const [parsedOpponents, setParsedOpponents] = useState<Opponent[] | null>(null)
  const [existingOwhaIds, setExistingOwhaIds] = useState<Set<string>>(new Set())
  const [dupeInfos, setDupeInfos] = useState<DuplicateInfo[]>([])
  const [importDone, setImportDone] = useState(false)

  // MHR opponent matching state
  const [mhrMatches, setMhrMatches] = useState<MhrMatchState[]>([])

  const dupeIndices = new Set(dupeInfos.map((d) => d.index))
  const scoreMismatches = dupeInfos.filter((d) => d.scoreMismatch)
  const scoreUpdates = dupeInfos.filter((d) => d.scoreUpdate)

  function handleParse() {
    setImportDone(false)
    setParsedStandings(null)
    setParsedGames(null)
    setParsedOpponents(null)
    setDupeInfos([])
    setMhrMatches([])

    if (activeTab === "owha-standings") {
      const rows = parseOwhaStandings(pasteText)
      setParsedStandings(rows)
    } else if (activeTab === "owha-games") {
      const games = parseOwhaGames(pasteText, teamId, teamOrganization, gameType)
      const dupes = findDuplicates(getTeamGames(teamId), games)
      setParsedGames(games)
      setDupeInfos(dupes)
    } else if (activeTab === "owha-teams") {
      const opponents = parseOwhaTeamList(pasteText, teamAgeGroup, teamLevel)
      const allExisting = getAll()
      const existingIds = new Set(allExisting.filter((o) => o.owhaId).map((o) => o.owhaId!))
      setExistingOwhaIds(existingIds)
      setParsedOpponents(opponents)
    } else {
      const games = activeTab === "teamsnap-games"
        ? parseTeamsnapGames(pasteText, teamId)
        : parseMhrGames(pasteText, teamId, "unlabeled")
      const dupes = findDuplicates(getTeamGames(teamId), games)
      setParsedGames(games)
      setDupeInfos(dupes)

      const registry = getAll()
      const matchStates: MhrMatchState[] = []
      const seen = new Set<string>()

      for (let i = 0; i < games.length; i++) {
        if (dupeIndices.has(i)) continue
        const oppName = games[i].opponent
        if (seen.has(oppName)) continue
        seen.add(oppName)

        const matches = matchOpponent(oppName, registry)
        if (matches.length === 1) {
          matchStates.push({
            gameIndex: i,
            mhrName: oppName,
            matches,
            resolved: true,
            opponentId: matches[0].id,
          })
        } else {
          matchStates.push({
            gameIndex: i,
            mhrName: oppName,
            matches,
            resolved: false,
          })
        }
      }
      setMhrMatches(matchStates)
    }
  }

  function handleMhrResolve(mhrName: string, opponentId: string) {
    setMhrMatches((prev) =>
      prev.map((m) =>
        m.mhrName === mhrName ? { ...m, resolved: true, opponentId } : m
      )
    )
  }

  function handleMhrNewOpponent(mhrName: string, opp: Opponent) {
    addOpponents([opp])
    setMhrMatches((prev) =>
      prev.map((m) =>
        m.mhrName === mhrName ? { ...m, resolved: true, opponentId: opp.id } : m
      )
    )
  }

  function handleGameTypeChange(index: number, newType: GameType) {
    if (!parsedGames) return
    const updated = [...parsedGames]
    updated[index] = { ...updated[index], gameType: newType }
    setParsedGames(updated)
  }

  const needsOpponentMatching = activeTab === "mhr-games" || activeTab === "teamsnap-games"
  const allMhrResolved = !needsOpponentMatching || mhrMatches.every((m) => m.resolved)

  function handleConfirm() {
    if (activeTab === "owha-standings" && parsedStandings) {
      setStandings(teamId, { teamId, sourceUrl, rows: parsedStandings })
      setImportDone(true)
    } else if (activeTab === "owha-teams" && parsedOpponents) {
      const newOps = parsedOpponents.filter((o) => !existingOwhaIds.has(o.owhaId!))
      if (newOps.length > 0) addOpponents(newOps)
      setImportDone(true)
    } else if (parsedGames) {
      const nonDupes = parsedGames.filter((_, i) => !dupeIndices.has(i))

      if (needsOpponentMatching) {
        const matchMap = new Map<string, string>()
        for (const m of mhrMatches) {
          if (m.opponentId) matchMap.set(m.mhrName, m.opponentId)
        }
        for (const game of nonDupes) {
          const oppId = matchMap.get(game.opponent)
          if (oppId) game.opponentId = oppId
        }
      }

      // Auto-update scores on existing games that had no score
      for (const dupe of dupeInfos) {
        if (dupe.scoreUpdate) {
          const incoming = parsedGames[dupe.index]
          updateGame(teamId, dupe.existingGame.id, {
            teamScore: incoming.teamScore,
            opponentScore: incoming.opponentScore,
            result: incoming.result,
            played: true,
          })
        }
      }

      if (nonDupes.length > 0) addGames(teamId, nonDupes)
      setImportDone(true)
    }
  }

  function handleNewImport() {
    setPasteText("")
    setSourceUrl("")
    setParsedStandings(null)
    setParsedGames(null)
    setParsedOpponents(null)
    setDupeInfos([])
    setMhrMatches([])
    setImportDone(false)
  }

  function handleTabSwitch(tab: ImportTab) {
    setActiveTab(tab)
    handleNewImport()
  }

  return (
    <>
      <div className="import-tabs">
        <button
          className="import-tab"
          data-active={activeTab === "teamsnap-games"}
          onClick={() => handleTabSwitch("teamsnap-games")}
        >
          TeamSnap
        </button>
        <button
          className="import-tab"
          data-active={activeTab === "owha-standings"}
          onClick={() => handleTabSwitch("owha-standings")}
        >
          Standings
        </button>
        <button
          className="import-tab"
          data-active={activeTab === "owha-games"}
          onClick={() => handleTabSwitch("owha-games")}
        >
          OWHA Games
        </button>
        <button
          className="import-tab"
          data-active={activeTab === "mhr-games"}
          onClick={() => handleTabSwitch("mhr-games")}
        >
          MHR Games
        </button>
        <button
          className="import-tab"
          data-active={activeTab === "owha-teams"}
          onClick={() => handleTabSwitch("owha-teams")}
        >
          OWHA Teams
        </button>
      </div>

      <div className="import-section">
        {activeTab !== "owha-teams" && (
          <div className="game-form-field">
            <label className="game-form-label">Source URL (optional)</label>
            <input
              type="url"
              className="game-form-input"
              placeholder="https://www.owha.on.ca/..."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>
        )}

        {activeTab === "owha-games" && (
          <div className="game-form-field">
            <label className="game-form-label">Game Type</label>
            <select
              className="game-form-select"
              value={gameType}
              onChange={(e) => setGameType(e.target.value as GameType)}
            >
              {GAME_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {!importDone && (
          <>
            <div className="game-form-field">
              <label className="game-form-label">
                {activeTab === "owha-standings" ? "Paste standings data" :
                 activeTab === "owha-teams" ? "Paste OWHA team list" :
                 "Paste game data"}
              </label>
              <textarea
                className="import-textarea"
                placeholder={
                  activeTab === "owha-standings" ? "Paste OWHA standings table here..." :
                  activeTab === "owha-games" ? "Paste OWHA games table here..." :
                  activeTab === "owha-teams" ? "Paste team list (one per line, e.g. 'Team Name #1234')..." :
                  activeTab === "teamsnap-games" ? "Paste TeamSnap schedule here..." :
                  "Paste MHR game data here..."
                }
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
            </div>

            <Button
              onClick={handleParse}
              disabled={!pasteText.trim()}
            >
              Parse Data
            </Button>
          </>
        )}

        {/* Standings Preview */}
        {parsedStandings && (
          <div className="import-preview">
            <p className="font-medium">
              {importDone && <span className="text-green-600">Imported: </span>}
              {parsedStandings.length} team{parsedStandings.length !== 1 ? "s" : ""}
            </p>
            <div className="overflow-x-auto mt-2">
              <table className="standings-table">
                <thead>
                  <tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>T</th><th>PTS</th></tr>
                </thead>
                <tbody>
                  {parsedStandings.map((row, i) => (
                    <tr key={i} className="standings-row">
                      <td>{row.teamName}</td>
                      <td>{row.gp}</td><td>{row.w}</td><td>{row.l}</td><td>{row.t}</td><td>{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* OWHA Teams Preview */}
        {parsedOpponents && (
          <div className="import-preview">
            <p className="font-medium">
              {importDone && <span className="text-green-600">Imported: </span>}
              {parsedOpponents.length} team{parsedOpponents.length !== 1 ? "s" : ""}
              {existingOwhaIds.size > 0 && (() => {
                const dupeCount = parsedOpponents.filter((o) => existingOwhaIds.has(o.owhaId!)).length
                return dupeCount > 0 ? (
                  <span className="text-yellow-600">
                    {" "}({dupeCount} already in registry, skipped)
                  </span>
                ) : null
              })()}
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {parsedOpponents.map((opp, i) => {
                const isDupe = existingOwhaIds.has(opp.owhaId!)
                return (
                  <div key={i} className={`text-xs ${isDupe ? "line-through text-muted-foreground" : ""}`}>
                    {opp.fullName} #{opp.owhaId}
                    {isDupe && " [exists]"}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Games Preview */}
        {parsedGames && (
          <div className="import-preview">
            <p className="font-medium">
              {importDone && <span className="text-green-600">Imported: </span>}
              {parsedGames.length} game{parsedGames.length !== 1 ? "s" : ""}
              {dupeInfos.length > 0 && (
                <span className="text-yellow-600">
                  {" "}({dupeInfos.length} duplicate{dupeInfos.length !== 1 ? "s" : ""}
                  {scoreUpdates.length > 0
                    ? `, ${scoreUpdates.length} score${scoreUpdates.length !== 1 ? "s" : ""} will be updated`
                    : " skipped"})
                </span>
              )}
            </p>
            {scoreUpdates.length > 0 && (
              <div className="mt-2 rounded border border-green-500 bg-green-50 px-3 py-2 text-xs dark:bg-green-950">
                <p className="font-medium text-green-700 dark:text-green-400">
                  Scores will be added to existing games:
                </p>
                {scoreUpdates.map((d) => {
                  const incoming = parsedGames[d.index]
                  return (
                    <p key={d.index} className="text-green-600 dark:text-green-500">
                      {incoming.date} vs {incoming.opponent}: {incoming.teamScore}-{incoming.opponentScore} {incoming.result}
                    </p>
                  )
                })}
              </div>
            )}
            {scoreMismatches.length > 0 && (
              <div className="mt-2 rounded border border-yellow-500 bg-yellow-50 px-3 py-2 text-xs dark:bg-yellow-950">
                <p className="font-medium text-yellow-700 dark:text-yellow-400">
                  Score mismatches found — existing scores kept:
                </p>
                {scoreMismatches.map((d) => {
                  const incoming = parsedGames[d.index]
                  return (
                    <p key={d.index} className="text-yellow-600 dark:text-yellow-500">
                      {incoming.date} vs {incoming.opponent}: existing {d.existingGame.teamScore}-{d.existingGame.opponentScore}, incoming {incoming.teamScore}-{incoming.opponentScore}
                    </p>
                  )
                })}
              </div>
            )}
            <div className="mt-2 flex flex-col gap-1">
              {parsedGames.map((game, i) => {
                const isDupe = dupeIndices.has(i)
                const dupeInfo = dupeInfos.find((d) => d.index === i)
                const isScoreUpdate = dupeInfo?.scoreUpdate
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-xs ${isDupe && !isScoreUpdate ? "line-through text-muted-foreground" : isDupe ? "text-muted-foreground" : ""}`}
                  >
                    <span>
                      {game.date} vs {game.opponent}
                      {game.played ? ` (${game.teamScore}-${game.opponentScore} ${game.result})` : " (upcoming)"}
                      {isDupe && isScoreUpdate && <span className="text-green-600"> [score update]</span>}
                      {isDupe && !isScoreUpdate && " [duplicate]"}
                    </span>
                    {!isDupe && !importDone && needsOpponentMatching && (
                      <select
                        className="games-table-select"
                        value={game.gameType}
                        onChange={(e) => handleGameTypeChange(i, e.target.value as GameType)}
                      >
                        {GAME_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Opponent Matching */}
        {needsOpponentMatching && parsedGames && !importDone && mhrMatches.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Opponent Matching</h3>
            {mhrMatches.map((ms) => {
              if (ms.resolved) {
                return (
                  <div key={ms.mhrName} className="text-xs text-green-600">
                    {ms.mhrName} — matched
                  </div>
                )
              }
              if (ms.matches.length > 1) {
                return (
                  <MhrMatchResolver
                    key={ms.mhrName}
                    state={ms}
                    onResolve={(oppId) => handleMhrResolve(ms.mhrName, oppId)}
                  />
                )
              }
              return (
                <MhrUnmatchedResolver
                  key={ms.mhrName}
                  mhrName={ms.mhrName}
                  onMapExisting={(oppId) => handleMhrResolve(ms.mhrName, oppId)}
                  onCreateNew={(opp) => handleMhrNewOpponent(ms.mhrName, opp)}
                />
              )
            })}
          </div>
        )}

        {(parsedStandings || parsedGames || parsedOpponents) && !importDone && (
          <Button onClick={handleConfirm} disabled={!allMhrResolved}>
            {!allMhrResolved ? "Resolve all opponents first" : "Confirm Import"}
          </Button>
        )}

        {importDone && (
          <Button variant="outline" size="sm" onClick={handleNewImport}>
            Import More
          </Button>
        )}
      </div>
    </>
  )
}

// === Tournaments Tab ===

type TournamentSubTab = "list" | "setup" | "games"

const ALL_TIEBREAKER_KEYS: { key: TiebreakerKey; label: string }[] = [
  { key: "wins", label: "Number of Wins" },
  { key: "head-to-head", label: "Head-to-Head Record" },
  { key: "goal-differential", label: "Goal Differential" },
  { key: "goals-allowed", label: "Fewest Goals Allowed" },
  { key: "goals-for", label: "Most Goals For" },
]

function TournamentsTab({ teamId }: { teamId: string }) {
  const { getTournaments, addTournament, updateConfig, removeTournament, addGame, updateGame, removeGame, setGames } = useTournaments()
  const { getTeamGames } = useGames()
  const { getById: getOpponentById } = useOpponents()
  const tournaments = getTournaments(teamId)
  const [subTab, setSubTab] = useState<TournamentSubTab>("list")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteGameId, setConfirmDeleteGameId] = useState<string | null>(null)
  const [scannedGames, setScannedGames] = useState<Game[] | null>(null)

  // Setup form state
  const selected = tournaments.find((t) => t.config.id === selectedId) ?? null
  const cfg = selected?.config
  const [tName, setTName] = useState("")
  const [tLocation, setTLocation] = useState("")
  const [tStartDate, setTStartDate] = useState("")
  const [tEndDate, setTEndDate] = useState("")
  const [tGamesPerMatchup, setTGamesPerMatchup] = useState(1)
  const [tEliminationEnabled, setTEliminationEnabled] = useState(true)
  const [tConsolationEnabled, setTConsolationEnabled] = useState(false)
  const [tTiebreakerOrder, setTTiebreakerOrder] = useState<TiebreakerKey[]>(["wins", "head-to-head", "goal-differential", "goals-allowed", "goals-for"])
  const [tPools, setTPools] = useState<TournamentPool[]>([])
  const [tTeams, setTTeams] = useState<TournamentTeam[]>([])

  // New team input
  const [newTeamName, setNewTeamName] = useState("")
  const [newTeamPool, setNewTeamPool] = useState("")

  // Games state
  const [activePoolTab, setActivePoolTab] = useState("")
  const [showAddGame, setShowAddGame] = useState(false)
  const [newGameDate, setNewGameDate] = useState("")
  const [newGameTime, setNewGameTime] = useState("")
  const [newGameHome, setNewGameHome] = useState("")
  const [newGameAway, setNewGameAway] = useState("")
  const [newGameLocation, setNewGameLocation] = useState("")
  const [newGameRound, setNewGameRound] = useState<TournamentGame["round"]>("pool")

  // Import state
  const [gamesText, setGamesText] = useState("")
  const [importStandingsText, setImportStandingsText] = useState("")
  const [importStandingsPool, setImportStandingsPool] = useState("")
  const [importScheduleText, setImportScheduleText] = useState("")
  const [importSchedulePool, setImportSchedulePool] = useState("")

  function loadConfigIntoForm(c: TournamentConfig) {
    setTName(c.name)
    setTLocation(c.location)
    setTStartDate(c.startDate)
    setTEndDate(c.endDate)
    setTGamesPerMatchup(c.gamesPerMatchup)
    setTEliminationEnabled(c.eliminationEnabled)
    setTConsolationEnabled(c.consolationEnabled)
    setTTiebreakerOrder([...c.tiebreakerOrder])
    setTPools(c.pools.map((p) => ({ ...p, teamIds: [...p.teamIds] })))
    setTTeams(c.teams.map((t) => ({ ...t })))
    if (c.pools.length > 0) setActivePoolTab(c.pools[0].id)
  }

  function handleSelectTournament(id: string) {
    setSelectedId(id)
    const t = tournaments.find((t) => t.config.id === id)
    if (t) {
      loadConfigIntoForm(t.config)
      setSubTab("setup")
    }
  }

  function handleNewTournament() {
    setSelectedId(null)
    setTName("")
    setTLocation("")
    setTStartDate("")
    setTEndDate("")
    setTGamesPerMatchup(1)
    setTEliminationEnabled(true)
    setTConsolationEnabled(false)
    setTTiebreakerOrder(["wins", "head-to-head", "goal-differential", "goals-allowed", "goals-for"])
    setTPools([{ id: "pool-a", name: "Pool A", teamIds: [], qualifyingSpots: 2 }])
    setTTeams([])
    setActivePoolTab("pool-a")
    setSubTab("setup")
  }

  function handleSaveConfig() {
    if (!tName.trim()) return
    const config: TournamentConfig = {
      id: selectedId ?? `tournament-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      teamId,
      name: tName.trim(),
      location: tLocation.trim(),
      startDate: tStartDate,
      endDate: tEndDate,
      pools: tPools,
      teams: tTeams,
      gamesPerMatchup: tGamesPerMatchup,
      tiebreakerOrder: tTiebreakerOrder,
      eliminationEnabled: tEliminationEnabled,
      consolationEnabled: tConsolationEnabled,
    }
    if (selectedId) {
      updateConfig(teamId, selectedId, config)
    } else {
      addTournament(teamId, config)
      setSelectedId(config.id)
    }
  }

  function handleAddPool() {
    const poolNum = tPools.length + 1
    const letters = "ABCDEFGH"
    const letter = letters[poolNum - 1] ?? String(poolNum)
    const id = `pool-${letter.toLowerCase()}`
    setTPools([...tPools, { id, name: `Pool ${letter}`, teamIds: [], qualifyingSpots: 2 }])
    setActivePoolTab(id)
  }

  function handleRemovePool(poolId: string) {
    setTPools(tPools.filter((p) => p.id !== poolId))
    setTTeams(tTeams.filter((t) => t.poolId !== poolId))
    if (activePoolTab === poolId && tPools.length > 1) {
      setActivePoolTab(tPools.find((p) => p.id !== poolId)?.id ?? "")
    }
  }

  function handleAddTeam() {
    if (!newTeamName.trim() || !newTeamPool) return
    const id = `t-team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const team: TournamentTeam = { id, name: newTeamName.trim(), poolId: newTeamPool }
    setTTeams([...tTeams, team])
    setTPools(tPools.map((p) => p.id === newTeamPool ? { ...p, teamIds: [...p.teamIds, id] } : p))
    setNewTeamName("")
  }

  function handleRemoveTeam(teamIdToRemove: string) {
    setTTeams(tTeams.filter((t) => t.id !== teamIdToRemove))
    setTPools(tPools.map((p) => ({ ...p, teamIds: p.teamIds.filter((id) => id !== teamIdToRemove) })))
  }

  function handleMoveTiebreaker(index: number, direction: "up" | "down") {
    const newOrder = [...tTiebreakerOrder]
    const swapIdx = direction === "up" ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= newOrder.length) return
    ;[newOrder[index], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[index]]
    setTTiebreakerOrder(newOrder)
  }

  function handleImportStandings() {
    const lines = importStandingsText.trim().split("\n").filter((l) => l.trim())
    if (lines.length === 0) return
    const targetPoolId = importStandingsPool || tPools[0]?.id
    if (!targetPoolId) return

    const newTeams: TournamentTeam[] = [...tTeams]
    const newPools = tPools.map((p) => ({ ...p, teamIds: [...p.teamIds] }))
    const existingNames = new Set(newTeams.map((t) => t.name.toLowerCase()))

    for (const line of lines) {
      const cols = line.split("\t").map((c) => c.trim())
      const nameCol = cols.find((c) => c && !/^\d+$/.test(c) && !/^\d+\.\d+$/.test(c))
      if (!nameCol) continue
      if (existingNames.has(nameCol.toLowerCase())) continue

      const id = `t-team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      newTeams.push({ id, name: nameCol, poolId: targetPoolId })
      const pool = newPools.find((p) => p.id === targetPoolId)
      if (pool) pool.teamIds.push(id)
      existingNames.add(nameCol.toLowerCase())
    }

    setTTeams(newTeams)
    setTPools(newPools)
    setImportStandingsText("")
  }

  function handleImportSchedule() {
    const lines = importScheduleText.trim().split("\n").filter((l) => l.trim())
    if (lines.length === 0) return
    const targetPoolId = importSchedulePool || tPools[0]?.id
    if (!targetPoolId) return

    const newTeams: TournamentTeam[] = [...tTeams]
    const newPools = tPools.map((p) => ({ ...p, teamIds: [...p.teamIds] }))
    const existingNames = new Set(newTeams.map((t) => t.name.toLowerCase()))
    const teamNames = new Set<string>()

    for (const line of lines) {
      const cols = line.split("\t").map((c) => c.trim())
      // Look for two team names: skip date/time/numeric/location-like columns
      const nameCandidates = cols.filter((c) =>
        c && !/^\d+$/.test(c) && !/^\d+\.\d+$/.test(c)
        && !/^\d{1,2}[:\-\/]\d{2}/.test(c) && !/^\d{4}-\d{2}/.test(c)
        && !/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(c)
        && c.length > 1
      )
      for (const name of nameCandidates) {
        teamNames.add(name)
      }
    }

    for (const name of teamNames) {
      if (existingNames.has(name.toLowerCase())) continue
      const id = `t-team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      newTeams.push({ id, name, poolId: targetPoolId })
      const pool = newPools.find((p) => p.id === targetPoolId)
      if (pool) pool.teamIds.push(id)
      existingNames.add(name.toLowerCase())
    }

    setTTeams(newTeams)
    setTPools(newPools)
    setImportScheduleText("")
  }

  function handleScanGames() {
    if (!tStartDate || !tEndDate) return
    const allGames = getTeamGames(teamId)
    // Compare date strings directly (both should be YYYY-MM-DD)
    // Also try matching by month-day only in case year was inferred differently
    const matched = allGames.filter((g) => {
      if (!g.date) return false
      // Exact YYYY-MM-DD range match
      if (g.date >= tStartDate && g.date <= tEndDate) return true
      // Fallback: match month-day range ignoring year (for cross-year inference issues)
      const gMD = g.date.slice(5) // "MM-DD"
      const startMD = tStartDate.slice(5)
      const endMD = tEndDate.slice(5)
      if (startMD <= endMD) {
        return gMD >= startMD && gMD <= endMD
      }
      return false
    })
    setScannedGames(matched)
  }

  function normalizeTo24h(time: string): string {
    if (!time) return ""
    // Already in HH:MM format
    if (/^\d{1,2}:\d{2}$/.test(time)) return time
    // Convert "7:30 PM" / "12:00 AM" style
    const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (match) {
      let h = parseInt(match[1], 10)
      const m = match[2]
      const ampm = match[3].toUpperCase()
      if (ampm === "PM" && h !== 12) h += 12
      if (ampm === "AM" && h === 12) h = 0
      return `${String(h).padStart(2, "0")}:${m}`
    }
    return time
  }

  function handleConfirmScannedGames() {
    if (!scannedGames || !selectedId) return
    const existingGames = selected?.games ?? []
    const existingKeys = new Set(existingGames.map((g) => `${g.date}|${g.homeTeam}|${g.awayTeam}`))

    // Determine the default pool
    const defaultPoolId = tPools[0]?.id ?? ""

    // Resolve opponent names to tournament team IDs where possible
    const nameToId = new Map(tTeams.map((t) => [t.name.toLowerCase(), t.id]))

    const newGames: TournamentGame[] = scannedGames.map((g) => {
      const oppDisplay = g.opponentId
        ? (getOpponentById(g.opponentId)?.fullName ?? g.opponent)
        : g.opponent
      const awayId = nameToId.get(oppDisplay.toLowerCase()) ?? oppDisplay
      return {
        id: `t-g-scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        teamId,
        tournamentId: selectedId,
        date: g.date,
        time: normalizeTo24h(g.time),
        homeTeam: "self",
        awayTeam: awayId,
        homeScore: g.teamScore,
        awayScore: g.opponentScore,
        location: g.location,
        played: g.played,
        round: "pool" as const,
        poolId: defaultPoolId,
      }
    }).filter((g) => !existingKeys.has(`${g.date}|${g.homeTeam}|${g.awayTeam}`))

    if (newGames.length > 0) {
      setGames(teamId, selectedId, [...existingGames, ...newGames])
    }
    setScannedGames(null)
  }

  function handleAddGameToTournament() {
    if (!selectedId || !newGameDate || !newGameHome || !newGameAway) return
    const id = `t-g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const poolId = newGameRound === "pool" ? activePoolTab : undefined
    addGame(teamId, selectedId, {
      id,
      teamId,
      tournamentId: selectedId,
      date: newGameDate,
      time: newGameTime,
      homeTeam: newGameHome,
      awayTeam: newGameAway,
      homeScore: null,
      awayScore: null,
      location: newGameLocation,
      played: false,
      round: newGameRound,
      poolId,
    })
    setNewGameDate("")
    setNewGameTime("")
    setNewGameHome("")
    setNewGameAway("")
    setNewGameLocation("")
    setShowAddGame(false)
  }

  function handleScoreUpdate(gameId: string, homeScore: string, awayScore: string) {
    if (!selectedId) return
    const hs = homeScore === "" ? null : parseInt(homeScore, 10)
    const as_ = awayScore === "" ? null : parseInt(awayScore, 10)
    const played = hs !== null && as_ !== null && !isNaN(hs) && !isNaN(as_)
    updateGame(teamId, selectedId, gameId, {
      homeScore: hs !== null && !isNaN(hs) ? hs : null,
      awayScore: as_ !== null && !isNaN(as_) ? as_ : null,
      played,
    })
  }

  function handleImportGames() {
    if (!selectedId) return
    const { games: parsed } = parsePlaydownGames(gamesText, teamId)
    if (parsed.length === 0) return

    const existingGames = selected?.games ?? []
    const existingKeys = new Set(existingGames.map((g) => `${g.date}|${g.homeTeam}|${g.awayTeam}`))

    // Map team names to IDs
    const nameToId = new Map(tTeams.map((t) => [t.name, t.id]))
    const poolForTeam = (tId: string) => tTeams.find((t) => t.id === tId)?.poolId

    const newGames: TournamentGame[] = parsed
      .filter((g) => !existingKeys.has(`${g.date}|${nameToId.get(g.homeTeam) ?? g.homeTeam}|${nameToId.get(g.awayTeam) ?? g.awayTeam}`))
      .map((g) => {
        const homeId = nameToId.get(g.homeTeam) ?? g.homeTeam
        const awayId = nameToId.get(g.awayTeam) ?? g.awayTeam
        const poolId = poolForTeam(homeId) ?? poolForTeam(awayId) ?? activePoolTab
        return {
          id: `t-g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          teamId,
          tournamentId: selectedId,
          date: g.date,
          time: g.time,
          homeTeam: homeId,
          awayTeam: awayId,
          homeScore: g.homeScore,
          awayScore: g.awayScore,
          location: g.location,
          played: g.played,
          round: "pool" as const,
          poolId,
        }
      })

    if (newGames.length > 0) {
      setGames(teamId, selectedId, [...existingGames, ...newGames])
    }
    setGamesText("")
  }

  const selfTeamLabel = (() => {
    const t = TEAMS.find((t) => t.id === teamId)
    return t ? `${t.organization} ${t.name}` : "Your Team"
  })()

  function tTeamName(id: string): string {
    if (id === "self") return selfTeamLabel
    return tTeams.find((t) => t.id === id)?.name ?? cfg?.teams.find((t) => t.id === id)?.name ?? id
  }

  const selectedGames = selected?.games ?? []
  const poolGames = selectedGames.filter((g) => g.round === "pool" && g.poolId === activePoolTab)
  const elimGames = selectedGames.filter((g) => g.round !== "pool")

  return (
    <>
      <div className="playdown-title-row">
        <h2 className="text-sm font-semibold">Tournaments</h2>
      </div>

      <div className="import-tabs">
        <button className="import-tab" data-active={subTab === "list"} onClick={() => setSubTab("list")}>
          List
        </button>
        <button className="import-tab" data-active={subTab === "setup"} onClick={() => setSubTab("setup")}>
          Setup
        </button>
        <button className="import-tab" data-active={subTab === "games"} onClick={() => { if (selectedId) setSubTab("games") }}>
          Games
        </button>
      </div>

      {/* List */}
      {subTab === "list" && (
        <div className="import-section">
          <Button size="sm" variant="outline" onClick={handleNewTournament}>
            <Plus className="size-3.5" /> New Tournament
          </Button>

          {tournaments.length === 0 ? (
            <p className="dashboard-record-label">No tournaments configured</p>
          ) : (
            <div className="flex flex-col gap-2">
              {tournaments.map((t) => (
                <div key={t.config.id} className="import-preview">
                  <div className="flex items-center justify-between">
                    <button className="text-left" onClick={() => handleSelectTournament(t.config.id)}>
                      <p className="text-sm font-medium">{t.config.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.config.location}
                        {t.config.startDate && ` — ${t.config.startDate}`}
                        {t.config.endDate && ` to ${t.config.endDate}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.config.pools.length} pool{t.config.pools.length !== 1 ? "s" : ""} — {t.config.teams.length} teams — {t.games.length} games
                      </p>
                    </button>
                    <div className="flex gap-1">
                      {confirmDeleteId === t.config.id ? (
                        <>
                          <Button variant="destructive" size="sm" onClick={() => { removeTournament(teamId, t.config.id); setConfirmDeleteId(null); if (selectedId === t.config.id) setSelectedId(null) }}>
                            Delete
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                            <X className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <button className="games-table-delete" onClick={() => setConfirmDeleteId(t.config.id)}>
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Setup */}
      {subTab === "setup" && (
        <div className="import-section">
          <div className="flex flex-col gap-3">
            <div className="game-form-field">
              <label className="game-form-label">Tournament Name</label>
              <input type="text" className="game-form-input" placeholder="e.g. Silver Stick Regional" value={tName} onChange={(e) => setTName(e.target.value)} />
            </div>
            <div className="game-form-field">
              <label className="game-form-label">Location</label>
              <input type="text" className="game-form-input" placeholder="e.g. Kanata, ON" value={tLocation} onChange={(e) => setTLocation(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <div className="game-form-field flex-1">
                <label className="game-form-label">Start Date</label>
                <input type="date" className="game-form-input" value={tStartDate} onChange={(e) => setTStartDate(e.target.value)} />
              </div>
              <div className="game-form-field flex-1">
                <label className="game-form-label">End Date</label>
                <input type="date" className="game-form-input" value={tEndDate} onChange={(e) => setTEndDate(e.target.value)} />
              </div>
            </div>

            <div className="playdown-config-row">
              <div className="playdown-config-field">
                <label className="game-form-label">Games / Matchup</label>
                <input type="number" className="playdown-config-input" min={1} value={tGamesPerMatchup} onChange={(e) => setTGamesPerMatchup(parseInt(e.target.value, 10) || 1)} />
              </div>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={tEliminationEnabled} onChange={(e) => setTEliminationEnabled(e.target.checked)} />
                Elimination Round
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={tConsolationEnabled} onChange={(e) => setTConsolationEnabled(e.target.checked)} />
                Consolation Bracket
              </label>
            </div>

            {/* Pools */}
            <div>
              <div className="flex items-center justify-between">
                <label className="game-form-label">Pools</label>
                <Button size="sm" variant="ghost" onClick={handleAddPool}>
                  <Plus className="size-3" /> Add Pool
                </Button>
              </div>
              <div className="flex flex-col gap-2 mt-1">
                {tPools.map((pool) => (
                  <div key={pool.id} className="import-preview">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="game-form-input flex-1"
                        value={pool.name}
                        onChange={(e) => setTPools(tPools.map((p) => p.id === pool.id ? { ...p, name: e.target.value } : p))}
                      />
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-muted-foreground">Qualify:</label>
                        <input
                          type="number"
                          className="playdown-config-input"
                          style={{ width: "50px" }}
                          min={1}
                          value={pool.qualifyingSpots}
                          onChange={(e) => setTPools(tPools.map((p) => p.id === pool.id ? { ...p, qualifyingSpots: parseInt(e.target.value, 10) || 1 } : p))}
                        />
                      </div>
                      {tPools.length > 1 && (
                        <button className="games-table-delete" onClick={() => handleRemovePool(pool.id)}>
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-1">
                      {tTeams.filter((t) => t.poolId === pool.id).map((t) => (
                        <div key={t.id} className="flex items-center justify-between py-0.5">
                          <span className="text-xs">{t.name} {t.id === "self" && "(You)"}</span>
                          <button className="games-table-delete" onClick={() => handleRemoveTeam(t.id)}>
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add Team */}
            {tPools.length > 0 && (
              <div className="flex gap-2 items-end">
                <div className="game-form-field flex-1">
                  <label className="game-form-label">Add Team</label>
                  <input type="text" className="game-form-input" placeholder="Team name" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
                </div>
                <select className="game-form-select" value={newTeamPool || tPools[0]?.id} onChange={(e) => setNewTeamPool(e.target.value)}>
                  {tPools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Button size="sm" onClick={handleAddTeam} disabled={!newTeamName.trim()}>
                  Add
                </Button>
              </div>
            )}

            {/* Tiebreaker Order */}
            <div>
              <label className="game-form-label">Tiebreaker Order (drag to reorder)</label>
              <div className="flex flex-col gap-1 mt-1">
                {tTiebreakerOrder.map((key, i) => {
                  const label = ALL_TIEBREAKER_KEYS.find((k) => k.key === key)?.label ?? key
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="text-sm flex-1">{label}</span>
                      <button className="games-table-delete" disabled={i === 0} onClick={() => handleMoveTiebreaker(i, "up")}>
                        &#x25B2;
                      </button>
                      <button className="games-table-delete" disabled={i === tTiebreakerOrder.length - 1} onClick={() => handleMoveTiebreaker(i, "down")}>
                        &#x25BC;
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveConfig}>
                {selectedId ? "Update Tournament" : "Create Tournament"}
              </Button>
              {selectedId && (
                <Button variant="outline" onClick={() => { setSelectedId(null); setSubTab("list") }}>
                  Cancel
                </Button>
              )}
            </div>

            {/* Scan Existing Games */}
            {tStartDate && tEndDate && (
              <div className="game-form-field">
                <label className="game-form-label">Scan Existing Games</label>
                <p className="text-xs text-muted-foreground">
                  Find games from your schedule between {tStartDate} and {tEndDate}
                </p>
                <Button variant="outline" size="sm" onClick={handleScanGames}>
                  <Download className="size-3.5" /> Scan Games
                </Button>

                {scannedGames !== null && (
                  <div className="import-preview">
                    {scannedGames.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No games found in date range.</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium">{scannedGames.length} game{scannedGames.length !== 1 ? "s" : ""} found:</p>
                        <div className="flex flex-col gap-1 mt-1">
                          {scannedGames
                            .slice()
                            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                            .map((game) => (
                                <div key={game.id} className="flex items-center justify-between">
                                  <p className="text-xs text-muted-foreground">
                                    {game.date}{game.time ? ` at ${game.time}` : ""}
                                    {game.location ? ` — ${game.location}` : ""}
                                  </p>
                                  {game.played && (
                                    <span className="text-xs font-bold">{game.teamScore}-{game.opponentScore}</span>
                                  )}
                                </div>
                              ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" onClick={handleConfirmScannedGames} disabled={!selectedId}>
                            {selectedId ? `Add ${scannedGames.length} Game${scannedGames.length !== 1 ? "s" : ""}` : "Save tournament first"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setScannedGames(null)}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Import Standings */}
            {tPools.length > 0 && (
              <details className="qual-tiebreaker-card">
                <summary className="qual-tiebreaker-summary">
                  <span className="game-form-label">Import Standings</span>
                </summary>
                <div className="game-form-field">
                  <p className="text-xs text-muted-foreground">Adds teams to a pool</p>
                  <div className="flex gap-2 mb-1">
                    <select className="game-form-select" value={importStandingsPool || tPools[0]?.id} onChange={(e) => setImportStandingsPool(e.target.value)}>
                      {tPools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <textarea
                    className="import-textarea"
                    placeholder={"Team\tGP\tW\tL\tT\tPTS\tGF\tGA\nNepean Wildcats\t4\t3\t1\t0\t6\t12\t5"}
                    value={importStandingsText}
                    onChange={(e) => setImportStandingsText(e.target.value)}
                  />
                  <Button variant="outline" size="sm" disabled={!importStandingsText.trim()} onClick={handleImportStandings}>
                    Import Teams from Standings
                  </Button>
                </div>
              </details>
            )}

            {/* Import Schedule */}
            {tPools.length > 0 && (
              <details className="qual-tiebreaker-card">
                <summary className="qual-tiebreaker-summary">
                  <span className="game-form-label">Import Schedule</span>
                </summary>
                <div className="game-form-field">
                  <p className="text-xs text-muted-foreground">Adds teams to a pool</p>
                  <div className="flex gap-2 mb-1">
                    <select className="game-form-select" value={importSchedulePool || tPools[0]?.id} onChange={(e) => setImportSchedulePool(e.target.value)}>
                      {tPools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <textarea
                    className="import-textarea"
                    placeholder={"Date\tTime\tHome\tAway\tLocation\n2026-02-20\t10:00\tNepean Wildcats\tOttawa Ice\tScotiabank Place"}
                    value={importScheduleText}
                    onChange={(e) => setImportScheduleText(e.target.value)}
                  />
                  <Button variant="outline" size="sm" disabled={!importScheduleText.trim()} onClick={handleImportSchedule}>
                    Import Teams from Schedule
                  </Button>
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Games */}
      {subTab === "games" && selectedId && (
        <div className="import-section">
          <p className="text-sm font-medium">{cfg?.name}</p>

          {/* Pool tabs */}
          {cfg && cfg.pools.length > 0 && (
            <div className="import-tabs">
              {cfg.pools.map((pool) => (
                <button key={pool.id} className="import-tab" data-active={activePoolTab === pool.id} onClick={() => setActivePoolTab(pool.id)}>
                  {pool.name}
                </button>
              ))}
              <button className="import-tab" data-active={activePoolTab === "elimination"} onClick={() => setActivePoolTab("elimination")}>
                Elimination
              </button>
            </div>
          )}

          <Button size="sm" variant="outline" onClick={() => setShowAddGame(!showAddGame)}>
            <Plus className="size-3.5" /> Add Game
          </Button>

          {showAddGame && (
            <div className="import-preview">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input type="date" className="game-form-input" value={newGameDate} onChange={(e) => setNewGameDate(e.target.value)} />
                  <input type="time" className="game-form-input" value={newGameTime} onChange={(e) => setNewGameTime(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <select className="game-form-select" value={newGameHome} onChange={(e) => setNewGameHome(e.target.value)}>
                    <option value="">Home Team</option>
                    {(cfg?.teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select className="game-form-select" value={newGameAway} onChange={(e) => setNewGameAway(e.target.value)}>
                    <option value="">Away Team</option>
                    {(cfg?.teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                {activePoolTab === "elimination" && (
                  <select className="game-form-select" value={newGameRound} onChange={(e) => setNewGameRound(e.target.value as TournamentGame["round"])}>
                    <option value="quarterfinal">Quarterfinal</option>
                    <option value="semifinal">Semifinal</option>
                    <option value="final">Final</option>
                    <option value="consolation">Consolation</option>
                    <option value="bronze">Bronze</option>
                  </select>
                )}
                <input type="text" className="game-form-input" placeholder="Location" value={newGameLocation} onChange={(e) => setNewGameLocation(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddGameToTournament} disabled={!newGameDate || !newGameHome || !newGameAway}>
                    Save Game
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddGame(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          )}

          {/* Games table */}
          {(() => {
            const displayGames = activePoolTab === "elimination" ? elimGames : poolGames
            if (displayGames.length === 0) return <p className="dashboard-record-label">No games yet</p>
            return (
              <div className="games-table-wrap">
                <table className="games-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Home</th>
                      <th>Away</th>
                      <th>H</th>
                      <th>A</th>
                      <th>Location</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayGames
                      .slice()
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      .map((game) => (
                      <tr key={game.id}>
                        <td>
                          <input
                            type="date"
                            className="games-table-input"
                            style={{ width: "115px" }}
                            defaultValue={game.date}
                            onBlur={(e) => {
                              if (e.target.value !== game.date) updateGame(teamId, selectedId, game.id, { date: e.target.value })
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            className="games-table-input"
                            style={{ width: "80px" }}
                            defaultValue={game.time}
                            onBlur={(e) => {
                              if (e.target.value !== game.time) updateGame(teamId, selectedId, game.id, { time: e.target.value })
                            }}
                          />
                        </td>
                        <td><span className="text-xs">{tTeamName(game.homeTeam)}</span></td>
                        <td><span className="text-xs">{tTeamName(game.awayTeam)}</span></td>
                        <td>
                          <input
                            type="number"
                            className="games-table-input"
                            style={{ width: "40px" }}
                            defaultValue={game.homeScore ?? ""}
                            onBlur={(e) => handleScoreUpdate(game.id, e.target.value, String(game.awayScore ?? ""))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="games-table-input"
                            style={{ width: "40px" }}
                            defaultValue={game.awayScore ?? ""}
                            onBlur={(e) => handleScoreUpdate(game.id, String(game.homeScore ?? ""), e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="games-table-input"
                            style={{ width: "120px" }}
                            defaultValue={game.location}
                            onBlur={(e) => {
                              if (e.target.value !== game.location) updateGame(teamId, selectedId, game.id, { location: e.target.value })
                            }}
                          />
                        </td>
                        <td>
                          {confirmDeleteGameId === game.id ? (
                            <div className="flex gap-1">
                              <button className="games-table-delete" onClick={() => { removeGame(teamId, selectedId, game.id); setConfirmDeleteGameId(null) }}>
                                <Trash2 className="size-3.5 text-destructive" />
                              </button>
                              <button className="games-table-delete" onClick={() => setConfirmDeleteGameId(null)}>
                                <X className="size-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button className="games-table-delete" onClick={() => setConfirmDeleteGameId(game.id)}>
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}

          {/* Import games */}
          <div className="game-form-field">
            <label className="game-form-label">Import Games</label>
            <textarea
              className="import-textarea"
              placeholder="Paste game data here (tab-separated)..."
              value={gamesText}
              onChange={(e) => setGamesText(e.target.value)}
            />
            <Button variant="outline" disabled={!gamesText.trim()} onClick={handleImportGames}>
              Import Games
            </Button>
          </div>
        </div>
      )}

      {subTab === "games" && !selectedId && (
        <div className="import-section">
          <p className="dashboard-record-label">Select a tournament from the list first</p>
        </div>
      )}
    </>
  )
}

// === Modes Tab (Playdowns) ===

type PlaydownSubTab = "setup" | "standings" | "games"

function ModesTab({ teamId, teamOrganization }: { teamId: string; teamOrganization: string }) {
  const { getPlaydown, setConfig, setGames, addGame, updateGame, removeGame, clearPlaydown } = usePlaydowns()
  const [subTab, setSubTab] = useState<PlaydownSubTab>("games")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  const playdown = getPlaydown(teamId)
  const config = playdown?.config
  const games = playdown?.games ?? []
  const standings = config ? computePlaydownStandings(config, games) : []

  // Setup form state
  const [totalTeams, setTotalTeams] = useState(config?.totalTeams ?? 4)
  const [qualifyingSpots, setQualifyingSpots] = useState(config?.qualifyingSpots ?? 2)
  const [gamesPerMatchup, setGamesPerMatchup] = useState(config?.gamesPerMatchup ?? 2)

  // Import state
  const [standingsText, setStandingsText] = useState("")
  const [gamesText, setGamesText] = useState("")

  // New game form state
  const [showAddGame, setShowAddGame] = useState(false)
  const [newGameDate, setNewGameDate] = useState("")
  const [newGameTime, setNewGameTime] = useState("")
  const [newGameHome, setNewGameHome] = useState("")
  const [newGameAway, setNewGameAway] = useState("")
  const [newGameLocation, setNewGameLocation] = useState("")

  function handleSaveConfig() {
    const newConfig: PlaydownConfig = {
      teamId,
      totalTeams,
      qualifyingSpots,
      gamesPerMatchup,
      teams: config?.teams ?? [],
    }
    setConfig(teamId, newConfig)
  }

  function handleImportStandings() {
    const lines = standingsText.trim().split("\n").filter((l) => l.trim())
    if (lines.length === 0) return

    const teams: PlaydownTeam[] = []
    const games: PlaydownGame[] = []
    let gameIndex = 0

    for (const line of lines) {
      const cols = line.split("\t").map((c) => c.trim())
      // Find team name — first column that isn't purely numeric
      const nameCol = cols.find((c) => c && !/^\d+$/.test(c) && !/^\d+\.\d+$/.test(c))
      if (!nameCol) continue

      // Try to extract W, L, T — look for 3+ consecutive numeric columns
      const numericCols = cols.filter((c) => /^\d+$/.test(c)).map(Number)
      // Expect at least: GP W L T
      const gp = numericCols.length >= 4 ? numericCols[0] : 0
      const w = numericCols.length >= 4 ? numericCols[1] : 0
      const l = numericCols.length >= 4 ? numericCols[2] : 0
      const t = numericCols.length >= 4 ? numericCols[3] : 0

      const id = `pd-team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      teams.push({ id, name: nameCol })

      // Create synthetic games for the record
      for (let i = 0; i < w; i++) {
        games.push({
          id: `pd-g-import-${gameIndex++}`,
          teamId,
          date: "",
          time: "",
          homeTeam: id,
          awayTeam: "unknown",
          homeScore: 1,
          awayScore: 0,
          location: "",
          played: true,
        })
      }
      for (let i = 0; i < l; i++) {
        games.push({
          id: `pd-g-import-${gameIndex++}`,
          teamId,
          date: "",
          time: "",
          homeTeam: id,
          awayTeam: "unknown",
          homeScore: 0,
          awayScore: 1,
          location: "",
          played: true,
        })
      }
      for (let i = 0; i < t; i++) {
        games.push({
          id: `pd-g-import-${gameIndex++}`,
          teamId,
          date: "",
          time: "",
          homeTeam: id,
          awayTeam: "unknown",
          homeScore: 0,
          awayScore: 0,
          location: "",
          played: true,
        })
      }
    }

    if (teams.length === 0) return

    const newConfig: PlaydownConfig = {
      teamId,
      totalTeams: teams.length,
      qualifyingSpots,
      gamesPerMatchup,
      teams,
    }
    setConfig(teamId, newConfig)
    setGames(teamId, games)
    setTotalTeams(teams.length)
    setStandingsText("")
  }

  function handleImportGames() {
    const { games: parsed } = parsePlaydownGames(gamesText, teamId)
    if (parsed.length === 0) return

    // Find the user's team by matching organization name
    const needle = teamOrganization.toLowerCase()
    const allTeamNames = new Set<string>()
    for (const g of parsed) {
      allTeamNames.add(g.homeTeam)
      allTeamNames.add(g.awayTeam)
    }
    const selfName = Array.from(allTeamNames).find((n) =>
      n.toLowerCase().includes(needle) || needle.includes(n.toLowerCase())
    )

    // Build adjacency graph to find the loop
    const adj = new Map<string, Set<string>>()
    for (const g of parsed) {
      if (!adj.has(g.homeTeam)) adj.set(g.homeTeam, new Set())
      if (!adj.has(g.awayTeam)) adj.set(g.awayTeam, new Set())
      adj.get(g.homeTeam)!.add(g.awayTeam)
      adj.get(g.awayTeam)!.add(g.homeTeam)
    }

    // BFS from user's team to find all connected teams in the loop
    const loopTeams = new Set<string>()
    if (selfName) {
      const queue = [selfName]
      loopTeams.add(selfName)
      while (queue.length > 0) {
        const current = queue.shift()!
        for (const neighbor of adj.get(current) ?? []) {
          if (!loopTeams.has(neighbor)) {
            loopTeams.add(neighbor)
            queue.push(neighbor)
          }
        }
      }
    }

    // Filter games to only those between loop teams
    const loopGames = selfName
      ? parsed.filter((g) => loopTeams.has(g.homeTeam) && loopTeams.has(g.awayTeam))
      : parsed

    // Build team list, marking user's team as "self"
    const existingNames = new Set((config?.teams ?? []).map((t) => t.name))
    const newTeams: PlaydownTeam[] = [...(config?.teams ?? [])]
    const loopTeamNames = selfName ? Array.from(loopTeams) : Array.from(allTeamNames)
    for (const name of loopTeamNames) {
      if (!existingNames.has(name)) {
        const isSelf = name === selfName
        const id = isSelf ? "self" : `pd-team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        newTeams.push({ id, name })
        existingNames.add(name)
      }
    }

    // Map team names to IDs in games
    const nameToId = new Map(newTeams.map((t) => [t.name, t.id]))
    const mappedGames = loopGames.map((g) => ({
      ...g,
      homeTeam: nameToId.get(g.homeTeam) ?? g.homeTeam,
      awayTeam: nameToId.get(g.awayTeam) ?? g.awayTeam,
    }))

    // Deduplicate against existing games (match by date + home + away)
    const existingKeys = new Set(
      games.map((g) => `${g.date}|${g.homeTeam}|${g.awayTeam}`)
    )
    const newGames = mappedGames.filter((g) =>
      !existingKeys.has(`${g.date}|${g.homeTeam}|${g.awayTeam}`)
    )

    const newConfig: PlaydownConfig = {
      teamId,
      totalTeams: newTeams.length,
      qualifyingSpots,
      gamesPerMatchup,
      teams: newTeams,
    }
    setConfig(teamId, newConfig)
    setGames(teamId, [...games, ...newGames])
    setTotalTeams(newTeams.length)
    setGamesText("")
  }

  function handleAddGame() {
    if (!newGameDate || !newGameHome || !newGameAway) return
    const id = `pd-g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    addGame(teamId, {
      id,
      teamId,
      date: newGameDate,
      time: newGameTime,
      homeTeam: newGameHome,
      awayTeam: newGameAway,
      homeScore: null,
      awayScore: null,
      location: newGameLocation,
      played: false,
    })
    setNewGameDate("")
    setNewGameTime("")
    setNewGameHome("")
    setNewGameAway("")
    setNewGameLocation("")
    setShowAddGame(false)
  }

  function handleScoreUpdate(gameId: string, homeScore: string, awayScore: string) {
    const hs = homeScore === "" ? null : parseInt(homeScore, 10)
    const as_ = awayScore === "" ? null : parseInt(awayScore, 10)
    const played = hs !== null && as_ !== null && !isNaN(hs) && !isNaN(as_)
    updateGame(teamId, gameId, {
      homeScore: hs !== null && !isNaN(hs) ? hs : null,
      awayScore: as_ !== null && !isNaN(as_) ? as_ : null,
      played,
    })
  }

  function teamName(id: string): string {
    const t = config?.teams.find((t) => t.id === id)
    return t?.name ?? id
  }

  return (
    <>
      <div className="playdown-title-row">
        <h2 className="text-sm font-semibold">Playdowns</h2>
        <div className="playdown-info-wrap">
          <Info className="playdown-info-icon" />
          <p className="playdown-info-tooltip">
            Go to OWHA &rarr; OWHA Provincial Playdowns &rarr; Age / Level &rarr; Games. Copy / Paste the list of games into the field below and click Import Games. This should update standings and organize everything.
          </p>
        </div>
      </div>

      <div className="import-tabs">
        <button className="import-tab" data-active={subTab === "games"} onClick={() => setSubTab("games")}>
          Games
        </button>
        <button className="import-tab" data-active={subTab === "standings"} onClick={() => setSubTab("standings")}>
          Standings
        </button>
        <button className="import-tab" data-active={subTab === "setup"} onClick={() => setSubTab("setup")}>
          Edit
        </button>
      </div>

      {/* Setup */}
      {subTab === "setup" && (
        <div className="import-section">
          <div className="playdown-config-row">
            <div className="playdown-config-field">
              <label className="game-form-label">Teams</label>
              <input type="number" className="playdown-config-input" min={2} value={totalTeams} onChange={(e) => setTotalTeams(parseInt(e.target.value, 10) || 2)} />
            </div>
            <div className="playdown-config-field">
              <label className="game-form-label">Qualifiers</label>
              <input type="number" className="playdown-config-input" min={1} value={qualifyingSpots} onChange={(e) => setQualifyingSpots(parseInt(e.target.value, 10) || 1)} />
            </div>
            <div className="playdown-config-field">
              <label className="game-form-label">Games per Matchup</label>
              <input type="number" className="playdown-config-input" min={1} value={gamesPerMatchup} onChange={(e) => setGamesPerMatchup(parseInt(e.target.value, 10) || 1)} />
            </div>
          </div>

          <Button onClick={handleSaveConfig}>
            {config ? "Update Config" : "Save Config"}
          </Button>

          {config && (
            confirmDeleteAll ? (
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="sm" onClick={() => { clearPlaydown(teamId); setConfirmDeleteAll(false) }}>
                  Confirm Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteAll(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmDeleteAll(true)}>
                Delete Playdowns
              </Button>
            )
          )}
        </div>
      )}

      {/* Standings */}
      {subTab === "standings" && (
        <div className="import-section">
          {config && (
            <p className="text-sm text-muted-foreground">
              {config.teams.length} teams — top {config.qualifyingSpots} qualify for Provincials
            </p>
          )}
          {standings.length > 0 ? (
            <table className="standings-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Team</th>
                  <th>GP</th>
                  <th>W</th>
                  <th>L</th>
                  <th>T</th>
                  <th>PTS</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>DIFF</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => (
                  <tr
                    key={row.teamId}
                    className={`standings-row ${row.teamId === "self" ? "font-bold" : ""} ${config && i === config.qualifyingSpots - 1 ? "playdown-cutoff" : ""}`}
                  >
                    <td>
                      <span className={`text-xs ${row.qualifies ? "text-green-600" : "text-muted-foreground"}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td>{row.teamName}</td>
                    <td>{row.gp}</td>
                    <td>{row.w}</td>
                    <td>{row.l}</td>
                    <td>{row.t}</td>
                    <td className="font-bold">{row.pts}</td>
                    <td>{row.gf}</td>
                    <td>{row.ga}</td>
                    <td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="dashboard-record-label">No games played yet</p>
          )}

          <div className="game-form-field">
            <label className="game-form-label">Import Standings</label>
            <textarea
              className="import-textarea"
              placeholder="Paste playdown standings table here (tab-separated)..."
              value={standingsText}
              onChange={(e) => setStandingsText(e.target.value)}
            />
            <Button variant="outline" disabled={!standingsText.trim()} onClick={handleImportStandings}>
              Import Standings
            </Button>
          </div>
        </div>
      )}

      {/* Games */}
      {subTab === "games" && (
        <div className="import-section">
          <Button size="sm" variant="outline" onClick={() => setShowAddGame(!showAddGame)}>
            <Plus className="size-3.5" /> Add Game
          </Button>

          {showAddGame && (
            <div className="import-preview">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input type="date" className="game-form-input" value={newGameDate} onChange={(e) => setNewGameDate(e.target.value)} />
                  <input type="time" className="game-form-input" value={newGameTime} onChange={(e) => setNewGameTime(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <select className="game-form-select" value={newGameHome} onChange={(e) => setNewGameHome(e.target.value)}>
                    <option value="">Home Team</option>
                    {(config?.teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select className="game-form-select" value={newGameAway} onChange={(e) => setNewGameAway(e.target.value)}>
                    <option value="">Away Team</option>
                    {(config?.teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <input type="text" className="game-form-input" placeholder="Location" value={newGameLocation} onChange={(e) => setNewGameLocation(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddGame} disabled={!newGameDate || !newGameHome || !newGameAway}>
                    Save Game
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddGame(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          )}

          {games.length === 0 ? (
            <p className="dashboard-record-label">No playdown games yet</p>
          ) : (
            <div className="games-table-wrap">
              <table className="games-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Home</th>
                    <th>Away</th>
                    <th>H</th>
                    <th>A</th>
                    <th>Location</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {games
                    .slice()
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((game) => (
                    <tr key={game.id}>
                      <td>
                        <input
                          type="date"
                          className="games-table-input"
                          style={{ width: "115px" }}
                          defaultValue={game.date}
                          onBlur={(e) => {
                            if (e.target.value !== game.date) updateGame(teamId, game.id, { date: e.target.value })
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          className="games-table-input"
                          style={{ width: "80px" }}
                          defaultValue={game.time}
                          onBlur={(e) => {
                            if (e.target.value !== game.time) updateGame(teamId, game.id, { time: e.target.value })
                          }}
                        />
                      </td>
                      <td><span className="text-xs">{teamName(game.homeTeam)}</span></td>
                      <td><span className="text-xs">{teamName(game.awayTeam)}</span></td>
                      <td>
                        <input
                          type="number"
                          className="games-table-input"
                          style={{ width: "40px" }}
                          defaultValue={game.homeScore ?? ""}
                          onBlur={(e) => handleScoreUpdate(game.id, e.target.value, String(game.awayScore ?? ""))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="games-table-input"
                          style={{ width: "40px" }}
                          defaultValue={game.awayScore ?? ""}
                          onBlur={(e) => handleScoreUpdate(game.id, String(game.homeScore ?? ""), e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="games-table-input"
                          style={{ width: "120px" }}
                          defaultValue={game.location}
                          onBlur={(e) => {
                            if (e.target.value !== game.location) updateGame(teamId, game.id, { location: e.target.value })
                          }}
                        />
                      </td>
                      <td>
                        {confirmDeleteId === game.id ? (
                          <div className="flex gap-1">
                            <button className="games-table-delete" onClick={() => { removeGame(teamId, game.id); setConfirmDeleteId(null) }}>
                              <Trash2 className="size-3.5 text-destructive" />
                            </button>
                            <button className="games-table-delete" onClick={() => setConfirmDeleteId(null)}>
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button className="games-table-delete" onClick={() => setConfirmDeleteId(game.id)}>
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="game-form-field">
            <label className="game-form-label">Import Games</label>
            <textarea
              className="import-textarea"
              placeholder="Paste OWHA game data here (tab-separated)..."
              value={gamesText}
              onChange={(e) => setGamesText(e.target.value)}
            />
            <Button variant="outline" disabled={!gamesText.trim()} onClick={handleImportGames}>
              Import Games
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

// === Admin Page ===

export default function AdminPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const [adminTab, setAdminTab] = useState<AdminTab>("config")
  const [configSubTab, setConfigSubTab] = useState<ConfigSubTab>("events")
  const [eventsSubTab, setEventsSubTab] = useState<EventsSubTab>("playdowns")
  const [dataSubTab, setDataSubTab] = useState<DataSubTab>("import")
  const [editSubTab, setEditSubTab] = useState<EditSubTab>("games")

  if (!team) return null

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">Admin</h1>
        <Link href={`/dashboard/${teamId}`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      <div className="admin-tabs">
        <button
          className="admin-tab"
          data-active={adminTab === "config"}
          onClick={() => setAdminTab("config")}
        >
          Config
        </button>
        <button
          className="admin-tab"
          data-active={adminTab === "data"}
          onClick={() => setAdminTab("data")}
        >
          Data
        </button>
      </div>

      {adminTab === "config" ? (
        <>
          <div className="import-tabs">
            <button className="import-tab" data-active={configSubTab === "events"} onClick={() => setConfigSubTab("events")}>
              Events
            </button>
            <button className="import-tab" data-active={configSubTab === "blank"} onClick={() => setConfigSubTab("blank")}>
              &nbsp;
            </button>
          </div>

          {configSubTab === "events" ? (
            <>
              <div className="import-tabs">
                <button className="import-tab" data-active={eventsSubTab === "tournaments"} onClick={() => setEventsSubTab("tournaments")}>
                  Tournaments
                </button>
                <button className="import-tab" data-active={eventsSubTab === "playoffs"} onClick={() => setEventsSubTab("playoffs")}>
                  Playoffs
                </button>
                <button className="import-tab" data-active={eventsSubTab === "playdowns"} onClick={() => setEventsSubTab("playdowns")}>
                  Playdowns
                </button>
              </div>

              {eventsSubTab === "playdowns" ? (
                <ModesTab teamId={teamId} teamOrganization={team.organization} />
              ) : eventsSubTab === "tournaments" ? (
                <TournamentsTab teamId={teamId} />
              ) : (
                <p className="text-sm text-muted-foreground">Coming soon</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Coming soon</p>
          )}
        </>
      ) : (
        <>
          <div className="import-tabs">
            <button className="import-tab" data-active={dataSubTab === "import"} onClick={() => setDataSubTab("import")}>
              Import
            </button>
            <button className="import-tab" data-active={dataSubTab === "edit"} onClick={() => setDataSubTab("edit")}>
              Edit
            </button>
            <button className="import-tab" data-active={dataSubTab === "backup"} onClick={() => setDataSubTab("backup")}>
              Backup
            </button>
          </div>

          {dataSubTab === "import" ? (
            <ImportDataTab
              teamId={teamId}
              teamOrganization={team.organization}
              teamAgeGroup={team.ageGroup}
              teamLevel={team.level}
            />
          ) : dataSubTab === "edit" ? (
            <>
              <div className="import-tabs">
                <button className="import-tab" data-active={editSubTab === "games"} onClick={() => setEditSubTab("games")}>
                  Games
                </button>
                <button className="import-tab" data-active={editSubTab === "opponents"} onClick={() => setEditSubTab("opponents")}>
                  Opponents
                </button>
              </div>

              {editSubTab === "games" ? (
                <GamesTab teamId={teamId} />
              ) : (
                <OpponentsTab />
              )}
            </>
          ) : (
            <DataTab teamId={teamId} teamName={team.name} />
          )}
        </>
      )}
    </div>
  )
}
