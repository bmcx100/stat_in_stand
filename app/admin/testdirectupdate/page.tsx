"use client"

import { useEffect, useState } from "react"
import type { OWHAGame } from "@/app/api/owha-schedule/route"

export default function TestDirectUpdatePage() {
  const [games, setGames] = useState<OWHAGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/owha-schedule")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setGames(data.games)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="owha-wrap"><p className="owha-subheading">Loading OWHA schedule…</p></div>
  }

  if (error) {
    return <div className="owha-wrap"><p className="owha-subheading">Error: {error}</p></div>
  }

  return (
    <div className="owha-wrap">
      <h1 className="owha-heading">OWHA Schedule — Division 27225</h1>
      <p className="owha-subheading">{games.length} games fetched live from owha.on.ca</p>

      <div className="owha-scroll">
        <table className="owha-table">
          <thead>
            <tr>
              <th className="owha-th">#</th>
              <th className="owha-th">Date</th>
              <th className="owha-th">Location</th>
              <th className="owha-th">Home</th>
              <th className="owha-th-center">Score</th>
              <th className="owha-th">Visitor</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => {
              const played = game.homeScore !== null && game.visitorScore !== null
              return (
                <tr key={game.id} className="owha-tr">
                  <td className="owha-td-mono">{game.id}</td>
                  <td className="owha-td">
                    <span>{game.date}</span>
                    {game.notes && <p className="owha-notes">{game.notes}</p>}
                  </td>
                  <td className="owha-td">
                    <span className="owha-location">{game.location}</span>
                  </td>
                  <td className="owha-td">{game.homeTeam}</td>
                  <td className="owha-td-center">
                    {played ? (
                      <span className="owha-score-played">
                        {game.homeScore}–{game.visitorScore}
                      </span>
                    ) : (
                      <span className="owha-score-pending">—</span>
                    )}
                  </td>
                  <td className="owha-td">{game.visitorTeam}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
