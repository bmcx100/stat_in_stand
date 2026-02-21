"use client"

import { useState, useMemo } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseOpponents } from "@/hooks/use-supabase-opponents"
import { parseOwhaTeamList, parseMhrTeamList } from "@/lib/parsers"
import type { Opponent } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, X } from "lucide-react"

export default function AdminOpponentsPage() {
  const team = useTeamContext()
  const { opponents, addOpponents, updateOpponent, removeOpponent, loading } =
    useSupabaseOpponents(team.id)

  // --- Import state ---
  const [importSource, setImportSource] = useState<"owha" | "mhr">("mhr")
  const [importText, setImportText] = useState("")
  const [parsed, setParsed] = useState<Opponent[]>([])
  const [importDone, setImportDone] = useState(false)

  // --- Manual add state ---
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualFullName, setManualFullName] = useState("")
  const [manualLocation, setManualLocation] = useState("")
  const [manualTeamName, setManualTeamName] = useState("")
  const [manualOwhaId, setManualOwhaId] = useState("")

  // --- Delete confirmation state ---
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const existingOwhaIds = useMemo(
    () => new Set(opponents.map((o) => o.owhaId).filter(Boolean)),
    [opponents]
  )

  const existingFullNames = useMemo(
    () => new Set(opponents.map((o) => o.fullName.toLowerCase())),
    [opponents]
  )

  const sorted = useMemo(
    () => [...opponents].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [opponents]
  )

  const duplicateNames = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of opponents) {
      counts[o.fullName] = (counts[o.fullName] || 0) + 1
    }
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1))
  }, [opponents])

  // --- Import handlers ---
  function handleParse() {
    const result = importSource === "owha"
      ? parseOwhaTeamList(importText, team.age_group, team.level)
      : parseMhrTeamList(importText, team.age_group, team.level)
    const withSplit = result.map((o) => {
      const parts = o.fullName.trim().split(/\s+/)
      return {
        ...o,
        location: parts[0] ?? "",
        name: parts.slice(1).join(" "),
      }
    })
    setParsed(withSplit)
    setImportDone(false)
  }

  function handleRemoveParsed(fullName: string) {
    setParsed((prev) => prev.filter((p) => p.fullName !== fullName))
  }

  function handleParsedFieldChange(owhaId: string | undefined, fullName: string, field: "location" | "name", value: string) {
    setParsed((prev) => prev.map((p) =>
      (owhaId ? p.owhaId === owhaId : p.fullName === fullName)
        ? { ...p, [field]: value }
        : p
    ))
  }

  function isExisting(p: Opponent) {
    if (p.owhaId && existingOwhaIds.has(p.owhaId)) return true
    return existingFullNames.has(p.fullName.toLowerCase())
  }

  async function handleConfirmImport() {
    const newOps = parsed.filter((p) => !isExisting(p))
    if (newOps.length > 0) {
      await addOpponents(
        newOps.map((o) => ({
          fullName: o.fullName,
          location: o.location,
          name: o.name,
          ageGroup: o.ageGroup,
          level: o.level,
          owhaId: o.owhaId,
        }))
      )
    }
    setImportDone(true)
  }

  function handleImportMore() {
    setImportText("")
    setParsed([])
    setImportDone(false)
  }

  function handleSourceChange(source: "owha" | "mhr") {
    setImportSource(source)
    setImportText("")
    setParsed([])
    setImportDone(false)
  }

  // --- Manual add handlers ---
  async function handleManualSave() {
    if (!manualFullName.trim()) return
    await addOpponents([
      {
        fullName: manualFullName.trim(),
        location: manualLocation.trim(),
        name: manualTeamName.trim(),
        ageGroup: "",
        level: "",
        owhaId: manualOwhaId.trim() || undefined,
      },
    ])
    setManualFullName("")
    setManualLocation("")
    setManualTeamName("")
    setManualOwhaId("")
    setShowManualForm(false)
  }

  function handleManualCancel() {
    setManualFullName("")
    setManualLocation("")
    setManualTeamName("")
    setManualOwhaId("")
    setShowManualForm(false)
  }

  // --- Inline edit handler ---
  function handleFieldBlur(
    opponentId: string,
    field: keyof Opponent,
    value: string,
    original: string
  ) {
    if (value !== original) {
      updateOpponent(opponentId, { [field]: value })
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading opponents...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-page-heading">
        <h1 className="admin-section-title">Opponents</h1>
      </div>

      {/* === Import Section === */}
      <div className="import-section">
        <h2 className="dashboard-record-label">Import Team List</h2>
        <div className="import-tabs">
          <button
            className="import-tab"
            data-active={importSource === "mhr"}
            onClick={() => handleSourceChange("mhr")}
          >
            My Hockey Rankings
          </button>
          <button
            className="import-tab"
            data-active={importSource === "owha"}
            onClick={() => handleSourceChange("owha")}
          >
            OWHA
          </button>
        </div>
        {importSource === "mhr" && (
          <a
            href="https://myhockeyrankings.com/association-info?a=1970"
            target="_blank"
            rel="noopener noreferrer"
            className="import-source-link"
          >
            Link: https://myhockeyrankings.com/association-info?a=1970
          </a>
        )}
        {importSource === "owha" && (
          <a
            href="https://www.owha.on.ca/"
            target="_blank"
            rel="noopener noreferrer"
            className="import-source-link"
          >
            Link: https://www.owha.on.ca/
          </a>
        )}
        <textarea
          className="import-textarea"
          rows={6}
          placeholder={
            importSource === "owha"
              ? "Paste OWHA team list here (e.g. Team Name #12345) - owha.on.ca - OWHL-EASTERN - AGE - LEVEL - Copy Paste Menu"
              : "Paste My Hockey Rankings table here - myhockeyrankings.com"
          }
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        {!importDone && parsed.length === 0 && (
          <Button onClick={handleParse} disabled={!importText.trim()}>
            Parse
          </Button>
        )}

        {parsed.length > 0 && !importDone && (
          <div className="import-preview">
            <div className="flex gap-2 items-center flex-wrap">
              <Button onClick={handleConfirmImport} className="btn-import">
                Confirm Import ({parsed.filter((p) => !isExisting(p)).length} new)
              </Button>
              <Button variant="ghost" onClick={handleImportMore}>
                <X className="size-4" /> Cancel
              </Button>
              <p className="dashboard-record-label">
                {parsed.length} team{parsed.length !== 1 ? "s" : ""} found — confirm location / name before importing
              </p>
            </div>
            <div className="games-table-wrap">
              <table className="games-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Location</th>
                    <th>Name</th>
                    <th>OWHA ID</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((p) => {
                    const exists = isExisting(p)
                    return (
                      <tr key={p.owhaId || p.fullName} className={exists ? "opacity-40" : ""}>
                        <td>{p.fullName}{exists && " ✓"}</td>
                        <td>
                          <input
                            className="games-table-input"
                            value={p.location}
                            disabled={exists}
                            onChange={(e) => handleParsedFieldChange(p.owhaId, p.fullName, "location", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="games-table-input"
                            value={p.name}
                            disabled={exists}
                            onChange={(e) => handleParsedFieldChange(p.owhaId, p.fullName, "name", e.target.value)}
                          />
                        </td>
                        <td className="text-muted-foreground">{p.owhaId}</td>
                        <td>
                          {!exists && (
                            <button className="games-table-delete" onClick={() => handleRemoveParsed(p.fullName)}>
                              <X className="size-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importDone && (
          <div className="flex gap-2 items-center">
            <p className="text-sm text-muted-foreground">Import complete.</p>
            <Button variant="outline" onClick={handleImportMore}>
              Import More
            </Button>
          </div>
        )}
      </div>

      {/* === Manual Add === */}
      <div>
        {!showManualForm ? (
          <Button variant="outline" onClick={() => setShowManualForm(true)}>
            <Plus className="size-4" /> Add Opponent Manually
          </Button>
        ) : (
          <div className="import-section">
            <h2 className="dashboard-record-label">Add Opponent</h2>
            <div className="game-form-field">
              <label className="game-form-label">Full Name *</label>
              <input
                className="game-form-input"
                value={manualFullName}
                onChange={(e) => setManualFullName(e.target.value)}
                placeholder="e.g. Nepean Wildcats U13 BB"
              />
            </div>
            <div className="game-form-field">
              <label className="game-form-label">Location</label>
              <input
                className="game-form-input"
                value={manualLocation}
                onChange={(e) => setManualLocation(e.target.value)}
                placeholder="e.g. Nepean"
              />
            </div>
            <div className="game-form-field">
              <label className="game-form-label">Team Name</label>
              <input
                className="game-form-input"
                value={manualTeamName}
                onChange={(e) => setManualTeamName(e.target.value)}
                placeholder="e.g. Wildcats"
              />
            </div>
            <div className="game-form-field">
              <label className="game-form-label">OWHA ID</label>
              <input
                className="game-form-input"
                value={manualOwhaId}
                onChange={(e) => setManualOwhaId(e.target.value)}
                placeholder="e.g. 12345"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleManualSave} disabled={!manualFullName.trim()}>
                Save
              </Button>
              <Button variant="ghost" onClick={handleManualCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* === Opponents List === */}
      <div>
        <h2 className="admin-section-title">
          All Opponents ({opponents.length})
        </h2>
        {opponents.length === 0 ? (
          <p className="text-muted-foreground text-sm">No opponents yet.</p>
        ) : (
          <div className="games-table-wrap">
            <table className="games-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Location</th>
                  <th>Name</th>
                  <th>OWHA ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((opp) => (
                  <tr
                    key={opp.id}
                    style={
                      duplicateNames.has(opp.fullName)
                        ? { backgroundColor: "oklch(0.9 0.1 95)" }
                        : undefined
                    }
                  >
                    <td>{opp.fullName}</td>
                    <td>
                      <input
                        className="games-table-input"
                        defaultValue={opp.location}
                        onBlur={(e) =>
                          handleFieldBlur(opp.id, "location", e.target.value, opp.location)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="games-table-input"
                        defaultValue={opp.name}
                        onBlur={(e) =>
                          handleFieldBlur(opp.id, "name", e.target.value, opp.name)
                        }
                      />
                    </td>
                    <td className="text-muted-foreground">{opp.owhaId || ""}</td>
                    <td>
                      {confirmDeleteId === opp.id ? (
                        <span className="flex gap-1 items-center">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              removeOpponent(opp.id)
                              setConfirmDeleteId(null)
                            }}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <button
                          className="games-table-delete"
                          onClick={() => setConfirmDeleteId(opp.id)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <a className="dashboard-nav-link" href={`/admin/team/${team.slug}`}>
        Back to Team Hub
      </a>
    </div>
  )
}
