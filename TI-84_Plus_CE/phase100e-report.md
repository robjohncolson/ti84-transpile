# Phase 100E - Buffer Write Hook

## Verdict

- `BUFFER POPULATOR REACHED`

## Run Summary

- `os_init`: entry=0x08c331 steps=727 term=missing_block lastPc=0xffffff interrupts=2
- `post_init`: entry=0x0802b2 steps=1 term=missing_block lastPc=0xffffff interrupts=0
- `event_loop`: entry=0x0019be steps=6 term=missing_block lastPc=0xffffff interrupts=0

## Write Log

- step=727 phase=os_init pc=0x00287d addr=0xd020a6 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020a7 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020a8 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020a9 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020aa value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020ab value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020ac value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020ad value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020ae value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020af value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b0 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b1 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b2 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b3 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b4 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b5 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b6 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b7 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b8 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020b9 value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020ba value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020bb value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020bc value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020bd value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020be value=0xff ascii=.
- step=727 phase=os_init pc=0x00287d addr=0xd020bf value=0xff ascii=.

## Unique PCs

- pc=0x00287d phase=os_init count=26 steps=727-727 addrs=0xd020a6, 0xd020a7, 0xd020a8, 0xd020a9, 0xd020aa, 0xd020ab, 0xd020ac, 0xd020ad, 0xd020ae, 0xd020af, 0xd020b0, 0xd020b1, 0xd020b2, 0xd020b3, 0xd020b4, 0xd020b5, 0xd020b6, 0xd020b7, 0xd020b8, 0xd020b9, 0xd020ba, 0xd020bb, 0xd020bc, 0xd020bd, 0xd020be, 0xd020bf values=0xff(.)

## Final Buffer

- Hex: `0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff`
- ASCII: `..........................`

## Recommendation

- Chase PC 0x00287d in phase os_init; it is the first confirmed dynamic writer into the mode-display buffer.

## Probe Stdout

```text
=== Phase 100E - Buffer write hook ===
watchRange=0xd020a6..0xd020bf len=26
timerInterrupt=true
coldBoot: entry=0x000000 steps=3062 term=halt lastPc=0x0019b5
buffer before os_init: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
run os_init: entry=0x08c331 mode=adl maxSteps=500000
result os_init: steps=727 term=missing_block lastPc=0xffffff interrupts=2
run post_init: entry=0x0802b2 mode=adl maxSteps=100
result post_init: steps=1 term=missing_block lastPc=0xffffff interrupts=0
run event_loop: entry=0x0019be mode=adl maxSteps=500000
result event_loop: steps=6 term=missing_block lastPc=0xffffff interrupts=0

write log:
  [1] step=727 phase=os_init pc=0x00287d addr=0xd020a6 value=0xff ascii=.
  [2] step=727 phase=os_init pc=0x00287d addr=0xd020a7 value=0xff ascii=.
  [3] step=727 phase=os_init pc=0x00287d addr=0xd020a8 value=0xff ascii=.
  [4] step=727 phase=os_init pc=0x00287d addr=0xd020a9 value=0xff ascii=.
  [5] step=727 phase=os_init pc=0x00287d addr=0xd020aa value=0xff ascii=.
  [6] step=727 phase=os_init pc=0x00287d addr=0xd020ab value=0xff ascii=.
  [7] step=727 phase=os_init pc=0x00287d addr=0xd020ac value=0xff ascii=.
  [8] step=727 phase=os_init pc=0x00287d addr=0xd020ad value=0xff ascii=.
  [9] step=727 phase=os_init pc=0x00287d addr=0xd020ae value=0xff ascii=.
  [10] step=727 phase=os_init pc=0x00287d addr=0xd020af value=0xff ascii=.
  [11] step=727 phase=os_init pc=0x00287d addr=0xd020b0 value=0xff ascii=.
  [12] step=727 phase=os_init pc=0x00287d addr=0xd020b1 value=0xff ascii=.
  [13] step=727 phase=os_init pc=0x00287d addr=0xd020b2 value=0xff ascii=.
  [14] step=727 phase=os_init pc=0x00287d addr=0xd020b3 value=0xff ascii=.
  [15] step=727 phase=os_init pc=0x00287d addr=0xd020b4 value=0xff ascii=.
  [16] step=727 phase=os_init pc=0x00287d addr=0xd020b5 value=0xff ascii=.
  [17] step=727 phase=os_init pc=0x00287d addr=0xd020b6 value=0xff ascii=.
  [18] step=727 phase=os_init pc=0x00287d addr=0xd020b7 value=0xff ascii=.
  [19] step=727 phase=os_init pc=0x00287d addr=0xd020b8 value=0xff ascii=.
  [20] step=727 phase=os_init pc=0x00287d addr=0xd020b9 value=0xff ascii=.
  [21] step=727 phase=os_init pc=0x00287d addr=0xd020ba value=0xff ascii=.
  [22] step=727 phase=os_init pc=0x00287d addr=0xd020bb value=0xff ascii=.
  [23] step=727 phase=os_init pc=0x00287d addr=0xd020bc value=0xff ascii=.
  [24] step=727 phase=os_init pc=0x00287d addr=0xd020bd value=0xff ascii=.
  [25] step=727 phase=os_init pc=0x00287d addr=0xd020be value=0xff ascii=.
  [26] step=727 phase=os_init pc=0x00287d addr=0xd020bf value=0xff ascii=.

unique pcs:
  pc=0x00287d phase=os_init count=26 steps=727-727 addrs=0xd020a6, 0xd020a7, 0xd020a8, 0xd020a9, 0xd020aa, 0xd020ab, 0xd020ac, 0xd020ad, 0xd020ae, 0xd020af, 0xd020b0, 0xd020b1, 0xd020b2, 0xd020b3, 0xd020b4, 0xd020b5, 0xd020b6, 0xd020b7, 0xd020b8, 0xd020b9, 0xd020ba, 0xd020bb, 0xd020bc, 0xd020bd, 0xd020be, 0xd020bf values=0xff(.)

final buffer hex: 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff
final buffer ascii: ..........................
recommendation: Chase PC 0x00287d in phase os_init; it is the first confirmed dynamic writer into the mode-display buffer.
BUFFER POPULATOR REACHED
```
