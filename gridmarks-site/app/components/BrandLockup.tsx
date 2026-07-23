"use client";

import { useState } from "react";

type BrandLockupProps = {
  autoRevealed?: boolean;
};

export function BrandLockup({ autoRevealed = false }: BrandLockupProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  return (
    <a
      className={`brand-lockup ${isHovered || autoRevealed ? "is-hovered" : ""} ${
        hasInteracted ? "has-interacted" : ""
      }`}
      href="https://github.com/copetus/gridmarks"
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => {
        setHasInteracted(true);
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setHasInteracted(true);
        setIsHovered(false);
      }}
      onFocus={() => {
        setHasInteracted(true);
        setIsHovered(true);
      }}
      onBlur={() => {
        setHasInteracted(true);
        setIsHovered(false);
      }}
    >
      <div className="brand-lockup-default">
        <img src="/gridmarks-icon-128.png" alt="" />
        <div>
          <span>Gridmarks</span>
        </div>
      </div>
      <span className="brand-lockup-cta">
        <span className="brand-lockup-cta-label">Get the extension</span>
        <span className="brand-lockup-cta-icon" aria-hidden="true">
          <svg focusable="false" viewBox="0 0 24 24">
            <path d="M6 6v2h8.59L5 17.59 6.41 19 16 9.41V18h2V6z" />
          </svg>
        </span>
      </span>
    </a>
  );
}
