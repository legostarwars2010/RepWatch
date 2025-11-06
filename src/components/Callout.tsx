import { ReactNode } from 'react'

interface CalloutProps {
  children: ReactNode
  variant?: 'info' | 'subtle'
}

export default function Callout({ children, variant = 'subtle' }: CalloutProps) {
  return (
    <div className={`px-6 py-4 rounded border ${
      variant === 'info' 
        ? 'bg-oled-border/10 border-oled-border' 
        : 'bg-oled-bg border-oled-border/30'
    }`}>
      <div className="text-oled-secondary">
        {children}
      </div>
    </div>
  )
}
