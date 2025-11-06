import { ReactNode } from 'react'

interface PageTitleProps {
  children: ReactNode
  subtitle?: string
}

export default function PageTitle({ children, subtitle }: PageTitleProps) {
  return (
    <div className="text-center mb-12">
      <h1 className="text-3xl font-light tracking-wide mb-3">{children}</h1>
      {subtitle && (
        <p className="text-oled-secondary text-base">{subtitle}</p>
      )}
    </div>
  )
}
