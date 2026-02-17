const STORAGE_KEYS = ["favorite-teams", "team-games", "team-standings", "opponents"]

export type BackupData = {
  version: 1
  createdAt: string
  data: Record<string, string>
}

export function createBackup(): BackupData {
  const data: Record<string, string> = {}
  for (const key of STORAGE_KEYS) {
    const value = localStorage.getItem(key)
    if (value) {
      data[key] = value
    }
  }
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    data,
  }
}

export function downloadBackup() {
  const backup = createBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `stat-in-stand-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function restoreBackup(file: File): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const backup: BackupData = JSON.parse(reader.result as string)
        if (!backup.version || !backup.data) {
          resolve({ success: false, error: "Invalid backup file format" })
          return
        }
        for (const [key, value] of Object.entries(backup.data)) {
          if (STORAGE_KEYS.includes(key)) {
            localStorage.setItem(key, value)
          }
        }
        resolve({ success: true })
      } catch {
        resolve({ success: false, error: "Could not parse backup file" })
      }
    }
    reader.onerror = () => {
      resolve({ success: false, error: "Could not read file" })
    }
    reader.readAsText(file)
  })
}
