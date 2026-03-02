import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import Breadcrumbs from '../components/Breadcrumbs'
import CopyLinkButton from '../components/CopyLinkButton'
import { apiUrl } from '../api'
import { congressGovBillUrl, congressGovSearchUrl } from '../lib/congressGov'

interface VoteRow {
  representative_id: number
  representative_name: string
  party: string | null
  state: string
  district: number | null
  vote: string
  vote_date: string
  roll_call: string
}

interface IssueDetail {
  id: number
  title: string | null
  description: string | null
  canonical_bill_id: string | null
  bill_id: string | null
  bill_summary: string | null
  ai_summary: Record<string, unknown> | null
  categories: string[] | null
  vote_date: string | null
  source: string | null
}

interface IssueResponse {
  issue: IssueDetail
  votes: VoteRow[]
  result: string | null
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

export default function Issue() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<IssueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('Invalid issue')
      return
    }
    setLoading(true)
    setError('')
    fetch(apiUrl(`/api/issues/${id}`))
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Issue not found' : 'Failed to load')
        return res.json()
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  // Must run every render (hooks rule); dedupe to one vote per representative
  const votes = data?.votes
  const displayVotes = useMemo(() => {
    const list = Array.isArray(votes) ? votes : []
    const seen = new Set<number>()
    return list.filter((v) => {
      if (!v || typeof (v as VoteRow).representative_id !== 'number') return false
      const rid = (v as VoteRow).representative_id
      if (seen.has(rid)) return false
      seen.add(rid)
      return true
    })
  }, [votes])

  if (loading) {
    return (
      <PageShell>
        <div className="min-h-[200px] flex items-center justify-center text-oled-secondary text-lg">Loading...</div>
      </PageShell>
    )
  }

  if (error || !data || !data.issue) {
    return (
      <PageShell>
        <div className="min-h-[200px] text-center py-12">
          <p className="text-red-400 mb-4 text-lg">{error || 'Issue not found'}</p>
          <Link to="/" className="text-oled-secondary hover:text-oled-text underline">Back to search</Link>
        </div>
      </PageShell>
    )
  }

  const { issue, result } = data

  const ai = issue.ai_summary as {
    short_summary?: string
    medium_summary?: string
    key_points?: string[]
    what_a_yea_vote_means?: string
    what_a_nay_vote_means?: string
    categories?: string[]
  } | undefined

  const yeaCount = displayVotes.filter((v) => ['yea', 'yes', 'aye'].includes((v.vote || '').toLowerCase())).length
  const nayCount = displayVotes.filter((v) => ['nay', 'no'].includes((v.vote || '').toLowerCase())).length
  const presentCount = displayVotes.filter((v) => (v.vote || '').toLowerCase() === 'present').length
  const notVotingCount = displayVotes.filter((v) => (v.vote || '').toLowerCase() === 'not voting').length

  const billLabel = issue.title || `Bill ${issue.canonical_bill_id || issue.bill_id || 'Unknown'}`
  const breadcrumbLabel = billLabel.length > 60 ? `${billLabel.slice(0, 60)}…` : billLabel

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto">
        <Breadcrumbs items={[{ label: 'Search', href: '/' }, { label: breadcrumbLabel }]} className="mb-4" />
        <Link to="/" className="text-sm text-oled-secondary hover:text-oled-text mb-6 inline-block">← Back to search</Link>

        {/* Title and outcome */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-light text-oled-text mb-2">
            {issue.title || `Bill ${issue.canonical_bill_id || issue.bill_id || 'Unknown'}`}
          </h1>
          {issue.canonical_bill_id && (
            <p className="text-oled-secondary text-sm mb-1">{formatBillId(issue.canonical_bill_id)}</p>
          )}
          {issue.vote_date && (
            <p className="text-oled-secondary text-sm mb-3">
              Vote date: {new Date(issue.vote_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}
          {result && (
            <p className={`text-lg font-medium ${result.toLowerCase().includes('pass') || result.toLowerCase().includes('agreed') ? 'text-green-400' : 'text-red-400'}`}>
              Outcome: {result}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <CopyLinkButton />
            {(congressGovBillUrl(issue.canonical_bill_id) ?? congressGovBillUrl(issue.bill_id ?? null)) ? (
              <a
                href={(congressGovBillUrl(issue.canonical_bill_id) ?? congressGovBillUrl(issue.bill_id ?? null))!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-oled-secondary hover:text-oled-text transition-colors inline-flex items-center gap-1.5"
              >
                Read full bill on Congress.gov →
              </a>
            ) : (issue.canonical_bill_id || issue.bill_id || issue.title) ? (
              <a
                href={congressGovSearchUrl(issue.title || issue.canonical_bill_id || issue.bill_id || '')}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-oled-secondary hover:text-oled-text transition-colors inline-flex items-center gap-1.5"
              >
                Read full bill on Congress.gov →
              </a>
            ) : null}
          </div>
        </div>

        {/* Summary breakdown */}
        <section className="mb-10">
          <h2 className="text-lg font-medium text-oled-text mb-3">Summary</h2>
          <div className="space-y-4 text-oled-secondary border-l-2 border-oled-border/50 pl-4">
            {ai?.short_summary && <p>{ai.short_summary}</p>}
            {ai?.medium_summary && <p className="text-sm">{ai.medium_summary}</p>}
            {issue.bill_summary && !ai?.short_summary && <p>{issue.bill_summary}</p>}
            {issue.description && !ai?.short_summary && !issue.bill_summary && <p>{issue.description}</p>}
            {!ai?.short_summary && !issue.bill_summary && !issue.description && (
              <p className="italic">No summary available.</p>
            )}
            {Array.isArray(ai?.key_points) && ai.key_points.length > 0 && (
              <ul className="list-disc list-inside space-y-1 text-sm">
                {ai.key_points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            )}
          </div>
          {((Array.isArray(issue.categories) && issue.categories.length) || (Array.isArray(ai?.categories) && ai?.categories?.length)) ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {(Array.isArray(issue.categories) ? issue.categories : Array.isArray(ai?.categories) ? ai?.categories : []).map((cat, i) => (
                <span key={i} className="text-xs px-2 py-1 bg-oled-border/30 text-oled-secondary rounded">
                  {cat}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {/* Vote counts */}
        <section className="mb-6">
          <h2 className="text-lg font-medium text-oled-text mb-3">Vote totals</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-oled-card border border-oled-border rounded">
              <span className="text-green-400 font-medium">Yes</span>
              <span className="block text-2xl font-light">{yeaCount}</span>
            </div>
            <div className="p-3 bg-oled-card border border-oled-border rounded">
              <span className="text-red-400 font-medium">No</span>
              <span className="block text-2xl font-light">{nayCount}</span>
            </div>
            <div className="p-3 bg-oled-card border border-oled-border rounded">
              <span className="text-oled-secondary font-medium">Present</span>
              <span className="block text-2xl font-light">{presentCount}</span>
            </div>
            <div className="p-3 bg-oled-card border border-oled-border rounded">
              <span className="text-oled-secondary font-medium">Not voting</span>
              <span className="block text-2xl font-light">{notVotingCount}</span>
            </div>
          </div>
        </section>

        {/* All votes table */}
        <section>
          <h2 className="text-lg font-medium text-oled-text mb-3">All votes ({displayVotes.length})</h2>
          <div className="overflow-x-auto border border-oled-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-oled-border bg-oled-card/50">
                  <th className="text-left py-3 px-3 font-medium text-oled-text">Representative</th>
                  <th className="text-left py-3 px-3 font-medium text-oled-text">Party</th>
                  <th className="text-left py-3 px-3 font-medium text-oled-text">State</th>
                  <th className="text-left py-3 px-3 font-medium text-oled-text">District</th>
                  <th className="text-left py-3 px-3 font-medium text-oled-text">Vote</th>
                </tr>
              </thead>
              <tbody>
                {displayVotes.map((v, idx) => (
                  <tr key={v.representative_id ?? `vote-${idx}`} className="border-b border-oled-border/50 hover:bg-oled-card/30">
                    <td className="py-2 px-3 text-oled-text">
                      <Link to={`/reps/${v.representative_id}`} className="hover:underline">
                        {v.representative_name}
                      </Link>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        (v.party || '').toLowerCase() === 'republican' ? 'bg-red-900/30 text-red-400' :
                        (v.party || '').toLowerCase() === 'democrat' ? 'bg-blue-900/30 text-blue-400' :
                        'bg-oled-border/30 text-oled-secondary'
                      }`}>
                        {v.party || '—'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-oled-secondary">{v.state}</td>
                    <td className="py-2 px-3 text-oled-secondary">{v.district ?? '—'}</td>
                    <td className="py-2 px-3">
                      <span className={`font-medium ${
                        ['yea', 'yes', 'aye'].includes((v.vote || '').toLowerCase()) ? 'text-green-400' :
                        ['nay', 'no'].includes((v.vote || '').toLowerCase()) ? 'text-red-400' :
                        'text-oled-secondary'
                      }`}>
                        {getVoteIcon(v.vote)} {v.vote || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  )
}
