import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Gridmarks",
  description:
    "Privacy policy for Gridmarks, covering preview image generation and local caching behavior.",
};

export default function PrivacyPage() {
  return (
    <main className="policy-shell">
      <div className="policy-header">
        <a className="policy-brand" href="/">
          Gridmarks
        </a>
      </div>

      <section className="policy-hero">
        <p className="policy-eyebrow">Privacy Policy</p>
        <h1>Built to stay restrained about your bookmarks.</h1>
        <p className="policy-lead">
          Gridmarks uses preview-image requests only when that feature is enabled, and only to generate the bookmark
          previews shown inside the extension.
        </p>
      </section>

      <section className="policy-card">
        <div className="policy-section">
          <h2>Preview Images</h2>
          <p>
            When preview images are enabled, Gridmarks sends bookmarked page URLs to a third-party thumbnail service,
            Thum.io, to generate preview images displayed in the extension.
          </p>
          <p>These URLs may reveal websites the user has saved as bookmarks.</p>
        </div>

        <div className="policy-section">
          <h2>How That Data Is Used</h2>
          <p>We use this data only to provide bookmark previews.</p>
          <p>We do not sell this data or use it for advertising.</p>
        </div>

        <div className="policy-section">
          <h2>Local Caching</h2>
          <p>Preview images are cached locally in the browser for faster display.</p>
        </div>
      </section>

      <footer className="policy-footer">
        <a className="policy-footer-link" href="/">
          Back to Gridmarks
        </a>
      </footer>
    </main>
  );
}
