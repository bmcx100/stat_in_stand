"use client"

import { useState, useEffect } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseMhrRankings } from "@/hooks/use-supabase-mhr-rankings"
import { createClient } from "@/lib/supabase/client"

export default function AdminRankingsPage() {
  const team = useTeamContext()
  const { rankings, latestWeek, loading } = useSupabaseMhrRankings(team.id)
  const [mhrTeamNbr, setMhrTeamNbr] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("mhr_config")
      .select("team_nbr")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.team_nbr) setMhrTeamNbr(data.team_nbr)
      })
  }, [team.id])

  if (loading) return <p className="text-muted-foreground">Loading...</p>

  const weekDisplay = latestWeek ? String(latestWeek).slice(-2) : null

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-page-heading">
        <h1 className="admin-section-title">Rankings</h1>
      </div>

      {rankings && rankings.length > 0 ? (
        <>
          <p className="owha-sync-heading">
            Week {weekDisplay} &middot; {rankings.length} teams
          </p>
          <div className="games-table-wrap">
            <table className="games-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>+/−</th>
                  <th>Team</th>
                  <th>GP</th>
                  <th>W</th>
                  <th>L</th>
                  <th>T</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>Rating</th>
                  <th>SOS</th>
                  <th>AGD</th>
                </tr>
              </thead>
              <tbody>
                {rankings
                  .sort((a, b) => a.ranking - b.ranking)
                  .map((r) => {
                    const isOurs = mhrTeamNbr != null && r.team_nbr === mhrTeamNbr
                    return (
                      <tr key={r.team_nbr} className={isOurs ? "playdown-self-row" : ""}>
                        <td>{r.ranking}</td>
                        <td className={r.difference > 0 ? "text-green-500" : r.difference < 0 ? "text-red-500" : ""}>
                          {r.difference > 0 ? `+${r.difference}` : r.difference === 0 ? "–" : r.difference}
                        </td>
                        <td>{r.name}</td>
                        <td>{r.gp}</td>
                        <td>{r.wins}</td>
                        <td>{r.losses}</td>
                        <td>{r.ties}</td>
                        <td>{r.gf}</td>
                        <td>{r.ga}</td>
                        <td>{r.rating.toFixed(1)}</td>
                        <td>{r.sched.toFixed(1)}</td>
                        <td>{r.agd.toFixed(1)}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">
          No rankings data yet. Use Sync Rankings on the Overview page.
        </p>
      )}
    </div>
  )
}
