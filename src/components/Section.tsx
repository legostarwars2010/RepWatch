import { ReactNode } from 'react'

interface SectionProps {
  title: string
  children: ReactNode
}

export default function Section({ title, children }: SectionProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-medium mb-4 pb-2 border-b border-oled-border/30">
        {title}
      </h2>
      <div className="space-y-4 text-oled-secondary">
        {children}
      </div>
    </section>
  )
}
