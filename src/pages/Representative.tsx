import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import Breadcrumbs from '../components/Breadcrumbs'
import CopyLinkButton from '../components/CopyLinkButton'
import { apiUrl } from '../api'

interface Vote {
  vote: string
  vote_date: string
  roll_call: string
  chamber: string
  issue_id: number | null
  bill_id: string | null
  title: string | null
  vote_metadata?: { question?: string }
  ai_summary?: {
    short_summary?: string
    categories?: string[]
  } | null
}

interface Rep {
  id: number
  name: string
  party: string | null
  state: string
  district: number | null
  chamber: string
  bioguide_id: string | null
  phone: string | null
  website: string | null
  contact_json?: unknown
  photo_url: string | null
}

interface RepResponse {
  representative: Rep
  votes: Vote[]
}

function formatBillId(billId: string | null): string {
  if (!billId) return ''
  const match = String(billId).match(/^([a-z]+)(\d+)-(\d+)$/i)
  if (match) {
    const [, type, num, congress] = match
    const typeUpper = (type || '').toUpperCase().split('').join('.') + '.'
    return `${typeUpper} ${num} (${congress}th Congress)`
  }
  return billId
}

function getVoteIcon(vote: string): string {
  const v = (vote || '').toUpperCase()
  if (v === 'YEA' || v === 'AYE' || v === 'YES') return '✓'
  if (v === 'NAY' || v === 'NO') return '✗'
  if (v === 'PRESENT') return '◯'
  if (v === 'NOT VOTING') return '—'
  return '•'
}

export default function Representative() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<RepResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError('')
    fetch(apiUrl(`/api/reps/${id}`))
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Representative not found' : 'Failed to load')
        return res.json()
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <PageShell>
        <div className="text-center text-oled-secondary py-12">Loading...</div>
      </PageShell>
    )
  }

  if (error || !data) {
    return (
      <PageShell>
        <div className="text-center py-12">
          <p className="text-red-400 mb-4">{error || 'Representative not found'}</p>
          <Link to="/" className="text-oled-secondary hover:text-oled-text underline">Back to search</Link>
        </div>
      </PageShell>
    )
  }

  const { representative: rep, votes } = data
  const partyClass = (rep.party || '').toLowerCase()
  const districtDisplay = rep.district === null || rep.district === 0 ? 'At-Large' : `District ${rep.district}`
  const initials = rep.name ? rep.name.split(/\s+/).map((n) => n.charAt(0)).join('').slice(0, 2).toUpperCase() : '?'

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto">
        <Breadcrumbs items={[{ label: 'Search', href: '/' }, { label: rep.name }]} className="mb-4" />
        <Link to="/" className="text-sm text-oled-secondary hover:text-oled-text mb-6 inline-block">← Back to search</Link>

        {/* Profile */}
        <div className="mb-10 p-6 border border-oled-border rounded flex flex-col sm:flex-row gap-6">
          <div className="flex-shrink-0">
            {rep.photo_url ? (
              <img
                src={rep.photo_url}
                alt={`${rep.name} official portrait`}
                className="w-32 h-32 rounded-full object-cover border border-oled-border bg-oled-card"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  const fallback = e.currentTarget.nextElementSibling
                  if (fallback) (fallback as HTMLElement).style.display = 'flex'
                }}
              />
            ) : null}
            <div
              className="w-32 h-32 rounded-full border border-oled-border bg-oled-card flex items-center justify-center text-2xl font-light text-oled-secondary"
              style={{ display: rep.photo_url ? 'none' : 'flex' }}
              aria-hidden
            >
              {initials}
            </div>
          </div>
          <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-light text-oled-text mb-3">{rep.name}</h1>
          <div className="flex flex-wrap gap-2 text-sm mb-4">
            <span className={`px-2 py-1 rounded ${
              partyClass === 'republican' ? 'bg-red-900/30 text-red-400' :
              partyClass === 'democrat' ? 'bg-blue-900/30 text-blue-400' :
              'bg-gray-700/30 text-gray-400'
            }`}>
              {rep.party || 'Unknown'}
            </span>
            <span className="px-2 py-1 rounded bg-oled-border/30 text-oled-secondary">
              {rep.state} {districtDisplay}
            </span>
            {rep.chamber && (
              <span className="px-2 py-1 rounded bg-oled-border/30 text-oled-secondary capitalize">
                {rep.chamber}
              </span>
            )}
          </div>
          <CopyLinkButton className="mt-2" />
          {(rep.phone || rep.website) && (
            <div className="flex flex-col gap-2 text-sm text-oled-secondary">
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
        </div>

        {/* Votes */}
        <section>
          <h2 className="text-lg font-medium text-oled-text mb-3">Recent votes ({votes.length})</h2>
          <div className="overflow-x-auto border border-oled-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-oled-border bg-oled-card/50">
                  <th className="text-left py-3 px-3 font-medium text-oled-text">Date</th>
                  <th className="text-left py-3 px-3 font-medium text-oled-text">Vote</th>
                  <th className="text-left py-3 px-3 font-medium text-oled-text">Bill / Question</th>
                  <th className="text-left py-3 px-3 font-medium text-oled-text w-20"></th>
                </tr>
              </thead>
              <tbody>
                {votes.map((v) => {
                  const voteDate = v.vote_date
                    ? new Date(v.vote_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                    : '—'
                  const title = v.title || v.vote_metadata?.question || `Vote ${v.roll_call || ''}`
                  return (
                    <tr key={v.roll_call || `${v.vote_date}-${v.bill_id}`} className="border-b border-oled-border/50 hover:bg-oled-card/30">
                      <td className="py-2 px-3 text-oled-secondary whitespace-nowrap">{voteDate}</td>
                      <td className="py-2 px-3">
                        <span className={`font-medium ${
                          ['yea', 'yes', 'aye'].includes((v.vote || '').toLowerCase()) ? 'text-green-400' :
                          ['nay', 'no'].includes((v.vote || '').toLowerCase()) ? 'text-red-400' :
                          'text-oled-secondary'
                        }`}>
                          {getVoteIcon(v.vote)} {v.vote || '—'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-oled-text">
                        {v.issue_id != null ? (
                          <Link to={`/issues/${v.issue_id}`} className="hover:underline">
                            {title.length > 80 ? `${title.substring(0, 80)}...` : title}
                          </Link>
                        ) : (
                          title.length > 80 ? `${title.substring(0, 80)}...` : title
                        )}
                        {v.bill_id && (
                          <div className="text-xs text-oled-secondary mt-0.5">{formatBillId(v.bill_id)}</div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {v.issue_id != null && (
                          <Link
                            to={`/issues/${v.issue_id}`}
                            className="text-xs text-oled-secondary hover:text-oled-text underline"
                          >
                            View issue →
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  )
}
