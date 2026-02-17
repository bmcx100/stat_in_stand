"use client"

import { Fragment, use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TEAMS } from "@/lib/teams"
import { useStandings } from "@/hooks/use-standings"

export default function StandingsPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getStandings } = useStandings()
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  if (!team) return null

  const standings = getStandings(teamId)

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">Standings</h1>
        <Link href={`/dashboard/${teamId}`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      {!standings || standings.rows.length === 0 ? (
        <div>
          <p className="dashboard-record-label">No standings data</p>
          <Button variant="outline" size="sm" asChild className="mt-2">
            <Link href={`/dashboard/${teamId}/import`}>Import Standings</Link>
          </Button>
        </div>
      ) : (
        <>
          {standings.sourceUrl && (
            <a
              href={standings.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="back-link"
            >
              View on OWHA <ExternalLink className="size-3" />
            </a>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {standings.rows.map((row, i) => (
                  <Fragment key={i}>
                    <tr
                      className="standings-row"
                      onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                    >
                      <td className="font-medium">{row.teamName}</td>
                      <td>{row.gp}</td>
                      <td>{row.w}</td>
                      <td>{row.l}</td>
                      <td>{row.t}</td>
                      <td className="font-bold">{row.pts}</td>
                      <td>
                        {expandedRow === i
                          ? <ChevronUp className="size-3" />
                          : <ChevronDown className="size-3" />
                        }
                      </td>
                    </tr>
                    {expandedRow === i && (
                      <tr className="standings-expandable">
                        <td colSpan={7}>
                          OTL: {row.otl} | SOL: {row.sol} | GF: {row.gf} | GA: {row.ga} | DIFF: {row.diff} | PIM: {row.pim} | Win%: {row.winPct}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
