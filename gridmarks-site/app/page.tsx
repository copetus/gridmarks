"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "./components/BrandLockup";

const features = [
  {
    text: "Overrides Chrome's default bookmarks page with a more useful browsing experience.",
  },
  {
    text: "Preserves the sidebar as the primary folder-navigation model.",
    previewLabel: "Sidebar navigation preview",
  },
  {
    text: "Surfaces both folders and bookmarks in the main content pane.",
    previewLabel: "Mixed content pane preview",
  },
  {
    text: "Provides clear hierarchical navigation context in the main pane.",
    previewLabel: "Breadcrumb preview",
  },
  {
    text: "Supports both card view and list view for bookmark contents.",
    previewLabel: "View mode preview",
  },
  {
    text: "Makes card view the primary browsing mode with controlled density.",
    previewLabel: "Card density preview",
  },
  {
    text: "Makes bookmark cards visually informative with previews and metadata.",
    previewLabel: "Bookmark card preview",
  },
  {
    text: "Makes list view compact, scannable, and function-first.",
    previewLabel: "List view preview",
  },
  {
    text: "Represents folders consistently across all UI surfaces.",
    previewLabel: "Folder state preview",
  },
  {
    text: "Preserves familiar Chrome-like interaction patterns where users expect them.",
  },
  {
    text: "Requires double-click for primary open and navigate actions in the main content area.",
    previewLabel: "Open behavior preview",
  },
  {
    text: "Provides bookmark and folder action menus for common management tasks.",
    previewLabel: "Context menu preview",
  },
  {
    text: "Supports creation and editing through modal dialogs.",
    previewLabel: "Modal dialog preview",
  },
  {
    text: "Supports manual organization through drag and drop across relevant surfaces.",
    previewLabel: "Drag and drop preview",
  },
  {
    text: "Supports robust multi-selection behavior across browsing modes.",
    previewLabel: "Multi-select preview",
  },
  {
    text: "Provides a persistent bulk-action toolbar when multiple items are selected.",
    previewLabel: "Bulk toolbar preview",
  },
  {
    text: "Supports keyboard shortcuts for common bookmark-management actions.",
  },
  {
    text: "Preserves a restrained Chrome-adjacent visual language.",
  },
  {
    text: "Makes the experience responsive without changing its core interaction model.",
    previewLabel: "Responsive layout preview",
  },
  {
    text: "Improves thumbnail reliability while degrading gracefully.",
    previewLabel: "Thumbnail fallback preview",
  },
];

const featurePreviewEnabled = false;

export default function Home() {
  const heroCtaRef = useRef<HTMLAnchorElement | null>(null);
  const featuredCardRef = useRef<HTMLElement | null>(null);
  const featureListRef = useRef<HTMLDivElement | null>(null);
  const featureItemRefs = useRef<Array<HTMLElement | null>>([]);
  const featureAnimationFrameRef = useRef<number>(0);
  const previewTargetRef = useRef({ x: 0, y: 0 });
  const [featuredScale, setFeaturedScale] = useState(0.84);
  const [featureRevealProgress, setFeatureRevealProgress] = useState(() => features.map(() => 0));
  const [isBrandAutoRevealed, setIsBrandAutoRevealed] = useState(false);
  const [activeFeatureIndex, setActiveFeatureIndex] = useState<number | null>(null);
  const [previewSide, setPreviewSide] = useState<"left" | "right">("right");
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let frame = 0;

    const updateScrollEffects = () => {
      frame = 0;

      const heroCtaElement = heroCtaRef.current;
      if (heroCtaElement) {
        const ctaRect = heroCtaElement.getBoundingClientRect();
        setIsBrandAutoRevealed(ctaRect.bottom <= 0);
      }

      const featuredElement = featuredCardRef.current;
      if (featuredElement) {
        const rect = featuredElement.getBoundingClientRect();
        const viewportCenter = window.innerHeight / 2;
        const elementCenter = rect.top + rect.height / 2;
        const maxDistance = (window.innerHeight + rect.height) / 2;
        const distance = Math.abs(viewportCenter - elementCenter);
        const proximity = Math.max(0, 1 - distance / maxDistance);
        const easedProximity = 1 - Math.pow(1 - proximity, 3);
        const nextScale = 0.84 + 0.16 * easedProximity;

        setFeaturedScale(nextScale);
      }

      setFeatureRevealProgress((currentProgress) => {
        const nextProgress = featureItemRefs.current.map((item, index) => {
          if (!item) {
            return currentProgress[index] ?? 0;
          }

          const rect = item.getBoundingClientRect();
          const triggerStart = window.innerHeight * 0.92;
          const triggerEnd = window.innerHeight * 0.28;
          const rawProgress = (triggerStart - rect.top) / (triggerStart - triggerEnd);
          const clampedProgress = Math.max(0, Math.min(1, rawProgress));

          return 1 - Math.pow(1 - clampedProgress, 3);
        });

        const hasChanged = nextProgress.some((value, index) => Math.abs(value - (currentProgress[index] ?? 0)) > 0.001);
        return hasChanged ? nextProgress : currentProgress;
      });
    };

    const requestUpdate = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(updateScrollEffects);
    };

    updateScrollEffects();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  useEffect(() => {
    const animatePreview = () => {
      setPreviewPosition((currentPosition) => {
        const nextX = currentPosition.x + (previewTargetRef.current.x - currentPosition.x) * 0.16;
        const nextY = currentPosition.y + (previewTargetRef.current.y - currentPosition.y) * 0.16;

        if (
          Math.abs(nextX - previewTargetRef.current.x) < 0.2 &&
          Math.abs(nextY - previewTargetRef.current.y) < 0.2
        ) {
          return {
            x: previewTargetRef.current.x,
            y: previewTargetRef.current.y,
          };
        }

        return { x: nextX, y: nextY };
      });

      featureAnimationFrameRef.current = window.requestAnimationFrame(animatePreview);
    };

    featureAnimationFrameRef.current = window.requestAnimationFrame(animatePreview);

    return () => {
      if (featureAnimationFrameRef.current) {
        window.cancelAnimationFrame(featureAnimationFrameRef.current);
      }
    };
  }, []);

  const updateFeaturePreviewPosition = (event: React.MouseEvent<HTMLElement>, index: number) => {
    const listRect = featureListRef.current?.getBoundingClientRect();
    if (!listRect) {
      return;
    }

    const cursorX = event.clientX - listRect.left;
    const cursorY = event.clientY - listRect.top;
    const nextSide = index % 2 === 0 ? "right" : "left";
    const previewWidth = Math.min(560, window.innerWidth * 0.44);
    const sideOffset = 24;
    const rawX = nextSide === "right" ? cursorX + sideOffset : cursorX - previewWidth - sideOffset;
    const nextX = Math.max(0, Math.min(listRect.width - previewWidth, rawX));
    const nextY = cursorY - 24;

    setActiveFeatureIndex(index);
    setPreviewSide(nextSide);
    previewTargetRef.current = { x: nextX, y: nextY };
    setPreviewPosition((currentPosition) =>
      currentPosition.x === 0 && currentPosition.y === 0 ? { x: nextX, y: nextY } : currentPosition,
    );
  };

  const clearFeaturePreview = () => {
    setActiveFeatureIndex(null);
  };

  return (
    <main className="page-shell">
      <header className="masthead">
        <BrandLockup autoRevealed={isBrandAutoRevealed} />
      </header>

      <section className="hero-section">
        <h1 aria-label="Bookmarks worth looking at.">
          <span className="hero-title-line">
            <span className="hero-title-line-inner">Bookmarks worth</span>
          </span>
          <span className="hero-title-line">
            <span className="hero-title-line-inner">looking at.</span>
          </span>
        </h1>
        <p className="hero-copy">
          Gridmarks rethinks bookmark management with a minimal, visual interface built around clarity, recognition,
          and faster navigation through dense collections.
        </p>

        <div className="hero-actions">
          <a
            className="button button-solid"
            href="https://github.com/copetus/gridmarks"
            target="_blank"
            rel="noreferrer"
            ref={heroCtaRef}
          >
            <span className="button-label">Get the extension</span>
            <span className="button-icon" aria-hidden="true">
              <svg focusable="false" viewBox="0 0 24 24">
                <path d="M6 6v2h8.59L5 17.59 6.41 19 16 9.41V18h2V6z" />
              </svg>
            </span>
          </a>
        </div>
      </section>

      <section className="featured-image-section" id="featured-image">
        <div className="featured-image-reveal">
          <figure
            ref={featuredCardRef}
            className="featured-image-card"
            style={{ "--featured-scale": featuredScale } as React.CSSProperties}
          >
            <video
              className="featured-image-video"
              src="/gridmarks-demo.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-label="Gridmarks demo video showing the bookmarks interface in motion."
            />
          </figure>
        </div>
      </section>

      <section className="features-section">
        <div className="section-heading">
          <p className="features-intro">What it does plain and simple</p>
        </div>

        <div className="feature-list" ref={featureListRef}>
          {features.map((feature, index) => (
            <article
              className={`feature-item ${feature.previewLabel && featurePreviewEnabled ? "has-preview" : ""}`}
              key={feature.text}
              ref={(element) => {
                featureItemRefs.current[index] = element;
              }}
              tabIndex={feature.previewLabel && featurePreviewEnabled ? 0 : undefined}
              style={
                {
                  "--feature-progress": featureRevealProgress[index] ?? 0,
                } as React.CSSProperties
              }
              onMouseEnter={
                feature.previewLabel && featurePreviewEnabled
                  ? (event) => updateFeaturePreviewPosition(event, index)
                  : undefined
              }
              onMouseMove={
                feature.previewLabel && featurePreviewEnabled
                  ? (event) => updateFeaturePreviewPosition(event, index)
                  : undefined
              }
              onMouseLeave={feature.previewLabel && featurePreviewEnabled ? clearFeaturePreview : undefined}
              onFocus={feature.previewLabel && featurePreviewEnabled ? () => setActiveFeatureIndex(index) : undefined}
              onBlur={feature.previewLabel && featurePreviewEnabled ? clearFeaturePreview : undefined}
            >
              <p>{feature.text}</p>
            </article>
          ))}

          {featurePreviewEnabled ? (
            <div
              className="feature-preview"
              aria-hidden="true"
              style={
                {
                  "--preview-x": `${previewPosition.x}px`,
                  "--preview-y": `${previewPosition.y}px`,
                } as React.CSSProperties
              }
              data-visible={activeFeatureIndex !== null}
              data-side={previewSide}
            >
              <div className="feature-preview-media" />
            </div>
          ) : null}
        </div>
      </section>

      <footer className="page-footer">
        <div className="page-footer-links">
          <a
            className="page-footer-link"
            href="https://www.linkedin.com/in/salomono"
            target="_blank"
            rel="noreferrer"
          >
            by <span className="page-footer-link-name">Salomon Onyegbulem</span>
          </a>
          <a className="page-footer-link" href="/privacy">
            Privacy Policy
          </a>
        </div>
      </footer>
    </main>
  );
}
