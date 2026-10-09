const repository = "https://github.com/chof64/celld-hono";

export function Hero() {
  return (
    <>
      <header className="site-header">
        <a className="site-brand" href="/" aria-label="celld-hono home">
          <span className="brand-mark" aria-hidden="true">c.</span>
          <span>celld-hono</span>
        </a>

        <nav className="site-nav" aria-label="Main navigation">
          <a href="#architecture">Architecture</a>
          <a href="#setup">Local setup</a>
          <a href={`${repository}/blob/main/ARCHITECTURE.md`}>Docs</a>
        </nav>

        <a className="site-nav-cta" href="/chat">
          Try the demo <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="hero-eyebrow"><span aria-hidden="true" /> CELLD BOILERPLATE</p>
          <h1 id="home-title">One app.<br /><span>Clear boundaries.</span></h1>
          <p className="hero-description">
            An API-first starting point with Hono, static Waku pages, and Celld in one
            straightforward deployment.
          </p>
          <div className="hero-actions">
            <a className="button-primary" href="/chat">
              Open the live chat <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#architecture">
              Explore the stack <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="hero-caption">Hono API <span>·</span> static Waku pages <span>·</span> Celld runtime</p>
        </div>

        <div className="architecture-visual" role="img" aria-label="Waku static pages and a Hono API deployed together as one Celld application">
          <div className="diagram-heading">
            <span>DEPLOYMENT SHAPE</span>
            <span className="diagram-index">01 / 01</span>
          </div>
          <div className="diagram-app">
            <div className="diagram-app-title"><span className="diagram-live-dot" /> ONE CELLD APPLICATION</div>
            <div className="diagram-layer diagram-static">
              <span className="diagram-glyph" aria-hidden="true">W</span>
              <span className="diagram-layer-copy"><strong>Waku pages</strong><small>Pre-rendered to dist/public</small></span>
              <span className="diagram-kind">STATIC</span>
            </div>
            <div className="diagram-connector"><span /> shipped together <span /></div>
            <div className="diagram-layer diagram-worker">
              <span className="diagram-glyph" aria-hidden="true">H</span>
              <span className="diagram-layer-copy"><strong>Hono Worker</strong><small>/api/* · /health</small></span>
              <span className="diagram-kind">LIVE</span>
            </div>
            <div className="diagram-capabilities"><span>REST</span><span>WebSockets</span><span>Durable Objects</span></div>
          </div>
          <p className="diagram-footnote"><span aria-hidden="true">↳</span> One deploy. No Waku server in production.</p>
        </div>
      </section>
    </>
  );
}
