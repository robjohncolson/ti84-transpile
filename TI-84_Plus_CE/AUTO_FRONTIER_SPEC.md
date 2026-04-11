# Autonomous Frontier Expansion Loop

**Goal**: Run unattended until the TI-84 CE OS event loop executes deeply enough to write LCD pixels.

## The Pattern We're Automating

Every phase of this project follows the same cycle:
1. Run tests → discover blocker (missing block, wrong value, stuck loop)
2. Investigate blocker (trace execution, disassemble ROM, check hardware docs)
3. Fix (add seed, fix peripheral, correct emitter)
4. Retranspile if seeds changed (50+ min)
5. Validate (rerun tests, check if blocker resolved)
6. Document (commit, update continuation prompt)
7. Repeat

The human's role has been exclusively approval ("sure, go ahead", "what's next?").
All decisions are data-driven from test output.

## Architecture

```
┌─────────────────────────────────────────────┐
│            frontier-runner.mjs               │
│                                             │
│  while (vramEmpty && iteration < MAX) {     │
│    blocker = runTestsAndParseBLocker()      │
│    fix = investigateAndFix(blocker)         │
│    if (fix.needsRetranspile) transpile()    │
│    commit(fix)                              │
│  }                                          │
└─────────────────────────────────────────────┘
        │              │             │
   ┌────▼────┐  ┌──────▼──────┐  ┌──▼──────────┐
   │ test    │  │ transpiler  │  │ git commit  │
   │ harness │  │ (50+ min)   │  │ + push      │
   └─────────┘  └─────────────┘  └─────────────┘
```

## Blocker Classification

| Blocker Type | Detection | Automated Fix |
|-------------|-----------|---------------|
| missing_block | `onMissingBlock` callback returns address | Add as seed to transpiler |
| halt_with_iff0 | termination=halt, IFF1=0 | Switch to NMI timer mode |
| infinite_loop | termination=max_steps, same 2 blocks | Check peripheral register, model hardware |
| wrong_port_value | Port read returns unexpected value | Trace what the code expects, fix handler |
| stack_corruption | PC lands at 0x000000 after RET | Incorrect calling convention, fix stack setup |

## Decision Tree

```
blocker = parseTestOutput()

if blocker.type == 'missing_block':
    addSeed(blocker.address)
    retranspile()

elif blocker.type == 'halt_stuck':
    trace = traceExecution(blocker.lastPc, 20 steps back)
    if trace.lastInterruptCheck.iff1 == 0:
        enableNMITimer()
    else:
        # Something else is wrong
        disassembleBlock(blocker.lastPc)
        escalate("CPU halted with interrupts enabled — unknown cause")

elif blocker.type == 'wrong_value':
    trace = traceExecution(blocker.context)
    portReads = trace.filter(isPortRead)
    for read in portReads:
        if read.expected != read.got:
            fixPeripheralHandler(read.port, read.expected)

elif blocker.type == 'loop_stuck':
    loopBlocks = identifyLoopBlocks(trace)
    exitCondition = findExitBranch(loopBlocks)
    # Model the hardware register that satisfies the exit condition
    fixPeripheralForExit(exitCondition)
```

## Success Criteria

1. **Minimum**: Event loop runs >1000 steps without missing_block
2. **Target**: VRAM at 0xD40000 has non-zero bytes (LCD activity)
3. **Stretch**: Boot screen (TI logo) rendered to VRAM

## Implementation Phases

### Phase A: Seed-Discovery Loop (simplest, highest ROI)
```javascript
// frontier-runner.mjs
while (true) {
  const { missingBlocks } = runTestHarness();
  if (missingBlocks.length === 0) break;
  injectSeeds(missingBlocks);
  await transpile(); // 50+ min
  regenerateGz();
  commit(`auto: seed ${missingBlocks.length} missing blocks`);
}
```

### Phase B: Add Investigation (medium complexity)
When no new missing blocks but execution is still shallow:
- Trace the last N blocks before termination
- Disassemble ROM bytes at the decision point
- Check if a port/MMIO read is returning wrong value
- Fix the peripheral model

### Phase C: Full Autonomous Loop (Claude Code /loop)
Structure as a Claude Code autonomous prompt:
```
/loop
Run one iteration of the TI-84 frontier expansion:
1. Run test harness, parse Test 23 output
2. If missing blocks: seed them, retranspile, wait, regenerate .gz
3. If no missing blocks but shallow execution: trace and investigate
4. Commit findings
5. Report what changed and what the next blocker is
```

## Constraints
- Never modify existing tests (only add new ones)
- Never break the build (node --check before commit)
- Commit after every meaningful change
- Update CONTINUATION_PROMPT_CODEX.md after each phase
- If investigation hits a dead end after 3 attempts, escalate to user

## Estimated Timeline
- Phase A (seed loop): 1-5 iterations × 50 min transpile = 1-4 hours
- Phase B (investigation): depends on blockers found
- Phase C (full loop): could run overnight for 10+ iterations
