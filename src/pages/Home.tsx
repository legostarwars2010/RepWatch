import { useState } from 'react'
import PageShell from '../components/PageShell'

interface Vote {
  vote: string
  vote_date: string
  title?: string
  bill_id?: string
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
  const [expandedVotes, setExpandedVotes] = useState<Set<string>>(new Set())
  const [votesShownCount, setVotesShownCount] = useState<Map<number, number>>(new Map())
  
  // Filter states
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [voteTypeFilter, setVoteTypeFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<string>('recent')

  const getVoteIcon = (vote: string) => {
    const voteUpper = vote.toUpperCase()
    if (voteUpper === 'YEA' || voteUpper === 'AYE') return '✓'
    if (voteUpper === 'NAY' || voteUpper === 'NO') return '✗'
    if (voteUpper === 'PRESENT') return '◯'
    if (voteUpper === 'NOT VOTING') return '—'
    return '•'
  }

  const getVoteClass = (vote: string) => {
    return vote.toLowerCase().replace(/\s+/g, '-')
  }

  const formatBillId = (billId: string) => {
    const match = billId.match(/^([a-z]+)(\d+)-(\d+)$/)
    if (match) {
      const [, type, number, congress] = match
      const typeUpper = type.toUpperCase().split('').join('.') + '.'
      return `${typeUpper} ${number} (${congress}th Congress)`
    }
    return billId
  }

  const toggleExpand = (voteId: string) => {
    setExpandedVotes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(voteId)) {
        newSet.delete(voteId)
      } else {
        newSet.add(voteId)
      }
      return newSet
    })
  }

  const toggleShowMore = (repIndex: number) => {
    setVotesShownCount(prev => {
      const newMap = new Map(prev)
      const currentCount = newMap.get(repIndex) || 5
      newMap.set(repIndex, currentCount + 5)
      return newMap
    })
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setReps([])
    setExpandedVotes(new Set())
    setVotesShownCount(new Map())

    try {
      // Detect if input looks like a name (contains letters but no numbers or common address keywords)
      const hasNumbers = /\d/.test(address)
      const hasAddressKeywords = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|court|ct|place|pl|zip|apt|suite)\b/i.test(address)
      const isLikelyName = !hasNumbers && !hasAddressKeywords && address.trim().split(/\s+/).length >= 2
      
      let response
      if (isLikelyName) {
        // Search by name
        response = await fetch(`/api/lookup-by-name?name=${encodeURIComponent(address)}`)
      } else {
        // Search by address
        response = await fetch(`/api/lookup?address=${encodeURIComponent(address)}`)
      }
      
      if (!response.ok) throw new Error('Failed to find representative')
      
      const data = await response.json()
      
      // Filter to only show House representatives (no senators for now)
      const houseReps = data.representatives?.filter((rep: Representative) => rep.chamber === 'house') || []
      setReps(houseReps)
    } catch (err) {
      console.error('Search error:', err)
      setError('Could not find representative. Please check the address/name and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageShell>
      <form onSubmit={handleSearch} className="max-w-xl mx-auto mb-12">
        <div className="flex gap-3">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter an Address or Representative Name"
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
            const shownCount = votesShownCount.get(repIndex) || 5
            
            // Apply filters
            let filteredVotes = rep.votes || []
            
            // Category filter
            if (categoryFilter !== 'all') {
              filteredVotes = filteredVotes.filter(v => 
                v.ai_summary?.categories?.includes(categoryFilter)
              )
            }
            
            // Vote type filter
            if (voteTypeFilter !== 'all') {
              if (voteTypeFilter === 'yea') {
                filteredVotes = filteredVotes.filter(v => {
                  const voteLower = (v.vote || '').toLowerCase()
                  return voteLower === 'yes' || voteLower === 'yea' || voteLower === 'aye'
                })
              } else if (voteTypeFilter === 'nay') {
                filteredVotes = filteredVotes.filter(v => {
                  const voteLower = (v.vote || '').toLowerCase()
                  return voteLower === 'no' || voteLower === 'nay'
                })
              } else if (voteTypeFilter === 'other') {
                filteredVotes = filteredVotes.filter(v => {
                  const voteLower = (v.vote || '').toLowerCase()
                  return voteLower === 'present' || voteLower === 'not voting'
                })
              }
            }
            
            // Sort order
            if (sortOrder === 'oldest') {
              filteredVotes = [...filteredVotes].reverse()
            }
            
            const votesToShow = filteredVotes.slice(0, shownCount)
            const hasMore = filteredVotes.length > shownCount
            
            return (
              <div key={repIndex} className="p-6 border border-oled-border rounded">
                <div className="mb-4">
                  <h2 className="text-2xl font-light mb-2">{rep.name}</h2>
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
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-medium">Recent Votes</h3>
                    {rep.votes && rep.votes.length > 0 && (
                      <div className="flex gap-2 text-sm">
                        <select 
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          className="px-2 py-1 bg-oled-bg border border-oled-border/50 rounded text-oled-text"
                        >
                          <option value="all">All Categories</option>
                          {Array.from(new Set(rep.votes.flatMap(v => v.ai_summary?.categories || []))).sort().map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        
                        <select 
                          value={voteTypeFilter}
                          onChange={(e) => setVoteTypeFilter(e.target.value)}
                          className="px-2 py-1 bg-oled-bg border border-oled-border/50 rounded text-oled-text"
                        >
                          <option value="all">All Votes</option>
                          <option value="yea">Yes</option>
                          <option value="nay">No</option>
                          <option value="other">Present/Not Voting</option>
                        </select>
                        
                        <select 
                          value={sortOrder}
                          onChange={(e) => setSortOrder(e.target.value)}
                          className="px-2 py-1 bg-oled-bg border border-oled-border/50 rounded text-oled-text"
                        >
                          <option value="recent">Most Recent</option>
                          <option value="oldest">Oldest First</option>
                        </select>
                      </div>
                    )}
                  </div>
                  {votesToShow && votesToShow.length > 0 ? (
                    <>
                      <div className="space-y-4">
                        {votesToShow.map((vote, voteIndex) => {
                          const voteDate = new Date(vote.vote_date).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })
                          const voteIcon = getVoteIcon(vote.vote)
                          const voteClass = getVoteClass(vote.vote)
                          const voteId = `vote-${repIndex}-${voteIndex}`
                          const isExpanded = expandedVotes.has(voteId)
                          
                          return (
                            <div key={voteIndex} className={`p-4 border border-oled-border/50 rounded vote-item vote-${voteClass}`}>
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2 vote-position">
                                  <span className="vote-icon font-bold text-lg">{voteIcon}</span>
                                  <span className="font-medium">{vote.vote}</span>
                                </div>
                                <span className="text-sm text-oled-secondary vote-date">{voteDate}</span>
                              </div>
                              
                              {vote.title && (
                                <div className="text-oled-text mb-2 vote-title">
                                  {vote.title.length > 120 ? `${vote.title.substring(0, 120)}...` : vote.title}
                                </div>
                              )}
                              
                              {vote.bill_id && (
                                <div className="text-sm text-oled-secondary mb-2 vote-bill">{formatBillId(vote.bill_id)}</div>
                              )}
                              
                              {vote.ai_summary?.categories && vote.ai_summary.categories.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {vote.ai_summary.categories.map((cat, idx) => (
                                    <span 
                                      key={idx} 
                                      className="text-xs px-2 py-0.5 bg-oled-border/30 text-oled-secondary rounded"
                                    >
                                      {cat}
                                    </span>
                                  ))}
                                </div>
                              )}
                              
                              {vote.ai_summary && (
                                <>
                                  {vote.ai_summary.short_summary && (
                                    <div className="text-sm text-oled-secondary mb-2 vote-summary">
                                      {vote.ai_summary.short_summary}
                                    </div>
                                  )}
                                  
                                  {isExpanded && vote.ai_summary.medium_summary && (
                                    <div className="text-sm text-oled-secondary mb-3 vote-medium-summary">
                                      {vote.ai_summary.medium_summary}
                                    </div>
                                  )}
                                  
                                  {isExpanded && vote.ai_summary.key_points && vote.ai_summary.key_points.length > 0 && (
                                    <div className="text-sm text-oled-secondary mb-3">
                                      <strong>Key Points:</strong>
                                      <ul className="list-disc list-inside mt-1 space-y-1">
                                        {vote.ai_summary.key_points.map((point, idx) => (
                                          <li key={idx}>{point}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  
                                  {isExpanded && vote.ai_summary.vote_context && (
                                    <div className="text-xs text-oled-secondary/70 mb-2 italic">
                                      {vote.ai_summary.vote_context.stage && vote.ai_summary.vote_context.vote_type && (
                                        <span>{vote.ai_summary.vote_context.stage} · {vote.ai_summary.vote_context.vote_type}</span>
                                      )}
                                      {vote.ai_summary.vote_context.status_quo_brief && (
                                        <span className="block mt-1">Current law: {vote.ai_summary.vote_context.status_quo_brief}</span>
                                      )}
                                    </div>
                                  )}
                                  
                                  <div className="text-sm text-oled-secondary vote-explanation">
                                    {vote.vote.toUpperCase() === 'YEA' || vote.vote.toUpperCase() === 'AYE' ? (
                                      <><strong>Voted YES:</strong> {vote.ai_summary.what_a_yea_vote_means || 'Supported this measure'}</>
                                    ) : vote.vote.toUpperCase() === 'NAY' || vote.vote.toUpperCase() === 'NO' ? (
                                      <><strong>Voted NO:</strong> {vote.ai_summary.what_a_nay_vote_means || 'Opposed this measure'}</>
                                    ) : vote.vote.toUpperCase() === 'PRESENT' ? (
                                      <><strong>Present:</strong> Was there but chose not to vote yes or no</>
                                    ) : vote.vote.toUpperCase() === 'NOT VOTING' ? (
                                      <><strong>Not Voting:</strong> Did not cast a vote on this measure</>
                                    ) : null}
                                  </div>
                                  
                                  <button
                                    onClick={() => toggleExpand(voteId)}
                                    className="mt-2 text-xs text-oled-secondary hover:text-oled-text underline"
                                  >
                                    {isExpanded ? 'Show less' : 'Show more details'}
                                  </button>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      
                      {hasMore && (
                        <button
                          onClick={() => toggleShowMore(repIndex)}
                          className="mt-4 px-4 py-2 bg-oled-border/30 hover:bg-oled-border/50 rounded text-oled-text transition-colors see-more-btn"
                        >
                          See more ({filteredVotes.length - shownCount} remaining)
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-oled-secondary text-sm">No votes match the selected filters</p>
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
