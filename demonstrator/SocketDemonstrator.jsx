import React, { useState, useRef, useCallback } from "react";

/**
 * Socket Theory Interactive Demonstrator
 *
 * Visualises the core principle of Socket Theory: that every automotive
 * surface transition can be described as a biological ball-and-socket
 * articulation — a convex "ball" form nesting into a concave "socket"
 * receiver.  Users drag the Ball–Socket Ratio slider to see how the
 * relationship between the two volumes reshapes a car's shoulder line,
 * wheel-arch lip, and greenhouse-to-body junction in real time.
 */

const DOMAINS = [
  {
    key: "musculoskeletal",
    label: "Musculoskeletal",
    colour: "#E85D3A",
    description:
      "Ball-and-socket joints allow omnidirectional rotation.  In automotive form, this maps to the way a fender crown (ball) rolls into the door pocket (socket), producing a shoulder line that reads as a living hinge rather than a stamped crease.",
  },
  {
    key: "neuroscience",
    label: "Neuroscience",
    colour: "#3A8EE8",
    description:
      "Human visual processing favours curvature continuity (G2+) over tangent-only (G1) transitions.  Socket Theory leverages this perceptual bias: the ball-to-socket blend is inherently G2-continuous, so the eye tracks it without friction.",
  },
  {
    key: "botany",
    label: "Botany",
    colour: "#4CAF50",
    description:
      "Phyllotactic growth produces convex lobes that nest into concave axils.  The same additive logic governs how a wheel-arch flare (ball) emerges from the body-side cavity (socket), giving the form an organic, growth-driven character.",
  },
  {
    key: "embryology",
    label: "Embryology",
    colour: "#9C27B0",
    description:
      "Invagination and evagination — tissue folding inward and outward — are the morphogenetic moves that Socket Theory abstracts into design operations.  Every tuck of a rear haunch into a tail-lamp recess re-enacts embryonic folding.",
  },
  {
    key: "palaeontology",
    label: "Palaeontology",
    colour: "#FF9800",
    description:
      "Arthropod exoskeletons achieve both protection and mobility through overlapping convex plates seated in concave sockets.  This principle translates directly to panel-gap strategy: each shut-line becomes a functional socket joint.",
  },
  {
    key: "fluid_dynamics",
    label: "Fluid Dynamics",
    colour: "#00BCD4",
    description:
      "Streamlined biological bodies (fish, birds) manage pressure gradients through smooth convex-to-concave surface changes.  Socket Theory applies the same curvature logic to aerodynamic surfaces, aligning aesthetic intent with airflow.",
  },
];

/* ------------------------------------------------------------------ */
/*  SVG car-profile generator                                          */
/* ------------------------------------------------------------------ */

function generateProfile(ratio) {
  // ratio 0 → flat / creased (no socket), ratio 1 → deep socket
  const r = ratio / 100;

  // Shoulder-line curvature
  const shoulderBulge = 8 + r * 22;
  const shoulderConcavity = 2 + r * 18;

  // Wheel-arch depth
  const archDepth = 10 + r * 30;

  // Greenhouse taper
  const roofInset = 30 + r * 15;

  return {
    body: `
      M 40,200
      C 40,200  60,${200 - shoulderBulge}  120,${200 - shoulderBulge}
      C 150,${200 - shoulderBulge}  155,${200 - shoulderBulge + shoulderConcavity}  180,${200 - shoulderBulge + shoulderConcavity}
      C 210,${200 - shoulderBulge + shoulderConcavity}  280,${200 - shoulderBulge}  340,${200 - shoulderBulge}
      C 380,${200 - shoulderBulge}  385,${200 - shoulderBulge + shoulderConcavity}  410,${200 - shoulderBulge + shoulderConcavity}
      C 440,${200 - shoulderBulge + shoulderConcavity}  480,${200 - shoulderBulge}  520,200
      L 520,230  40,230 Z
    `,
    roof: `
      M ${80 + roofInset},${200 - shoulderBulge}
      C ${80 + roofInset},${140 - r * 10}  ${480 - roofInset},${140 - r * 10}  ${480 - roofInset},${200 - shoulderBulge}
    `,
    frontArch: `
      M 100,230
      C 100,${230 - archDepth}  170,${230 - archDepth}  170,230
    `,
    rearArch: `
      M 390,230
      C 390,${230 - archDepth}  460,${230 - archDepth}  460,230
    `,
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

function ProfileViewer({ ratio, activeDomain }) {
  const paths = generateProfile(ratio);
  const colour = activeDomain ? activeDomain.colour : "#333";

  return (
    <svg
      viewBox="0 0 560 280"
      style={{ width: "100%", maxWidth: 560, display: "block", margin: "0 auto" }}
      role="img"
      aria-label={`Car profile at ball-socket ratio ${ratio}%`}
    >
      {/* Ground line */}
      <line x1="20" y1="232" x2="540" y2="232" stroke="#ccc" strokeWidth="1" />

      {/* Body */}
      <path d={paths.body} fill={colour + "22"} stroke={colour} strokeWidth="2.5" />

      {/* Roof */}
      <path d={paths.roof} fill="none" stroke={colour} strokeWidth="2" strokeDasharray={ratio < 20 ? "6 4" : "none"} />

      {/* Wheel arches */}
      <path d={paths.frontArch} fill="#fff" stroke={colour} strokeWidth="2" />
      <path d={paths.rearArch} fill="#fff" stroke={colour} strokeWidth="2" />

      {/* Wheels */}
      <circle cx="135" cy="232" r="18" fill="#222" />
      <circle cx="135" cy="232" r="8" fill="#555" />
      <circle cx="425" cy="232" r="18" fill="#222" />
      <circle cx="425" cy="232" r="8" fill="#555" />

      {/* Labels */}
      <text x="280" y="20" textAnchor="middle" fontSize="13" fill="#666">
        Ball–Socket Ratio: {ratio}%
      </text>
      <text x="135" y="270" textAnchor="middle" fontSize="10" fill="#999">
        {ratio < 30 ? "flat arch" : ratio < 70 ? "emerging socket" : "deep socket"}
      </text>
      <text x="425" y="270" textAnchor="middle" fontSize="10" fill="#999">
        {ratio < 30 ? "flat arch" : ratio < 70 ? "emerging socket" : "deep socket"}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main demonstrator                                                  */
/* ------------------------------------------------------------------ */

export default function SocketDemonstrator() {
  const [ratio, setRatio] = useState(50);
  const [activeDomainKey, setActiveDomainKey] = useState(null);

  const activeDomain = DOMAINS.find((d) => d.key === activeDomainKey) || null;

  const handleSlider = useCallback((e) => {
    setRatio(Number(e.target.value));
  }, []);

  return (
    <div
      style={{
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
        padding: 32,
        color: "#222",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Socket Theory — Interactive Demonstrator
        </h1>
        <p style={{ fontSize: 15, color: "#666", marginTop: 8, maxWidth: 600, margin: "8px auto 0" }}>
          Drag the slider to adjust the <em>ball–socket ratio</em> and watch
          how biological articulation logic reshapes every surface transition
          on the car profile.
        </p>
      </header>

      {/* Profile viewer */}
      <ProfileViewer ratio={ratio} activeDomain={activeDomain} />

      {/* Slider */}
      <div style={{ textAlign: "center", margin: "24px 0 40px" }}>
        <label style={{ display: "block", fontSize: 13, color: "#888", marginBottom: 6 }}>
          Ball–Socket Ratio
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={ratio}
          onChange={handleSlider}
          style={{ width: "60%", maxWidth: 400, cursor: "pointer" }}
          aria-label="Ball-socket ratio"
        />
        <div style={{ fontSize: 12, color: "#aaa", marginTop: 4, display: "flex", justifyContent: "space-between", maxWidth: 400, margin: "4px auto 0" }}>
          <span>0 — Flat / Creased</span>
          <span>100 — Deep Socket</span>
        </div>
      </div>

      {/* Six-domain evidence grid */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Six-Domain Evidence Base
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {DOMAINS.map((d) => (
            <DomainCard
              key={d.key}
              domain={d}
              isActive={activeDomainKey === d.key}
              onClick={() => setActiveDomainKey(activeDomainKey === d.key ? null : d.key)}
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
              color: "#333",
            }}
          >
            <strong style={{ color: activeDomain.colour }}>{activeDomain.label}:</strong>{" "}
            {activeDomain.description}
          </div>
        )}
      </section>

      <footer style={{ marginTop: 48, borderTop: "1px solid #eee", paddingTop: 16, fontSize: 12, color: "#aaa", textAlign: "center" }}>
        Socket Theory © Owen Earnhardt. All rights reserved.
      </footer>
    </div>
  );
}
