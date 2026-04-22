#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TI84_DIR = __dirname;
const ROM_PATH = path.join(TI84_DIR, 'ROM.rom');
const INCLUDE_PATH = path.join(TI84_DIR, 'references', 'ti84pceg.inc');
const REPORT_PATH = path.join(TI84_DIR, 'phase25s-errno88-report.md');
const PHASE25R_REPORT_PATH = path.join(TI84_DIR, 'phase25r-parseinp-errsp-report.md');

const ADL_MODE = 'adl';
const SAMPLE_ERRNO_WRITERS = [
  '0x061db2',
  '0x08a6dd',
  '0x0b3326',
  '0x08516d',
  '0x0a5d78',
  '0x0b6e59',
];

const TARGETS = [
  {
    name: 'ChkFindSym entry 0x08383D',
    start: 0x08383d,
    maxBytes: 96,
  },
  {
    name: 'FindSym entry/context 0x0846EA',
    start: 0x0846ea,
    maxBytes: 96,
  },
  {
    name: 'VAT backstep helper 0x082BE2',
    start: 0x082be2,
    maxBytes: 64,
  },
  {
    name: 'VAT scan loop 0x084711',
    start: 0x084711,
    maxBytes: 80,
  },
];

const ANNOTATIONS = new Map([
  [0x08383d, 'ParseInp reaches symbol lookup through ChkFindSym.'],
  [0x083843, 'Generic symbol path jumps straight into FindSym.'],
  [0x0846f2, 'Lower VAT bound comes from progPtr.'],
  [0x0846f7, 'The first name byte comes from OP1+1.'],
  [0x0846fd, 'Temp variables use pTemp/opBase instead of the main VAT top.'],
  [0x08470a, 'Non-temp lookup starts at the top of VAT.'],
  [0x08470e, 'DE is incremented once, so the lower bound is progPtr + 1.'],
  [0x082be2, 'Called entry: back up 6 bytes from the current VAT cursor.'],
  [0x084711, 'Read the current VAT byte.'],
  [0x084712, 'Move from the record tail back to the candidate name bytes.'],
  [0x084716, 'Mask the record byte down to 6 bits before the bound check.'],
  [0x08471a, 'Not-found exit once the cursor moves below the lower bound.'],
  [0x08471c, 'Compare the first name byte against OP1+1.'],
  [0x084723, 'Miss path: subtract 3 more bytes and try the previous slot.'],
  [0x08472c, 'First name byte matched; now verify the remaining name bytes.'],
  [0x084744, 'Success path converts the stored VAT pointer.'],
  [0x08474c, 'Success path stores the object type into OP1[0].'],
  [0x084751, 'Partial-name miss falls back into the same 3-byte stride loop.'],
]);

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'or-a': text = 'or a'; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function disasmRange(startAddr, maxBytes) {
  const rows = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, ADL_MODE);
    } catch (error) {
      rows.push({ pc, bytes: '', text: `decode-error: ${error.message}` });
      break;
    }

    if (!inst || inst.length === 0) {
      rows.push({ pc, bytes: '', text: 'decode failed' });
      break;
    }

    const bytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes,
      text: formatInstruction(inst),
    });

    pc += inst.length;
  }

  return rows;
}

function normalizeExpression(expr) {
  return expr
    .replace(/;.*/g, '')
    .replace(/\?/g, '')
    .replace(/\b([0-9a-f]+)h\b/gi, '0x$1')
    .replace(/\bshl\b/gi, '<<')
    .trim();
}

function parseErrorEquates() {
  const lines = fs.readFileSync(INCLUDE_PATH, 'utf8').split(/\r?\n/);
  const rawEquates = [];
  let inErrorSection = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes(';System Error Codes')) {
      inErrorSection = true;
      continue;
    }
    if (inErrorSection && line.includes(';System Variable Equates')) break;
    if (!inErrorSection) continue;

    const match = line.match(/^\?([A-Za-z0-9_]+)\s*:=\s*(.+)$/);
    if (!match) continue;
    rawEquates.push({
      name: match[1],
      expr: normalizeExpression(match[2]),
      lineNo: index + 1,
    });
  }

  const values = {};
  const remaining = new Map(rawEquates.map((item) => [item.name, item]));
  let progressed = true;

  while (remaining.size > 0 && progressed) {
    progressed = false;
    for (const [name, item] of [...remaining.entries()]) {
      try {
        const evaluator = Function('ctx', `with (ctx) { return (${item.expr}); }`);
        const value = evaluator(values);
        if (typeof value === 'number' && Number.isFinite(value)) {
          values[name] = value;
          remaining.delete(name);
          progressed = true;
        }
      } catch {
        // Leave unresolved until its dependencies have values.
      }
    }
  }

  return rawEquates
    .filter((item) => Object.prototype.hasOwnProperty.call(values, item.name))
    .map((item) => ({
      ...item,
      value: values[item.name] >>> 0,
    }));
}

function collectPhaseHits() {
  const files = fs.readdirSync(TI84_DIR).filter((name) => /^phase.*-report\.md$/i.test(name));
  const hits = [];
  const pattern = /0x88|error.*88|err.*0x88/i;

  for (const file of files) {
    const lines = fs.readFileSync(path.join(TI84_DIR, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!pattern.test(line)) return;
      hits.push({
        file,
        lineNo: index + 1,
        text: line.trim(),
        relevant: /phase25/i.test(file) || /errNo|061d1a|061db2/i.test(line),
      });
    });
  }

  hits.sort((left, right) => {
    if (left.relevant !== right.relevant) return left.relevant ? -1 : 1;
    return left.file.localeCompare(right.file) || left.lineNo - right.lineNo;
  });

  return hits;
}

function parsePhase25rObservation() {
  const text = fs.readFileSync(PHASE25R_REPORT_PATH, 'utf8');
  const op1Match = text.match(/OP1 post-call \[([^\]]+)\]/);
  const afterMatch = text.match(/OPS\/progPtr\/pTemp\/OPBase after:\s+([^\n]+)/);
  const recentMatch = text.match(/recent=([^\n]+)/);

  const pointers = {};
  if (afterMatch) {
    for (const match of afterMatch[1].matchAll(/([A-Za-z]+)=0x([0-9a-f]+)/gi)) {
      pointers[match[1]] = Number.parseInt(match[2], 16) >>> 0;
    }
  }

  return {
    op1Text: op1Match ? op1Match[1].trim() : 'n/a',
    pointerText: afterMatch ? afterMatch[1].trim() : 'n/a',
    recentText: recentMatch ? recentMatch[1].trim() : 'n/a',
    progPtr: pointers.progPtr ?? 0,
    errNo: pointers.errNo ?? 0,
  };
}

function computeMissLoop(lowerBound) {
  let cursor = 0xd3ffff;
  let iterations = 0;

  while ((cursor - 6) >= lowerBound) {
    cursor -= 9;
    iterations += 1;
  }

  const observedBlocks = 500000;
  const blocksPerIteration = 5;
  const observedIterations = Math.floor(observedBlocks / blocksPerIteration);

  return {
    lowerBound,
    startCursor: 0xd3ffff,
    iterations,
    blocksPerIteration,
    requiredBlocks: iterations * blocksPerIteration,
    observedBlocks,
    observedIterations,
    coveragePct: ((observedIterations / iterations) * 100),
  };
}

function buildDisassemblySection(target) {
  const rows = disasmRange(target.start, target.maxBytes);
  const raw = Array.from(
    romBytes.slice(target.start, target.start + target.maxBytes),
    (value) => value.toString(16).padStart(2, '0'),
  ).join(' ');

  const lines = [];
  lines.push(`### ${target.name}`);
  lines.push('');
  lines.push(`Raw bytes (${target.maxBytes} bytes from ${hex(target.start)}):`);
  lines.push('');
  lines.push(`\`${raw}\``);
  lines.push('');
  lines.push('```text');
  for (const row of rows) {
    const note = ANNOTATIONS.get(row.pc);
    const suffix = note ? `  ; ${note}` : '';
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${suffix}`);
  }
  lines.push('```');
  lines.push('');
  return lines;
}

function buildReport() {
  const errorEquates = parseErrorEquates();
  const code88Matches = errorEquates.filter((item) => item.value === 0x88);
  const editFlag = errorEquates.find((item) => item.name === 'E_EDIT');
  const syntaxCode = code88Matches.find((item) => item.name === 'E_Syntax') ?? code88Matches[0];
  const phaseHits = collectPhaseHits();
  const observed = parsePhase25rObservation();
  const loop = computeMissLoop((observed.progPtr + 1) & 0xffffff);

  const lines = [];
  lines.push('# Phase 25S - errNo 0x88 / ParseInp VAT loop');
  lines.push('');
  lines.push('## What 0x88 means');
  lines.push('');
  if (syntaxCode && editFlag) {
    lines.push(`- \`${hex(0x88, 2)}\` resolves to \`?${syntaxCode.name}\` in [references/ti84pceg.inc](references/ti84pceg.inc).`);
    lines.push(`- The include defines \`?E_EDIT = ${hex(editFlag.value, 2)}\` and \`?E_Syntax = 8 + E_EDIT = ${hex(syntaxCode.value, 2)}\`.`);
    lines.push(`- Meaning: the parser latched **Syntax** with the edit / re-entry bit set.`);
    lines.push(`- Source lines: \`${syntaxCode.lineNo}\` for \`?${syntaxCode.name}\`, \`${editFlag.lineNo}\` for \`?E_EDIT\`.`);
  } else {
    lines.push('- Failed to resolve `0x88` back to an include equate.');
  }
  lines.push('');
  lines.push('## Local report hits');
  lines.push('');
  for (const hit of phaseHits) {
    const tag = hit.relevant ? 'relevant' : 'unrelated';
    lines.push(`- [${hit.file}:${hit.lineNo}](${hit.file}:${hit.lineNo}) [${tag}] ${hit.text}`);
  }
  lines.push('');
  lines.push('## Annotated disassembly');
  lines.push('');
  for (const target of TARGETS) {
    lines.push(...buildDisassemblySection(target));
  }
  lines.push('## Analysis');
  lines.push('');
  lines.push('### Why ParseInp enters VAT search code');
  lines.push('');
  lines.push('- `ParseInp` helper `0x099b18` calls `0x08383d` (`ChkFindSym`).');
  lines.push('- `0x083843` immediately jumps to `0x0846ea` (`FindSym`) on the generic symbol path, so identifier resolution naturally lands in the VAT walker.');
  lines.push(`- The earlier phase25R probe ended with \`OP1=[${observed.op1Text}]\`, so the active lookup key was the first name byte \`${observed.op1Text.split(' ')[1] ?? '??'}\`.`);
  lines.push('');
  lines.push('### What exits the loop');
  lines.push('');
  lines.push('- `0x08471a ret c` is the not-found exit. It fires once the backtracked cursor (`current - 6`) falls below the lower bound in `DE`.');
  lines.push('- `0x08472c..0x084750` is the found exit. After the first-byte match, it checks the remaining name bytes, decodes the pointer, copies the object type into `OP1[0]`, and returns.');
  lines.push('- The miss path is a 9-byte reverse walk per slot: `call 0x082be2` backs up 6 bytes, then `sbc hl, bc` subtracts 3 more bytes before the next iteration.');
  lines.push('- Note that the call target is `0x082be2`, so only the 6-byte helper body runs here; the extra `dec hl` at `0x082be1` is a sibling entry, not part of this loop.');
  lines.push('');
  lines.push('### Why the observed probe looks stuck');
  lines.push('');
  lines.push(`- Phase25R recorded the post-call pointer state as \`${observed.pointerText}\`.`);
  lines.push(`- On the non-temp path (`OP1+1 != '$'`), `FindSym` starts at \`HL=${hex(loop.startCursor)}\` and sets the lower bound to \`DE=progPtr+1=${hex(loop.lowerBound)}\`.`);
  lines.push(`- If no matching first-byte is found, that requires about \`${loop.iterations.toLocaleString()}\` reverse-slot iterations before \`ret c\` can fire.`);
  lines.push(`- At roughly \`${loop.blocksPerIteration}\` basic-block hits per miss iteration, that is about \`${loop.requiredBlocks.toLocaleString()}\` block executions.`);
  lines.push(`- The phase25R run stopped after only \`${loop.observedBlocks.toLocaleString()}\` blocks, or about \`${loop.observedIterations.toLocaleString()}\` miss iterations (${loop.coveragePct.toFixed(2)}% of the full walk).`);
  lines.push('- So the loop is not logically infinite. With `progPtr=0`, it is just walking an absurdly wide range.');
  lines.push('');
  lines.push('### Hypothesis for errNo=0x88 without longjmp');
  lines.push('');
  lines.push('- The loop window itself (`0x082be2`, `0x084711..0x084756`) never writes `0xD008DF` and never branches to `0x061db2`.');
  lines.push('- That means the visible `errNo=0x88` is almost certainly a stale or earlier parser-side latch, not something the VAT loop itself produces.');
  lines.push('- Because `0x88` is `E_Syntax`, the parser has already decided the current parse state is syntactically invalid before or while it falls into symbol resolution.');
  lines.push('- Once control reaches `FindSym` with `progPtr=0`, the walker burns its time budget scanning from `0xD3FFFF` downward, so the syntax latch remains visible even though the observed tail loop never executes `0x061db2`.');
  lines.push(`- Static ROM search in this workspace also shows that \`errNo\` is a general latch with direct writers outside the shared \`JError\` convergence path. Sample writer sites: \`${SAMPLE_ERRNO_WRITERS.join('`, `')}\`.`);
  lines.push('- So `errNo != 0` is not proof that the longjmp just happened; in this case it is more consistent with "syntax error already latched, then VAT search runs too long to unwind within the probe budget."');
  lines.push('');
  lines.push('## Bottom line');
  lines.push('');
  lines.push('- `0x88` means **Syntax** (`E_Syntax`) with the edit bit set.');
  lines.push('- The parser is in the symbol-resolution VAT walker because `ParseInp` reached `ChkFindSym` / `FindSym`.');
  lines.push('- The loop exits on full-name match or when the cursor drops below `progPtr+1`.');
  lines.push('- In the observed probe, `progPtr=0` makes that bound `0x000001`, so the scan needs about 1.54 million reverse-slot iterations to terminate.');
  lines.push('- `errNo=0x88` is therefore best explained as an earlier syntax-error latch that survives while the mis-bounded VAT scan consumes the rest of the budget.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const report = buildReport();
  fs.writeFileSync(REPORT_PATH, report);
  console.log('Phase 25S errno report written.');
  console.log(`report: ${REPORT_PATH}`);
}

main();
