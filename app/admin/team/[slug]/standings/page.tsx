"use client"

import { useState } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import { parseOwhaStandings } from "@/lib/parsers"
import type { StandingsRow } from "@/lib/types"
import { Button } from "@/components/ui/button"

type ImportStep = "input" | "preview" | "done"

export default function AdminStandingsPage() {
  const team = useTeamContext()
  const { standings, setStandings, loading } = useSupabaseStandings(team.id)

  const [step, setStep] = useState<ImportStep>("input")
  const [sourceUrl, setSourceUrl] = useState(standings?.sourceUrl ?? "")
  const [rawText, setRawText] = useState("")
  const [parsed, setParsed] = useState<StandingsRow[]>([])
  const [error, setError] = useState("")

  function handleParse() {
    setError("")
    const rows = parseOwhaStandings(rawText)
    if (rows.length === 0) {
      setError("No standings rows could be parsed. Check the pasted data.")
      return
    }
    setParsed(rows)
    setStep("preview")
  }

  async function handleConfirm() {
    await setStandings(sourceUrl, parsed)
    setStep("done")
  }

  function handleImportMore() {
    setRawText("")
    setParsed([])
    setError("")
    setStep("input")
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-page-heading">
        <h1 className="admin-section-title">Standings Import</h1>
      </div>

      {/* Import Section */}
      <div className="import-section">
        {step === "input" && (
          <div className="flex flex-col gap-4">
            <div className="game-form-field">
              <label className="game-form-label">Source URL</label>
              <input
                className="game-form-input"
                type="url"
                placeholder="https://www.owha.com/..."
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>

            <div className="game-form-field">
              <label className="game-form-label">Paste OWHA Standings</label>
              <textarea
                className="import-textarea"
                rows={10}
                placeholder="Paste tab-separated standings data here..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button onClick={handleParse} disabled={!rawText.trim()}>
              Parse Standings
            </Button>
          </div>
        )}

        {step === "preview" && (
          <div className="import-preview">
            <p className="text-sm text-muted-foreground mb-2">
              {parsed.length} team{parsed.length !== 1 ? "s" : ""} parsed
            </p>

            <div className="overflow-x-auto">
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>GP</th>
                    <th>W</th>
                    <th>L</th>
                    <th>T</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row, i) => (
                    <tr key={i} className="standings-row">
                      <td>{row.teamName}</td>
                      <td>{row.gp}</td>
                      <td>{row.w}</td>
                      <td>{row.l}</td>
                      <td>{row.t}</td>
                      <td>{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 mt-4">
              <Button onClick={handleConfirm} className="btn-import">Confirm Import</Button>
              <Button variant="outline" onClick={() => setStep("input")}>
                Back
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Standings imported successfully.
            </p>
            <Button variant="outline" onClick={handleImportMore}>
              Import More
            </Button>
          </div>
        )}
      </div>

      {/* Current Standings */}
      <div className="flex flex-col gap-2">
        <h2 className="admin-section-title">Current Standings</h2>

        {standings && standings.rows.length > 0 ? (
          <>
            {standings.sourceUrl && (
              <p className="dashboard-record-label">
                Source: {standings.sourceUrl}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>GP</th>
                    <th>W</th>
                    <th>L</th>
                    <th>T</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.rows.map((row, i) => (
                    <tr key={i} className="standings-row">
                      <td>{row.teamName}</td>
                      <td>{row.gp}</td>
                      <td>{row.w}</td>
                      <td>{row.l}</td>
                      <td>{row.t}</td>
                      <td>{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">No standings data</p>
        )}
      </div>
    </div>
  )
}
