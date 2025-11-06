import { ReactNode } from 'react'

interface PageShellProps {
  children: ReactNode
}

export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {children}
    </div>
  )
}
