import PageShell from '../components/PageShell'
import PageTitle from '../components/PageTitle'

export default function About() {
  return (
    <PageShell>
      <PageTitle>
        About RepWatch
      </PageTitle>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-12">
          {/* Mission */}
          <section className="space-y-4">
            <div>
              <h2 className="text-sm uppercase tracking-wide text-oled-secondary mb-1">
                Mission
              </h2>
              <p className="text-xs text-oled-secondary italic">
                Making democracy accessible to everyone
              </p>
            </div>
            <div className="space-y-4 text-sm text-oled-text leading-relaxed max-w-2xl">
              <p>
                RepWatch helps you see how your elected representatives vote on the issues that matter to you.
              </p>
              <p>
                Our mission is to make government understandable for everyone — not just policy experts or political insiders. We turn complex legislation and vote data into clear, factual summaries so every citizen can stay informed and engaged. No spin, no bias, just accessibility and truth.
              </p>
            </div>
          </section>

          {/* Why RepWatch */}
          <section className="space-y-4">
            <h2 className="text-sm uppercase tracking-wide text-oled-secondary">
              Why RepWatch
            </h2>
            <div className="space-y-4 text-sm text-oled-text leading-relaxed max-w-2xl">
              <p>
                Democracy works best when citizens are informed. But finding accurate information 
                about how representatives vote can be difficult and time-consuming.
              </p>
              <p>
                RepWatch makes it easy. We pull official government data and translate it into plain language, showing how every vote shapes the issues that affect your life. Everything is presented in a clean, easy-to-understand format — no ads, no tracking, no agenda, just transparency you can actually understand.
              </p>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  )
}
