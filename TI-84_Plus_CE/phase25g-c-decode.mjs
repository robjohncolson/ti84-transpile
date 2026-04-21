import fs from 'node:fs';

const START = 0x09F79B;
const PLANE_SIZE = 57;
const PLANES = ['NONE', '2nd', 'ALPHA', 'ALPHA+2nd'];
const LABELS = Object.fromEntries(`
01 DOWN alt
02 LEFT
03 RIGHT
04 UP
09 ENTER
0A (+)
0B (-)
0C (*)
0D (/)
0E (^)
0F CLEAR
10 (-)
11 VARS
12 CLEAR
13 PRGM
14 STAT
15 X,T,theta,n
16 MATH
17 APPS
18 MODE
19 DEL
1A 2ND
1B ALPHA
1C ON
1D STO
1E LN
1F LOG
20 SQUARE
21 RECIP
22 SIN
23 COS
24 TAN
25 POWER
26 COMMA
27 LPAREN
28 RPAREN
29 DIVIDE
2A MULT
2B MINUS
2C PLUS
30 0
31 1
32 2
33 3
34 4
35 5
36 6
37 7
38 8
39 9
3A DECIMAL
3B NEG
3C ENTER alt
`.trim().split('\n').map((line) => {
  const [code, ...label] = line.split(' ');
  return [parseInt(code, 16), label.join(' ')];
}));
const TOKENS = {
  0x00: 'NONE', 0x04: 'EQ (=)', 0x09: 'ENTER', 0x0A: '[+]', 0x0B: '[-]', 0x0C: '[*]',
  0x0D: '[/]', 0x0E: '[^]', 0x0F: '[(]', 0x10: '[)]', 0x11: '[,]', 0x80: 'tok:PI',
  0x81: 'tok:INV', 0x82: 'tok:SIN', 0x83: 'tok:COS', 0x84: 'tok:TAN', 0x85: 'tok:EXP',
  0x86: 'tok:LN', 0x87: 'tok:LOG', 0x88: 'tok:SQR', 0x89: 'tok:NEG', 0x8A: 'tok:STO',
  0x8B: 'tok:Ans', 0x8C: 'tok:MATH', 0x8D: 'tok:APPS', 0x8E: 'tok:PRGM', 0x8F: 'tok:VARS',
  0x90: 'tok:CLEAR', 0x91: 'tok:X_VAR', 0x92: 'tok:STAT', 0x93: 'tok:ON'
};
const PUNCT = { 0x2A: '*', 0x2B: '+', 0x2D: '-', 0x2E: '.', 0x2F: '/', 0x3D: '=' };
const hex = (n, w = 2) => `0x${n.toString(16).toUpperCase().padStart(w, '0')}`;
const labelFor = (scan) => LABELS[scan] ?? `key${hex(scan)}`;
const decodeByte = (byte) => TOKENS[byte]
  ?? (byte >= 0x30 && byte <= 0x39 ? String.fromCharCode(byte) : null)
  ?? (byte >= 0x41 && byte <= 0x5A ? String.fromCharCode(byte) : null)
  ?? (byte >= 0x61 && byte <= 0x7A ? String.fromCharCode(byte) : null)
  ?? PUNCT[byte]
  ?? (((byte >= 0xA0 && byte <= 0xAF) || byte >= 0xB0) ? `tok:${hex(byte)}` : hex(byte));

const rom = fs.readFileSync(new URL('./ROM.rom', import.meta.url));
const slice = rom.subarray(START, START + PLANE_SIZE * PLANES.length);
const rowsByPlane = PLANES.map((name, planeIndex) => ({
  name,
  rows: [...slice.subarray(planeIndex * PLANE_SIZE, (planeIndex + 1) * PLANE_SIZE)].map((byte, i) => {
    const scan = i + 1;
    return {
      scan,
      row: scan >> 4,
      col: scan & 0x0F,
      label: labelFor(scan),
      byte,
      decoded: decodeByte(byte)
    };
  })
}));

const renderTable = (rows) => [
  '| scancode | row | col | physical label | token byte | decoded name |',
  '|---|---:|---:|:---|---|:---|',
  ...rows.map((r) => `| ${hex(r.scan)} | ${hex(r.row, 1)} | ${hex(r.col, 1)} | ${r.label} | ${hex(r.byte)} | ${r.decoded} |`)
].join('\n');

const undecoded = [...rowsByPlane.flatMap((plane) => plane.rows)]
  .filter((r) => r.decoded.startsWith('tok:0x') || /^0x[0-9A-F]{2}$/.test(r.decoded))
  .reduce((acc, r) => ({ ...acc, [hex(r.byte)]: (acc[hex(r.byte)] ?? 0) + 1 }), {});

if (process.argv.includes('--undecoded-json')) {
  console.log(JSON.stringify(Object.entries(undecoded).sort(([a], [b]) => parseInt(a, 16) - parseInt(b, 16))
    .map(([byte, count]) => ({ byte, count })), null, 2));
} else {
  console.log(rowsByPlane.map((plane) => `## ${plane.name}\n\n${renderTable(plane.rows)}`).join('\n\n'));
}
