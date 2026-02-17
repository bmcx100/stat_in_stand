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
import { computePlaydownStandings } from "@/lib/playdowns"
import type { Game, GameType, Opponent, StandingsRow, PlaydownConfig, PlaydownGame, PlaydownTeam } from "@/lib/types"

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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
      homeScore: played ? hs : null,
      awayScore: played ? as_ : null,
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
