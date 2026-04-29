# Phase 25BE — Graph Subsystem Investigation Report

Static analysis of graph subsystem entry points in TI-84 Plus CE OS 5.8.2.

## Graph Key Path

| Stage | Value | Notes |
|-------|-------|-------|
| Physical key | keyMatrix[6] bit 0 | SDK Group 1, bit 0 |
| Scan code | 0x60 | `(6 << 4) \| 0` |
| k* code (no modifier) | **kGraph = 0x44** | From scancode table at 0x09F79B |
| Context app ID | **cxGraph = 0x44** | `ti84pceg.inc: cxGraph := kGraph` |

## Key Equates (ti84pceg.inc)

| Symbol | Value | Notes |
|--------|-------|-------|
| cxCurApp | 0xD007E0 | Current app ID (1 byte) |
| cxMain | 0xD007CA | Main handler pointer (3 bytes) |
| cxPPutAway | 0xD007CD | Pre-putaway handler |
| cxPutAway | 0xD007D0 | Putaway handler |
| cxErrorEP | 0xD007D6 | Error handler |
| cxSizeWind | 0xD007D9 | Size window handler |
| cxPage | 0xD007DC | Page handler |
| plotSScreen | 0xD09466 | Graph back-buffer (21945 bytes) |
| graphFlags | IY+3h | bit 0 = graphDraw (0=valid, 1=dirty) |
| grfDBFlags | IY+4h | Graph database flags |
| plotFlags | IY+2h | Plot generation flags |
| graphFlags2 | IY+1Fh | Additional graph flags |
| plotFlag3 | IY+3Ch | Plot flag 3 |

## Graph Context Table Candidate

The home screen context table at 0x0585D3 sets 7 handler pointers that get LDIR'd into cxMain..cxPage (0xD007CA-0xD007DF). The cxCurApp byte (0xD007E0) is set separately by the caller.

**Best graph table candidate: 0x059E36** — all pointers cluster in the 0x05A0xx graph handler region:

| Field | Address | Handler |
|-------|---------|---------|
| cxMain | 0x05A7B6 | Graph main handler |
| cxPPutAway | 0x05A074 | Graph pre-putaway |
| cxPutAway | 0x05A07C | Graph putaway |
| cxRedisp | 0x05A04C | Graph redisplay |
| cxErrorEP | 0x05A050 | Graph error handler |
| cxSizeWind | 0x05A054 | Graph size-window |
| cxPage | 0x05A040 | Graph page handler |

Other candidates at 0x074FFD, 0x075015, 0x075E57 also have valid pointer clusters in the 0x07xxxx range (possibly Trace, Zoom, or Window editor contexts).

## Graph-Related Jump Table Entries (40 total)

### Drawing Primitives

| Name | JT Slot | Impl Address | Purpose |
|------|---------|--------------|---------|
| IPoint | 670 | 0x07B451 | Plot single pixel (graph coords) |
| ILine | 669 | 0x07B245 | Draw line (graph coords) |
| DarkLine | 668 | 0x07B241 | Draw dark/bold line |
| CPointS | 676 | 0x056ABA | Clear point |
| DrawSplitLine | 716 | 0x06F41A | Draw split-screen divider |
| ScreenScrollPixelsUp | 875 | 0x0A3126 | Scroll screen pixels up |

### Graph Commands (user-facing)

| Name | JT Slot | Impl Address | Purpose |
|------|---------|--------------|---------|
| LineCmd | 736 | 0x05DAC3 | Line( command |
| UnLineCmd | 737 | 0x05DB12 | Un-draw line |
| PointCmd | 738 | 0x05DB2E | Point( command |
| PixelTest | 739 | 0x05DB45 | pxl-Test( |
| PixelCmd | 740 | 0x05DBA0 | Pxl-On/Off/Change |
| DrawCmdInit | 742 | 0x05DC04 | Draw command init |
| DrawCmd | 743 | 0x05DD96 | Draw command dispatcher |
| ShadeCmd | 744 | 0x05DDD7 | Shade( command |
| StatShade | 746 | 0x05E062 | Statistical shade |

### Graph System

| Name | JT Slot | Impl Address | Purpose |
|------|---------|--------------|---------|
| GraphPars | 893 | 0x09986C | Parse graph parameters |
| PlotPars | 894 | 0x099874 | Parse plot parameters |
| ClrGraphRef | 862 | 0x083268 | Clear graph reference buffer |
| SetFuncM | 701 | 0x0BD0D8 | Set function mode |
| SetNumWindow | 442 | 0x0A1F12 | Set numeric window vars |
| ClrWindow | 454 | 0x0A223A | Clear window |
| ShrinkWindow | 446 | 0x0A215B | Shrink window |
| NewLine | 443 | 0x0A2032 | New line in text |

### Trace / Zoom

| Name | JT Slot | Impl Address | Purpose |
|------|---------|--------------|---------|
| TraceOff | 682 | 0x06C7AA | Turn off trace cursor |
| InitNewTraceP | 652 | 0x0B0978 | Init new trace point |
| TblTrace | 760 | 0x0B52E1 | Table-trace |
| ZoomXYCmd | 698 | 0x0B1729 | Zoom X/Y command |

### Stat Plots

| Name | JT Slot | Impl Address | Purpose |
|------|---------|--------------|---------|
| DrawSPlot | 651 | 0x0B05D1 | Draw stat plot |
| SPlotCoord | 653 | 0x0B0BAD | Stat plot coordinate |
| SPlotRight | 654 | 0x0B0C8B | Stat plot trace right |
| SPlotLeft | 655 | 0x0B0CFF | Stat plot trace left |
| NextPlot | 657 | 0x0B0DDB | Next plot |
| PrevPlot | 658 | 0x0B0DEE | Previous plot |
| ClrPrevPlot | 659 | 0x0B0DFF | Clear previous plot |
| PointStatHelp | 650 | 0x0B056C | Point stat helper |
| ErrStatPlot | 417 | 0x061D76 | Stat plot error handler |

### Curve Lines

| Name | JT Slot | Impl Address | Purpose |
|------|---------|--------------|---------|
| UCLines | 644 | 0x0AF949 | Uncompressed curve lines |
| CLine | 645 | 0x0AF966 | Single curve line |
| CLines | 646 | 0x0AF974 | Multiple curve lines |
| CkEndLineRR | 901 | 0x099D2F | Check end-of-line |

## First-Level Disassembly of Priority Routines

### IPoint (0x07B451) — Pixel plot
```
07B451: LD (0xD02AC8),A    ; save draw mode byte
07B455: PUSH AF
07B456: LD A,0x00
07B458: LD (0xD02AD4),A    ; clear line-mode flag (0=point, 1=line)
07B45C: POP AF
07B45D: PUSH AF
07B45E: BIT 7,(IY+35h)     ; check some graph state flag
07B462: CALL NZ,0x023A9E   ; conditional call if flag set
07B466: JR Z,+3            ; skip RET if zero
07B468: POP AF
07B469: RET                 ; bail out if condition met
```
Note: First bytes `32 C8 2A D0` decode as `LD (0xD02AC8),A` in eZ80 ADL mode (the decoder missed the 3-byte address).

### ILine (0x07B245) — Line draw
```
07B245: PUSH AF
07B246: LD A,0x01
07B248: LD (0xD02AD4),A    ; set line-mode flag = 1
07B24C: POP AF
07B24D: PUSH AF
07B24E: BIT 7,(IY+35h)     ; same graph state flag check
...                         ; continues into shared IPoint/ILine logic
```
ILine and IPoint share the same core — they diverge only on the mode byte at 0xD02AD4 (0=point, 1=line).

### ClrGraphRef (0x083268) — Clear graph buffer
```
083268: LD HL,0xD3FFFF      ; end of graph buffer area
08326C: LD BC,(0xD02590)    ; buffer size/count
083271: ...                  ; loop to clear graph reference bits
```
Loads the top of a graph buffer region and a count, then iterates to clear reference flags.

### DrawCmd (0x05DD96) — Draw dispatcher
```
05DD96: CALL 0x05DA51       ; → HorizCmd (horizontal line)
05DD9A: RES 1,(IY+0Dh)     ; clear a parser flag
05DD9E: CALL 0x070228       ; unknown — possibly ClrDraw or graph setup
05DDA2: CALL 0x05E128       ; unknown — possibly graph redraw
05DDA6: SET 7,(IY+03h)      ; set graphDraw dirty flag
```
First calls HorizCmd, clears a flag, calls two setup routines, then marks graph as dirty.

### GraphPars (0x09986C) — Graph parameter parser
```
09986C: LD A,(0xD01474)     ; read graph mode/type byte
099870: CALL 0x091DFB       ; dispatch based on graph type
099874: LD A,0x08           ; (this is PlotPars entry point)
```
Reads the current graph mode and dispatches to the appropriate parameter parser.

## Recommended Next Steps for Rendering Y=X

1. **Deep-disassemble IPoint and ILine** (128+ bytes each) to understand the coordinate transform from math coordinates (Xmin/Xmax/Ymin/Ymax) to pixel coordinates.

2. **Identify graph window variables in RAM**. The OS stores Xmin, Xmax, Ymin, Ymax as TI floating-point values. Search `ti84pceg.inc` for `XMin`, `XMax`, `YMin`, `YMax` or scan the 0xD01xxx area.

3. **Trace the graph app context** — call `NewContext(0x44)` with the context table at 0x059E36 and trace what `cxMain` handler (0x05A7B6) does on first entry. This is the graph app's main loop.

4. **Find the Y= equation storage** — TI-OS stores Y1..Y0 equations as tokenized expressions in the equation editor area. Search for `Y1` or `equObj` in ti84pceg.inc.

5. **Build a graph-render probe**: seed cxCurApp=0x44, load the 0x059E36 context table into cxMain..cxPage, set graphDraw dirty flag, set Xmin=-10/Xmax=10/Ymin=-10/Ymax=10 as TI floats, store a tokenized Y1=X equation, and call the graph main handler.

6. **Alternative shortcut**: Instead of full OS graph rendering, call `ILine` directly with pixel coordinates to verify the line-drawing primitive works, then build up from there.
