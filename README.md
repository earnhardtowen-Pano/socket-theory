# Socket Theory

**A biologically grounded framework for automotive design.**

Socket Theory proposes that every compelling surface transition in automotive form can be understood as a ball-and-socket articulation — a convex volume nesting into a concave receiver, the same fundamental relationship that governs how bones meet in a shoulder joint, how a leaf emerges from its stem, and how embryonic tissue folds inward to create structure. By grounding design language in this single biological primitive, Socket Theory replaces subjective aesthetic debate with a testable, cross-domain principle: if the ball–socket ratio is anatomically coherent, the surface will read as alive; if it collapses into a flat crease or an arbitrary fillet, the form goes inert. The framework draws its evidence from six domains — musculoskeletal anatomy, neuroscience, botany, embryology, palaeontology, and fluid dynamics — and offers designers a shared vocabulary for creating vehicles that feel grown rather than styled.

---

## Repository Contents

```
socket-theory/
├── README.md                          ← This file
├── docs/
│   ├── socket-theory-manifesto.pdf    ← The Socket Theory manifesto
│   └── six-domain-evidence-base.pdf   ← Evidence across six biological domains
├── demonstrator/
│   └── SocketDemonstrator.jsx         ← Interactive React demonstrator
├── vehicles/
│   ├── vehicle-01/                    ← Vehicle project 1
│   ├── vehicle-02/                    ← Vehicle project 2
│   ├── vehicle-03/                    ← Vehicle project 3
│   └── vehicle-04/                    ← Vehicle project 4
├── sketches/                          ← Design sketches and explorations
└── website/                           ← Public portfolio website
```

### docs/

Core written works. The **manifesto** lays out the theory's principles and design operations. The **six-domain evidence base** catalogues biological precedents across musculoskeletal anatomy, neuroscience, botany, embryology, palaeontology, and fluid dynamics.

### demonstrator/

An interactive React component that lets users drag a ball–socket ratio slider and watch how the relationship between convex and concave volumes reshapes a car's shoulder line, wheel arches, and greenhouse junction in real time. Each of the six evidence domains can be toggled to colour-code the profile and read a domain-specific annotation.

### vehicles/

Four vehicle projects developed under Socket Theory. Each folder will contain concept renders, surface-analysis overlays, and design rationale documents.

### sketches/

Freehand and digital sketches exploring socket articulations, surface studies, and form-language development.

### website/

Source files for the public-facing portfolio site.

---

## Getting Started

To run the interactive demonstrator locally:

```bash
# In a React project that supports JSX
cp demonstrator/SocketDemonstrator.jsx src/
# Import and render <SocketDemonstrator /> in your app
```

---

## License & Copyright

© Owen Earnhardt. All rights reserved.

No part of this repository — including written works, visual designs, source code, and design frameworks — may be reproduced, distributed, or transmitted in any form without the prior written permission of the author, except for brief quotations in critical reviews and certain other non-commercial uses permitted by copyright law.

Socket Theory is an original design framework by Owen Earnhardt.
