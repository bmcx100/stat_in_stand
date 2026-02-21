"use client"

import { useState } from "react"
import { HelpCircle, X } from "lucide-react"

export function AdminHelp({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="ob-nav-link" onClick={() => setOpen(true)}>
        <HelpCircle className="ob-nav-icon" />
        Help
      </button>

      {open && (
        <>
          <div className="help-backdrop" onClick={() => setOpen(false)} />
          <div className="help-panel">
            <div className="help-panel-header">
              <span className="help-panel-title">Help</span>
              <button className="help-panel-close" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="help-panel-body">
              {children}
            </div>
          </div>
        </>
      )}
    </>
  )
}
