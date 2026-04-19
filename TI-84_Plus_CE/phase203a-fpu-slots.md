# Phase 203A FPU BCALL slots

Repo-local cross-checks:

- `TI-84_Plus_CE/probe-phase88-bcall-scan.mjs` documents the CE jump-table base as `0x020104` with stride `4`.
- `TI-84_Plus_CE/ti84-math.mjs` already hard-codes local ROM targets for `SqRoot`, `Sin`, `Cos`, and `Tan`: `0x07DF66`, `0x07E57B`, `0x07E5B5`, `0x07E5D8`.
- Using that same jump-table base against `TI-84_Plus_CE/ROM.rom`, the local ROM targets resolve as:
  `SqRoot -> 0x07DF66`, `LnX -> 0x07E053`, `LogX -> 0x07E071`, `EToX -> 0x07E20D`, `Sin -> 0x07E57B`, `Cos -> 0x07E5B5`, `Tan -> 0x07E5D8`, `YtoX -> 0x0AFD41`.

Note: the prompt uses `FPSin` / `FPCos` / `FPTan`; the CE include file names these BCALLs `_Sin` / `_Cos` / `_Tan`.

| op name | BCALL label | slot hex | source |
| --- | --- | --- | --- |
| Sin | `FPSin` / `_Sin` | `0x0048` | in-repo: `TI-84_Plus_CE/ti84-math.mjs`; external: TI-83 Plus Developer Guide Table 2.18 + WikiTI `84PCE:OS:Include File` (`_Sin equ 0020224h`) |
| Cos | `FPCos` / `_Cos` | `0x0049` | in-repo: `TI-84_Plus_CE/ti84-math.mjs`; external: TI-83 Plus Developer Guide Table 2.18 + WikiTI `84PCE:OS:Include File` (`_Cos equ 0020228h`) |
| Tan | `FPTan` / `_Tan` | `0x004A` | in-repo: `TI-84_Plus_CE/ti84-math.mjs`; external: TI-83 Plus Developer Guide Table 2.18 + WikiTI `84PCE:OS:Include File` (`_Tan equ 002022Ch`) |
| Log (base 10) | `LogX` / `_LogX` | `0x0043` | in-repo: `TI-84_Plus_CE/probe-phase88-bcall-scan.mjs` (JT base); external: TI-83 Plus Developer Guide Table 2.19 + WikiTI `84PCE:OS:Include File` (`_LogX equ 0020210h`) |
| Ln | `LnX` / `_LnX` | `0x0042` | in-repo: `TI-84_Plus_CE/probe-phase88-bcall-scan.mjs` (JT base); external: TI-83 Plus Developer Guide Table 2.19 + WikiTI `84PCE:OS:Include File` (`_LnX equ 002020Ch`) |
| Exp (`e^x`) | `EToX` / `_EToX` | `0x0045` | in-repo: `TI-84_Plus_CE/probe-phase88-bcall-scan.mjs` (JT base); external: TI-83 Plus Developer Guide Table 2.19 + WikiTI `84PCE:OS:Include File` (`_EToX equ 0020218h`) |
| Pow (`^`) | `YToX` / `_YtoX` | `0x0288` | in-repo: `TI-84_Plus_CE/probe-phase88-bcall-scan.mjs` (JT base); external: TI-83 Plus Developer Guide Table 2.19 + WikiTI `84PCE:OS:Include File` (`_YtoX equ 0020B24h`) |
| Sqrt | `SqRoot` / `_SqRoot` | `0x003D` | in-repo: `TI-84_Plus_CE/ti84-math.mjs`; external: TI-83 Plus Developer Guide Table 2.17 + WikiTI `84PCE:OS:Include File` (`_SqRoot equ 00201F8h`) |

Neighbor note for power/root ops:

- `XRootY` is the adjacent CE BCALL at `0x0287` (`_XrootY equ 0020B20h`) if that becomes useful later.
