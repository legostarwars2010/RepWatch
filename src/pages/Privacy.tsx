import PageShell from '../components/PageShell'
import PageTitle from '../components/PageTitle'

export default function Privacy() {
  return (
    <PageShell>
      <PageTitle>
        Privacy Policy
      </PageTitle>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-12">
        {/* What We Collect */}
        <section className="space-y-6">
          <h2 className="text-sm uppercase tracking-wide text-oled-secondary">
            What We Collect
          </h2>

          <ul className="space-y-3 text-sm text-oled-text leading-relaxed">
            <li className="flex gap-2">
              <span className="text-oled-secondary mt-0.5">•</span>
              <span><strong className="font-medium">Personal info:</strong> None. No accounts, tracking, or cookies.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-oled-secondary mt-0.5">•</span>
              <span><strong className="font-medium">Address lookups:</strong> Sent to Census TIGERweb for district matching. Not stored or logged.</span>
            </li>
          </ul>
        </section>

        {/* Third-Party Services */}
        <section className="space-y-6">
          <h2 className="text-sm uppercase tracking-wide text-oled-secondary">
            Third-Party Services
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <h3 className="text-base font-medium text-oled-text">Neon</h3>
              <p className="text-sm text-oled-secondary leading-tight">Database for voting records</p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-medium text-oled-text">TIGERweb</h3>
              <p className="text-sm text-oled-secondary leading-tight">Census Bureau district lookup</p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-medium text-oled-text">OpenAI</h3>
              <p className="text-sm text-oled-secondary leading-tight">Bill summary generation</p>
            </div>
          </div>
        </section>

        {/* Key Points */}
        <section className="space-y-6">
          <h2 className="text-sm uppercase tracking-wide text-oled-secondary">
            Key Points
          </h2>

          <ul className="space-y-3 text-sm text-oled-text leading-relaxed">
            <li className="flex gap-2">
              <span className="text-oled-secondary mt-0.5">•</span>
              <span><strong className="font-medium">No accounts required:</strong> Use RepWatch without signing up or sharing personal info.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-oled-secondary mt-0.5">•</span>
              <span>
                <strong className="font-medium">Questions:</strong> Contact us at{' '}
                <a 
                  href="mailto:feedback@repwatch.co" 
                  className="text-oled-text hover:underline hover:text-oled-secondary transition-colors"
                >
                  feedback@repwatch.co
                </a>
              </span>
            </li>
          </ul>
        </section>
      </div>
    </PageShell>
  )
}
