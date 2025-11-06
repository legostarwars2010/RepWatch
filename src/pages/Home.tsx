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
    what_a_yea_vote_means?: string
    what_a_nay_vote_means?: string
  }
}

interface Representative {
  name: string
  party: string
  state: string
  district: number | null
  chamber: string
  votes?: Vote[]
}

export default function Home() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [reps, setReps] = useState<Representative[]>([])
  const [error, setError] = useState('')
  const [expandedVotes, setExpandedVotes] = useState<Set<string>>(new Set())
  const [votesShownCount, setVotesShownCount] = useState<Map<number, number>>(new Map())

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
            const votesToShow = rep.votes?.slice(0, shownCount)
            const hasMore = rep.votes && rep.votes.length > shownCount
            
            return (
              <div key={repIndex} className="p-6 border border-oled-border rounded">
                <div className="mb-4">
                  <h2 className="text-2xl font-light mb-2">{rep.name}</h2>
                  <div className="flex gap-2 text-sm">
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
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-3">Recent Votes</h3>
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
                              
                              {vote.ai_summary && (
                                <>
                                  {vote.ai_summary.short_summary && (
                                    <div className="text-sm text-oled-secondary mb-2 vote-summary">
                                      {vote.ai_summary.short_summary}
                                    </div>
                                  )}
                                  
                                  {vote.ai_summary.medium_summary && (
                                    <>
                                      <button
                                        onClick={() => toggleExpand(voteId)}
                                        className="text-sm text-oled-text hover:text-white transition-colors mb-2 flex items-center gap-1 expand-btn"
                                      >
                                        <span className="expand-text">{isExpanded ? 'Read less' : 'Read more'}</span>
                                        <span className={`expand-icon transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                      </button>
                                      
                                      {isExpanded && (
                                        <div className="text-sm text-oled-secondary mb-2 p-3 bg-oled-border/20 rounded medium-summary">
                                          {vote.ai_summary.medium_summary}
                                        </div>
                                      )}
                                    </>
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
                          See more ({rep.votes!.length - shownCount} remaining)
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-oled-secondary text-sm">No recent votes available</p>
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
