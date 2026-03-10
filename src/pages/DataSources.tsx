import PageShell from '../components/PageShell'
import PageTitle from '../components/PageTitle'

export default function DataSources() {
  return (
    <PageShell>
      <PageTitle>
        Sources & Practices
      </PageTitle>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-12">
        {/* Official Sources */}
        <section className="space-y-6">
          <div>
            <h2 className="text-sm uppercase tracking-wide text-oled-secondary mb-2">
              Official Sources
            </h2>
            <p className="text-xs text-oled-secondary leading-relaxed">
              All data comes directly from U.S. government sources
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <a
                href="https://clerk.house.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-medium text-oled-text hover:text-oled-secondary transition-colors inline-flex items-center gap-1 group"
                aria-label="U.S. House Clerk (opens in new tab)"
              >
                U.S. House Clerk
                <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <p className="text-sm text-oled-secondary leading-tight">House roll call votes (XML)</p>
            </div>

            <div className="space-y-1.5">
              <a
                href="https://www.senate.gov/legislative/votes_new.htm"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-medium text-oled-text hover:text-oled-secondary transition-colors inline-flex items-center gap-1 group"
                aria-label="Senate.gov roll call votes (opens in new tab)"
              >
                Senate.gov
                <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <p className="text-sm text-oled-secondary leading-tight">Senate roll call votes — bills, nominations, amendments &amp; procedural motions (XML)</p>
            </div>

            <div className="space-y-1.5">
              <a
                href="https://www.congress.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-medium text-oled-text hover:text-oled-secondary transition-colors inline-flex items-center gap-1 group"
                aria-label="Congress.gov (opens in new tab)"
              >
                Congress.gov API
                <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <p className="text-sm text-oled-secondary leading-tight">Official bill titles &amp; summaries for House and Senate legislation</p>
            </div>

            <div className="space-y-1.5">
              <a
                href="https://github.com/unitedstates/congress-legislators"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-medium text-oled-text hover:text-oled-secondary transition-colors inline-flex items-center gap-1 group"
                aria-label="unitedstates/congress-legislators (opens in new tab)"
              >
                congress-legislators
                <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <p className="text-sm text-oled-secondary leading-tight">Current member roster for all 535 representatives and senators</p>
            </div>

            <div className="space-y-1.5">
              <a
                href="https://tigerweb.geo.census.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-medium text-oled-text hover:text-oled-secondary transition-colors inline-flex items-center gap-1 group"
                aria-label="Census TIGERweb (opens in new tab)"
              >
                Census TIGERweb
                <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <p className="text-sm text-oled-secondary leading-tight">Congressional district boundaries for address lookup</p>
            </div>
          </div>
        </section>

        {/* How We Handle Data */}
        <section className="space-y-6">
          <h2 className="text-sm uppercase tracking-wide text-oled-secondary">
            How We Handle Data
          </h2>

          <ul className="space-y-3 text-sm text-oled-text leading-relaxed">
            <li className="flex gap-2">
              <span className="text-oled-secondary mt-0.5">•</span>
              <span><strong className="font-medium">Both chambers:</strong> We track all 435 House members and all 100 senators, including bills, nominations, amendments, and procedural votes.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-oled-secondary mt-0.5">•</span>
              <span><strong className="font-medium">AI summaries:</strong> Generated by OpenAI for every tracked vote — bills get a legislative summary; nominations and procedural votes get plain-English context. Always marked as AI-generated and linked to official sources.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-oled-secondary mt-0.5">•</span>
              <span><strong className="font-medium">Data freshness:</strong> Both chambers update daily. We only show recorded votes — no predictions or estimates.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-oled-secondary mt-0.5">•</span>
              <span>
                <strong className="font-medium">Open source:</strong> Code and data handling explained on{' '}
                <a
                  href="https://github.com/legostarwars2010/RepWatch"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-oled-text hover:underline hover:text-oled-secondary transition-colors"
                >
                  GitHub
                </a>.
              </span>
            </li>
          </ul>

          <details className="group">
            <summary className="text-sm text-oled-secondary cursor-pointer hover:text-oled-text transition-colors list-none">
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Show pipeline details
              </span>
            </summary>
            <div className="mt-3 pl-4 space-y-2 text-sm text-oled-secondary leading-relaxed">
              <p>
                Each day the pipeline runs four steps: (1) ingest new House roll call votes from the House Clerk XML feed;
                (2) ingest new Senate roll call votes from Senate.gov XML — this covers bills, confirmation votes,
                amendment votes, cloture motions, and other procedural votes; (3) fetch official bill titles and
                summaries from the Congress.gov API for any newly seen legislation; (4) generate plain-English
                AI summaries via OpenAI for issues that don't have one yet.
              </p>
              <p>
                Senate votes that aren't tied to a specific bill (nominations, amendments, procedural motions)
                are stored with the full vote title from the official XML, so you always see who or what was
                actually being voted on — not just a generic label like "On the Nomination."
              </p>
              <p>
                Weekly digest emails cover both chambers. Subscribers see the 5 most recent votes for each
                representative or senator they follow, with AI-generated summaries where available.
              </p>
              <p>
                RepWatch is open source. You can review our data processing and see exactly
                how we handle government data on GitHub.
              </p>
            </div>
          </details>
        </section>
      </div>
    </PageShell>
  )
}
