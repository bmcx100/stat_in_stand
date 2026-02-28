"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import MatricivesContent from "../matricives-content"

export default function MatricivesPage() {
  const team = useTeamContext()

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">Simulator</h1>
        <Link href={`/team/${team.slug}/playdowns`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>
      <MatricivesContent />
    </div>
  )
}
