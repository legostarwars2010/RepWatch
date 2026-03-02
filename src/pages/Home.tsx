import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { apiUrl } from '../api'

interface Vote {
  vote: string
  vote_date: string
  issue_id?: number | null
  title?: string
  bill_id?: string
  categories?: string[]
  ai_summary?: {
    short_summary?: string
    medium_summary?: string
    key_points?: string[]
    vote_context?: {
      vote_type?: string
      stage?: string
      status_quo_brief?: string
    }
    what_a_yea_vote_means?: string
    what_a_nay_vote_means?: string
    categories?: string[]
  }
}

interface Representative {
  id?: number
  name: string
  party: string
  state: string
  district: number | null
  chamber: string
  phone?: string
  website?: string
  votes?: Vote[]
}

export default function Home() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [reps, setReps] = useState<Representative[]>([])
  const [error, setError] = useState('')

  const getVoteIcon = (vote: string) => {
    const voteUpper = vote.toUpperCase()
    if (voteUpper === 'YEA' || voteUpper === 'AYE') return '✓'
    if (voteUpper === 'NAY' || voteUpper === 'NO') return '✗'
    if (voteUpper === 'PRESENT') return '◯'
    if (voteUpper === 'NOT VOTING') return '—'
    return '•'
  }

  const runSearch = async (query: string) => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError('')
    setReps([])

    try {
      const hasNumbers = /\d/.test(q)
      const hasAddressKeywords = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|court|ct|place|pl|zip|apt|suite)\b/i.test(q)
      const isLikelyName = !hasNumbers && !hasAddressKeywords && q.split(/\s+/).length >= 2

      let response
      if (isLikelyName) {
        response = await fetch(apiUrl(`/api/lookup-by-name?name=${encodeURIComponent(q)}`))
      } else {
        response = await fetch(apiUrl(`/api/lookup?address=${encodeURIComponent(q)}`))
      }

      if (!response.ok) throw new Error('Failed to find representative')
      const data = await response.json()
      const houseReps = data.representatives?.filter((rep: Representative) => rep.chamber === 'house') || []
      setReps(houseReps)
    } catch (err) {
      console.error('Search error:', err)
      setError('Could not find representative. Please check the address/name and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    runSearch(address)
  }

  return (
    <PageShell>
      <form onSubmit={handleSearch} className="max-w-xl mx-auto mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address, ZIP code, or representative name"
            className="flex-1 px-4 py-3 bg-oled-bg border border-oled-border rounded text-oled-text placeholder-oled-secondary focus:outline-none focus:border-oled-text transition-colors"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-oled-text text-oled-bg rounded font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>
      {error && (
        <div className="max-w-xl mx-auto p-4 border border-red-500/30 bg-red-500/10 rounded text-red-400 text-center">
          {error}
        </div>
      )}

      {reps.length > 0 && (
        <div className="max-w-2xl mx-auto space-y-4">
          {reps.map((rep, repIndex) => {
            const districtDisplay = rep.district === null || rep.district === 0 ? 'At-Large' : `District ${rep.district}`
            const partyClass = rep.party?.toLowerCase() || ''
            const votesToShow = (rep.votes || []).slice(0, 5)
            
            return (
              <div key={repIndex} className="p-6 border border-oled-border rounded">
                <div className="mb-4">
                  <h2 className="text-2xl font-light mb-2">
                    {rep.id != null ? (
                      <Link to={`/reps/${rep.id}`} className="hover:underline">{rep.name}</Link>
                    ) : (
                      rep.name
                    )}
                  </h2>
                  <div className="flex gap-2 text-sm mb-3">
                    <span className={`px-2 py-1 rounded ${
                      partyClass === 'republican' ? 'bg-red-900/30 text-red-400' :
                      partyClass === 'democrat' ? 'bg-blue-900/30 text-blue-400' :
                      'bg-gray-700/30 text-gray-400'
                    }`}>
                      {rep.party}
                    </span>
                    <span className="px-2 py-1 rounded bg-oled-border/30 text-oled-secondary">
                      {rep.state} {districtDisplay}
                    </span>
                  </div>
                  {(rep.phone || rep.website) && (
                    <div className="flex flex-col gap-1 text-sm text-oled-secondary">
                      {rep.phone && (
                        <div className="flex items-center gap-2">
                          <span>📞</span>
                          <a href={`tel:${rep.phone}`} className="hover:text-oled-text transition-colors">
                            {rep.phone}
                          </a>
                        </div>
                      )}
                      {rep.website && (
                        <div className="flex items-center gap-2">
                          <span>🌐</span>
                          <a 
                            href={rep.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="hover:text-oled-text transition-colors"
                          >
                            {rep.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  {rep.id != null && (
                    <Link
                      to={`/reps/${rep.id}`}
                      className="text-sm text-oled-secondary hover:text-oled-text underline mt-2 inline-block"
                    >
                      View full profile →
                    </Link>
                  )}
                </div>
                
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-lg font-medium">Recent votes</h3>
                    {rep.votes && rep.votes.length > 5 && (
                      <span className="text-xs text-oled-secondary">
                        Showing 5 of {rep.votes.length} votes
                      </span>
                    )}
                  </div>
                  {votesToShow && votesToShow.length > 0 ? (
                    <div className="space-y-3">
                      {votesToShow.map((vote, voteIndex) => {
                        const voteDate = new Date(vote.vote_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                        const voteIcon = getVoteIcon(vote.vote)
                        const title = vote.title || 'Vote'
                        
                        return (
                          <div key={voteIndex} className="p-4 border border-oled-border/50 rounded">
                            <div className="flex justify-between items-start mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-lg">{voteIcon}</span>
                                <span className="font-medium">
                                  {vote.vote || '—'}
                                </span>
                              </div>
                              <span className="text-sm text-oled-secondary">{voteDate}</span>
                            </div>
                            <div className="text-oled-text text-sm mb-1">
                              {vote.issue_id != null ? (
                                <Link to={`/issues/${vote.issue_id}`} className="hover:underline">
                                  {title.length > 100 ? `${title.substring(0, 100)}...` : title}
                                </Link>
                              ) : (
                                title.length > 100 ? `${title.substring(0, 100)}...` : title
                              )}
                            </div>
                            {vote.ai_summary?.short_summary && (
                              <div className="text-xs text-oled-secondary mb-1">
                                {vote.ai_summary.short_summary.length > 140
                                  ? `${vote.ai_summary.short_summary.substring(0, 140)}...`
                                  : vote.ai_summary.short_summary}
                              </div>
                            )}
                            {vote.issue_id != null && (
                              <div className="mt-1">
                                <Link
                                  to={`/issues/${vote.issue_id}`}
                                  className="text-xs text-oled-secondary hover:text-oled-text underline"
                                >
                                  View full breakdown →
                                </Link>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-oled-secondary text-sm">No recent votes available.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
