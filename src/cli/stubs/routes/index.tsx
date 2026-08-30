import { Link } from 'react-router';

export const meta = () => [{ title: 'Home' }];

// The landing page is hand-authored here (edit it freely). Other pages are content-managed: create
// them in the console (Pages), give one a slug like "about", and routes/$.tsx renders it. The
// links below point at pages you'll want to create there (or repoint them).
export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="hero__eyebrow">Welcome</p>
          <h1 className="hero__title">A short, confident headline about what you do</h1>
          <p className="hero__lede">
            One or two sentences that say who you help and how. Keep it concrete — the visitor should
            know within seconds whether they're in the right place.
          </p>
          <div className="hero__actions">
            <Link to="/contact" className="button button--primary">
              Get in touch
            </Link>
            <Link to="/services" className="button button--ghost">
              See what we do
            </Link>
          </div>
        </div>
      </section>

      <section className="features container">
        <div className="feature">
          <h2>First thing</h2>
          <p>Explain one concrete benefit. Swap this copy for something true about your work.</p>
        </div>
        <div className="feature">
          <h2>Second thing</h2>
          <p>Another benefit, or a step in how you work. Short paragraphs read best here.</p>
        </div>
        <div className="feature">
          <h2>Third thing</h2>
          <p>A final reason to trust you — experience, a guarantee, a way you're different.</p>
        </div>
      </section>

      <section className="cta">
        <div className="container">
          <h2>Ready to start?</h2>
          <p>Tell us what you're working on and we'll get back to you.</p>
          <Link to="/contact" className="button button--primary">
            Contact us
          </Link>
        </div>
      </section>
    </>
  );
}
