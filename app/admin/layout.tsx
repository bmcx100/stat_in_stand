export const dynamic = "force-dynamic"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: "100dvh", background: "#f9f9f9" }}>
      {children}
    </div>
  )
}
