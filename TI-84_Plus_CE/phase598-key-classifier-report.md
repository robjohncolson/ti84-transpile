# Phase 598 Key Classifier Report

## Scope

This report accompanies `probe-phase598-decode-058EDA.mjs`, a static ROM disassembly probe for:

- `0x05877A`: general key handler inside `cxMain`
- `0x058EDA`: key classifier
- `0x0587E9`: convergence point after the classifier path rejoins

The probe uses the project eZ80 decoder directly:

```js
import { decodeInstruction } from './ez80-decoder.js';
decodeInstruction(romBytes, offset, 'adl');
```

It does not hand-decode ROM bytes.

## How To Run

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase598-decode-058EDA.mjs
```

The probe prints three full listings plus summaries for control-flow references, predicate/branch candidates, and immediate ROM address references.

## Static Decode Targets

### `0x05877A` - General Key Handler

The probe decodes from `0x05877A` through and beyond `0x058EDA` so the caller context leading into the key classifier is visible. This region is expected to include the path Session 597 identified for all non-ENTER keys.

Important annotation to check in this listing:

- Any `CALL 0x058EDA` is tagged as `key classifier`.
- Any jump to `0x0587E9` is tagged as `convergence point`.
- Calls or jumps to known key-processing helpers are tagged inline.

### `0x058EDA` - Key Classifier

The classifier listing is the key artifact for this phase. The probe decodes 250 bytes and does not stop at the first conditional return. It highlights:

- `CP` instructions as classifier predicate candidates.
- `BIT` instructions as classifier predicate candidates.
- Nearby `JR`, `JP`, `CALL`, and `RET` instructions after each predicate as the likely branch outcome.

The character-vs-command split should be read from this section by locating the predicate whose branch target reaches the command dispatcher path versus the path that returns or falls through to character insertion.

### `0x0587E9` - Convergence Point

The convergence listing starts at `0x0587E9` and decodes at least 150 bytes. This shows how paths from the general key handler merge after the classifier has run, and whether the code proceeds into token insertion, command dispatch, display refresh, or early exit.

## Branching Logic To Identify

The decisive classification logic is expected to appear in the `0x058EDA` listing as a short sequence of:

1. Loading or deriving a key code / token candidate.
2. Comparing it with `CP` or testing a flag/range with `BIT`.
3. Taking a conditional `JR` or `JP`.

Use the probe section named `0x058EDA Predicate/Branch Candidates` to find the exact predicate. For each `CP` or `BIT`, the probe prints the next nearby control-transfer instructions. The branch whose target leads toward `0x099921` is the command-key path. The opposite branch or fallthrough is the character-insertion path.

Expected interpretation:

- Character keys, including digits, bypass the `0x099921` 38-entry command dispatcher.
- Command keys, including graph/menu-style keys, take the classifier branch that reaches the dispatcher path.
- The split is therefore not at `0x05877A`; it is inside or immediately after `0x058EDA`, based on a range/test predicate over the key/token value.

## Known Cross-References

The probe tags these addresses when they appear as parsed `CALL`, `JP`, or `JR` targets:

| Address | Meaning |
| --- | --- |
| `0x099921` | 38-entry command dispatcher |
| `0x080259` | Descriptor helper |
| `0x058EDA` | Key classifier |
| `0x0587E9` | Convergence point |
| `0x07BF19` | Quit handler |
| `0x061D1A` | Key-to-token |
| `0x03E1B4` | Token processor |
| `0x022331` | Key processor suite |
| `0x08C72F` | Display refresh dispatch |
| `0x05622E` | Key-code-to-token mapper |

## ROM Table Lookups

The probe section named `Immediate ROM Address References` lists parsed 5- or 6-digit immediate addresses that are not already known function labels. Treat these as candidate ROM tables or data pointers.

For the classifier, table references near `LD`, indexed loads, or pointer arithmetic are the most important. Record the address and surrounding byte range from the full listing after running the probe.

## Reading The Probe Output

The relevant output pattern for the final key finding is:

```text
0x058eda  ...  CP/BIT ...    ; classifier predicate candidate
  next control: 0x...... ... JR/JP condition,target    ; branch candidate
```

If the branch target or its downstream path reaches `0x099921`, that condition is the command-key classification. If the branch avoids `0x099921` and rejoins at `0x0587E9` or proceeds toward token insertion helpers, that condition is the character-key classification.

Because this subagent task explicitly forbids running verification commands after patching, the exact decoded opcodes and final branch condition should be taken from the probe output when it is run by the parent session.
