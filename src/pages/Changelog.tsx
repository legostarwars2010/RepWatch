import PageShell from '../components/PageShell'

export default function Changelog() {
  return (
    <PageShell>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-light mb-8">Changelog</h1>
        
        <div className="space-y-8">
          {/* Version 1.3.0 */}
          <div className="border-l-2 border-oled-border/50 pl-6">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-2xl font-light">v1.3.0</h2>
              <span className="text-sm text-oled-secondary">March 10, 2026</span>
            </div>

            <div className="space-y-4 text-oled-secondary">
              <div>
                <h3 className="text-lg text-oled-text mb-2">Full Senate coverage</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>All 100 senators and their roll call votes are now tracked alongside House members.</li>
                  <li>Senators appear in address lookup results under a "Your Senators" section, separate from your House representative.</li>
                  <li>Senate votes cover all vote types: legislation, confirmation votes, amendments, cloture motions, and procedural motions — each with a descriptive title showing exactly who or what was voted on.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-oled-text mb-2">AI summaries for all vote types</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Nomination votes get plain-English summaries explaining who was confirmed and for what role.</li>
                  <li>Amendment and procedural votes get summaries with legislative context.</li>
                  <li>Bill votes use the same enriched pipeline as before.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-oled-text mb-2">Representative page improvements</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Vote history now paginates — 25 votes shown at a time with a "Load more" button.</li>
                  <li>Senators show their state and "Senator" label instead of a district number.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-oled-text mb-2">Weekly digest emails</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Digest emails now include senators alongside House members.</li>
                  <li>Senate vote titles show the actual nomination name or bill reference, not just "On the Nomination."</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Version 1.2.4 */}
          <div className="border-l-2 border-oled-border/50 pl-6">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-2xl font-light">v1.2.4</h2>
              <span className="text-sm text-oled-secondary">February 26, 2026</span>
            </div>
            
            <div className="space-y-4 text-oled-secondary">
              <div>
                <h3 className="text-lg text-oled-text mb-2">Weekly email digest</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Subscribe to get a weekly email (Sundays) with the last 5 House votes for each representative you follow.</li>
                  <li>One-click unsubscribe in every email; signup and preferences stored securely.</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg text-oled-text mb-2">Digest content</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Digest emails use clear bill titles (trimmed when long) and AI summaries; Congress.gov boilerplate is filtered out.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Version 1.2.3 */}
          <div className="border-l-2 border-oled-border/50 pl-6">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-2xl font-light">v1.2.3</h2>
              <span className="text-sm text-oled-secondary">March 2026</span>
            </div>
            
            <div className="space-y-4 text-oled-secondary">
              <div>
                <h3 className="text-lg text-oled-text mb-2">Address / ZIP lookup</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Fixed US ZIP codes (e.g. 94539) resolving to the wrong state when geocoding fell back to a non-US result; lookup is now restricted to the United States.</li>
                  <li>ZIP-to-district CSV rows with blank state or district are ignored so they no longer produce incorrect matches.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Version 1.2.2 */}
          <div className="border-l-2 border-oled-border/50 pl-6">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-2xl font-light">v1.2.2</h2>
              <span className="text-sm text-oled-secondary">March 2, 2026</span>
            </div>
            
            <div className="space-y-4 text-oled-secondary">
              <div>
                <h3 className="text-lg text-oled-text mb-2">Representative pages</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Representative profiles now show official congressional headshots when available (with initials fallback).</li>
                  <li>Representative names in the issue vote breakdown are now clickable to open the full profile page.</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg text-oled-text mb-2">Reliability</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Backend no longer crashes when the database drops an idle connection; errors are logged and requests recover on reconnect.</li>
                </ul>
              </div>
            </div>
          </div>

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
