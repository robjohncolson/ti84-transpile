# Phase 604: VRAM Peak-Capture Strategy

## Goal

Find the exact step before the second bulk wipe destroys VRAM, so a future probe
can snapshot the screen state at its peak for analysis or frame-grabbing.

## Configuration

- VRAM region: 0xD40000 – 0xD52C00 (320×240, 16bpp, 153,600 bytes)
- Sample interval: every 5000 steps
- Max steps: 500,000
- Decline threshold: pixel count drops >100 from peak

## Results

### Peak

| Field | Value |
|-------|-------|
| Step | 45000 |
| PC | 0x0A2563 |
| Non-zero pixel count | 38400 |
| VRAM valid (>1000 px) | YES |

### Capture Point

Step 45000 at PC 0x0A2563 (38400 pixels)

## VRAM Sample Table

| Step | PC | Non-zero pixels |
|------|----|----------------|
| 5000 | 0x001C3C | 37079 |
| 10000 | 0x001C48 | 37079 |
| 15000 | 0x001C3C | 37079 |
| 20000 | 0x001C3C | 37079 |
| 25000 | 0x001C3C | 37079 |
| 30000 | 0x001C3C | 37079 |
| 35000 | 0x001C3C | 37079 |
| 40000 | 0x001C48 | 37079 |
| 45000 | 0x0A2563 | 38400 | ← PEAK
| 50000 | 0x0A257E | 38291 |
| 55000 | 0x001C3C | 38287 |
| 60000 | 0x001C4F | 38159 |
| 65000 | 0x09162E | 37934 |
| 70000 | 0x0A2588 | 37570 |
| 75000 | 0x0A255F | 37326 |
| 80000 | 0x0A255F | 37079 |
| 85000 | 0x00611D | 38400 |
| 90000 | 0x005B16 | 38380 |
| 95000 | 0x006D64 | 38380 |
| 100000 | 0x006D64 | 38380 |
| 105000 | 0x006D64 | 38380 |
| 110000 | 0x006D64 | 38380 |
| 115000 | 0x006D64 | 38380 |
| 120000 | 0x006D64 | 38380 |
| 125000 | 0x006D64 | 38380 |
| 130000 | 0x006D64 | 38380 |
| 135000 | 0x006D64 | 38380 |
| 140000 | 0x006D64 | 38380 |
| 145000 | 0x006D64 | 38380 |
| 150000 | 0x006D64 | 38380 |
| 155000 | 0x006D64 | 38380 |
| 160000 | 0x006D64 | 38380 |
| 165000 | 0x006D64 | 38380 |
| 170000 | 0x006D64 | 38380 |
| 175000 | 0x0017FC | 38378 |
| 180000 | 0x000A92 | 38378 |
| 185000 | 0x000A92 | 38378 |
| 190000 | 0x000A92 | 38378 |
| 195000 | 0x000BFE | 38378 |
| 200000 | 0x000B7C | 38378 |
| 205000 | 0x000B7C | 38378 |
| 210000 | 0x000B7C | 38378 |
| 215000 | 0x000A92 | 38378 |
| 220000 | 0x000A92 | 38378 |
| 225000 | 0x000A92 | 38378 |
| 230000 | 0x000A92 | 38378 |
| 235000 | 0x000BFE | 38378 |
| 240000 | 0x000BFE | 38378 |
| 245000 | 0x000BFE | 38378 |
| 250000 | 0x000BFE | 38378 |
| 255000 | 0x005B16 | 38380 |
| 260000 | 0x005B16 | 36649 |
| 265000 | 0x005B16 | 35945 |
| 270000 | 0x00596E | 35945 |
| 275000 | 0x006145 | 38400 |

## Execution

- Termination: halt
- Steps run: 276820
- Last PC: 0x0019B5

## Next Steps

The capture point is step 45000 (PC 0x0A2563).
A follow-up probe should run exactly that many steps from 0x08C331, then snapshot VRAM to a .bin file.
