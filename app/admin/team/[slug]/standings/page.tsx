"use client"

import { useState } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import type { StandingsRow } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Pencil, Check, Trash2 } from "lucide-react"

const NUM_COLS: (keyof StandingsRow)[] = ["gp", "w", "l", "t", "otl", "sol", "pts", "gf", "ga"]

export default function AdminStandingsPage() {
  const team = useTeamContext()
  const { standings, setStandings, loading } = useSupabaseStandings(team.id)

  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<StandingsRow[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  function handleEdit() {
    setRows(standings?.rows ? standings.rows.map((r) => ({ ...r })) : [])
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    await setStandings(standings?.sourceUrl ?? "", rows)
    setSaving(false)
    setEditing(false)
  }

  function updateCell(index: number, field: keyof StandingsRow, value: string) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== index) return r
      const updated = { ...r }
      if (field === "teamName") {
        updated.teamName = value
      } else {
        (updated as Record<string, unknown>)[field] = value === "" ? 0 : Number(value)
      }
      return updated
    }))
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>

  const displayRows = editing ? rows : (standings?.rows ?? [])

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-page-heading">
        <h1 className="admin-section-title">Standings</h1>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="owha-sync-heading">Current Standings</h2>
          <div className="flex items-center gap-2">
            {confirmClear ? (
              <>
                <span className="text-destructive text-sm">Clear all standings?</span>
                <Button variant="destructive" size="sm" onClick={async () => { await setStandings("", []); setConfirmClear(false) }}>
                  Confirm
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {editing ? (
                  <Button size="sm" onClick={handleSave} disabled={saving}
                    style={{ backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" }}>
                    <Check className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={handleEdit}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
                      <Trash2 className="h-4 w-4" /> Clear All
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {displayRows.length > 0 ? (
          <div className="games-table-wrap">
            <table className="games-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>GP</th>
                  <th>W</th>
                  <th>L</th>
                  <th>T</th>
                  <th>OTL</th>
                  <th>SOL</th>
                  <th>PTS</th>
                  <th>GF</th>
                  <th>GA</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      {editing ? (
                        <input
                          className="games-table-input"
                          type="text"
                          value={row.teamName}
                          onChange={(e) => updateCell(i, "teamName", e.target.value)}
                        />
                      ) : row.teamName}
                    </td>
                    {NUM_COLS.map((col) => (
                      <td key={col}>
                        {editing ? (
                          <input
                            className="games-table-score-input"
                            type="number"
                            min={0}
                            value={(row as Record<string, unknown>)[col] as number}
                            onChange={(e) => updateCell(i, col, e.target.value)}
                          />
                        ) : (row as Record<string, unknown>)[col] as number}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground">No standings data yet. Use Sync Standings on the Overview page.</p>
        )}
      </div>
    </div>
  )
}
