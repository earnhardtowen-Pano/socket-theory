# OPEN QUESTIONS

Holes the owner fills. An honest hole beats a confident lie.

1. **Seed file missing.** The brief references `seed/pkgprop-v0.jsx` but it was
   not present in the repository at kickoff. The four seed contracts were
   rebuilt from the brief's own description (§1). If the real seed exists
   elsewhere, drop it into `pkgprop/seed/` and I will diff behavior against it.

2. **Anthropometric values are ASSUMED pending sources.** Seated stature, eye
   height, hip-to-heel and similar chain values ship as ASSUMED with notes.
   Candidate sources to verify against: SAE J833, ISO 3411, ANSUR II tables.
   Each ASSUMED anthro value is editable in the LEDGER.

3. **`unit_in_to_mm` — kernel or car?** The only parameter with a real external
   citation, and the citation is about measurement rather than cars. But both
   consumers use it for exactly one thing: pulling the rim diameter out of the
   inch-based part of the ISO tire code. Kernel-side it becomes a
   unit-conversion table with one entry. Car-side, a second module needing
   inches must redeclare it — and `Registry.define()` throws on duplicate ids,
   so loading both modules would crash. That last point is the only argument
   that bites at runtime, and it points to kernel. Owner's call at the Phase 1
   gate.

4. **Constraints as data: an expression AST, or registered thunks?** `solve.ts`
   is a hand-ordered script and the order is car knowledge. The obvious fix is
   forbidden by DECISIONS #6 — constraints cannot carry precomputed numbers
   without severing attribution. INVENTORY.md §7 recommends thunks (data-shaped
   registration, code-shaped bodies) over writing an interpreter, and notes
   that extending `beginTrace()` to record *placed quantities* would yield the
   dependency order for free and close the severance bug at the same time.
   Needs a decision before Phase 1 starts.

5. **Nine live defects, unfixed by choice.** INVENTORY.md §4 lists them with
   reproductions: truncated attribution chains, a wheelbase floor whose author
   is decided by source-line order, a crash-structure demand that is not
   enforced, a DERIVED wall standing on an ASSUMED style target, a slider and a
   drawing that disagree for the EV, thirteen unlicensed defaults outside the
   lint's reach, and a feature that narrates the kernel's attribution over its
   own arithmetic. Phase 0 reports rather than fixes, because the golden
   snapshot exists to prove this phase changed nothing. Each needs a decision:
   fix before extraction, or carry forward.
