---
phase: "01"
slug: "precisi-n-normativa-oguc-y-motor-solar"
status: draft
nyquist_compliant: false
wave_0_complete: true
created: "2026-10-28"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript Compiler (`tsc --noEmit`) + `npx tsx` deterministic verification assertions |
| **Config file** | `tsconfig.json` |
| **Quick run command** | `npm run lint` |
| **Full suite command** | `npm run lint && npm run build` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run lint` + task-specific `npx tsx` assertion command
- **After every plan wave:** Run `npm run lint && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | OGUC-03 | T-01-01 | Bounded `maxPasses` in `pruneSelfIntersections` prevents main-thread DoS on degenerate polygons | unit | `npx tsx` concave inset assertion + `npm run lint` | ✅ | ⬜ pending |
| 01-01-02 | 01 | 1 | OGUC-01 | T-01-02 | Multi-tier shadow hull grounded on DEM elevation | unit | `npx tsx` multi-tier shadow assertion + `npm run lint` | ✅ | ⬜ pending |
| 01-02-01 | 02 | 1 | OGUC-04 | T-01-03 | Validated `Date` parsing & bounded timezone offsets | unit | `npx tsx` solar timezone/date assertion + `npm run lint` | ✅ | ⬜ pending |
| 01-02-02 | 02 | 2 | OGUC-02 | T-01-04 | Rigid-body clamped lot translation (`Number.isFinite` guard) synced across 2.5D/3D/.geoarc | unit/integration | `npx tsx` lot translation assertion + `npm run lint` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure (`typescript` + `tsx`) covers all Phase 01 requirements (Note: full `Vitest` test runner installation is scoped to Phase 4 `QUAL-01`).

---

## Manual-Only Verifications

*All phase behaviors have automated verification via `npx tsx` geometric/astronomical assertions and `npm run lint`.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter once plans are verified

**Approval:** pending
