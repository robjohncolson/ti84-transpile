#!/usr/bin/env node
// Phase 307: Trace 0x09DDB8 (Token Descriptor Table Population)
//            + 0x070165 (Mode Selector / Table Entry Writer)
//
// Session 304 discovered a token descriptor table at RAM D0227E:
//   3 entries x 18 bytes each, MLT-indexed.
//   Entry 0: D0227E  (Function/Parametric mode)
//   Entry 1: D02290  (Polar mode)
//   Entry 2: D022A2  (Sequence mode)
//
// 0x09DDB8 initializes the table at startup.
// 0x070165 selects and updates one entry based on current graph mode.
//
// ================================================================
// STATIC DISASSEMBLY: 0x09DDB8 — Table Initialization
// 76 instructions, 0x09DDB8–0x09DEDF (296 bytes)
// ================================================================
//
// --- Phase 1: Clear flags and call setup routines ---
//
// 0x09DDB8: CALL 0x08876B     ; pre-init setup (clear graph state?)
// 0x09DDBC: XOR A             ; A = 0
// 0x09DDBD: LD (D00BE6),A     ; clear flag byte D00BE6
// 0x09DDC1: LD (D00C7E),A     ; clear flag byte D00C7E
// 0x09DDC5: CALL 0x09E1FF     ; additional init (probably clears more state)
//
// --- Phase 2: Zero/set fields across all 3 entries ---
//
// 0x09DDC9: XOR A             ; A = 0
// 0x09DDCA: LD (D0227F),A     ; entry0[+1] = 0   (X-dim field cleared)
// 0x09DDCE: LD (D02291),A     ; entry1[+1] = 0
// 0x09DDD2: LD (D022A3),A     ; entry2[+1] = 0
//
// 0x09DDD6: INC A             ; A = 1
// 0x09DDD7: LD (D02284),A     ; entry0[+6] = 1   (Y-dim field = 1, "enabled")
// 0x09DDDB: LD (D02296),A     ; entry1[+6] = 1
// 0x09DDDF: LD (D022A8),A     ; entry2[+6] = 1
//
// 0x09DDE3: LD A,0x31         ; A = 0x31 (ASCII '1')
// 0x09DDE5: LD (D02289),A     ; entry0[+11] = 0x31  (default format char)
// 0x09DDE9: LD (D0229B),A     ; entry1[+11] = 0x31
// 0x09DDED: LD (D022AD),A     ; entry2[+11] = 0x31
//
// --- Phase 3: Set misc config values ---
//
// 0x09DDF1: LD A,0x01         ; A = 1
// 0x09DDF3: LD (D024FB),A     ; set config flag D024FB = 1
// 0x09DDF7: LD (D02A97),A     ; set config flag D02A97 = 1
//
// --- Phase 4: Store pointer and set mode indices ---
//
// 0x09DDFB: LD HL,0x00E71C    ; HL = pointer to ROM code/data at 0xE71C
// 0x09DDFF: SIS LD (0x2A98),HL; store 16-bit HL to D02A98 (via SIS MBASE prefix)
//                              ;   D02A98 = 0x1C, D02A99 = 0xE7  (pointer low bytes)
//
// 0x09DE03: LD (D0228F),A     ; entry0[+17] = 1  (A still = 1, mode index)
// 0x09DE07: INC A             ; A = 2
// 0x09DE08: LD (D022A1),A     ; entry1[+17] = 2  (mode index)
// 0x09DE0C: INC A             ; A = 3
// 0x09DE0D: LD (D022B3),A     ; entry2[+17] = 3  (mode index)
//
// --- Phase 5: Additional setup calls ---
//
// 0x09DE11: CALL 0x09DCC8     ; graph table auxiliary init
// 0x09DE15: CALL 0x07FAC2     ; OP1/display formatting init
// 0x09DE19: CALL 0x09A572     ; graph variable init
//
// --- Phase 6: DJNZ loop — populate graph window variables (B=10 iterations) ---
//
// 0x09DE1D: LD B,0x0A         ; B = 10 (10 window variable groups)
//
// LOOP_TOP (0x09DE1F):
// 0x09DE1F: PUSH BC           ; save loop counter
// 0x09DE20: LD A,B            ; A = current counter (10 down to 1)
// 0x09DE21: CALL 0x091DEB     ; build OP1 ref: HL=0x5E10 → token 0x5E,(0x10+A-1)
//                              ;   i.e. window vars Xmin/Xmax/Xscl/Ymin/Ymax/Yscl/...
// 0x09DE25: CALL 0x08242B     ; read variable value + store into descriptor
//
// 0x09DE29: POP AF            ; restore counter to A
// 0x09DE2A: PUSH AF           ; save it again
// 0x09DE2B: CP 0x07           ; compare counter to 7
// 0x09DE2D: JR NC,0x09DE4B    ; if counter >= 7 (iterations 7-10) → skip extended writes
//
//   --- extended writes for counters 1-6 only ---
//   0x09DE2F: CALL 0x091DD1   ; build OP1 ref: HL=0x5E20 → token 0x5E,(0x20+2*(A-1))
//                              ;   derived/calculated window vars (DEC+ADD A,A = *2 offset)
//   0x09DE33: CALL 0x08242B   ; read + store
//
//   0x09DE37: POP AF          ; restore counter
//   0x09DE38: PUSH AF
//   0x09DE39: CALL 0x091DC6   ; call 0x091DD1 variant with SET 0,(D005FA)
//                              ;   sets bit 0 of token name byte (alternate var flag)
//   0x09DE3D: CALL 0x08242B   ; read + store
//
//   0x09DE41: POP AF
//   0x09DE42: PUSH AF
//   0x09DE43: CALL 0x091DF1   ; build OP1 ref: HL=0x5E40 → token 0x5E,(0x40+A-1)
//                              ;   plot/table window vars
//   0x09DE47: CALL 0x08242B   ; read + store
//
//   0x09DE4B: POP AF          ; common path: restore counter
//   0x09DE4C: PUSH AF
//   0x09DE4D: CP 0x04         ; compare counter to 4
//   0x09DE4F: JR NC,0x09DE59  ; if counter >= 4 → skip
//
//     --- extra writes for counters 1-3 only ---
//     0x09DE51: CALL 0x091E0D ; build OP1 ref: HL=0x5E80 → token 0x5E,(0x80+A-1)
//                              ;   extended/zoom window vars
//     0x09DE55: CALL 0x08242B ; read + store
//
// 0x09DE59: POP BC            ; restore BC (B = counter)
// 0x09DE5A: DJNZ 0x09DE1F    ; B--; if B != 0 → loop
//
// --- Phase 7: Post-loop setup ---
//
// 0x09DE5C: LD HL,D022DC      ; point to entry0 + 0x5E (table extension area)
// 0x09DE60: SET 0,(HL)        ; set bit 0 of extension byte
// 0x09DE62: LD HL,D022E7      ; point to entry area + 0x69
// 0x09DE66: SET 5,(HL)        ; set bit 5 of extension byte
//
// 0x09DE68: LD A,0x01
// 0x09DE6A: LD (D02046),A     ; set config flag = 1
//
// 0x09DE6E: CALL 0x07FAC2     ; display formatting (same as phase 5)
// 0x09DE72: CALL 0x09A546     ; graph variable finalize
//
// 0x09DE76: LD DE,D02267      ; destination for OP1 copy
// 0x09DE7A: CALL 0x07FA0D     ; copy OP1 region to DE
//
// 0x09DE7E: LD A,0x10         ; A = 16
// 0x09DE80: LD (D005FA),A     ; OP1[+2] = 0x10 (variable token offset)
// 0x09DE84: CALL 0x07FA0D     ; copy again
//
// 0x09DE88: LD DE,D01F65      ; another destination buffer
// 0x09DE8C: CALL 0x07FA0D     ; copy OP1 to D01F65
// 0x09DE90: CALL 0x07FA0D     ; copy again (fills adjacent area)
//
// 0x09DE94: LD HL,D0150B      ; cursor/edit state
// 0x09DE98: LD (D01508),HL    ; set cursor pointer
//
// 0x09DE9C: LD HL,0x000000    ; HL = 0
// 0x09DEA0: SIS LD (0x1D0B),HL; clear 16-bit at D01D0B
// 0x09DEA4: SIS LD (0x00C8),HL; clear 16-bit at D000C8
//
// 0x09DEA8: SET 5,(IY+0x44)   ; set bit 5 of IY flags byte (graph display mode flag)
//
// 0x09DEAC: LD A,0x0B         ; A = 11
// 0x09DEAE: LD (D02258),A     ; set descriptor count/max = 11
//
// 0x09DEB2: CALL 0x0800EC     ; display/LCD refresh
// 0x09DEB6: CALL 0x0A235E     ; graph engine init
// 0x09DEBA: CALL 0x0BCFFA     ; graph rendering init
// 0x09DEBE: CALL 0x058C47     ; mode/context setup
// 0x09DEC2: CALL 0x0AE17E     ; graph calc engine
// 0x09DEC6: CALL 0x0BD2C2     ; graph display finalize
//
// 0x09DECA: RES 4,(IY+0x13)   ; clear bit 4 of IY+0x13 (graph recalc needed flag)
// 0x09DECE: RES 5,(IY+0x13)   ; clear bit 5 of IY+0x13 (graph redraw needed flag)
//
// 0x09DED2: CALL 0x08A9CF     ; final cleanup
// 0x09DED6: CALL 0x05E997     ; mode/state finalize
//
// 0x09DEDA: XOR A             ; A = 0
// 0x09DEDB: LD (D02FE6),A     ; clear final state flag
// 0x09DEDF: RET               ; done
//
// ================================================================
// FUNCTION BOUNDARY: 0x09DDB8 – 0x09DEDF (296 bytes, 76 instructions)
// Single RET at 0x09DEDF.
// ================================================================
//
//
// ================================================================
// STATIC DISASSEMBLY: 0x070165 — Mode Selector / Entry Writer
// 38 instructions, 0x070165–0x0701FC (152 bytes)
// ================================================================
//
// --- Phase 1: Select table entry based on graph mode ---
//
// 0x070165: LD A,(D00839)     ; read current graph mode index
// 0x070169: LD DE,D0227E      ; default = entry 0
// 0x07016D: SUB 2             ; A -= 2
// 0x07016F: JR C,0x07017B     ; if original A < 2 → entry 0 (Function/Parametric)
// 0x070171: LD DE,D02290      ; entry 1
// 0x070175: JR Z,0x07017B     ; if original A == 2 → entry 1 (Polar)
// 0x070177: LD DE,D022A2      ; entry 2 (Sequence mode, A was 3+)
//
// --- Phase 2: Build 17-byte descriptor in OP1 from ROM template ---
//
// 0x07017B: PUSH DE           ; save entry pointer
// 0x07017C: LD DE,D005F8      ; DE = OP1 destination
// 0x070180: LD HL,0x070206    ; HL = ROM template (17 bytes of defaults)
//                              ;   Template: 00 00 00 00 00 00 00 00 00 00 00 31 00 00 00 00 01
// 0x070184: LD BC,0x000011    ; BC = 17 bytes
// 0x070188: LDIR              ; copy ROM template → OP1
//
// --- Phase 3: Customize X and Y dimensions from config ---
//
// 0x07018A: LD A,(D00837)     ; read X dimension setting
// 0x07018E: DEC A             ; A = Xdim - 1
// 0x07018F: LD (D005F9),A     ; OP1[+1] = Xdim - 1
// 0x070193: LD A,(D00838)     ; read Y dimension setting
// 0x070197: DEC A             ; A = Ydim - 1
// 0x070198: LD (D005FE),A     ; OP1[+6] = Ydim - 1
//
// --- Phase 4: Copy customized descriptor to selected table entry ---
//
// 0x07019C: POP DE            ; restore entry pointer (D0227E/D02290/D022A2)
// 0x07019D: LD HL,D005F8      ; source = OP1 (customized descriptor)
// 0x0701A1: LD BC,0x000011    ; BC = 17 bytes
// 0x0701A5: LDIR              ; copy OP1 → selected entry[0..16]
//
// --- Phase 5: Write 18th byte (entry[17]) ---
//
// 0x0701A7: LD A,(D026B2)     ; read graph format config byte
// 0x0701AB: LD (DE),A         ; store to entry[17] (DE now = entry_base + 17 after LDIR)
//
// --- Phase 6: Display rendering for X axis ---
//
// 0x0701AC: LD HL,0x070664    ; HL = string "QPX" (stat plot X var name, 0x01 0x5D prefix)
// 0x0701B0: CALL 0x07F9FB     ; display string renderer
// 0x0701B4: CALL 0x082961     ; formatting/spacing call
// 0x0701B8: LD HL,0x070217    ; HL = secondary label data
// 0x0701BC: CALL 0x07F9FB     ; display string renderer
//
// --- Phase 7: First axis value display ---
//
// 0x0701C0: LD A,(D00837)     ; X dimension config
// 0x0701C4: ADD A,0xFF        ; A = Xdim - 1 (same as DEC but sets carry differently)
// 0x0701C6: LD (D005FA),A     ; OP1[+2] = Xdim - 1 (variable token byte)
// 0x0701CA: CALL 0x09A5B5     ; format/display graph variable value
//
// --- Phase 8: Display rendering for Y axis ---
//
// 0x0701CE: LD HL,0x07066A    ; HL = string "QPY" (stat plot Y var name)
// 0x0701D2: CALL 0x07F9FB     ; display string renderer
// 0x0701D6: CALL 0x082961     ; formatting/spacing
// 0x0701DA: LD HL,0x070217    ; secondary label
// 0x0701DE: CALL 0x07F9FB     ; display
//
// --- Phase 9: Second axis value display ---
//
// 0x0701E2: LD A,(D00838)     ; Y dimension config
// 0x0701E6: ADD A,0xFF        ; A = Ydim - 1
// 0x0701E8: LD (D005FA),A     ; OP1[+2] = Ydim - 1
// 0x0701EC: CALL 0x09A5B5     ; format/display graph variable value
//
// --- Phase 10: Final display updates ---
//
// 0x0701F0: CALL 0x03D1E4     ; cursor/display update
// 0x0701F4: CALL 0x05DA51     ; screen refresh
// 0x0701F8: CALL 0x06C879     ; LCD commit
// 0x0701FC: RET               ; done
//
// ================================================================
// FUNCTION BOUNDARY: 0x070165 – 0x0701FC (152 bytes, 38 instructions)
// Single RET at 0x0701FC.
// ================================================================
//
//
// ================================================================
// 18-BYTE TABLE ENTRY STRUCTURE (D0227E / D02290 / D022A2)
// ================================================================
//
//   Offset  Size  Init Value       Mode Selector Sets    Purpose
//   ------  ----  ---------------  ------------------    -------
//   +0x00   1     (from template)  template[0] = 0x00    Variable type byte
//   +0x01   1     0x00             Xdim - 1              X-dimension / columns count
//   +0x02   4     (from template)  template bytes        Reserved / token data
//   +0x06   1     0x01             Ydim - 1              Y-dimension / rows count
//   +0x07   4     (from template)  template bytes        Reserved / format data
//   +0x0B   1     0x31 (ASCII '1') template[11] = 0x31   Default format character
//   +0x0C   5     (from template)  template bytes        Reserved / display config
//   +0x11   1     1 / 2 / 3        (D026B2)              Mode index (init) → graph config (runtime)
//
//   ROM template at 0x070206 (17 bytes):
//     00 00 00 00 00 00 00 00 00 00 00 31 00 00 00 00 01
//     ^                          ^                    ^
//     [+0]                       [+11]=0x31           [+16]=0x01
//
//   Note: The 18th byte (offset +0x11) is written SEPARATELY by both functions:
//     - 0x09DDB8 writes mode indices 1/2/3 during init
//     - 0x070165 overwrites with (D026B2) at runtime to reflect current graph format
//
//
// ================================================================
// DJNZ LOOP SUB-CALLS (Window Variable Token Builders)
// ================================================================
//
// The B=10 DJNZ loop at 0x09DE1F–0x09DE5A builds OP1 variable references
// using TI-OS token 0x5E (window/graph variable prefix). Each sub-call
// loads a base HL value, then the shared code at 0x091DD9 computes:
//
//   OP1[0..1] = {0x03, H}     (type=0x03, name prefix byte)
//   OP1[2]    = L + (B-1)     (variable index within group)
//   OP1[3]    = 0x00           (null terminator)
//
// Sub-call table:
//   Address    HL value  Token range       Called when   Variables
//   0x091DEB   0x5E10    0x5E,0x10+n       Always        Xmin,Xmax,Xscl,Ymin,Ymax,Yscl,...
//   0x091DD1   0x5E20    0x5E,0x20+2n      B < 7         Derived window vars (2x stride)
//   0x091DC6   (0x5E20)  0x5E,0x20+2n|0x01 B < 7         Alternate vars (SET bit 0)
//   0x091DF1   0x5E40    0x5E,0x40+n       B < 7         Plot/table window vars
//   0x091E0D   0x5E80    0x5E,0x80+n       B < 4         Extended/zoom window vars
//
// After each token build, CALL 0x08242B reads the variable's current value
// and stores it into the appropriate descriptor table field.
//
//
// ================================================================
// RELATIONSHIP: 0x09DDB8, 0x070165, and D0227E
// ================================================================
//
//   0x09DDB8 (Table Init)
//     │
//     ├─ Zeros field[+1] in all 3 entries (X-dim = 0)
//     ├─ Sets field[+6] = 1 in all 3 entries (Y-dim = 1)
//     ├─ Sets field[+11] = 0x31 in all 3 entries (format char)
//     ├─ Sets field[+17] = 1, 2, 3 (mode index per entry)
//     ├─ Runs DJNZ loop: loads 10 groups of window variables
//     │   via 0x091DEB/0x091DD1/0x091DC6/0x091DF1/0x091E0D
//     │   into the graph database (via 0x08242B)
//     └─ Post-loop: sets extension bits, inits graph engine
//
//   0x070165 (Mode Selector)
//     │
//     ├─ Reads (D00839) to determine which of the 3 entries to update
//     │   A < 2  → entry 0 (D0227E) — Function/Parametric
//     │   A == 2 → entry 1 (D02290) — Polar
//     │   A > 2  → entry 2 (D022A2) — Sequence
//     ├─ Builds 17-byte descriptor from ROM template + X/Y dim config
//     ├─ Copies descriptor into selected entry (LDIR 17 bytes)
//     ├─ Writes entry[17] = (D026B2) — current graph format config
//     └─ Renders axis labels (QPX/QPY) and variable values to LCD
//
//   D0227E (Token Descriptor Table, 3 × 18 bytes)
//     │
//     ├─ Entry 0: D0227E–D0228F — Function/Parametric graph mode
//     ├─ Entry 1: D02290–D022A1 — Polar graph mode
//     └─ Entry 2: D022A2–D022B3 — Sequence graph mode
//
//   Data flow:
//     ROM template (0x070206) ─→ OP1 (D005F8) ─→ table entry
//     D00837 (X dim config) ──→ entry[+1]
//     D00838 (Y dim config) ──→ entry[+6]
//     D026B2 (graph format) ──→ entry[+17]
//     D00839 (mode selector) ─→ chooses which entry to update
//
// ================================================================

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

// ── helpers ──

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function disassemble(startPc, maxInstr, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(70)}`);

  let pc = startPc;
  let count = 0;

  for (let i = 0; i < maxInstr; i++) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst) {
      console.log(`  ${hex(pc)}: *** DECODE FAILURE ***`);
      break;
    }

    const rawBytes = Array.from(rom.slice(pc, pc + inst.length))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');

    let desc = inst.tag || '???';

    // Build human-readable operand string
    if (inst.tag === 'call') desc = `CALL ${hex(inst.target)}`;
    else if (inst.tag === 'jp') desc = `JP ${hex(inst.target)}`;
    else if (inst.tag === 'jr') desc = `JR ${hex(inst.target)}`;
    else if (inst.tag === 'jr-conditional') desc = `JR ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    else if (inst.tag === 'djnz') desc = `DJNZ ${hex(inst.target)}`;
    else if (inst.tag === 'ret') desc = inst.condition ? `RET ${inst.condition.toUpperCase()}` : 'RET';
    else if (inst.tag === 'ld-reg-imm') desc = `LD ${inst.dest.toUpperCase()},${hex(inst.value, 2)}`;
    else if (inst.tag === 'ld-reg-mem') desc = `LD ${inst.dest.toUpperCase()},(${hex(inst.addr)})`;
    else if (inst.tag === 'ld-mem-reg') desc = `LD (${hex(inst.addr)}),${inst.src.toUpperCase()}`;
    else if (inst.tag === 'ld-reg-reg') desc = `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    else if (inst.tag === 'ld-pair-imm') desc = `LD ${inst.pair.toUpperCase()},${hex(inst.value)}`;
    else if (inst.tag === 'ld-pair-mem') {
      if (inst.direction === 'to-mem') desc = `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`;
      else desc = `LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`;
    }
    else if (inst.tag === 'ld-ind-reg') desc = `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    else if (inst.tag === 'alu-reg') desc = `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    else if (inst.tag === 'alu-imm') desc = `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    else if (inst.tag === 'inc-reg') desc = `INC ${inst.reg.toUpperCase()}`;
    else if (inst.tag === 'dec-reg') desc = `DEC ${inst.reg.toUpperCase()}`;
    else if (inst.tag === 'inc-pair') desc = `INC ${inst.pair.toUpperCase()}`;
    else if (inst.tag === 'push') desc = `PUSH ${inst.pair.toUpperCase()}`;
    else if (inst.tag === 'pop') desc = `POP ${inst.pair.toUpperCase()}`;
    else if (inst.tag === 'ldir') desc = 'LDIR';
    else if (inst.tag === 'bit-set-ind') desc = `SET ${inst.bit},(${inst.indirectRegister.toUpperCase()})`;
    else if (inst.tag === 'indexed-cb-set') desc = `SET ${inst.bit},(${inst.indexRegister.toUpperCase()}+${hex(inst.displacement, 2)})`;
    else if (inst.tag === 'indexed-cb-res') desc = `RES ${inst.bit},(${inst.indexRegister.toUpperCase()}+${hex(inst.displacement, 2)})`;

    const prefix = inst.modePrefix ? `[${inst.modePrefix.toUpperCase()}] ` : '';

    console.log(`  ${hex(pc)}: ${rawBytes.padEnd(20)} ${prefix}${desc}`);
    count++;
    pc = inst.nextPc;

    if (inst.tag === 'ret' && !inst.condition) break;
  }

  console.log(`  --- ${count} instructions, ${pc - startPc} bytes ---`);
  return pc;
}

// ── main ──

console.log('Phase 307: Token Descriptor Table Population + Mode Selector');
console.log('============================================================');

// Disassemble 0x09DDB8
disassemble(0x09DDB8, 100, '0x09DDB8 — Token Descriptor Table Init');

// Disassemble 0x070165
disassemble(0x070165, 60, '0x070165 — Mode Selector / Entry Writer');

// Disassemble the DJNZ sub-calls
disassemble(0x091DEB, 15, '0x091DEB — Window Var Builder (0x5E10 group)');
disassemble(0x091DD1, 15, '0x091DD1 — Window Var Builder (0x5E20 group, 2x stride)');
disassemble(0x091DC6, 10, '0x091DC6 — Window Var Builder (0x5E20 + bit 0 set)');
disassemble(0x091DF1, 10, '0x091DF1 — Window Var Builder (0x5E40 group)');
disassemble(0x091E0D, 10, '0x091E0D — Window Var Builder (0x5E80 group)');

// ── Table structure analysis ──

console.log('\n' + '='.repeat(70));
console.log('  TABLE ENTRY STRUCTURE (18 bytes each)');
console.log('='.repeat(70));

const TABLE_BASE = [0xD0227E, 0xD02290, 0xD022A2];
const ENTRY_NAMES = ['Function/Parametric', 'Polar', 'Sequence'];

console.log('\n  Entry addresses:');
for (let i = 0; i < 3; i++) {
  console.log(`    Entry ${i}: ${hex(TABLE_BASE[i])} – ${hex(TABLE_BASE[i] + 17)}  (${ENTRY_NAMES[i]})`);
}

console.log('\n  Field layout (from init at 0x09DDB8):');
console.log('    Offset  Init Value   Mode Selector    Purpose');
console.log('    ------  ----------   -------------    -------');
console.log('    +0x00   0x00         template[0]      Variable type byte');
console.log('    +0x01   0x00         (D00837) - 1     X-dimension (columns)');
console.log('    +0x02   0x00         template[2..5]   Reserved / token data');
console.log('    +0x06   0x01         (D00838) - 1     Y-dimension (rows)');
console.log('    +0x07   0x00         template[7..10]  Reserved / format data');
console.log('    +0x0B   0x31         template[11]     Format char (ASCII "1")');
console.log('    +0x0C   0x00         template[12..15] Reserved / display config');
console.log('    +0x10   0x01         template[16]     Config flag');
console.log('    +0x11   1/2/3        (D026B2)         Mode index → graph format');

// ── ROM template dump ──

console.log('\n  ROM template at 0x070206 (17 bytes):');
const tpl = rom.slice(0x070206, 0x070206 + 17);
const tplHex = Array.from(tpl).map(b => b.toString(16).padStart(2, '0')).join(' ');
console.log(`    ${tplHex}`);

// ── Mode selector logic ──

console.log('\n' + '='.repeat(70));
console.log('  MODE SELECTOR DECISION TREE');
console.log('='.repeat(70));
console.log('\n  (D00839) = graph mode register');
console.log('    Value 0, 1  →  Entry 0 (D0227E)  Function / Parametric');
console.log('    Value 2     →  Entry 1 (D02290)  Polar');
console.log('    Value 3+    →  Entry 2 (D022A2)  Sequence');

// ── String data at display section ──

console.log('\n' + '='.repeat(70));
console.log('  DISPLAY STRINGS (used by 0x070165 for axis labels)');
console.log('='.repeat(70));

function showString(addr, len) {
  const data = rom.slice(addr, addr + len);
  const hexStr = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = Array.from(data).map(b => b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.').join('');
  console.log(`    ${hex(addr)}: ${hexStr}`);
  console.log(`    ASCII: ${ascii}`);
}

console.log('\n  0x070664 — "QPX" (X-axis stat plot variable):');
showString(0x070664, 6);
console.log('\n  0x07066A — "QPY" (Y-axis stat plot variable):');
showString(0x07066A, 6);
console.log('\n  0x070217 — secondary label data:');
showString(0x070217, 8);

// ── Relationship summary ──

console.log('\n' + '='.repeat(70));
console.log('  RELATIONSHIP SUMMARY');
console.log('='.repeat(70));
console.log(`
  0x09DDB8 (Init)          0x070165 (Runtime Update)
  ──────────────            ────────────────────────
  Called once at startup    Called on mode change
  Zeros all 3 entries       Selects 1 entry via (D00839)
  Sets mode indices 1/2/3   Overwrites entry from template
  Runs DJNZ var loader      Customizes X/Y dims from D00837/D00838
  Inits graph engine         Writes entry[17] from (D026B2)
       │                          │
       └──────── D0227E ──────────┘
                 D02290
                 D022A2
            (3 × 18-byte table)

  Config registers:
    D00837 — X dimension setting
    D00838 — Y dimension setting
    D00839 — graph mode index (selects entry 0/1/2)
    D026B2 — graph format config (written to entry[17])

  Key sub-calls:
    0x08242B — read variable value + store to descriptor
    0x091DEB..0x091E0D — build OP1 token refs for window variables
    0x07FAC2 — OP1/display formatting
    0x09A572/0x09A546 — graph variable init/finalize
    0x07FA0D — OP1 region copy
    0x07F9FB — string display renderer
`);

console.log('Phase 307 probe complete.');
