import PageShell from '../components/PageShell'

export default function Changelog() {
  return (
    <PageShell>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-light mb-8">Changelog</h1>
        
        <div className="space-y-8">
          {/* Version 1.2.1 */}
          <div className="border-l-2 border-oled-border/50 pl-6">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-2xl font-light">v1.2.1</h2>
              <span className="text-sm text-oled-secondary">February 27, 2026</span>
            </div>
            
            <div className="space-y-4 text-oled-secondary">
              <div>
                <h3 className="text-lg text-oled-text mb-2">Issue page and vote display</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Issue detail page now shows one vote per representative (fixed doubling when bills had multiple roll calls).</li>
                  <li>Fixed issue page not rendering (hooks and error handling).</li>
                  <li>“Read full bill on Congress.gov” link now appears whenever we have a bill id or title; uses direct bill URL or search as fallback.</li>
                  <li>Error boundary on the issue page so failures show a clear message instead of a blank screen.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Version 1.2.0 */}
          <div className="border-l-2 border-oled-border/50 pl-6">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-2xl font-light">v1.2.0</h2>
              <span className="text-sm text-oled-secondary">February 26, 2026</span>
            </div>
            
            <div className="space-y-4 text-oled-secondary">
              <div>
                <h3 className="text-lg text-oled-text mb-2">Automated daily vote ingest</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Nightly pipeline keeps the database synced with the latest House roll-call votes from the Clerk.</li>
                  <li>Only fetches new votes since the last successful run to avoid re-processing old data.</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg text-oled-text mb-2">Real bill titles and required AI summaries</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>New issues are automatically enriched with official titles and summaries from Congress.gov.</li>
                  <li>Every bill shown in the app now has an AI-powered explainer before it appears in the UI.</li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Version 1.1.1 */}
          <div className="border-l-2 border-oled-border/50 pl-6">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-2xl font-light">v1.1.1</h2>
              <span className="text-sm text-oled-secondary">November 7, 2025</span>
            </div>
            
            <div className="space-y-4 text-oled-secondary">
              <div>
                <h3 className="text-lg text-oled-text mb-2">Mobile Improvements</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Fixed filter controls extending beyond screen on mobile devices</li>
                  <li>Filters now stack vertically on phones for better usability</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Version 1.1.0 */}
          <div className="border-l-2 border-oled-border/50 pl-6">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-2xl font-light">v1.1.0</h2>
              <span className="text-sm text-oled-secondary">November 7, 2025</span>
            </div>
            
            <div className="space-y-4 text-oled-secondary">
              <div>
                <h3 className="text-lg text-oled-text mb-2">Enhanced Bill Summaries</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>More detailed and accurate explanations based on actual bill text</li>
                  <li>Category tags for each vote (healthcare, economy, defense, etc.)</li>
                  <li>Key points highlighting important provisions</li>
                  <li>Expandable details with context about vote type and current law</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg text-oled-text mb-2">Vote Filtering</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Filter votes by topic category</li>
                  <li>Filter by vote type (Yes, No, Present/Not Voting)</li>
                  <li>Sort by date (most recent or oldest first)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Version 1.0.0 */}
          <div className="border-l-2 border-oled-border/50 pl-6">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-2xl font-light">v1.0.0</h2>
              <span className="text-sm text-oled-secondary">November 2025</span>
            </div>
            
            <div className="space-y-4 text-oled-secondary">
              <div>
                <h3 className="text-lg text-oled-text mb-2">Initial Release</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Search for representatives by address or name</li>
                  <li>View voting records with plain language explanations</li>
                  <li>See representative contact information</li>
                  <li>Clean, accessible interface</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
