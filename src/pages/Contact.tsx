import PageShell from '../components/PageShell'
import PageTitle from '../components/PageTitle'

export default function Contact() {
  return (
    <PageShell>
      <PageTitle>
        Contact
      </PageTitle>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-12">
        {/* Get in Touch */}
        <section className="space-y-4">
          <h2 className="text-sm uppercase tracking-wide text-oled-secondary">
            Get in Touch
          </h2>
          <a 
            href="mailto:feedback@repwatch.co" 
            className="block text-base font-medium text-oled-text hover:text-oled-secondary transition-colors"
          >
            feedback@repwatch.co
          </a>
        </section>

        {/* Open Source */}
        <section className="space-y-4">
          <h2 className="text-sm uppercase tracking-wide text-oled-secondary">
            Open Source
          </h2>
          <p className="text-sm text-oled-text leading-relaxed">
            RepWatch is open source. View the code, report issues, or contribute on{' '}
            <a 
              href="https://github.com/legostarwars2010/RepWatch" 
              target="_blank"
              rel="noopener noreferrer"
              className="text-oled-text hover:underline hover:text-oled-secondary transition-colors font-medium"
            >
              GitHub
            </a>.
          </p>
        </section>
      </div>
    </PageShell>
  )
}
