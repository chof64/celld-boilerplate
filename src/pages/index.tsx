import { Hero } from "../components/hero";

const repository = "https://github.com/chof64/celld-hono";

export default function HomePage() {
  return (
    <div className="home-page">
      <title>Celld + Hono starter</title>
      <Hero />

      <main className="home-main">
        <section className="architecture-section" id="architecture" aria-labelledby="architecture-title">
          <div className="section-intro">
            <p className="section-label">01 <span>·</span> THE SHAPE</p>
            <h2 id="architecture-title">A small stack with<br />room to grow.</h2>
            <p>
              Keep the API, frontend, and shared logic in their own places. They still ship
              together as a single Celld application.
            </p>
          </div>
          <div className="capability-list">
            <article className="capability-row">
              <span className="capability-number">01</span>
              <h3>Hono owns the API</h3>
              <p>REST routes, WebSockets, and Durable Objects live under <code>src/api/</code>.</p>
            </article>
            <article className="capability-row">
              <span className="capability-number">02</span>
              <h3>Waku renders the web</h3>
              <p>Pages in <code>src/pages/</code> pre-render at build time; production has no Waku server.</p>
            </article>
            <article className="capability-row">
              <span className="capability-number">03</span>
              <h3>Celld ships both</h3>
              <p>Static assets and the Hono Worker deploy together, with API paths routed to the Worker.</p>
            </article>
          </div>
        </section>

        <section className="setup-section" id="setup" aria-labelledby="setup-title">
          <div className="setup-heading">
            <div>
              <p className="section-label">02 <span>·</span> GET STARTED</p>
              <h2 id="setup-title">Clone it. Run both sides.</h2>
            </div>
            <p>Node.js 22.15+, pnpm, and the Celld CLI are the local prerequisites.</p>
          </div>

          <div className="setup-grid">
            <div className="setup-local">
              <h3><span>01</span> Prepare the project</h3>
              <pre><code>{`pnpm install --frozen-lockfile\ncp .env.example .env`}</code></pre>
              <h3><span>02</span> Start two terminals</h3>
              <div className="terminal-pair">
                <div className="terminal-command">
                  <span>TERMINAL A <small>Hono API · :9876</small></span>
                  <code>pnpm dev:celld</code>
                </div>
                <div className="terminal-command">
                  <span>TERMINAL B <small>Waku pages · :3000</small></span>
                  <code>pnpm dev</code>
                </div>
              </div>
            </div>

            <aside className="setup-deploy">
              <h3><span>03</span> Build and deploy</h3>
              <p>Check the project, preview the deployment, then publish the same app.</p>
              <pre><code>{`pnpm check\npnpm deploy -- --dry-run\npnpm deploy`}</code></pre>
              <p className="setup-note">The deploy script builds Waku and attaches <code>dist/public</code> to the Hono Worker.</p>
            </aside>
          </div>
        </section>

        <section className="docs-section" aria-labelledby="docs-title">
          <div className="docs-heading">
            <p className="section-label">03 <span>·</span> KEEP EXPLORING</p>
            <h2 id="docs-title">The useful details.</h2>
          </div>
          <div className="docs-links">
            <a href={`${repository}/blob/main/ARCHITECTURE.md`}>
              <span className="docs-link-type">GUIDE 01</span>
              <span className="docs-link-copy"><strong>Architecture</strong><small>Source layout, boundaries, and runtime behavior</small></span>
              <span className="docs-arrow" aria-hidden="true">↗</span>
            </a>
            <a href={`${repository}/blob/main/DEPLOY.md`}>
              <span className="docs-link-type">GUIDE 02</span>
              <span className="docs-link-copy"><strong>Deployment</strong><small>Celld setup, production topology, and operations</small></span>
              <span className="docs-arrow" aria-hidden="true">↗</span>
            </a>
            <a href={repository}>
              <span className="docs-link-type">SOURCE</span>
              <span className="docs-link-copy"><strong>GitHub repository</strong><small>Browse the boilerplate and start your own</small></span>
              <span className="docs-arrow" aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="site-brand" href="/">
          <span className="brand-mark" aria-hidden="true">c.</span><span>celld-hono</span>
        </a>
        <p>Hono API · static Waku pages · Celld runtime</p>
        <a href="/chat">Open the chat demo <span aria-hidden="true">↗</span></a>
      </footer>
    </div>
  );
}
