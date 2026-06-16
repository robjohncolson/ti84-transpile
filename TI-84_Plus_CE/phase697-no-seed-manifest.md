# Phase 697: No-Seed Decision Manifest

Probe: `probe-phase697-no-seed-manifest.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase697-no-seed-manifest.mjs`

## Decision

- Decision: **NO SEED** from the phase693-696 coverage frontier.
- Scope: the 31,921 remaining uncovered non-erased ROM bytes and the 94 CODE? candidates identified by phase693.
- Basis: phase694 found 0 seed candidates and 0 direct control refs; phase695 found 0 seedable owners and 0 dynamic hits for the four manual-review ranges; phase696 grouped all remaining bytes as data/debt.
- Allowed future change: a seed edit requires new evidence, not another blind pass over the same ranges.

## Evidence Inputs

| phase | probe | report | key result |
| --- | --- | --- | --- |
| 694 | probe-phase694-code-frontier-refine.mjs | phase694-code-frontier-refine.md | 94 CODE? ranges refined to 90 likely-data + 4 manual-review; 0 seed candidates; 0 direct control refs |
| 695 | probe-phase695-manual-review-owner-search.mjs | phase695-manual-review-owner-search.md | 4 manual-review ranges checked; 0 seedable owners; 0 dynamic hits; only 3 raw24 non-control refs |
| 696 | probe-phase696-coverage-debt-map.mjs | phase696-coverage-debt-map.md | 31,921 uncovered bytes grouped into data/debt buckets; 94 CODE? candidates closed as do-not-seed debt |

## Debt Manifest

| bucket | ranges | bytes | disposition |
| --- | --- | --- | --- |
| table | 1479 | 22,014 | closed as data/debt; do not seed as code |
| font-bitmap | 425 | 4,026 | closed as data/debt; do not seed as code |
| sparse-data | 895 | 3,004 | closed as data/debt; do not seed as code |
| string | 143 | 2,800 | closed as data/debt; do not seed as code |
| unresolved-manual-review | 4 | 77 | hold as unresolved data/debt; do not seed without new owner or dynamic hit |

## Manual-Review Hold List

| range | len | reason | current policy |
| --- | --- | --- | --- |
| 0x08983D..0x089856 | 26 | phase695: no direct raw/lifted owner; pointer-table neighborhood | no raw/lifted control owner; no dynamic hit; no seed |
| 0x08B8F1..0x08B8FD | 13 | phase695: no direct raw/lifted owner; covered-target-looking data | no raw/lifted control owner; no dynamic hit; no seed |
| 0x0A169D..0x0A16AF | 19 | phase695: three raw24 data refs only; no executable owner | no raw/lifted control owner; no dynamic hit; no seed |
| 0x0A57B7..0x0A57C9 | 19 | phase695: no direct raw/lifted owner; covered-target-looking data | no raw/lifted control owner; no dynamic hit; no seed |

## Seed Proposal Admission Rules

- A dynamic trace must enter the proposed range as a lifted block or missing block; or
- A real indirect dispatch/table owner from covered code must point at the proposed range; or
- A newly discovered direct control-flow reference must identify a valid caller.
- Without one of those, the proposal stays no-seed debt. Adjacency, plausible decoded branch targets, and data-like raw24 references are insufficient.

## Compact JSON

```json
{
  "pass": true,
  "decision": "NO_SEED_FROM_PHASE693_696_FRONTIER",
  "coveredBytes": 713656,
  "uncoveredNonErasedBytes": 31921,
  "uncoveredRanges": 2946,
  "codeQuestionRanges": 94,
  "codeQuestionBytes": 1952,
  "seedCandidateCount": 0,
  "manualReviewRanges": [
    "0x08983D..0x089856",
    "0x08B8F1..0x08B8FD",
    "0x0A169D..0x0A16AF",
    "0x0A57B7..0x0A57C9"
  ],
  "requiredNewEvidence": [
    "dynamic trace enters the range as a lifted or missing block",
    "covered code has a real indirect dispatch/table owner pointing at the range",
    "new direct control-flow reference is found with a valid caller"
  ]
}
```

