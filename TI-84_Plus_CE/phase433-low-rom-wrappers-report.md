# Phase 433: Low-ROM wrappers in `0x000000..0x000300`

## Summary

- The seven suspected low-ROM thunks are all plain 4-byte `JP nn` veneers.
- The previously unknown targets are now resolved:
  - `0x000138 -> 0x0021C2`
  - `0x000204 -> 0x0025E8`
  - `0x000210 -> 0x002623`
  - `0x000264 -> 0x00276B`
- The scan window contains more than those seven wrappers. After a handful of reset/interrupt stubs, `0x000080..0x0002FC` is a contiguous 160-entry wrapper table with one `JP` every 4 bytes.
- The pattern does not support an eZ80 CALL-range explanation. For these seven helper families, bank `0x03xxxx` uses the low wrappers exclusively, while bank `0x00xxxx` calls the real helper bodies directly.

## Focused wrapper decode

| Wrapper | Bytes | Target | Known role |
| --- | --- | --- | --- |
| `0x0000A4` | `C3 E8 27 00` | `0x0027E8` | `memcpy` |
| `0x000124` | `C3 1B 21 00` | `0x00211B` | sparse case dispatcher |
| `0x00012C` | `C3 97 21 00` | `0x002197` | `__frameset` variant |
| `0x000138` | `C3 C2 21 00` | `0x0021C2` | zero/null check |
| `0x000204` | `C3 E8 25 00` | `0x0025E8` | post-walk predicate/helper |
| `0x000210` | `C3 23 26 00` | `0x002623` | `_seqcase` |
| `0x000264` | `C3 6B 27 00` | `0x00276B` | `_stoiu` |

## Why `0x03xxxx` uses wrappers

The ROM evidence points to a low-address import table, not a call-range limit:

- eZ80 ADL `CALL nn` is already a 24-bit absolute call, so `0x03xxxx` could encode direct calls to `0x0027E8`, `0x00211B`, `0x002197`, and the other low helpers.
- It does not. For these seven helpers, bank `0x03xxxx` makes wrapper calls only and zero direct calls to the real helper bodies.
- The inverse is true in bank `0x00xxxx`: direct calls to the real helper bodies exist, but wrapper calls do not.
- The wrappers live in a dense fixed-address table at `0x000080..0x0002FC`, and the table contains repeated aliases such as:
  - `0x000154` and `0x000158` both jump to `0x00224C`
  - `0x0001A8` and `0x0001AC` both jump to `0x0023AD`
  - `0x0001C8` and `0x0001CC` both jump to `0x00245A`
  - `0x000224` and `0x000228` both jump to `0x0026BD`
- That looks like a stable exported veneer ABI. A mirrored high-ROM routine family can be duplicated into `0x03xxxx` and other banks while leaving shared-helper call operands unchanged as `call 0x000xxx`.

Working hypothesis: TI duplicated some routine families into higher ROM regions and retargeted intra-bank sibling helpers directly, but routed shared low utilities through a fixed veneer table in the first page of ROM so mirrored copies could reuse the same helper-call sites.

## Wrapper/direct call evidence

| Wrapper | Target | Name | Wrapper CALLs (all ROM) | Direct CALLs to target (all ROM) | Wrapper CALLs from `0x03xxxx` | Direct CALLs from `0x03xxxx` | Wrapper CALLs from `0x00xxxx` | Direct CALLs from `0x00xxxx` |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `0x0000A4` | `0x0027E8` | `memcpy` | 62 | 11 | 31 | 0 | 0 | 10 |
| `0x000124` | `0x00211B` | sparse case dispatcher | 69 | 22 | 31 | 0 | 0 | 20 |
| `0x00012C` | `0x002197` | `__frameset` variant | 283 | 125 | 114 | 0 | 0 | 67 |
| `0x000138` | `0x0021C2` | zero/null check | 545 | 167 | 202 | 0 | 0 | 100 |
| `0x000204` | `0x0025E8` | post-walk predicate/helper | 139 | 36 | 5 | 0 | 0 | 11 |
| `0x000210` | `0x002623` | `_seqcase` | 49 | 34 | 16 | 0 | 0 | 28 |
| `0x000264` | `0x00276B` | `_stoiu` | 140 | 91 | 21 | 0 | 0 | 59 |

Totals across the seven helper families:

- `0x03xxxx` wrapper calls: `420`
- `0x03xxxx` direct calls to the underlying helpers: `0`
- `0x00xxxx` wrapper calls: `0`
- `0x00xxxx` direct calls to the underlying helpers: `295`

## Complete normalized JP list in `0x000000..0x0002FF`

Method:

- Raw scan: every byte offset in `0x000000..0x0002FF` where byte `0xC3` appears.
- Normalized scan: consume actual wrapper entries as non-overlapping 4-byte `JP nn` thunks.
- Result: `170` normalized JP sites. `10` are early reset/interrupt/service stubs. `160` form the dense veneer table at `0x000080..0x0002FC`.
- The raw scan sees one extra `0xC3` at `0x0001B1`, but that is just the low byte `0xC3` inside the real entry `0x0001B0 -> 0x0023C3`.

### Early reset/interrupt/service JP sites

| Wrapper | Target | Known name |
| --- | --- | --- |
| `0x000004` | `0x000658` |  |
| `0x00000C` | `0x001AFA` |  |
| `0x000014` | `0x020110` |  |
| `0x00001C` | `0x020114` |  |
| `0x000024` | `0x020118` |  |
| `0x00002C` | `0x02011C` |  |
| `0x000034` | `0x020120` |  |
| `0x000043` | `0x0006F3` |  |
| `0x000054` | `0x0220A8` |  |
| `0x000072` | `0x001AFA` |  |

### Dense wrapper table at `0x000080..0x0002FC`

| Wrapper | Target | Known name |
| --- | --- | --- |
| `0x000080` | `0x001768` |  |
| `0x000084` | `0x001775` |  |
| `0x000088` | `0x003C59` |  |
| `0x00008C` | `0x00176D` |  |
| `0x000090` | `0x001770` |  |
| `0x000094` | `0x00277A` |  |
| `0x000098` | `0x0028F3` |  |
| `0x00009C` | `0x002794` |  |
| `0x0000A0` | `0x0027B7` |  |
| `0x0000A4` | `0x0027E8` | `memcpy` |
| `0x0000A8` | `0x002808` |  |
| `0x0000AC` | `0x00283A` |  |
| `0x0000B0` | `0x00285F` | `_bzero` |
| `0x0000B4` | `0x0028A5` |  |
| `0x0000B8` | `0x0028D2` |  |
| `0x0000BC` | `0x002920` |  |
| `0x0000C0` | `0x00294B` |  |
| `0x0000C4` | `0x002970` |  |
| `0x0000C8` | `0x00298D` |  |
| `0x0000CC` | `0x0029A8` |  |
| `0x0000D0` | `0x0029C2` |  |
| `0x0000D4` | `0x0029E9` |  |
| `0x0000D8` | `0x0029FE` |  |
| `0x0000DC` | `0x002A2F` |  |
| `0x0000E0` | `0x002A64` |  |
| `0x0000E4` | `0x002AAB` |  |
| `0x0000E8` | `0x002ADC` |  |
| `0x0000EC` | `0x002AFF` |  |
| `0x0000F0` | `0x002B2F` |  |
| `0x0000F4` | `0x002B5C` |  |
| `0x0000F8` | `0x0028D1` |  |
| `0x0000FC` | `0x002588` |  |
| `0x000100` | `0x00257F` |  |
| `0x000104` | `0x002575` |  |
| `0x000108` | `0x002594` |  |
| `0x00010C` | `0x0025A0` |  |
| `0x000110` | `0x00200F` |  |
| `0x000114` | `0x00203B` |  |
| `0x000118` | `0x002075` |  |
| `0x00011C` | `0x0020B2` |  |
| `0x000120` | `0x0020E5` |  |
| `0x000124` | `0x00211B` | sparse case dispatcher |
| `0x000128` | `0x002151` |  |
| `0x00012C` | `0x002197` | `__frameset` variant |
| `0x000130` | `0x00218A` | `__frameset` |
| `0x000134` | `0x0021A7` |  |
| `0x000138` | `0x0021C2` | zero/null check |
| `0x00013C` | `0x0021CE` |  |
| `0x000140` | `0x002207` |  |
| `0x000144` | `0x002211` |  |
| `0x000148` | `0x002228` |  |
| `0x00014C` | `0x002234` |  |
| `0x000150` | `0x002240` |  |
| `0x000154` | `0x00224C` |  |
| `0x000158` | `0x00224C` |  |
| `0x00015C` | `0x002288` |  |
| `0x000160` | `0x00228A` |  |
| `0x000164` | `0x002293` |  |
| `0x000168` | `0x00229D` |  |
| `0x00016C` | `0x0022B8` |  |
| `0x000170` | `0x0022F0` |  |
| `0x000174` | `0x002301` |  |
| `0x000178` | `0x0022F9` | shift-left variant |
| `0x00017C` | `0x002313` |  |
| `0x000180` | `0x00230B` | left-shift |
| `0x000184` | `0x002338` |  |
| `0x000188` | `0x002330` | right-shift |
| `0x00018C` | `0x002355` |  |
| `0x000190` | `0x002361` |  |
| `0x000194` | `0x00236D` |  |
| `0x000198` | `0x002374` |  |
| `0x00019C` | `0x00239E` |  |
| `0x0001A0` | `0x00238F` |  |
| `0x0001A4` | `0x0023A4` |  |
| `0x0001A8` | `0x0023AD` |  |
| `0x0001AC` | `0x0023AD` |  |
| `0x0001B0` | `0x0023C3` |  |
| `0x0001B4` | `0x0023D7` |  |
| `0x0001B8` | `0x002406` |  |
| `0x0001BC` | `0x002418` |  |
| `0x0001C0` | `0x00243C` |  |
| `0x0001C4` | `0x00244B` |  |
| `0x0001C8` | `0x00245A` |  |
| `0x0001CC` | `0x00245A` |  |
| `0x0001D0` | `0x0024C7` |  |
| `0x0001D4` | `0x0024D4` |  |
| `0x0001D8` | `0x0024DE` |  |
| `0x0001DC` | `0x0024E7` |  |
| `0x0001E0` | `0x002512` |  |
| `0x0001E4` | `0x002522` |  |
| `0x0001E8` | `0x002531` |  |
| `0x0001EC` | `0x002553` |  |
| `0x0001F0` | `0x0025AC` |  |
| `0x0001F4` | `0x0025BB` |  |
| `0x0001F8` | `0x0025CA` |  |
| `0x0001FC` | `0x0025D6` |  |
| `0x000200` | `0x0025DF` |  |
| `0x000204` | `0x0025E8` | post-walk predicate/helper |
| `0x000208` | `0x0025F5` |  |
| `0x00020C` | `0x00260F` |  |
| `0x000210` | `0x002623` | `_seqcase` |
| `0x000214` | `0x00265B` |  |
| `0x000218` | `0x002696` |  |
| `0x00021C` | `0x0026A5` |  |
| `0x000220` | `0x0026B1` |  |
| `0x000224` | `0x0026BD` |  |
| `0x000228` | `0x0026BD` |  |
| `0x00022C` | `0x00228A` |  |
| `0x000230` | `0x002293` |  |
| `0x000234` | `0x0026D2` |  |
| `0x000238` | `0x0026DB` |  |
| `0x00023C` | `0x0026F5` |  |
| `0x000240` | `0x002711` |  |
| `0x000244` | `0x002709` |  |
| `0x000248` | `0x002723` |  |
| `0x00024C` | `0x00271B` |  |
| `0x000250` | `0x002738` |  |
| `0x000254` | `0x002730` |  |
| `0x000258` | `0x002745` |  |
| `0x00025C` | `0x002754` |  |
| `0x000260` | `0x002763` |  |
| `0x000264` | `0x00276B` | `_stoiu` |
| `0x000268` | `0x002771` |  |
| `0x00026C` | `0x0034EE` |  |
| `0x000270` | `0x003569` |  |
| `0x000274` | `0x0035C8` |  |
| `0x000278` | `0x0035E5` |  |
| `0x00027C` | `0x003663` |  |
| `0x000280` | `0x00380D` |  |
| `0x000284` | `0x003704` |  |
| `0x000288` | `0x00372B` |  |
| `0x00028C` | `0x0037EB` |  |
| `0x000290` | `0x0037FC` |  |
| `0x000294` | `0x003565` |  |
| `0x000298` | `0x003818` |  |
| `0x00029C` | `0x00388B` |  |
| `0x0002A0` | `0x0038A9` |  |
| `0x0002A4` | `0x0038ED` |  |
| `0x0002A8` | `0x0038BA` |  |
| `0x0002AC` | `0x003931` |  |
| `0x0002B0` | `0x0038D8` |  |
| `0x0002B4` | `0x00396D` |  |
| `0x0002B8` | `0x00399C` |  |
| `0x0002BC` | `0x0039E1` |  |
| `0x0002C0` | `0x0039BD` |  |
| `0x0002C4` | `0x0039C7` |  |
| `0x0002C8` | `0x003A05` |  |
| `0x0002CC` | `0x003A89` |  |
| `0x0002D0` | `0x001713` |  |
| `0x0002D4` | `0x000FB0` |  |
| `0x0002D8` | `0x000E4D` |  |
| `0x0002DC` | `0x000E3D` |  |
| `0x0002E0` | `0x000FC0` |  |
| `0x0002E4` | `0x000FB0` |  |
| `0x0002E8` | `0x001D94` |  |
| `0x0002EC` | `0x001DB1` |  |
| `0x0002F0` | `0x000DD7` |  |
| `0x0002F4` | `0x000DDD` |  |
| `0x0002F8` | `0x000DD8` |  |
| `0x0002FC` | `0x01586C` |  |

## Bottom line

- The seven `0x0391DC` low-ROM calls are genuine veneer thunks, each implemented as a single `JP`.
- The wrapper table is not limited to the seven addresses from session 432; it is a large exported veneer strip occupying `0x000080..0x0002FC`.
- `0x03xxxx` prefers the veneer strip while `0x00xxxx` prefers direct helper calls, so the most defensible explanation is a fixed low-ROM import ABI for mirrored higher-ROM code, not an instruction-range constraint.
