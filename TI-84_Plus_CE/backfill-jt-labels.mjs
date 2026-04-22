import { promises as fs } from 'node:fs';
import path from 'node:path';

const ADDRESS_RE = /0x[0-9a-fA-F]{6}/g;
const REPORT_RE = /^phase.*-report\.md$/i;
const ANNOTATED_RE = /^(?:`+)?\s*\((?:=\s*)?[A-Z_]/;

const scriptDir = path.dirname(path.resolve(process.argv[1] ?? '.'));
const jumpTablePath = path.join(scriptDir, 'phase25h-a-jump-table.json');

function normalizeAddress(value) {
  if (typeof value === 'string') {
    const match = value.trim().match(/^0x([0-9a-fA-F]{1,6})$/);
    return match ? `0x${match[1].toUpperCase().padStart(6, '0')}` : null;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
    return `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
  }
  return null;
}

function addMapping(map, rawAddress, name) {
  const address = normalizeAddress(rawAddress);
  if (address && name && !map.has(address)) {
    map.set(address, name);
  }
}

async function loadJumpTable() {
  const raw = await fs.readFile(jumpTablePath, 'utf8');
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    throw new Error('phase25h-a-jump-table.json is not an array');
  }

  const addressToName = new Map();
  for (const entry of entries) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name) {
      continue;
    }
    addMapping(addressToName, entry.impl, name);
    addMapping(addressToName, entry.target, name);
    addMapping(addressToName, entry.slotAddr, name);
    addMapping(addressToName, entry.slotAddrNum, name);
    addMapping(addressToName, entry.targetNum, name);
    if (typeof entry.slot === 'string') {
      addMapping(addressToName, entry.slot, name);
    }
  }
  return addressToName;
}

function annotateReport(source, addressToName) {
  let annotations = 0;
  const updated = source.replace(ADDRESS_RE, (match, offset, text) => {
    const address = `0x${match.slice(2).toUpperCase()}`;
    const name = addressToName.get(address);
    if (!name) {
      return match;
    }
    const after = text.slice(offset + match.length);
    if (ANNOTATED_RE.test(after)) {
      return match;
    }
    annotations += 1;
    return `${match} (= ${name})`;
  });
  return { updated, annotations };
}

async function main() {
  const addressToName = await loadJumpTable();
  const dirEntries = await fs.readdir(scriptDir, { withFileTypes: true });
  const reports = dirEntries
    .filter((entry) => entry.isFile() && REPORT_RE.test(entry.name))
    .map((entry) => path.join(scriptDir, entry.name))
    .sort();

  let filesModified = 0;
  let addressesAnnotated = 0;

  for (const reportPath of reports) {
    const source = await fs.readFile(reportPath, 'utf8');
    const { updated, annotations } = annotateReport(source, addressToName);
    if (!annotations || updated === source) {
      continue;
    }
    await fs.writeFile(reportPath, updated, 'utf8');
    filesModified += 1;
    addressesAnnotated += annotations;
  }

  console.log(
    `Scanned ${reports.length} files, modified ${filesModified}, annotated ${addressesAnnotated} addresses.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
