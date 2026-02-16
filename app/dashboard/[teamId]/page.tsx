import Link from "next/link"
import { TEAMS } from "@/lib/teams"

export default async function Dashboard({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  const team = TEAMS.find((t) => t.id === teamId)

  if (!team) {
    return (
      <div className="dashboard-container">
        <h1 className="dashboard-title">Team not found</h1>
        <Link href="/">Back to My Teams</Link>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">{team.organization} {team.name}</h1>
      <p className="dashboard-subtitle">Dashboard coming soon</p>
      <Link href="/">Back to My Teams</Link>
    </div>
  )
}
