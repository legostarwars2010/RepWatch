import { Link } from 'react-router-dom'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  className?: string
}

export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (items.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" className={`text-sm text-oled-secondary ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-oled-border">/</span>}
            {item.href ? (
              <Link to={item.href} className="hover:text-oled-text transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="text-oled-text">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
