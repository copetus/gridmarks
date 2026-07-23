import type { Metadata } from "next";
import { BrandLockup } from "../components/BrandLockup";

export const metadata: Metadata = {
  title: "Privacy Policy | Gridmarks",
  description:
    "Privacy policy for Gridmarks, covering preview image generation and local caching behavior.",
};

export default function PrivacyPage() {
  return (
    <main className="policy-shell">
      <div className="policy-header">
        <BrandLockup />
      </div>

      <section className="policy-hero">
        <h1>Privacy Policy</h1>
        <p className="policy-lead">
          Gridmarks uses a third-party thumbnail service to generate bookmark thumbnails, sending bookmarked page URLs
          only when preview images are enabled.
        </p>
      </section>

      <section className="policy-card">
        <div className="policy-section">
          <p>
            When preview images are enabled, Gridmarks sends bookmarked page URLs to a third-party thumbnail service (
            <a href="https://www.thum.io/" target="_blank" rel="noreferrer">
              Thum.io
            </a>
            ) to generate bookmark thumbnails.
          </p>
          <p>These requests are made only while preview images are enabled and may reveal which pages you've bookmarked.</p>
        </div>

        <div className="policy-section">
          <p>Bookmarked page URLs are used only to generate bookmark thumbnails. This data is not sold or used for advertising.</p>
        </div>

        <div className="policy-section">
          <p>Bookmark thumbnails are cached locally by your browser for faster loading.</p>
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
