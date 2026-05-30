import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const PRELUDE_START = 0x030040;
const ENTRY = 0x030078;
const END = 0x030200;
const IY_BASE = 0xD00080;

const KNOWN = new Map([
  [0xD0058F, 'D0058F unknown OS variable; likely mode/state latch in this routine'],
  [0xD00080, 'D00080 IY base (OS flags byte 0)'],
  [0xD000C6, 'D000C6 = IY+0x46'],
  [0x040D40, '040D40 unknown helper'],
  [0x03FA09, '03FA09 key processor'],
  [0x003D5A, '003D5A _GetCSC'],
]);

const REL_JR_OPS = new Set([0x10, 0x18, 0x20, 0x28, 0x30, 0x38]);
const JP_OPS = new Set([0xC2, 0xC3, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]);
const CALL_OPS = new Set([0xC4, 0xCC, 0xCD, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bytesToHex(bytes) {
  return Array.from(bytes, hexByte).join(' ');
}

function asDecodeFunction(mod) {
  if (!mod) return null;
  if (typeof mod.decodeInstruction === 'function') return mod.decodeInstruction;
  if (typeof mod.default === 'function') return mod.default;
  if (typeof mod.default?.decodeInstruction === 'function') return mod.default.decodeInstruction;
  return null;
}

async function loadDecodeInstruction() {
  const errors = [];

  try {
    const imported = await import(pathToFileURL(DECODER_PATH).href);
    const fn = asDecodeFunction(imported);
    if (fn) return fn;
    errors.push('dynamic import succeeded but exposed no decodeInstruction export');
  } catch (error) {
    errors.push(`dynamic import failed: ${error.message}`);
  }

  try {
    const require = createRequire(import.meta.url);
    const required = require(DECODER_PATH);
    const fn = asDecodeFunction(required);
    if (fn) return fn;
    errors.push('CommonJS require succeeded but exposed no decodeInstruction export');
  } catch (error) {
    errors.push(`CommonJS require failed: ${error.message}`);
  }

  try {
    const require = createRequire(import.meta.url);
    const source = fs.readFileSync(DECODER_PATH, 'utf8');
    const module = { exports: {} };
    const sandbox = {
      Buffer,
      Uint8Array,
      console,
      module,
      exports: module.exports,
      require,
      __dirname: path.dirname(DECODER_PATH),
      __filename: DECODER_PATH,
    };
    vm.runInNewContext(source, sandbox, { filename: DECODER_PATH });
    const fn = asDecodeFunction(module.exports);
    if (fn) return fn;
    errors.push('vm CommonJS evaluation succeeded but exposed no decodeInstruction export');
  } catch (error) {
    errors.push(`vm CommonJS evaluation failed: ${error.message}`);
  }

  throw new Error(`Unable to load ez80 decoder:\n${errors.map((line) => `  - ${line}`).join('\n')}`);
}

function operandText(operand) {
  if (operand == null) return '';
  if (typeof operand === 'string') return operand;
  if (typeof operand === 'number') return hex(operand);
  if (typeof operand.text === 'string') return operand.text;
  if (typeof operand.name === 'string' && operand.value != null) return `${operand.name}:${hex(operand.value)}`;
  if (operand.value != null) return hex(operand.value);
  if (operand.address != null) return hex(operand.address);
  return JSON.stringify(operand);
}

function instructionText(decoded) {
  if (typeof decoded === 'string') {
    const match = decoded.trim().match(/^(\S+)(?:\s+(.*))?$/);
    return {
      mnemonic: match?.[1] ?? 'DB',
      operands: match?.[2] ?? '',
    };
  }

  const rawText = decoded?.text ?? decoded?.instruction ?? decoded?.asm;
  const rawMnemonic = decoded?.mnemonic ?? decoded?.opcode ?? decoded?.name;
  if (!rawMnemonic && typeof rawText === 'string') {
    const match = rawText.trim().match(/^(\S+)(?:\s+(.*))?$/);
    return {
      mnemonic: match?.[1] ?? 'DB',
      operands: match?.[2] ?? '',
    };
  }

  const operands = decoded?.operands ?? decoded?.args ?? decoded?.operand ?? decoded?.operandText;
  return {
    mnemonic: rawMnemonic ?? 'DB',
    operands: Array.isArray(operands) ? operands.map(operandText).join(', ') : operandText(operands),
  };
}

function decodedLength(decoded) {
  const length = decoded?.length ?? decoded?.size ?? decoded?.byteLength ?? decoded?.bytes?.length;
  return Number.isInteger(length) && length > 0 ? length : 1;
}

function findKnownRefs(bytes, text) {
  const refs = new Map();
  const upper = text.toUpperCase();

  for (const [address, label] of KNOWN) {
    const full = address.toString(16).toUpperCase().padStart(6, '0');
    const short = full.replace(/^0+/, '');
    if (upper.includes(full) || (short.length >= 4 && upper.includes(short))) {
      refs.set(address, label);
    }
  }

  for (let i = 0; i + 2 < bytes.length; i += 1) {
    const value = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
    if (KNOWN.has(value)) refs.set(value, KNOWN.get(value));
  }

  if (bytes[0] === 0xFD && bytes[1] === 0xCB && bytes.length >= 4) {
    const displacement = signed8(bytes[2]);
    const iyAddress = IY_BASE + displacement;
    refs.set(IY_BASE, KNOWN.get(IY_BASE));
    refs.set(iyAddress, KNOWN.get(iyAddress) ?? `IY${displacement < 0 ? '-' : '+'}${hex(Math.abs(displacement), 2)} = ${hex(iyAddress)}`);
  } else if (upper.includes('IY')) {
    refs.set(IY_BASE, KNOWN.get(IY_BASE));
  }

  return refs;
}

function branchInfo(record) {
  const { address, bytes, mnemonic, operands } = record;
  const op = bytes[0];
  const text = `${mnemonic} ${operands}`.trim().toUpperCase();

  if (REL_JR_OPS.has(op) && bytes.length >= 2) {
    const target = address + 2 + signed8(bytes[1]);
    return {
      kind: op === 0x10 ? 'DJNZ' : 'JR',
      target,
      relative: true,
      backward: target <= address,
    };
  }

  if (CALL_OPS.has(op) && bytes.length >= 4) {
    const target = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16);
    return {
      kind: 'CALL',
      target,
      relative: false,
      backward: false,
    };
  }

  if (JP_OPS.has(op) && bytes.length >= 4) {
    const target = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16);
    return {
      kind: 'JP',
      target,
      relative: false,
      backward: target <= address,
      exitsRange: target < PRELUDE_START || target > END,
    };
  }

  const targetMatch = text.match(/\b(?:0X)?([0-9A-F]{4,6})H?\b/);
  if ((text.startsWith('CALL') || text.startsWith('JP')) && targetMatch) {
    const target = Number.parseInt(targetMatch[1], 16);
    return {
      kind: text.startsWith('CALL') ? 'CALL' : 'JP',
      target,
      relative: false,
      backward: target <= address,
      exitsRange: target < PRELUDE_START || target > END,
    };
  }

  return null;
}

function terminalKind(record) {
  const mnemonic = record.mnemonic.toUpperCase();
  const branch = branchInfo(record);
  if (mnemonic === 'RET' || mnemonic === 'RETI' || mnemonic === 'RETN' || mnemonic.startsWith('RET ')) {
    return 'RET exit';
  }
  if (branch?.kind === 'JP' && branch.exitsRange) {
    return `JP exits to ${hex(branch.target)}`;
  }
  return '';
}

function decodeAt(rom, decodeInstruction, address) {
  const decoded = decodeInstruction(rom, address);
  const length = Math.min(decodedLength(decoded), rom.length - address);
  const bytes = rom.subarray(address, address + length);
  const text = instructionText(decoded);
  const refs = findKnownRefs(bytes, `${text.mnemonic} ${text.operands}`);
  return {
    address,
    bytes,
    mnemonic: text.mnemonic,
    operands: text.operands,
    length,
    refs,
  };
}

function printRecord(record) {
  const byteColumn = bytesToHex(record.bytes).padEnd(15, ' ');
  const asm = `${record.mnemonic}${record.operands ? ` ${record.operands}` : ''}`.padEnd(28, ' ');
  const annotations = [];
  for (const label of record.refs.values()) annotations.push(label);

  const branch = branchInfo(record);
  if (branch && branch.kind !== 'CALL') {
    annotations.push(`${branch.kind} target ${hex(branch.target)}${branch.backward ? ' (back edge)' : ''}`);
  } else if (branch?.kind === 'CALL') {
    annotations.push(`CALL target ${hex(branch.target)}`);
  }

  const terminal = terminalKind(record);
  if (terminal) annotations.push(terminal);

  console.log(`${hex(record.address)}  ${byteColumn}  ${asm}${annotations.length ? ` ; ${annotations.join('; ')}` : ''}`);
}

function disassembleRange(rom, decodeInstruction, start, end) {
  const records = [];
  let address = start;

  while (address < end && address < rom.length) {
    const record = decodeAt(rom, decodeInstruction, address);
    records.push(record);
    printRecord(record);
    address += Math.max(record.length, 1);
  }

  return records;
}

function containsIo(record) {
  const text = `${record.mnemonic} ${record.operands}`.trim().toUpperCase();
  return text.startsWith('IN') || text.startsWith('OUT') || record.bytes[0] === 0xED;
}

function summarize(records) {
  const branches = records.map((record) => ({ record, branch: branchInfo(record) })).filter((entry) => entry.branch);
  const loops = branches
    .filter(({ branch }) => branch.backward)
    .map(({ record, branch }) => {
      const body = records.filter((candidate) => candidate.address >= branch.target && candidate.address <= record.address);
      const reasons = [];
      if (body.some((candidate) => candidate.refs.has(0x003D5A))) reasons.push('calls or references _GetCSC');
      if (body.some((candidate) => candidate.refs.has(0x03FA09))) reasons.push('calls or references key processor');
      if (body.some(containsIo)) reasons.push('uses eZ80 I/O instructions');
      if (body.some((candidate) => candidate.refs.has(0xD0058F))) reasons.push('touches D0058F state');
      return {
        start: branch.target,
        end: record.address,
        branchRecord: record,
        body,
        reasons,
      };
    });

  const calls = branches.filter(({ branch }) => branch.kind === 'CALL');
  const keyProcessorCalls = calls.filter(({ branch }) => branch.target === 0x03FA09);
  const getCscCalls = calls.filter(({ branch }) => branch.target === 0x003D5A);
  const helperCalls = calls.filter(({ branch }) => branch.target === 0x040D40);
  const d0058fRecords = records.filter((record) => record.refs.has(0xD0058F));
  const firstTerminal = records.find((record) => terminalKind(record));

  const likelyLoop =
    loops.find((loop) => loop.reasons.some((reason) => reason.includes('key processor') || reason.includes('_GetCSC'))) ??
    loops.find((loop) => loop.reasons.some((reason) => reason.includes('I/O'))) ??
    loops[0];

  console.log('\nSummary');
  console.log(`Entry under test: ${hex(ENTRY)}`);
  console.log(`Prelude decoded: ${hex(PRELUDE_START)}..${hex(ENTRY)}`);
  console.log(`Main linear decode: ${hex(ENTRY)}..${hex(END)} (${END - ENTRY} bytes requested)`);

  if (firstTerminal) {
    console.log(`First terminal instruction in linear decode: ${hex(firstTerminal.address)} ${firstTerminal.mnemonic}${firstTerminal.operands ? ` ${firstTerminal.operands}` : ''} (${terminalKind(firstTerminal)})`);
  } else {
    console.log('No RET or exiting JP found before the requested end address.');
  }

  if (likelyLoop) {
    const reason = likelyLoop.reasons.length ? likelyLoop.reasons.join(', ') : 'backward branch';
    console.log(`Likely key polling loop: ${hex(likelyLoop.start)}..${hex(likelyLoop.end)}; back edge at ${hex(likelyLoop.branchRecord.address)} (${reason}).`);
  } else {
    console.log('No backward branch was decoded in the requested range; key polling loop not identified.');
  }

  if (loops.length) {
    console.log('All backward-branch loops:');
    for (const loop of loops) {
      const reason = loop.reasons.length ? loop.reasons.join(', ') : 'no key-specific refs detected';
      console.log(`  - ${hex(loop.start)}..${hex(loop.end)} via ${hex(loop.branchRecord.address)}: ${reason}`);
    }
  }

  if (keyProcessorCalls.length) {
    console.log(`Calls to 0x03FA09 key processor: ${keyProcessorCalls.map(({ record }) => hex(record.address)).join(', ')}`);
  } else {
    console.log('Calls to 0x03FA09 key processor: none decoded in this range.');
  }

  if (getCscCalls.length) {
    console.log(`Calls to 0x003D5A _GetCSC: ${getCscCalls.map(({ record }) => hex(record.address)).join(', ')}`);
  } else {
    console.log('Calls to 0x003D5A _GetCSC: none decoded in this range.');
  }

  if (helperCalls.length) {
    console.log(`Calls to 0x040D40 helper: ${helperCalls.map(({ record }) => hex(record.address)).join(', ')}`);
  } else {
    console.log('Calls to 0x040D40 helper: none decoded in this range.');
  }

  if (d0058fRecords.length) {
    console.log('D0058F state references:');
    for (const record of d0058fRecords) {
      const text = `${record.mnemonic}${record.operands ? ` ${record.operands}` : ''}`;
      console.log(`  - ${hex(record.address)}: ${text}`);
    }
    console.log('Mode/state variable candidate: D0058F, because this decode sees it loaded, stored, and used around mode-step/control-flow logic.');
  } else {
    console.log('Mode/state variable candidate: D0058F was not referenced in the decoded range.');
  }
}

const decodeInstruction = await loadDecodeInstruction();
const rom = fs.readFileSync(ROM_PATH);

console.log('Disassembly prelude before 0x030078');
console.log('addr      bytes            instruction                  annotations');
const preludeRecords = disassembleRange(rom, decodeInstruction, PRELUDE_START, ENTRY);

console.log('\nDisassembly from 0x030078 through 0x030200');
console.log('addr      bytes            instruction                  annotations');
const mainRecords = disassembleRange(rom, decodeInstruction, ENTRY, END);

summarize([...preludeRecords, ...mainRecords]);
