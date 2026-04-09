import React, { useState, useCallback, useMemo } from "react";

/**
 * Socket Theory Interactive Demonstrator
 *
 * Visualises how socket depth, brow ridge, and aperture ratio shape a
 * vehicle's face — triggering involuntary pareidolia via the fusiform
 * face area.  Includes day/night mode to demonstrate how shadow
 * behaviour under different lighting intensifies or softens the
 * face-recognition response.
 */

const DOMAINS = [
  {
    key: "alfa159",
    label: "Alfa Romeo 159 Precedent",
    colour: "#C0392B",
    description:
      "The Alfa Romeo 159 is the modern benchmark for socketed automotive design. Its headlamps are deeply recessed beneath a pronounced brow ridge, and the shield grille sits in a sculpted cavity rather than flush with the bumper — producing a face that registers as alert, even predatory, before the viewer consciously identifies it as a car.",
  },
  {
    key: "pareidolia",
    label: "Pareidolia Neuroscience",
    colour: "#2980B9",
    description:
      "The fusiform face area (FFA) in the temporal lobe detects face-like patterns within 165 milliseconds — faster than conscious recognition. When headlamps sit in deep sockets and a brow ridge casts shadow above them, the FFA fires involuntarily. Socket Theory exploits this hard-wired response: the deeper the recess, the stronger the face read.",
  },
  {
    key: "korean",
    label: "Korean Design Inflection",
    colour: "#8E44AD",
    description:
      "Korean automotive design has shifted from conservative surface language to aggressive, feature-rich faces. Socket Theory analyses this inflection — where Korean brands push surface complexity outward (additive detail) versus the socket approach of carving inward (subtractive depth) — and identifies the divergence point where deeper recession creates presence without clutter.",
  },
  {
    key: "scalability",
    label: "Cross-Vehicle Scalability",
    colour: "#27AE60",
    description:
      "Socket architecture must scale from compact sports cars to full-size SUVs. The framework defines how socket depth, brow-ridge prominence, and aperture ratio adjust proportionally across vehicle segments — maintaining the pareidolia trigger at every scale without requiring segment-specific redesign.",
  },
  {
    key: "shadow",
    label: "Shadow Engineering",
    colour: "#F39C12",
    description:
      "Shadow is the active ingredient in socket design. By controlling the geometry of brow ridges and cavity walls, designers engineer the penumbra — the gradient from light to dark — that gives sockets their depth read. Shadow engineering defines how ambient occlusion, direct sun, and artificial lighting each alter the socket's perceived depth and emotional register.",
  },
  {
    key: "whitespace",
    label: "$110K–$140K Market White Space",
    colour: "#1ABC9C",
    description:
      "Between the $80K–$110K premium segment and the $150K+ ultra-luxury tier sits a white-space opportunity at $110K–$140K where no current vehicle fully exploits socket architecture. This domain maps the competitive landscape and demonstrates how a Socket Theory vehicle would own the segment through design differentiation rather than powertrain or badge alone.",
  },
];

/* ------------------------------------------------------------------ */
/*  SVG vehicle-face generator                                         */
/* ------------------------------------------------------------------ */

function generateFace({ socketDepth, browRidge, apertureRatio, nightMode }) {
  const sd = socketDepth / 100; // 0–1
  const br = browRidge / 100;
  const ar = apertureRatio / 100;

  // Shadow intensity driven by socket depth + lighting
  const shadowOpacity = nightMode
    ? 0.15 + sd * 0.35
    : 0.08 + sd * 0.55;

  // Brow ridge height
  const browHeight = 8 + br * 28;

  // Headlamp aperture size
  const lampWidth = 30 + ar * 35;
  const lampHeight = 12 + ar * 18;

  // Socket recess depth (visual offset)
  const recessDepth = 4 + sd * 20;

  // Grille aperture
  const grilleWidth = 40 + ar * 30;
  const grilleHeight = 20 + ar * 20;

  return {
    shadowOpacity,
    browHeight,
    lampWidth,
    lampHeight,
    recessDepth,
    grilleWidth,
    grilleHeight,
  };
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function DomainCard({ domain, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: isActive ? domain.colour + "18" : "#fafafa",
        border: `2px solid ${isActive ? domain.colour : "#e0e0e0"}`,
        borderRadius: 12,
        padding: "12px 16px",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.2s ease",
        width: "100%",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: domain.colour,
          marginRight: 8,
        }}
      />
      <strong style={{ fontSize: 14 }}>{domain.label}</strong>
    </button>
  );
}

function FaceViewer({ socketDepth, browRidge, apertureRatio, nightMode, accentColour }) {
  const face = generateFace({ socketDepth, browRidge, apertureRatio, nightMode });
  const bg = nightMode ? "#0D1117" : "#F5F5F0";
  const bodyColour = nightMode ? "#1A1F2E" : "#D4D0C8";
  const strokeColour = nightMode ? "#3A3F4E" : "#888";
  const accent = accentColour || (nightMode ? "#6EA8D7" : "#333");

  const cx = 280; // centre x
  const cy = 160; // centre y

  return (
    <svg
      viewBox="0 0 560 340"
      style={{
        width: "100%",
        maxWidth: 560,
        display: "block",
        margin: "0 auto",
        borderRadius: 12,
        background: bg,
        transition: "background 0.4s ease",
      }}
      role="img"
      aria-label={`Vehicle face — socket depth ${socketDepth}%, brow ridge ${browRidge}%, aperture ratio ${apertureRatio}%`}
    >
      {/* Body shell outline */}
      <path
        d={`
          M ${cx - 140},${cy + 80}
          C ${cx - 140},${cy - 60} ${cx + 140},${cy - 60} ${cx + 140},${cy + 80}
          L ${cx + 140},${cy + 100}
          L ${cx - 140},${cy + 100} Z
        `}
        fill={bodyColour}
        stroke={strokeColour}
        strokeWidth="2"
      />

      {/* Left headlamp socket */}
      <g>
        {/* Socket cavity (shadow) */}
        <ellipse
          cx={cx - 80}
          cy={cy + 10}
          rx={face.lampWidth}
          ry={face.lampHeight + face.recessDepth}
          fill={`rgba(0,0,0,${face.shadowOpacity})`}
        />
        {/* Brow ridge */}
        <path
          d={`
            M ${cx - 80 - face.lampWidth - 4},${cy + 10 - face.lampHeight}
            Q ${cx - 80},${cy + 10 - face.lampHeight - face.browHeight}
              ${cx - 80 + face.lampWidth + 4},${cy + 10 - face.lampHeight}
          `}
          fill="none"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Lamp element */}
        <ellipse
          cx={cx - 80}
          cy={cy + 10}
          rx={face.lampWidth * 0.6}
          ry={face.lampHeight * 0.55}
          fill={nightMode ? "#FFF5CC" : accent + "44"}
          stroke={accent}
          strokeWidth="1.5"
          opacity={nightMode ? 0.9 : 0.7}
        />
        {nightMode && (
          <ellipse
            cx={cx - 80}
            cy={cy + 10}
            rx={face.lampWidth * 0.9}
            ry={face.lampHeight * 0.8}
            fill="none"
            stroke="#FFF5CC"
            strokeWidth="0.5"
            opacity="0.3"
          />
        )}
      </g>

      {/* Right headlamp socket */}
      <g>
        <ellipse
          cx={cx + 80}
          cy={cy + 10}
          rx={face.lampWidth}
          ry={face.lampHeight + face.recessDepth}
          fill={`rgba(0,0,0,${face.shadowOpacity})`}
        />
        <path
          d={`
            M ${cx + 80 - face.lampWidth - 4},${cy + 10 - face.lampHeight}
            Q ${cx + 80},${cy + 10 - face.lampHeight - face.browHeight}
              ${cx + 80 + face.lampWidth + 4},${cy + 10 - face.lampHeight}
          `}
          fill="none"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <ellipse
          cx={cx + 80}
          cy={cy + 10}
          rx={face.lampWidth * 0.6}
          ry={face.lampHeight * 0.55}
          fill={nightMode ? "#FFF5CC" : accent + "44"}
          stroke={accent}
          strokeWidth="1.5"
          opacity={nightMode ? 0.9 : 0.7}
        />
        {nightMode && (
          <ellipse
            cx={cx + 80}
            cy={cy + 10}
            rx={face.lampWidth * 0.9}
            ry={face.lampHeight * 0.8}
            fill="none"
            stroke="#FFF5CC"
            strokeWidth="0.5"
            opacity="0.3"
          />
        )}
      </g>

      {/* Grille socket */}
      <g>
        <rect
          x={cx - face.grilleWidth}
          y={cy + 40}
          width={face.grilleWidth * 2}
          height={face.grilleHeight}
          rx={face.grilleHeight * 0.4}
          fill={`rgba(0,0,0,${face.shadowOpacity * 1.2})`}
        />
        <rect
          x={cx - face.grilleWidth + 6}
          y={cy + 44}
          width={(face.grilleWidth - 6) * 2}
          height={face.grilleHeight - 8}
          rx={(face.grilleHeight - 8) * 0.35}
          fill="none"
          stroke={accent}
          strokeWidth="1"
          opacity="0.5"
        />
      </g>

      {/* Labels */}
      <text x={cx} y={20} textAnchor="middle" fontSize="12" fill={nightMode ? "#667" : "#999"}>
        {nightMode ? "Night — shadow defines the socket" : "Day — brow ridge reads as bone structure"}
      </text>

      {/* FFA timing annotation */}
      <text x={cx} y={cy + 130} textAnchor="middle" fontSize="11" fill={accent} opacity="0.7">
        Fusiform face area fires in {"<"}165ms
      </text>
    </svg>
  );
}

function Slider({ label, value, onChange, min, max, leftLabel, rightLabel }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        {label}: {value}%
      </label>
      <input
        type="range"
        min={min || 0}
        max={max || 100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", cursor: "pointer" }}
        aria-label={label}
      />
      {leftLabel && rightLabel && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa", marginTop: 2 }}>
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main demonstrator                                                  */
/* ------------------------------------------------------------------ */

export default function SocketDemonstrator() {
  const [socketDepth, setSocketDepth] = useState(60);
  const [browRidge, setBrowRidge] = useState(50);
  const [apertureRatio, setApertureRatio] = useState(50);
  const [nightMode, setNightMode] = useState(false);
  const [activeDomainKey, setActiveDomainKey] = useState(null);

  const activeDomain = DOMAINS.find((d) => d.key === activeDomainKey) || null;

  return (
    <div
      style={{
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
        padding: 32,
        color: nightMode ? "#E0E0E0" : "#222",
        background: nightMode ? "#0A0E14" : "#fff",
        transition: "all 0.4s ease",
        minHeight: "100vh",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Socket Theory — Interactive Demonstrator
        </h1>
        <p
          style={{
            fontSize: 15,
            color: nightMode ? "#889" : "#666",
            marginTop: 8,
            maxWidth: 640,
            margin: "8px auto 0",
          }}
        >
          Adjust socket depth, brow ridge, and aperture ratio to see how
          skull-like panel framing and deep recession trigger face pareidolia.
          Toggle day/night mode to see how shadow behaviour transforms the read.
        </p>
      </header>

      {/* Face viewer */}
      <FaceViewer
        socketDepth={socketDepth}
        browRidge={browRidge}
        apertureRatio={apertureRatio}
        nightMode={nightMode}
        accentColour={activeDomain?.colour}
      />

      {/* Controls */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          maxWidth: 640,
          margin: "32px auto",
        }}
      >
        <div>
          <Slider
            label="Socket Depth"
            value={socketDepth}
            onChange={setSocketDepth}
            leftLabel="Flush"
            rightLabel="Deep recess"
          />
          <Slider
            label="Brow Ridge"
            value={browRidge}
            onChange={setBrowRidge}
            leftLabel="Flat"
            rightLabel="Pronounced"
          />
        </div>
        <div>
          <Slider
            label="Aperture Ratio"
            value={apertureRatio}
            onChange={setApertureRatio}
            leftLabel="Narrow"
            rightLabel="Wide open"
          />

          {/* Day / Night toggle */}
          <div style={{ marginTop: 8 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Lighting Mode
            </label>
            <button
              onClick={() => setNightMode(!nightMode)}
              style={{
                background: nightMode ? "#1A1F2E" : "#F5F5F0",
                border: `2px solid ${nightMode ? "#3A5F8A" : "#ccc"}`,
                borderRadius: 8,
                padding: "8px 20px",
                cursor: "pointer",
                fontSize: 14,
                color: nightMode ? "#6EA8D7" : "#555",
                transition: "all 0.3s ease",
                width: "100%",
              }}
            >
              {nightMode ? "Night Mode" : "Day Mode"} — tap to switch
            </button>
            <div style={{ fontSize: 11, color: nightMode ? "#556" : "#aaa", marginTop: 4 }}>
              {nightMode
                ? "Shadow dominates — sockets read as eye cavities"
                : "Brow ridges cast directional shadow — bone structure reads"}
            </div>
          </div>
        </div>
      </div>

      {/* Six-domain evidence grid */}
      <section style={{ maxWidth: 640, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Six-Domain Evidence Base
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {DOMAINS.map((d) => (
            <DomainCard
              key={d.key}
              domain={d}
              isActive={activeDomainKey === d.key}
              onClick={() =>
                setActiveDomainKey(activeDomainKey === d.key ? null : d.key)
              }
            />
          ))}
        </div>

        {activeDomain && (
          <div
            style={{
              background: activeDomain.colour + "0C",
              border: `1px solid ${activeDomain.colour}33`,
              borderRadius: 12,
              padding: "20px 24px",
              fontSize: 14,
              lineHeight: 1.65,
              color: nightMode ? "#CCC" : "#333",
            }}
          >
            <strong style={{ color: activeDomain.colour }}>
              {activeDomain.label}:
            </strong>{" "}
            {activeDomain.description}
          </div>
        )}
      </section>

      <footer
        style={{
          marginTop: 48,
          borderTop: `1px solid ${nightMode ? "#1A1F2E" : "#eee"}`,
          paddingTop: 16,
          fontSize: 12,
          color: nightMode ? "#445" : "#aaa",
          textAlign: "center",
        }}
      >
        Socket Theory © Owen Earnhardt. All rights reserved.
      </footer>
    </div>
  );
}
