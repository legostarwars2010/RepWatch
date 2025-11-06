interface KeyValueProps {
  label: string
  value: string | JSX.Element
}

export default function KeyValue({ label, value }: KeyValueProps) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 py-3 border-b border-oled-border/20 last:border-0">
      <dt className="text-oled-secondary font-medium">{label}</dt>
      <dd className="text-oled-text">{value}</dd>
    </div>
  )
}
