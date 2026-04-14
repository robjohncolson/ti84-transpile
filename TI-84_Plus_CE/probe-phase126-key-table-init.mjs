#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

const REPORT_URL = new URL('./phase126-report.md', import.meta.url);
const ROM = decodeEmbeddedRom();

const FN = 0x0b8e19;
const EXPECTED_WRITE_PC = 0x001881;
const DISASM_BYTES = 0xc8;
const STACK_SENTINEL = 0xd1a87e - 3;
const MBASE = 0xd0;
const IY = 0xd00080;

const BOOT = { entry: 0x000000, mode: 'z80', maxSteps: 20000, maxLoopIterations: 32 };
const OS_INIT = { entry: 0x08c331, mode: 'adl', maxSteps: 100000, maxLoopIterations: 10000 };
const POST_INIT = { entry: 0x0802b2, mode: 'adl', maxSteps: 50000, maxLoopIterations: 500 };
const DIRECT = { entry: FN, mode: 'adl', maxSteps: 10000, maxLoopIterations: 500 };

const POINTERS = [
  { key: 'ptrDe', label: 'PTR_DE', addr: 0xd008d6 },
  { key: 'ptrHl', label: 'PTR_HL', addr: 0xd0243a },
];

const PATTERNS = [
  { kind: 'CALL', tag: 'call', bytes: [0xcd, 0x19, 0x8e, 0x0b] },
  { kind: 'JP', tag: 'jp', bytes: [0xc3, 0x19, 0x8e, 0x0b] },
];

function hex(v, w = 6) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  return `0x${(Number(v) >>> 0).toString(16).padStart(w, '0')}`;
}

function hex8(v) {
  return hex(v & 0xff, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

function isShortPrefix(prefix) {
  return prefix === 'sis' || prefix === 'lis';
}

function resolveAddr(inst) {
  if (typeof inst?.addr !== 'number') return null;
  if (isShortPrefix(inst.modePrefix)) return ((MBASE << 16) | (inst.addr & 0xffff)) & 0xffffff;
  return inst.addr & 0xffffff;
}

function fmtAddr(addr, prefix) {
  if (typeof addr !== 'number') return 'n/a';
  if (!isShortPrefix(prefix)) return hex(addr);
  return `${hex(addr)} => ${hex(((MBASE << 16) | (addr & 0xffff)) & 0xffffff)}`;
}

function idx(base, disp) {
  return `(${base}${disp >= 0 ? '+' : ''}${disp})`;
}

function fmtInst(inst) {
  const p = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'call': return `${p}call ${hex(inst.target)}`;
    case 'call-conditional': return `${p}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${p}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}jp (${inst.indirectRegister})`;
    case 'jr': return `${p}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return `${p}ret`;
    case 'ret-conditional': return `${p}ret ${inst.condition}`;
    case 'push': return `${p}push ${inst.pair}`;
    case 'pop': return `${p}pop ${inst.pair}`;
    case 'ld-pair-imm': return `${p}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${p}ld (${fmtAddr(inst.addr, inst.modePrefix)}), ${inst.pair}`
        : `${p}ld ${inst.pair}, (${fmtAddr(inst.addr, inst.modePrefix)})`;
    case 'ld-mem-pair': return `${p}ld (${fmtAddr(inst.addr, inst.modePrefix)}), ${inst.pair}`;
    case 'ld-reg-mem': return `${p}ld ${inst.dest}, (${fmtAddr(inst.addr, inst.modePrefix)})`;
    case 'ld-mem-reg': return `${p}ld (${fmtAddr(inst.addr, inst.modePrefix)}), ${inst.src}`;
    case 'ld-reg-imm': return `${p}ld ${inst.dest}, ${hex8(inst.value)}`;
    case 'ld-reg-reg': return `${p}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${p}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${p}ld (${inst.dest}), ${inst.src}`;
    case 'ld-pair-ind': return `${p}ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair': return `${p}ld (${inst.dest}), ${inst.pair}`;
    case 'ld-reg-ixd': return `${p}ld ${inst.dest}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${p}ld ${idx(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm': return `${p}ld ${idx(inst.indexRegister, inst.displacement)}, ${hex8(inst.value)}`;
    case 'inc-reg': return `${p}inc ${inst.reg}`;
    case 'dec-reg': return `${p}dec ${inst.reg}`;
    case 'inc-pair': return `${p}inc ${inst.pair}`;
    case 'dec-pair': return `${p}dec ${inst.pair}`;
    case 'inc-ixd': return `${p}inc ${idx(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `${p}dec ${idx(inst.indexRegister, inst.displacement)}`;
    case 'add-pair': return `${p}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${p}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${p}sbc hl, ${inst.src}`;
    case 'alu-imm': return `${p}${inst.op} ${hex8(inst.value)}`;
    case 'alu-reg': return `${p}${inst.op} ${inst.src}`;
    case 'alu-ixd': return `${p}${inst.op} ${idx(inst.indexRegister, inst.displacement)}`;
    case 'bit-test': return `${p}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${p}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res': return `${p}res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind': return `${p}res ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set': return `${p}set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `${p}set ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': return `${p}bit ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${p}res ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${p}set ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'lea': return `${p}lea ${inst.dest}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    default: return `${p}${inst.tag}`;
  }
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function seedSentinel(mem) {
  for (const p of POINTERS) write24(mem, p.addr, 0xffffff);
}

function readPtrs(mem) {
  return Object.fromEntries(POINTERS.map((p) => [p.key, read24(mem, p.addr)]));
}

function traceHook(cpu) {
  const state = { stage: 'unknown', step: 0, pc: 0 };
  const writes = [];
  const w8 = cpu.write8.bind(cpu);
  const w16 = cpu.write16.bind(cpu);
  const w24 = cpu.write24.bind(cpu);
  const rangeFor = (addr) => POINTERS.find((p) => addr >= p.addr && addr <= p.addr + 2) ?? null;
  const rec = (addr, size, value, via) => {
    for (let i = 0; i < size; i += 1) {
      const a = (addr + i) & 0xffffff;
      const p = rangeFor(a);
      if (!p) continue;
      writes.push({
        stage: state.stage,
        step: state.step,
        pc: state.pc,
        addr: a,
        target: p.label,
        offset: a - p.addr,
        value: ((Number(value) >>> (i * 8)) & 0xff) >>> 0,
        via,
      });
    }
  };
  cpu.write8 = (addr, value) => { rec(addr, 1, value, 'write8'); return w8(addr, value); };
  cpu.write16 = (addr, value) => { rec(addr, 2, value, 'write16'); return w16(addr, value); };
  cpu.write24 = (addr, value) => { rec(addr, 3, value, 'write24'); return w24(addr, value); };
  return {
    writes,
    setStage(stage) { state.stage = stage; state.step = 0; state.pc = 0; },
    onBlock(pc, _mode, _meta, steps) { state.pc = pc & 0xffffff; state.step = steps; },
    uninstall() { cpu.write8 = w8; cpu.write16 = w16; cpu.write24 = w24; },
  };
}

function makeEnv() {
  const mem = new Uint8Array(0x1000000);
  mem.set(ROM);
  seedSentinel(mem);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu };
}

function prepCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = MBASE;
  cpu._iy = IY;
  cpu.sp = STACK_SENTINEL;
  write24(mem, cpu.sp, 0xffffff);
}

function prepAfterColdBoot(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_SENTINEL;
  write24(mem, cpu.sp, 0xffffff);
}

function summarize(run) {
  return {
    steps: run.steps ?? 0,
    termination: run.termination ?? 'unknown',
    lastPc: run.lastPc ?? null,
    lastMode: run.lastMode ?? null,
    loopsForced: run.loopsForced ?? 0,
  };
}

function disasm() {
  const out = { lines: [], calls: [], jps: [], refs: [] };
  for (let pc = FN, end = Math.min(ROM.length, FN + DISASM_BYTES), guard = 0; pc < end && guard < 512; guard += 1) {
    let inst, len = 1, text = `db ${hex8(ROM[pc] ?? 0)}`;
    try {
      inst = decodeInstruction(ROM, pc, 'adl');
      if (inst?.length > 0) {
        len = inst.length;
        text = fmtInst(inst);
      }
    } catch {}
    const notes = [];
    if (inst?.tag === 'call' || inst?.tag === 'call-conditional') {
      out.calls.push({ pc, target: inst.target & 0xffffff });
      notes.push(`CALL -> ${hex(inst.target)}`);
    }
    if (inst?.tag === 'jp' || inst?.tag === 'jp-conditional') {
      out.jps.push({ pc, target: inst.target & 0xffffff });
      notes.push(`JP -> ${hex(inst.target)}`);
    }
    if ((inst?.tag || '').startsWith('ld')) {
      const resolved = resolveAddr(inst);
      for (const p of POINTERS) {
        if (resolved === p.addr) {
          out.refs.push({ pc, label: p.label, kind: 'memory operand' });
          notes.push(`LD ref ${p.label} (memory operand)`);
        }
        if (inst.tag === 'ld-pair-imm' && (inst.value & 0xffffff) === p.addr) {
          out.refs.push({ pc, label: p.label, kind: `literal into ${inst.pair}` });
          notes.push(`LD ref ${p.label} (literal into ${inst.pair})`);
        }
      }
    }
    out.lines.push({
      pc,
      bytes: Array.from(ROM.slice(pc, pc + len)),
      text,
      notes,
    });
    pc += Math.max(1, len);
  }
  return out;
}

function bootCheck() {
  const env = makeEnv();
  const hook = traceHook(env.cpu);
  const stages = {
    cold: { label: 'cold-boot', cfg: BOOT, hits: 0, firstStep: null, run: null },
    os: { label: 'os-init', cfg: OS_INIT, hits: 0, firstStep: null, run: null },
    post: { label: 'post-init', cfg: POST_INIT, hits: 0, firstStep: null, run: null },
  };
  const on = (stage) => (pc, mode, meta, steps) => {
    hook.onBlock(pc, mode, meta, steps);
    if ((pc & 0xffffff) !== FN) return;
    stage.hits += 1;
    if (stage.firstStep === null) stage.firstStep = steps;
  };
  try {
    hook.setStage(stages.cold.label);
    stages.cold.run = env.executor.runFrom(BOOT.entry, BOOT.mode, { maxSteps: BOOT.maxSteps, maxLoopIterations: BOOT.maxLoopIterations, onBlock: on(stages.cold) });
    prepAfterColdBoot(env.cpu, env.mem);
    hook.setStage(stages.os.label);
    stages.os.run = env.executor.runFrom(OS_INIT.entry, OS_INIT.mode, { maxSteps: OS_INIT.maxSteps, maxLoopIterations: OS_INIT.maxLoopIterations, onBlock: on(stages.os) });
    env.cpu.mbase = MBASE;
    env.cpu._iy = IY;
    hook.setStage(stages.post.label);
    stages.post.run = env.executor.runFrom(POST_INIT.entry, POST_INIT.mode, { maxSteps: POST_INIT.maxSteps, maxLoopIterations: POST_INIT.maxLoopIterations, onBlock: on(stages.post) });
  } finally {
    hook.uninstall();
  }
  return { env, stages, writes: hook.writes, finalPtrs: readPtrs(env.mem) };
}

function directTrace(env, before) {
  prepCall(env.cpu, env.mem);
  const hook = traceHook(env.cpu);
  let run;
  try {
    hook.setStage('direct-call');
    run = env.executor.runFrom(DIRECT.entry, DIRECT.mode, { maxSteps: DIRECT.maxSteps, maxLoopIterations: DIRECT.maxLoopIterations, onBlock: hook.onBlock });
  } finally {
    hook.uninstall();
  }
  return { before, after: readPtrs(env.mem), writes: hook.writes, run: summarize(run) };
}

function callerSearch() {
  return PATTERNS.map((pattern) => {
    const hits = [];
    for (let pc = 0, max = ROM.length - pattern.bytes.length; pc <= max; pc += 1) {
      if (pattern.bytes.some((b, i) => ROM[pc + i] !== b)) continue;
      let decoded = 'decode failed';
      let valid = false;
      try {
        const inst = decodeInstruction(ROM, pc, 'adl');
        decoded = fmtInst(inst);
        valid = inst.tag === pattern.tag && (inst.target & 0xffffff) === FN;
      } catch {}
      hits.push({ pc, bytes: pattern.bytes, decoded, valid });
    }
    return { ...pattern, hits };
  });
}

function ptrStatus(value, writes) {
  if (value === 0xffffff && writes.length === 0) return 'still 0xFFFFFF sentinel';
  if (value === 0xffffff) return 'written back to 0xFFFFFF';
  if (value === 0x000000) return 'set to 0x000000';
  return `set to ${hex(value)}`;
}

function writesTable(writes, withStage) {
  const lines = withStage
    ? ['| stage | step | pc | addr | target | byte | via |', '|---|---:|---|---|---|---|---|']
    : ['| step | pc | addr | target | byte | via |', '|---:|---|---|---|---|---|'];
  if (writes.length === 0) {
    lines.push(withStage ? '| (none) | - | - | - | - | - | - |' : '| - | - | - | (none) | - | - |');
    return lines.join('\n');
  }
  for (const w of writes) {
    const cells = withStage
      ? [w.stage, w.step, hex(w.pc), hex(w.addr), `${w.target}+${w.offset}`, hex8(w.value), w.via]
      : [w.step, hex(w.pc), hex(w.addr), `${w.target}+${w.offset}`, hex8(w.value), w.via];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function report(partA, partB, partC, partD) {
  const osPathWrites = partB.writes.filter((w) => w.stage === 'os-init' || w.stage === 'post-init');
  const allBootZero = POINTERS.every((p) => partB.finalPtrs[p.key] === 0x000000);
  const allDirectZero = POINTERS.every((p) => partC.after[p.key] === 0x000000);
  const answers = [
    allBootZero && allDirectZero
      ? '`0x000000` behaves as the empty-table state in the sentinel-preseeded standard init path; no later non-zero population was observed through post-init.'
      : POINTERS.every((p) => partB.finalPtrs[p.key] === 0xffffff)
        ? 'The standard init window left both preseeded slots at `0xFFFFFF`, so no boot-time population was observed.'
        : `Post-init pointers are ${POINTERS.map((p) => `${p.label}=${hex(partB.finalPtrs[p.key])}`).join(', ')}, so the empty-table state is not purely sentinel after boot.`,
    partB.stages.os.hits + partB.stages.post.hits > 0
      ? `The traced \`0x08C331 -> 0x0802B2\` path visited \`${hex(FN)}\` (os-init hits=${partB.stages.os.hits}, post-init hits=${partB.stages.post.hits}).`
      : osPathWrites.length > 0
        ? `The traced \`0x08C331 -> 0x0802B2\` path did not hit block \`${hex(FN)}\`, but it did write the pointer bytes from other PCs.`
        : 'The traced `0x08C331 -> 0x0802B2` path neither visited `0x0B8E19` nor wrote the six pointer bytes in this sentinel-preseeded run.',
    `A 200-byte linear disassembly of ${hex(FN)} is included below. Expected write-site PC from prior context: ${hex(EXPECTED_WRITE_PC)}.`,
  ];

  const lines = [
    '# Phase 126 - 0x0B8E19 Key-Handler Table Initialization Deep-Dive',
    '',
    'Generated by `probe-phase126-key-table-init.mjs`.',
    '',
    '## Setup',
    '',
    `- ROM size: ${TRANSPILATION_META?.romSize ?? ROM.length} bytes`,
    `- PRELIFTED block count: ${TRANSPILATION_META?.blockCount ?? 'n/a'}`,
    '- Part B pre-seeds both 3-byte pointer slots with `0xFFFFFF` before boot so untouched RAM stays distinguishable from zero-filled JS memory.',
    '',
    '## Answers',
    '',
    `1. ${answers[0]}`,
    `2. ${answers[1]}`,
    `3. ${answers[2]}`,
    '',
    '## Part A - Static Disassembly',
    '',
    `- Window: ${DISASM_BYTES} bytes from ${hex(FN)} to ${hex(FN + DISASM_BYTES - 1)}`,
    `- CALL targets: ${partA.calls.length ? [...new Set(partA.calls.map((x) => hex(x.target)))].join(', ') : '(none)'}`,
    `- JP targets: ${partA.jps.length ? [...new Set(partA.jps.map((x) => hex(x.target)))].join(', ') : '(none)'}`,
    `- LD pointer refs: ${partA.refs.length ? partA.refs.map((x) => `${hex(x.pc)} -> ${x.label} (${x.kind})`).join(', ') : '(none)'}`,
    '',
    '| address | bytes | mnemonic | notes |',
    '|---|---|---|---|',
    ...partA.lines.map((line) => `| ${hex(line.pc)} | \`${bytesToHex(line.bytes)}\` | \`${line.text}\` | ${line.notes.join('<br>')} |`),
    '',
    '## Part B - OS Init Check',
    '',
    '| stage | entry | steps | termination | lastPc | hit 0x0B8E19? |',
    '|---|---|---:|---|---|---|',
    `| ${partB.stages.cold.label} | ${hex(partB.stages.cold.cfg.entry)} | ${partB.stages.cold.run.steps} | ${partB.stages.cold.run.termination} | ${hex(partB.stages.cold.run.lastPc)} | ${partB.stages.cold.hits ? `yes (${partB.stages.cold.hits}, first step ${partB.stages.cold.firstStep})` : 'no'} |`,
    `| ${partB.stages.os.label} | ${hex(partB.stages.os.cfg.entry)} | ${partB.stages.os.run.steps} | ${partB.stages.os.run.termination} | ${hex(partB.stages.os.run.lastPc)} | ${partB.stages.os.hits ? `yes (${partB.stages.os.hits}, first step ${partB.stages.os.firstStep})` : 'no'} |`,
    `| ${partB.stages.post.label} | ${hex(partB.stages.post.cfg.entry)} | ${partB.stages.post.run.steps} | ${partB.stages.post.run.termination} | ${hex(partB.stages.post.run.lastPc)} | ${partB.stages.post.hits ? `yes (${partB.stages.post.hits}, first step ${partB.stages.post.firstStep})` : 'no'} |`,
    '',
    '| pointer | addr | post-init value | status | boot writes |',
    '|---|---|---|---|---:|',
    ...POINTERS.map((p) => {
      const writes = partB.writes.filter((w) => w.target === p.label);
      return `| ${p.label} | ${hex(p.addr)} | ${hex(partB.finalPtrs[p.key])} | ${ptrStatus(partB.finalPtrs[p.key], writes)} | ${writes.length} |`;
    }),
    '',
    '### Boot-Time Pointer Writes',
    '',
    writesTable(partB.writes, true),
    '',
    '## Part C - Dynamic Trace of 0x0B8E19',
    '',
    `- Entry: ${hex(FN)}`,
    `- Prior expected write-site PC: ${hex(EXPECTED_WRITE_PC)}`,
    `- Run: steps=${partC.run.steps}, termination=${partC.run.termination}, lastPc=${hex(partC.run.lastPc)}, lastMode=${partC.run.lastMode ?? 'n/a'}, loopsForced=${partC.run.loopsForced}`,
    '',
    '| pointer | addr | before direct call | after direct call | traced writes |',
    '|---|---|---|---|---:|',
    ...POINTERS.map((p) => `| ${p.label} | ${hex(p.addr)} | ${hex(partC.before[p.key])} | ${hex(partC.after[p.key])} | ${partC.writes.filter((w) => w.target === p.label).length} |`),
    '',
    '### Direct-Call Write Log',
    '',
    writesTable(partC.writes, false),
    '',
    '## Part D - Caller Search',
    '',
    '- Raw byte patterns: `cd 19 8e 0b` for CALL, `c3 19 8e 0b` for JP.',
    '',
    ...partD.flatMap((group) => [
      `### ${group.kind} Hits (${group.hits.length})`,
      '',
      '| caller pc | bytes | adl decode | decode matches target? |',
      '|---|---|---|---|',
      ...(group.hits.length
        ? group.hits.map((hit) => `| ${hex(hit.pc)} | \`${bytesToHex(hit.bytes)}\` | \`${hit.decoded}\` | ${hit.valid ? 'yes' : 'no'} |`)
        : ['| (none) | - | - | - |']),
      '',
    ]),
  ];
  return lines.join('\n');
}

function summary(partA, partB, partC, partD) {
  return [
    'Phase 126 probe complete.',
    `Report: ${REPORT_URL.pathname.split('/').pop()}`,
    `Part A: ${partA.lines.length} instructions, CALL refs=${partA.calls.length}, JP refs=${partA.jps.length}, LD pointer refs=${partA.refs.length}.`,
    `Part B: PTR_DE=${hex(partB.finalPtrs.ptrDe)}, PTR_HL=${hex(partB.finalPtrs.ptrHl)}, os-init hits=${partB.stages.os.hits}, post-init hits=${partB.stages.post.hits}.`,
    `Part C: writes=${partC.writes.length}, final PTR_DE=${hex(partC.after.ptrDe)}, final PTR_HL=${hex(partC.after.ptrHl)}, termination=${partC.run.termination}.`,
    `Part D: CALL hits=${partD.find((x) => x.kind === 'CALL')?.hits.length ?? 0}, JP hits=${partD.find((x) => x.kind === 'JP')?.hits.length ?? 0}.`,
  ].join('\n');
}

try {
  const partA = disasm();
  const partB = bootCheck();
  const partC = directTrace(partB.env, partB.finalPtrs);
  const partD = callerSearch();
  writeFileSync(REPORT_URL, report(partA, partB, partC, partD));
  console.log(summary(partA, partB, partC, partD));
} catch (error) {
  writeFileSync(REPORT_URL, `# Phase 126 - 0x0B8E19 Key-Handler Table Initialization Deep-Dive\n\n## Failure\n\n\`\`\`text\n${error?.stack ?? String(error)}\n\`\`\`\n`);
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
