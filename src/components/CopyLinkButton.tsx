import { useState } from 'react'

interface CopyLinkButtonProps {
  className?: string
}

export default function CopyLinkButton({ className = '' }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      const url = window.location.origin + window.location.pathname
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`text-sm text-oled-secondary hover:text-oled-text transition-colors inline-flex items-center gap-1.5 ${className}`}
      title="Copy link to this page"
    >
      {copied ? (
        <>
          <span className="text-green-400">✓</span> Copied!
        </>
      ) : (
        <>
          <LinkIcon />
          Copy link
        </>
      )}
    </button>
  )
}

function LinkIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  )
}
