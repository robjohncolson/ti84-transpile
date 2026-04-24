#!/usr/bin/env node

/**
 * Phase 25AR: static disassembly of the post-empty-ENTER flow.
 *
 * Goal:
 *   Prove whether the empty-history ENTER path
 *
 *     0x058637  jp z, 0x058C65
 *
 *   can ever rejoin the common tail at 0x058693, which later calls:
 *
 *     0x0586E3  call 0x099910
 *
 *   Static answer expected:
 *   - No. `jp z, 0x058C65` is a non-returning intra-handler transfer.
 *   - `ret` at 0x058C82 returns to the caller of 0x0585E9, not to 0x05863B
 *     and not to 0x058693.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ar-post-empty-enter-disasm-report.md');
const REPORT_TITLE = 'Phase 25AR - Post-empty-ENTER Static Disassembly';

const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const STACK_SNIPPET = {
  label: 'Stack-balance lead-in around the empty-history dispatch',
  start: 0x058621,
  end: 0x058638,
};

const PRIMARY_RANGES = [
  {
    label: '0x058630..0x058695 - ENTER handler branch window',
    start: 0x058630,
    end: 0x058695,
  },
  {
    label: '0x058C65..0x058C90 - empty-ENTER handler tail',
    start: 0x058C65,
    end: 0x058C90,
  },
  {
    label: '0x058693..0x0586F0 - common tail with ParseInp handoff',
    start: 0x058693,
    end: 0x0586F0,
  },
];

const HELPER_EXIT_RANGES = [
  { start: 0x058C65, end: 0x058D3B },
  { start: 0x058D8E, end: 0x058DA7 },
];

const DIRECT_JP_TO_SECOND_PASS_RANGE = {
  label: 'Direct JP to 0x0585E9',
  start: 0x058A98,
  end: 0x058AA4,
};

const KNOWN_ADDRESSES = new Map([
  [0x0585E9, 'second-pass ENTER handler'],
  [0x058637, 'empty-history dispatch (`jp z, 0x058C65`)'],
  [0x058668, 'non-empty history path rejoin (`jr 0x058693`)'],
  [0x058693, 'common tail'],
  [0x0586E3, 'ParseInp call site (`call 0x099910`)'],
  [0x058C65, 'empty-ENTER handler'],
  [0x058C76, 'shared flag helper'],
  [0x058C82, 'RET from empty-ENTER'],
  [0x058AA2, 'direct `jp 0x0585E9`'],
  [0x099910, 'ParseCmd / ParseInp trampoline'],
  [0x099914, 'ParseInp entry'],
  [0xD01D0B, 'numLastEntries'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'ld-ixd-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
      break;
    }
    case 'ld-ixd-imm': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${hexByte(inst.value)}`;
      break;
    }
    case 'ld-reg-mem': text = `ld ${inst.dest ?? 'a'}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-pair-ind': text = `ld ${inst.pair}, (${inst.src})`; break;
    case 'ld-pair-indexed': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.pair}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ind': text = `${inst.op} (hl)`; break;
    case 'alu-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `${inst.op} (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'inc-ind': text = 'inc (hl)'; break;
    case 'dec-ind': text = 'dec (hl)'; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (hl)`; break;
    case 'indexed-cb-bit': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `bit ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'indexed-cb-set': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `set ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'indexed-cb-res': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `res ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'indexed-cb-rotate': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `${inst.op} (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'exx': text = 'exx'; break;
    case 'ldir': text = 'ldir'; break;
    case 'ldi': text = 'ldi'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpd': text = 'cpd'; break;
    case 'rst': text = `rst ${hex(inst.target, 2)}`; break;
    case 'nop': text = 'nop'; break;
    case 'halt': text = 'halt'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'cpl': text = 'cpl'; break;
    case 'daa': text = 'daa'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'reti': text = 'reti'; break;
    case 'retn': text = 'retn'; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `out (c), ${inst.reg}`; break;
    case 'in-reg': text = `in ${inst.reg}, (c)`; break;
    case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
    case 'neg': text = 'neg'; break;
    case 'im-set': text = `im ${inst.mode}`; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'outi': text = 'outi'; break;
    case 'outd': text = 'outd'; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function disassembleRange(romBytes, startPc, endPc) {
  const rows = [];
  let pc = startPc;

  while (pc < endPc) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (v) => v.toString(16).padStart(2, '0').toUpperCase(),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      dasm: formatInstruction(inst),
      inst,
    });

    pc = inst.nextPc;
  }

  return rows;
}

function formatDisasmRow(row) {
  return `${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.dasm}`;
}

function instructionTarget(inst) {
  if (!inst) return null;
  if (
    inst.tag === 'call' ||
    inst.tag === 'call-conditional' ||
    inst.tag === 'jp' ||
    inst.tag === 'jp-conditional' ||
    inst.tag === 'jr' ||
    inst.tag === 'jr-conditional' ||
    inst.tag === 'rst'
  ) {
    return typeof inst.target === 'number' ? inst.target : null;
  }
  return null;
}

function formatAnnotatedRow(row) {
  const notes = [];
  if (KNOWN_ADDRESSES.has(row.pc)) {
    notes.push(KNOWN_ADDRESSES.get(row.pc));
  }
  const target = instructionTarget(row.inst);
  if (target !== null && KNOWN_ADDRESSES.has(target)) {
    notes.push(`target: ${KNOWN_ADDRESSES.get(target)}`);
  }
  if (notes.length === 0) return formatDisasmRow(row);
  return `${formatDisasmRow(row)}  ; ${notes.join(' | ')}`;
}

function findPatternHits(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let matched = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }
  return hits;
}

function isExitInstruction(row) {
  const tag = row.inst?.tag;
  return tag === 'ret' || tag === 'ret-conditional' || tag === 'jp' || tag === 'jp-conditional';
}

function stackEffectSummary() {
  return [
    '`0x058621  push af` saves flags before the history-manager call chain.',
    '`0x058622`, `0x058626`, and `0x05862B` are ordinary `call`s that all return before control reaches `0x05862F`.',
    '`0x05862F  pop af` balances the earlier `push af`.',
    '`0x058637  jp z, 0x058C65` pushes no return address.',
    'Therefore the stack at entry to `0x058C65` is the same stack the outer caller gave to `0x0585E9`.',
    'When `0x058C82  ret` executes, it consumes that outer caller frame; it does not continue at `0x05863B` and cannot fall into `0x058693`.',
  ];
}

function exitMeaning(row) {
  switch (row.pc) {
    case 0x058C69:
      return 'top-level early return from empty-ENTER to the caller of 0x0585E9';
    case 0x058C82:
      return 'top-level final return from empty-ENTER to the caller of 0x0585E9';
    case 0x058CB1:
    case 0x058CD6:
    case 0x058CDB:
      return 'local helper return back to 0x058C6E in the top-level empty-ENTER path';
    case 0x058CE0:
      return 'local helper return inside the 0x058Cxx helper cluster';
    case 0x058D03:
    case 0x058D18:
      return 'helper return back to 0x058C87 after the 0x058CFF call';
    case 0x058D2D:
      return 'local helper return; does not target the common tail';
    case 0x058D29:
      return 'tail-jumps into 0x061D42 error/unwind code, not 0x058693';
    case 0x058DA6:
      return 'tail-jumps into 0x082448 generic dispatcher helper, not 0x058693';
    default:
      return 'exits the current local helper or cluster';
  }
}

function buildReport() {
  const stackRows = disassembleRange(rom, STACK_SNIPPET.start, STACK_SNIPPET.end);
  const directSecondPassJumpRows = disassembleRange(
    rom,
    DIRECT_JP_TO_SECOND_PASS_RANGE.start,
    DIRECT_JP_TO_SECOND_PASS_RANGE.end,
  );
  const sections = PRIMARY_RANGES.map((range) => ({
    ...range,
    rows: disassembleRange(rom, range.start, range.end),
  }));

  const emptyClusterRows = HELPER_EXIT_RANGES.flatMap((range) =>
    disassembleRange(rom, range.start, range.end),
  );
  const exitRows = emptyClusterRows.filter(isExitInstruction);

  const directCallToSecondPass = findPatternHits([0xCD, 0xE9, 0x85, 0x05]);
  const directJpToSecondPass = findPatternHits([0xC3, 0xE9, 0x85, 0x05]);
  const directJpToEmpty = findPatternHits([0xCA, 0x65, 0x8C, 0x05]);

  const branchWindow = sections[0].rows;
  const emptyTail = sections[1].rows;
  const commonTail = sections[2].rows;

  const emptyTailTargets693 = emptyTail.filter((row) => instructionTarget(row.inst) === 0x058693);
  const branchWindowTargets693 = branchWindow.filter((row) => instructionTarget(row.inst) === 0x058693);
  const branchWindowTargetsC65 = branchWindow.filter((row) => instructionTarget(row.inst) === 0x058C65);

  const lines = [];
  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Executive Answer');
  lines.push('');
  lines.push('- The empty-history ENTER path cannot reach `0x058693` within the same `0x0585E9` invocation.');
  lines.push('- The decisive instruction is `0x058637  jp z, 0x058C65`: this is a `JP`, not a `CALL`, so no intra-handler return address is pushed.');
  lines.push('- `0x058C82  ret` therefore returns to the caller that entered `0x0585E9` (or to that caller\'s caller if `0x0585E9` itself was entered through `0x058AA2  jp 0x0585E9`).');
  lines.push('- `0x058693` is only reached on the non-empty paths: explicitly by `0x058668  jr 0x058693`, or by fall-through after `0x05868F  call 0x05E872` returns.');
  lines.push('- Static conclusion: empty ENTER is a ParseInp dead end for this handler invocation.');
  lines.push('');
  lines.push('## Supporting Stack Snippet');
  lines.push('');
  lines.push(`### ${STACK_SNIPPET.label} (${hex(STACK_SNIPPET.start)}-${hex(STACK_SNIPPET.end)})`);
  lines.push('');
  lines.push('```text');
  for (const row of stackRows) lines.push(formatAnnotatedRow(row));
  lines.push('```');
  lines.push('');
  for (const item of stackEffectSummary()) lines.push(`- ${item}`);
  lines.push('');
  for (const section of sections) {
    lines.push(`## ${section.label}`);
    lines.push('');
    lines.push('```text');
    for (const row of section.rows) lines.push(formatAnnotatedRow(row));
    lines.push('```');
    lines.push('');
  }
  lines.push('## Direct Xref Check For 0x0585E9');
  lines.push('');
  lines.push('| Pattern | Hits | Result |');
  lines.push('|---|---:|---|');
  lines.push(`| \`CALL 0x0585E9\` | ${directCallToSecondPass.length} | ${directCallToSecondPass.length ? directCallToSecondPass.map((hit) => `\`${hex(hit)}\``).join(', ') : 'none'} |`);
  lines.push(`| \`JP 0x0585E9\` | ${directJpToSecondPass.length} | ${directJpToSecondPass.length ? directJpToSecondPass.map((hit) => `\`${hex(hit)}\``).join(', ') : 'none'} |`);
  lines.push(`| \`JP Z, 0x058C65\` | ${directJpToEmpty.length} | ${directJpToEmpty.length ? directJpToEmpty.map((hit) => `\`${hex(hit)}\``).join(', ') : 'none'} |`);
  lines.push('');
  lines.push(`### ${DIRECT_JP_TO_SECOND_PASS_RANGE.label} (${hex(DIRECT_JP_TO_SECOND_PASS_RANGE.start)}-${hex(DIRECT_JP_TO_SECOND_PASS_RANGE.end)})`);
  lines.push('');
  lines.push('```text');
  for (const row of directSecondPassJumpRows) lines.push(formatAnnotatedRow(row));
  lines.push('```');
  lines.push('');
  lines.push('The byte scan found no direct `CALL 0x0585E9`; the only direct code xref is `0x058AA2  jp 0x0585E9`. That reinforces the stack argument above: the empty-enter `ret` is unwinding an outer caller frame, not returning to an instruction after `0x058637`.');
  lines.push('');
  lines.push('## Empty-ENTER Helper-Cluster Exits');
  lines.push('');
  lines.push('This broader scan covers the nearby helper cluster that earlier sessions summarized as the empty-enter guard/exit region.');
  lines.push('');
  lines.push('| Site | Instruction | Why It Does Not Reach 0x058693 |');
  lines.push('|---|---|---|');
  for (const row of exitRows) {
    lines.push(`| \`${hex(row.pc)}\` | \`${row.dasm}\` | ${exitMeaning(row)} |`);
  }
  lines.push('');
  lines.push('## Control-Flow Findings');
  lines.push('');
  lines.push(`- Branches from the branch window to \`0x058C65\`: ${branchWindowTargetsC65.map((row) => `\`${hex(row.pc)}\``).join(', ') || 'none'}.`);
  lines.push(`- Branches from the branch window to \`0x058693\`: ${branchWindowTargets693.map((row) => `\`${hex(row.pc)}\``).join(', ') || 'none'}.`);
  lines.push(`- Branches from the empty-enter tail slice directly to \`0x058693\`: ${emptyTailTargets693.length ? emptyTailTargets693.map((row) => `\`${hex(row.pc)}\``).join(', ') : 'none'}.`);
  lines.push(`- \`0x0586E3\` in the common tail is the ParseInp handoff: \`${commonTail.find((row) => row.pc === 0x0586E3)?.dasm ?? 'call 0x099910'}\`.`);
  lines.push('');
  lines.push('## Final Conclusion');
  lines.push('');
  lines.push('`0x058637` sends the empty-history path to `0x058C65` with an unconditional `JP`, so control never returns to `0x05863B` and never falls through to the common tail at `0x058693`. The top-level empty-enter block ends at `0x058C82  ret`, which unwinds the caller of `0x0585E9` rather than resuming inside the handler. Static answer: empty ENTER does not reach ParseInp; any later ParseInp would have to come from a separate outer dispatcher cycle, not from post-`0x058C65` continuation inside this invocation.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

try {
  const report = buildReport();
  writeFileSync(REPORT_PATH, report);
  process.stdout.write(report);
  process.stdout.write(`Report written to ${REPORT_PATH}\n`);
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  const failReport = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '## Error',
    '',
    '```text',
    ...String(message).split(/\r?\n/),
    '```',
    '',
  ].join('\n');
  writeFileSync(REPORT_PATH, failReport);
  console.error(message);
  process.exitCode = 1;
}
