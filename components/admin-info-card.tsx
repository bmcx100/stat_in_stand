"use client"

import { useState } from "react"
import { Info, ChevronDown, ChevronUp, ListChecks } from "lucide-react"

export function AdminInfoCard({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="admin-info-card">
      <button className="admin-info-toggle" onClick={() => setOpen(!open)}>
        <Info className="admin-info-icon" />
        Instructions
        {open ? <ChevronUp className="admin-info-chevron" /> : <ChevronDown className="admin-info-chevron" />}
      </button>
      {open && <div className="admin-info-body">{children}</div>}
    </div>
  )
}

export function SetupCard({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="admin-setup-card">
      <button className="admin-setup-toggle" onClick={() => setOpen(!open)}>
        <ListChecks className="admin-info-icon" />
        Setup
        {open ? <ChevronUp className="admin-info-chevron" /> : <ChevronDown className="admin-info-chevron" />}
      </button>
      {open && <div className="admin-info-body">{children}</div>}
    </div>
  )
}
