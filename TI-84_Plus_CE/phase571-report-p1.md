# Phase 571 P1 — Map D02A62-D02A75 Pixel Renderer Workspace

## Summary

Scanned the entire 4MB ROM for all references to RAM addresses D02A62-D02A75 (20 bytes). Found **42 references** across **42 unique ROM locations**, touching **10 of 20 bytes** directly. The workspace serves the pixel/glyph renderer with the heaviest usage concentrated in the 0x0A18xx-0x0A1Axx range.

## Probe

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase571-map-D02A62.mjs
```

Exit 0. 42 references found and decoded.

## Workspace Layout

The 20-byte workspace decomposes into **6 distinct fields**:

| Offset | Address | Width | Name (inferred) | Refs | Description |
|--------|---------|-------|------------------|------|-------------|
| +00 | D02A62 | 24-bit (3B) | **VRAM cursor ptr** | 8 | Pointer into VRAM framebuffer. Written as HL/DE, advanced by +0x28 (40 = one LCD row of 320px at 1bpp) per glyph row. Read to write pixel data. Used by pixel_loop, 0x05C9xx (font packer), 0x0A18xx-0x0A1Axx (glyph render). |
| +03 | D02A65 | 3B (pair) | **font param block A** | 2 | Written from D0146E (font sysvar). Used as LDIR dest pointer pair with D02A68 via CALL 0x07F984. Part of graph/text mode font configuration. |
| +06 | D02A68 | 3B (pair) | **font param block B** | 2 | Paired with D02A65 -- loaded as pointer target for 0x07F984 copy. Read as byte by 0x09F2B8. |
| +09 | D02A6B | 24-bit (3B) | **graph VRAM base ptr** | 7 | Initialized from D028FD (graph screen base). Advanced by +0x010C (268 = one graph row stride). Used in the graph plotting routines at 0x09F4xx-0x09F5xx. Separate from the glyph renderer D02A62. |
| +12 | D02A6E | 24-bit (3B) | **next-byte VRAM ptr** | 4 | Secondary cursor into VRAM, written right after the first pixel byte is stored. Points to the next byte after the current pixel column. Used for multi-bit-shift glyph overflow into adjacent bytes. |
| +15 | D02A71 | 1B | **bit shift count** | 4 | Low 3 bits of the X pixel coordinate (AND 0x07). Determines how many bits to shift the glyph column right to align with the byte boundary. Zero = byte-aligned fast path. |
| +16 | D02A72 | 1B | **remaining width** | 4 | Computed as D02A75 + D02A71 - 8. Controls how many overflow bits spill into the next VRAM byte. When negative (after ADD 8), adjusted and D02A6E is decremented. |
| +17 | D02A73 | 1B | **glyph column data** | 7 | The current vertical column of the glyph font bitmap. Written during font decode, read during pixel rendering. XOR 0xFE applied for inverse mode (BIT 3,(IY+0x05)). Most-referenced single byte in the workspace. |
| +18 | D02A74 | 1B | **shifted overflow** | 1 | Result of shifting D02A73 right by D02A71 bits -- the low bits that overflow past the current byte boundary. Written once per column, read via (HL) indirection. |
| +19 | D02A75 | 1B | **glyph width** | 3 | Width in pixels of the current glyph column (typically 5 or 7 from LD C,0x05/0x07). Loaded from C register. Used with D02A71 to compute D02A72. |

### Unreferenced byte offsets

Offsets +01, +02, +04, +05, +07, +08, +10, +11, +13, +14 have no direct references. These are the high bytes of the 24-bit pointer fields at +00, +03, +06, +09, +12. They are implicitly read/written by the 24-bit LD instructions that reference the base address.

## Reference Table (all 42)

| RAM Addr | ROM Addr | Instruction | Access | Containing Function |
|----------|----------|-------------|--------|---------------------|
| D02A62 | 0x05C94B | LD (0xD02A62),DE | WRITE | ~0x05C940 font packer |
| D02A62 | 0x05C976 | LD HL,(0xD02A62) | READ | ~0x05C970 font packer |
| D02A62 | 0x05C986 | LD (0xD02A62),HL | WRITE | ~0x05C980 font packer |
| D02A62 | 0x0A183E | LD (0xD02A62),HL | WRITE | pixel_loop (sess.560) |
| D02A62 | 0x0A18AF | LD HL,(0xD02A62) | READ | glyph render 0x0A18xx |
| D02A62 | 0x0A1903 | LD HL,(0xD02A62) | READ | glyph render 0x0A19xx |
| D02A62 | 0x0A1A1E | LD HL,(0xD02A62) | READ | row advance 0x0A1Axx |
| D02A62 | 0x0A1A27 | LD (0xD02A62),HL | WRITE | row advance 0x0A1Axx |
| D02A65 | 0x06F6EF | LD (0xD02A65),A | WRITE | font config 0x06F6xx |
| D02A65 | 0x06F72F | LD DE,0xD02A65 | LOAD-PTR | font config 0x06F7xx |
| D02A68 | 0x06F71F | LD DE,0xD02A68 | LOAD-PTR | font config 0x06F7xx |
| D02A68 | 0x09F2B8 | LD A,(0xD02A68) | READ | graph plotter 0x09F2xx |
| D02A6B | 0x09F474 | LD (0xD02A6B),HL | WRITE | graph plotter 0x09F4xx |
| D02A6B | 0x09F4B8 | LD HL,(0xD02A6B) | READ | graph plotter 0x09F4xx |
| D02A6B | 0x09F4CA | LD HL,(0xD02A6B) | READ | graph plotter 0x09F4xx |
| D02A6B | 0x09F5B2 | LD HL,(0xD02A6B) | READ | graph plotter 0x09F5xx |
| D02A6B | 0x09F5BB | LD (0xD02A6B),HL | WRITE | graph plotter 0x09F5xx |
| D02A6B | 0x09F5CE | LD HL,(0xD02A6B) | READ | graph plotter 0x09F5xx |
| D02A6B | 0x09F5D7 | LD (0xD02A6B),HL | WRITE | graph plotter 0x09F5xx |
| D02A6E | 0x0A18D3 | LD (0xD02A6E),HL | WRITE | glyph render 0x0A18xx |
| D02A6E | 0x0A18F2 | LD (0xD02A6E),DE | WRITE | glyph render 0x0A18xx |
| D02A6E | 0x0A1995 | LD HL,(0xD02A6E) | READ | glyph render 0x0A19xx |
| D02A6E | 0x0A19C3 | LD HL,(0xD02A6E) | READ | glyph render 0x0A19xx |
| D02A71 | 0x0A180E | LD (0xD02A71),A | WRITE | pixel_loop (sess.560) |
| D02A71 | 0x0A18A6 | LD A,(0xD02A71) | READ | glyph render 0x0A18xx |
| D02A71 | 0x0A18B5 | LD A,(0xD02A71) | READ | glyph render 0x0A18xx |
| D02A71 | 0x0A18DC | LD HL,0xD02A71 | LOAD-PTR | glyph render 0x0A18xx |
| D02A72 | 0x0A18E3 | LD (0xD02A72),A | WRITE | glyph render 0x0A18xx |
| D02A72 | 0x0A18ED | LD (0xD02A72),A | WRITE | glyph render 0x0A18xx |
| D02A72 | 0x0A198A | LD A,(0xD02A72) | READ | glyph render 0x0A19xx |
| D02A72 | 0x0A19AD | LD A,(0xD02A72) | READ | glyph render 0x0A19xx |
| D02A73 | 0x005AEA | LD (0xD02A73),A | WRITE | OS init 0x005Axx |
| D02A73 | 0x005AF6 | LD A,(0xD02A73) | READ | OS init 0x005Axx |
| D02A73 | 0x0A188C | LD (0xD02A73),A | WRITE | glyph render 0x0A18xx |
| D02A73 | 0x0A18BB | LD A,(0xD02A73) | READ | glyph render 0x0A18xx |
| D02A73 | 0x0A1913 | LD A,(0xD02A73) | READ | glyph render 0x0A19xx |
| D02A73 | 0x0A1976 | LD (0xD02A73),A | WRITE | glyph render 0x0A19xx |
| D02A73 | 0x0A19CC | LD A,(0xD02A73) | READ | glyph render 0x0A19xx |
| D02A74 | 0x0A18CB | LD (0xD02A74),A | WRITE | glyph render 0x0A18xx |
| D02A75 | 0x005AF0 | LD (0xD02A75),A | WRITE | OS init 0x005Axx |
| D02A75 | 0x0A1892 | LD (0xD02A75),A | WRITE | glyph render 0x0A18xx |
| D02A75 | 0x0A18D7 | LD A,(0xD02A75) | READ | glyph render 0x0A18xx |

## Code Regions

### 1. OS Init / Font Setup (0x005Axx)
- Writes D02A73 (glyph column) and D02A75 (glyph width = 5 or 7), then reads D02A73 back
- SRL A twice + XOR 0xFE suggests inverse-mode font column transform

### 2. Font Bitmap Packer (0x05C9xx)
- Uses D02A62 as a cursor to pack font bitmap data
- Writes bytes via (HL), advances D02A62
- Loop of 12 iterations (LD C,0x0C) with D005C5-related control

### 3. Mode Switch / Font Init (0x06F6xx-0x06F7xx)
- Copies D0146E to D02A65 (font param)
- Sets up LDIR pairs with D02A68/D02A65 as destinations via CALL 0x07F984

### 4. Graph Plotter (0x09F2xx-0x09F5xx)
- Heavy use of D02A6B (graph VRAM base), init from D028FD, advance by +0x010C per row
- EXX-protected shadow register usage for tight inner loop

### 5. Glyph Renderer (0x0A18xx-0x0A1Axx) -- PRIMARY USER
28 of 42 references (67%). Core glyph column rendering loop:
1. Extract bit offset from X coord -> D02A71
2. Compute VRAM address -> D02A62
3. Store glyph column -> D02A73, width -> D02A75
4. Shift-and-mask glyph data using D02A71 as shift count
5. Write primary pixel byte to (D02A62), overflow to (D02A6E)
6. Advance D02A62 by +0x28 per scan row
7. Repeat for B rows (typically 16 for large font, from LD B,0x10)

## Key Relationships

- **D02A62** and **D02A6E** work together: D02A62 = current VRAM byte, D02A6E = next byte (for overflow)
- **D02A71**, **D02A72**, and **D02A75** form a bit-alignment triple: D02A71 = shift count, D02A75 = glyph width, D02A72 = remaining bits after first byte
- **D02A73** is the hot pixel data byte, read/written 7 times
- **D02A65/D02A68** are a separate subsystem (font parameter block), not part of pixel rendering inner loop
- **D02A6B** is exclusively used by the graph plotter (0x09Fxxx), separate from glyph rendering
