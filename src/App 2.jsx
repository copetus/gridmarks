import { useEffect, useMemo, useRef, useState } from "react";

const FEATURE_LIST = [
  {
    title: "Clear API Documentation",
    desc: "Give developers a fast path to understanding your APIs with clean references, guides, and examples.",
  },
  {
    title: "Quick Start Access",
    desc: "Help users get keys, authenticate, and make their first successful call without digging around.",
  },
  {
    title: "Built for Teams",
    desc: "Support collaboration with shared apps, ownership controls, and a scalable developer experience.",
  },
];

const STEP_LIST = [
  "Browse APIs and products",
  "Read guides and test endpoints",
  "Create an app and get credentials",
  "Launch integrations with confidence",
];

const FONT_OPTIONS = [
  {
    label: "Google Sans-like",
    value: '"Google Sans", "Product Sans", "Segoe UI", Arial, sans-serif',
  },
  {
    label: "SF-like System",
    value:
      '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
  },
  {
    label: "Avenir Next",
    value: '"Avenir Next", Avenir, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    label: "Helvetica Neue",
    value: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    label: "IBM Plex Sans",
    value: '"IBM Plex Sans", "Segoe UI", sans-serif',
  },
];

const DEFAULT_TOKENS = {
  color: {
    foreground: "#111827",
    foregroundMuted: "#667085",
    contrastDark: "#111827",
    contrastLight: "#ffffff",
    background: "#f5f7fb",
    surface: "#ffffff",
    surfaceMuted: "#eef2f7",
    border: "#d7dee8",
    primary: "#2563eb",
    secondary: "#0f766e",
    tertiary: "#d97706",
  },
  spacing: {
    density: 1,
  },
  typography: {
    fontFamily: FONT_OPTIONS[0].value,
  },
};

const THEME_PRESETS = {
  google: {
    label: "Google",
    description: "Clean neutrals with Google blue, green, and amber accents.",
    tokens: {
      color: {
        foreground: "#202124",
        foregroundMuted: "#5f6368",
        contrastDark: "#202124",
        contrastLight: "#ffffff",
        background: "#f8f9fa",
        surface: "#ffffff",
        surfaceMuted: "#eef3fd",
        border: "#dadce0",
        primary: "#1a73e8",
        secondary: "#188038",
        tertiary: "#f9ab00",
      },
      spacing: {
        density: 0.96,
      },
      typography: {
        fontFamily: FONT_OPTIONS[0].value,
      },
    },
  },
  apple: {
    label: "Apple",
    description: "Restrained graphite neutrals, airy surfaces, and system blue accents.",
    tokens: {
      color: {
        foreground: "#1d1d1f",
        foregroundMuted: "#6e6e73",
        contrastDark: "#1d1d1f",
        contrastLight: "#ffffff",
        background: "#f5f5f7",
        surface: "#ffffff",
        surfaceMuted: "#f0f1f5",
        border: "#d2d2d7",
        primary: "#0071e3",
        secondary: "#34c759",
        tertiary: "#ff9f0a",
      },
      spacing: {
        density: 1,
      },
      typography: {
        fontFamily: FONT_OPTIONS[1].value,
      },
    },
  },
  kong: {
    label: "Kong",
    description: "High-contrast API + AI look with hotter orange-red accents and darker support tones.",
    tokens: {
      color: {
        foreground: "#14151a",
        foregroundMuted: "#5f6574",
        contrastDark: "#14151a",
        contrastLight: "#ffffff",
        background: "#cdd4cb",
        surface: "#ffffff",
        surfaceMuted: "#f7efe8",
        border: "#dddfe6",
        primary: "#ccff00",
        secondary: "#a6191e",
        tertiary: "#ef7c6f",
      },
      spacing: {
        density: 0.9,
      },
      typography: {
        fontFamily: FONT_OPTIONS[4].value,
      },
    },
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;

  const int = Number.parseInt(safeHex, 16);

  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixColors(baseHex, mixHex, ratio) {
  const base = hexToRgb(baseHex);
  const mix = hexToRgb(mixHex);

  return rgbToHex({
    r: base.r + (mix.r - base.r) * ratio,
    g: base.g + (mix.g - base.g) * ratio,
    b: base.b + (mix.b - base.b) * ratio,
  });
}

function srgbToLinear(channel) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function getContrastRatio(foregroundHex, backgroundHex) {
  const foregroundLuminance = getRelativeLuminance(foregroundHex);
  const backgroundLuminance = getRelativeLuminance(backgroundHex);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function pickAccessibleTextColor(backgroundHex, darkHex, lightHex, minimumRatio = 4.5) {
  const darkContrast = getContrastRatio(darkHex, backgroundHex);
  const lightContrast = getContrastRatio(lightHex, backgroundHex);

  if (darkContrast >= minimumRatio || lightContrast >= minimumRatio) {
    return darkContrast >= lightContrast ? darkHex : lightHex;
  }

  const pureDarkContrast = getContrastRatio("#000000", backgroundHex);
  const pureLightContrast = getContrastRatio("#ffffff", backgroundHex);

  return pureDarkContrast >= pureLightContrast ? "#000000" : "#ffffff";
}

function buildTheme(tokens, appearanceMode) {
  const { color, spacing, typography } = tokens;
  const density = spacing.density;
  const isDarkMode = appearanceMode === "dark";
  const effectiveBackground = isDarkMode ? mixColors(color.foreground, "#000000", 0.78) : color.background;
  const effectiveSurface = isDarkMode ? mixColors(color.foreground, "#000000", 0.66) : color.surface;
  const effectiveSurfaceMuted = isDarkMode
    ? mixColors(color.foreground, color.primary, 0.12)
    : color.surfaceMuted;
  const effectiveBorder = isDarkMode ? mixColors(color.foregroundMuted, "#000000", 0.58) : color.border;
  const effectiveForeground = isDarkMode ? color.contrastLight : color.foreground;
  const effectiveForegroundMuted = isDarkMode
    ? mixColors(color.contrastLight, effectiveBackground, 0.34)
    : color.foregroundMuted;

  const primarySoft = mixColors(color.primary, effectiveBackground, isDarkMode ? 0.76 : 0.82);
  const secondarySoft = mixColors(color.secondary, effectiveBackground, isDarkMode ? 0.78 : 0.84);
  const tertiarySoft = mixColors(color.tertiary, effectiveBackground, isDarkMode ? 0.8 : 0.85);
  const elevatedSurface = mixColors(effectiveSurface, isDarkMode ? "#000000" : "#ffffff", 0.18);
  const mutedGlassSurface = mixColors(effectiveSurface, effectiveBackground, 0.3);
  const darkCanvas = mixColors(effectiveForeground, "#000000", 0.46);

  const onBackground = pickAccessibleTextColor(
    effectiveBackground,
    color.contrastDark,
    color.contrastLight,
  );
  const onSurface = pickAccessibleTextColor(
    effectiveSurface,
    color.contrastDark,
    color.contrastLight,
  );
  const onSurfaceMuted = pickAccessibleTextColor(
    effectiveSurfaceMuted,
    color.contrastDark,
    color.contrastLight,
  );
  const onPrimary = pickAccessibleTextColor(color.primary, color.contrastDark, color.contrastLight);
  const onPrimarySoft = pickAccessibleTextColor(
    primarySoft,
    color.contrastDark,
    color.contrastLight,
  );
  const onSecondarySoft = pickAccessibleTextColor(
    secondarySoft,
    color.contrastDark,
    color.contrastLight,
  );
  const onDarkCanvas = pickAccessibleTextColor(
    darkCanvas,
    color.contrastDark,
    color.contrastLight,
  );

  return {
    "--font-family": typography.fontFamily,
    "--color-fg": effectiveForeground,
    "--color-fg-muted": effectiveForegroundMuted,
    "--color-contrast-dark": color.contrastDark,
    "--color-contrast-light": color.contrastLight,
    "--color-bg": effectiveBackground,
    "--color-surface": effectiveSurface,
    "--color-surface-muted": effectiveSurfaceMuted,
    "--color-border": effectiveBorder,
    "--color-primary": color.primary,
    "--color-primary-soft": primarySoft,
    "--color-secondary": color.secondary,
    "--color-secondary-soft": secondarySoft,
    "--color-tertiary": color.tertiary,
    "--color-tertiary-soft": tertiarySoft,
    "--color-dark-canvas": darkCanvas,
    "--color-on-bg": onBackground,
    "--color-on-surface": onSurface,
    "--color-on-surface-muted": onSurfaceMuted,
    "--color-on-primary": onPrimary,
    "--color-on-primary-soft": onPrimarySoft,
    "--color-on-secondary-soft": onSecondarySoft,
    "--color-on-dark-canvas": onDarkCanvas,
    "--hero-shadow": `0 24px 80px ${mixColors(color.primary, isDarkMode ? "#000000" : "#ffffff", 0.78)}55`,
    "--panel-shadow": `0 16px 48px ${mixColors(effectiveForeground, isDarkMode ? "#000000" : "#ffffff", 0.92)}22`,
    "--editor-text": pickAccessibleTextColor("#ffffff", color.contrastDark, color.contrastLight),
    "--editor-subtle-text": pickAccessibleTextColor(mutedGlassSurface, color.contrastDark, color.contrastLight),
    "--editor-surface-elevated": elevatedSurface,
    "--editor-mode-ring": isDarkMode ? color.primary : "#714bff",
    "--preview-device-width":
      appearanceMode === "dark"
        ? "100%"
        : "100%",
    "--radius-sm": `${12 * density}px`,
    "--radius-md": `${18 * density}px`,
    "--radius-lg": `${26 * density}px`,
    "--space-1": `${4 * density}px`,
    "--space-2": `${8 * density}px`,
    "--space-3": `${12 * density}px`,
    "--space-4": `${16 * density}px`,
    "--space-5": `${20 * density}px`,
    "--space-6": `${24 * density}px`,
    "--space-8": `${32 * density}px`,
    "--space-10": `${40 * density}px`,
    "--space-12": `${48 * density}px`,
    "--space-16": `${64 * density}px`,
    "--space-20": `${80 * density}px`,
  };
}

function TokenRow({ label, value, onChange, description }) {
  return (
    <label className="token-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="token-input-wrap">
        <input type="color" value={value} onChange={onChange} />
        <input type="text" value={value} onChange={onChange} spellCheck="false" />
      </span>
    </label>
  );
}

function App() {
  const shellRef = useRef(null);
  const landingPageRef = useRef(null);
  const [tokens, setTokens] = useState(DEFAULT_TOKENS);
  const [activePreset, setActivePreset] = useState(null);
  const [activeTab] = useState("basic");
  const [appearanceMode, setAppearanceMode] = useState("light");
  const [previewDevice, setPreviewDevice] = useState("desktop");
  const [splitRatio, setSplitRatio] = useState(46);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [isSplitHover, setIsSplitHover] = useState(false);
  const [previewWidthClass, setPreviewWidthClass] = useState("preview-width-wide");

  const theme = useMemo(() => buildTheme(tokens, appearanceMode), [appearanceMode, tokens]);

  useEffect(() => {
    if (!isDraggingSplit) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const shell = shellRef.current;
      if (!shell) {
        return;
      }

      const rect = shell.getBoundingClientRect();
      const minPaneWidth = 360;
      const availableWidth = rect.width;
      const minRatio = (minPaneWidth / availableWidth) * 100;
      const maxRatio = 100 - minRatio;
      const nextRatio = ((event.clientX - rect.left) / availableWidth) * 100;

      setSplitRatio(clamp(nextRatio, minRatio, maxRatio));
    };

    const handlePointerUp = () => {
      setIsDraggingSplit(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDraggingSplit]);

  useEffect(() => {
    const node = landingPageRef.current;
    if (!node) {
      return undefined;
    }

    const updatePreviewWidthClass = (width) => {
      if (width < 360) {
        setPreviewWidthClass("preview-width-xnarrow");
        return;
      }

      if (width < 420) {
        setPreviewWidthClass("preview-width-narrow");
        return;
      }

      if (width < 500) {
        setPreviewWidthClass("preview-width-medium");
        return;
      }

      setPreviewWidthClass("preview-width-wide");
    };

    updatePreviewWidthClass(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updatePreviewWidthClass(entry.contentRect.width);
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, [previewDevice, splitRatio]);

  const updateColorToken = (key, nextValue) => {
    setTokens((current) => ({
      ...current,
      color: {
        ...current.color,
        [key]: nextValue,
      },
    }));
  };

  const updateDensity = (nextDensity) => {
    setTokens((current) => ({
      ...current,
      spacing: {
        ...current.spacing,
        density: Number(nextDensity),
      },
    }));
  };

  const updateFontFamily = (nextFamily) => {
    setTokens((current) => ({
      ...current,
      typography: {
        ...current.typography,
        fontFamily: nextFamily,
      },
    }));
  };

  const applyPreset = (presetKey) => {
    const preset = THEME_PRESETS[presetKey];
    if (!preset) {
      return;
    }

    setTokens(preset.tokens);
    setActivePreset(presetKey);
  };

  const handleResetTokens = () => {
    setTokens(DEFAULT_TOKENS);
    setActivePreset(null);
  };

  return (
    <div
      ref={shellRef}
      className={`app-shell ${isDraggingSplit ? "is-resizing" : ""}`}
      style={{
        ...theme,
        "--split-position": `${splitRatio}%`,
        "--splitter-color": isDraggingSplit || isSplitHover ? "#714bff" : "#d9deea",
        gridTemplateColumns: `${splitRatio}% minmax(0, 1fr)`,
      }}
    >
      <aside className="editor-pane">
        <div className="editor-header">
          <div className="editor-header-row">
            <div>
              <h1>Appearance</h1>
            </div>
            <div className="editor-header-actions">
              <button type="button" className="ghost-button" onClick={handleResetTokens}>
                Revert to saved
              </button>
              <button type="button" className="save-button">
                Save
              </button>
            </div>
          </div>
          <div className="editor-tabs">
            <button
              type="button"
              className={`editor-tab ${activeTab === "basic" ? "is-active" : ""}`}
            >
              Basic appearance
            </button>
            <button type="button" className="editor-tab is-muted">
              Global CSS
            </button>
          </div>
        </div>

        <div className="editor-scroll">
          <section className="appearance-block">
            <div className="appearance-block-heading">
              <h2>Color mode</h2>
            </div>
            <div className="mode-grid">
              <button
                type="button"
                className={`mode-card ${appearanceMode === "light" ? "is-active" : ""}`}
                onClick={() => setAppearanceMode("light")}
              >
                <strong>Light</strong>
                <small>Light background and dark text.</small>
              </button>
              <button
                type="button"
                className={`mode-card ${appearanceMode === "dark" ? "is-active" : ""}`}
                onClick={() => setAppearanceMode("dark")}
              >
                <strong>Dark</strong>
                <small>Dark background and light text.</small>
              </button>
            </div>
          </section>

          <section className="appearance-block">
            <div className="appearance-block-heading">
              <h2>Theme presets</h2>
              <p>Apply a full brand-aligned token set in one click.</p>
            </div>
            <div className="preset-grid preset-grid-inline">
              {Object.entries(THEME_PRESETS).map(([presetKey, preset]) => (
                <button
                  key={presetKey}
                  type="button"
                  className={`preset-button ${activePreset === presetKey ? "is-active" : ""}`}
                  onClick={() => applyPreset(presetKey)}
                >
                  <span className="preset-swatch-row">
                    <span style={{ background: preset.tokens.color.primary }} />
                    <span style={{ background: preset.tokens.color.foreground }} />
                    <span style={{ background: preset.tokens.color.background }} />
                  </span>
                  <span className="preset-copy">
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="appearance-block">
            <div className="appearance-block-heading">
              <h2>Basic appearance</h2>
              <p>Everything currently editable in the token configurator lives here.</p>
            </div>

            <section className="editor-section">
              <div className="section-heading">
                <h2>Base colors</h2>
                <p>Foreground, background, and structural surfaces.</p>
              </div>
              <div className="token-group">
                <TokenRow
                  label="Foreground"
                  description="Primary text and dark accents."
                  value={tokens.color.foreground}
                  onChange={(event) => updateColorToken("foreground", event.target.value)}
                />
                <TokenRow
                  label="Muted foreground"
                  description="Secondary copy and low emphasis text."
                  value={tokens.color.foregroundMuted}
                  onChange={(event) => updateColorToken("foregroundMuted", event.target.value)}
                />
                <TokenRow
                  label="Contrast dark"
                  description="Auto-selected dark text for filled and tinted components."
                  value={tokens.color.contrastDark}
                  onChange={(event) => updateColorToken("contrastDark", event.target.value)}
                />
                <TokenRow
                  label="Contrast light"
                  description="Auto-selected light text for dark fills and overlays."
                  value={tokens.color.contrastLight}
                  onChange={(event) => updateColorToken("contrastLight", event.target.value)}
                />
                <TokenRow
                  label="Page background"
                  description="Global backdrop behind the landing page."
                  value={tokens.color.background}
                  onChange={(event) => updateColorToken("background", event.target.value)}
                />
                <TokenRow
                  label="Surface"
                  description="Cards, panels, and elevated blocks."
                  value={tokens.color.surface}
                  onChange={(event) => updateColorToken("surface", event.target.value)}
                />
                <TokenRow
                  label="Muted surface"
                  description="Soft contrast surfaces and nested containers."
                  value={tokens.color.surfaceMuted}
                  onChange={(event) => updateColorToken("surfaceMuted", event.target.value)}
                />
                <TokenRow
                  label="Border"
                  description="Dividers, outlines, and strokes."
                  value={tokens.color.border}
                  onChange={(event) => updateColorToken("border", event.target.value)}
                />
              </div>
            </section>

            <section className="editor-section">
              <div className="section-heading">
                <h2>Brand colors</h2>
                <p>Primary, secondary, and tertiary accents linked into the preview.</p>
              </div>
              <div className="token-group">
                <TokenRow
                  label="Primary"
                  description="Main CTA, major highlights, and linked soft backgrounds."
                  value={tokens.color.primary}
                  onChange={(event) => updateColorToken("primary", event.target.value)}
                />
                <TokenRow
                  label="Secondary"
                  description="Support accent for tags and feature moments."
                  value={tokens.color.secondary}
                  onChange={(event) => updateColorToken("secondary", event.target.value)}
                />
                <TokenRow
                  label="Tertiary"
                  description="Third accent for metadata and tertiary emphasis."
                  value={tokens.color.tertiary}
                  onChange={(event) => updateColorToken("tertiary", event.target.value)}
                />
              </div>
            </section>

            <div className="basic-grid">
              <section className="editor-section">
                <div className="section-heading">
                  <h2>Density</h2>
                  <p>Adjust layout airiness and component rhythm.</p>
                </div>
                <div className="density-card">
                  <div className="density-header">
                    <strong>{tokens.spacing.density.toFixed(2)}x density</strong>
                    <span>
                      {tokens.spacing.density < 0.95
                        ? "Compact"
                        : tokens.spacing.density > 1.1
                          ? "Relaxed"
                          : "Balanced"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.82"
                    max="1.22"
                    step="0.02"
                    value={tokens.spacing.density}
                    onChange={(event) => updateDensity(event.target.value)}
                  />
                </div>
              </section>

              <section className="editor-section">
                <div className="section-heading">
                  <h2>Typography</h2>
                  <p>Set one product font family across the whole composition.</p>
                </div>
                <label className="font-select">
                  <span>Font family</span>
                  <select
                    value={tokens.typography.fontFamily}
                    onChange={(event) => updateFontFamily(event.target.value)}
                  >
                    {FONT_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            </div>
          </section>
        </div>
      </aside>

      <div
        className="splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize layout"
        onPointerDown={() => setIsDraggingSplit(true)}
        onPointerEnter={() => setIsSplitHover(true)}
        onPointerLeave={() => setIsSplitHover(false)}
      >
        <span className="splitter-line" />
      </div>

      <main className="preview-pane">
        <div className="preview-header">
          <div className="preview-header-left">
            <p>Preview</p>
          </div>
          <div className="preview-devices">
            {["desktop", "tablet", "mobile"].map((device) => (
              <button
                key={device}
                type="button"
                className={`device-button ${previewDevice === device ? "is-active" : ""}`}
                onClick={() => setPreviewDevice(device)}
              >
                {device}
              </button>
            ))}
          </div>
        </div>

        <div className="preview-status">
          <p>You are previewing the live tokenized landing page.</p>
          <button type="button" className="preview-login">
            Log in
          </button>
        </div>

        <div className="preview-scroll">
          <div
            ref={landingPageRef}
            className={`landing-page preview-device-${previewDevice} ${previewWidthClass}`}
          >
            <header className="portal-header">
              <div className="container header-inner">
                <div className="brand-lockup">
                  <div className="brand-badge">DP</div>
                  <div>
                    <p className="brand-name">Acme Dev Portal</p>
                    <p className="brand-subtitle">Developer platform</p>
                  </div>
                </div>
                <nav className="desktop-nav">
                  <a href="#features">Features</a>
                  <a href="#how-it-works">How it works</a>
                  <a href="#start">Get started</a>
                </nav>
                <button type="button" className="secondary-button">
                  Sign in
                </button>
              </div>
            </header>

            <section className="container hero-grid">
              <div>
                <div className="pill">Launch faster with a better developer experience</div>
                <h1 className="hero-title">
                  A simple developer portal for discovering, learning, and building.
                </h1>
                <p className="hero-copy">
                  Publish APIs, share documentation, and help developers go from first look to
                  first successful integration without the friction.
                </p>
                <div className="hero-actions">
                  <button type="button" className="primary-button">
                    Explore APIs
                  </button>
                  <button type="button" className="secondary-button">
                    Read docs
                  </button>
                </div>
                <div className="stats-grid">
                  <div className="stat-card">
                    <p className="stat-value">50+</p>
                    <p className="stat-label">APIs published</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-value">3 min</p>
                    <p className="stat-label">to first call</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-value">99.9%</p>
                    <p className="stat-label">uptime goal</p>
                  </div>
                </div>
              </div>

              <div className="showcase-frame">
                <div className="showcase-card">
                  <div className="showcase-head">
                    <div>
                      <p className="api-name">Payments API</p>
                      <p className="api-meta">REST . v2.1</p>
                    </div>
                    <span className="status-chip">Available</span>
                  </div>

                  <div className="showcase-stack">
                    <div className="content-card">
                      <p className="card-label">Quick start</p>
                      <p className="body-sm">
                        Create an application, generate credentials, and send your first request in
                        minutes.
                      </p>
                    </div>

                    <div className="content-card">
                      <p className="card-label">Popular endpoints</p>
                      <div className="endpoint-list">
                        <div className="endpoint-row">
                          <span className="endpoint-method endpoint-post">POST</span>
                          <span className="endpoint-path">/payments</span>
                        </div>
                        <div className="endpoint-row">
                          <span className="endpoint-method endpoint-get">GET</span>
                          <span className="endpoint-path">/payments/{"{id}"}</span>
                        </div>
                        <div className="endpoint-row">
                          <span className="endpoint-method endpoint-put">PUT</span>
                          <span className="endpoint-path">/customers/{"{id}"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="code-card">
                      <p className="card-label card-label-inverse">Example request</p>
                      <pre>{`curl -X POST https://api.acme.com/payments \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":1000,"currency":"USD"}'`}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="features" className="container section-block">
              <div className="section-intro">
                <p className="section-kicker">Features</p>
                <h2>Everything teams need to support developers well.</h2>
              </div>
              <div className="feature-grid">
                {FEATURE_LIST.map((feature) => (
                  <div key={feature.title} className="feature-card">
                    <h3>{feature.title}</h3>
                    <p>{feature.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="how-it-works" className="container section-block">
              <div className="journey-panel">
                <div>
                  <p className="section-kicker">How it works</p>
                  <h2>Move developers from discovery to delivery.</h2>
                  <p className="journey-copy">
                    A strong portal helps users find the right API, understand how it works, get
                    access, and ship something real without wasting time.
                  </p>
                </div>
                <div className="step-stack">
                  {STEP_LIST.map((step, index) => (
                    <div key={step} className="step-card">
                      <div className="step-number">{index + 1}</div>
                      <p>{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="start" className="container section-block section-block-last">
              <div className="cta-panel">
                <h2>Ready to give developers a better front door?</h2>
                <p>
                  Start with clear docs, clean onboarding, and a portal experience that makes your
                  APIs easier to adopt.
                </p>
                <div className="cta-actions">
                  <button type="button" className="cta-primary">
                    Get started
                  </button>
                  <button type="button" className="cta-secondary">
                    Contact sales
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
