# Phase 311: Certificate Region Deep Dive (0x3B0001-0x3C0000)

## Executive Summary

The certificate region at `0x3B0001..0x3C0000` is a TLV (Type-Length-Value) structure stored in flash containing 6 fields in 58 bytes, followed by a 0xFF end marker and 65,477 bytes of erased flash. The field encoding uses a 2-byte header (type + size code) with optional extended size bytes, followed by the payload. All 17 certificate helper vectors from `ti84pceg.inc` have been cross-referenced; 16 of 17 are actively called in this ROM.

## 1. Field Structure Format

```
Byte 0:    high byte of field type
Byte 1:    bits [7:4] = low nibble of field type
           bits [3:0] = size encoding:
             0x00..0x0C: inline size (0-12 bytes)
             0x0D:       next 1 byte is the size
             0x0E:       next 2 bytes (big-endian) are the size
             0x0F:       next 3 bytes (big-endian) are the size
Payload:   <size> bytes
Terminator: 0xFF byte ends the field list
```

Type reconstruction: `type = (byte0 << 8) | (byte1 & 0xF0)`

## 2. Complete Field Catalog

| Field addr | Type | Name | Payload addr | Size | Hex payload | Interpretation |
|------------|------|------|-------------|------|-------------|----------------|
| `0x3B0001` | `0x0330` | Calc string / product name | `0x3B0004` | 24 | `04 05 13 00 D8 56 A8 04 2D 0E 4D 69 6C 65 73 60 20 63 61 6C 63 20 20 00` | Mixed binary + ASCII: "Miles` calc" substring |
| `0x3B001C` | `0x0340` | Hardware revision | `0x3B001F` | 1 | `00` | HW rev 0 |
| `0x3B0020` | `0x0350` | Boot code version | `0x3B0023` | 3 | `04 00 00` | Boot v4.0.0 |
| `0x3B0026` | `0x0B00` | Serial number | `0x3B0029` | 8 | `45 4E 47 4C 49 53 48 00` | "ENGLISH\0" |
| `0x3B0031` | `0x0C00` | Device descriptor / feature flags | `0x3B0033` | 3 | `00 00 00` | All features disabled |
| `0x3B0036` | `0x0370` | OS version | `0x3B0038` | 3 | `02 08 05` | OS v2.8.5 (= 5.8.2 in TI's display order) |

End marker: `0x3B003B = 0xFF`. Everything from `0x3B003B` to `0x3C0000` is erased flash (all 0xFF).

## 3. Field Interpretations

### 0x0330 - Product Name (24 bytes)

The first 12 bytes are binary (likely a cryptographic prefix or padding), followed by the ASCII substring "Miles` calc  \0". This is the string returned by `boot.GetCertCalcString` (`0x000338`). The binary prefix suggests this ROM dump came from a specific unit whose certificate was written at manufacturing time.

### 0x0340 - Hardware Revision (1 byte)

Single byte `0x00`. Accessed by two call sites (`0x0283C3`, `0x028463`) that look up the HW revision for model identification.

### 0x0350 - Boot Code Version (3 bytes)

`04 00 00` = boot version 4.0.0. Read by `FindAppHeaderTimestamp` consumers and version-checking code.

### 0x0B00 - Serial Number (8 bytes)

ASCII "ENGLISH\0". This is clearly a placeholder/test serial (or a language identifier repurposed into the serial field). Returned by `GetSerial` (`0x000340`). Two call sites (`0x0246DB`, `0x0282A1`) look up this field for device identification.

### 0x0C00 - Device Descriptor (3 bytes)

All zeros (`00 00 00`). This is the field decoded in phase 310:
- `byte0` = `0x00`: all feature flags clear (bits 0-5 tested by `setClassResult`)
- `byte1` = `0x00`: no subtype (bit7 clear), no external lookup (bit2 clear)
- `byte2` = `0x00`: unused by known callers

Three call sites (`0x042065`, `0x04211B`, `0x0421AB`) look up field `0x0C00`. The descriptor getter at `0x0421A7` is the primary consumer.

### 0x0370 - OS Version (3 bytes)

`02 08 05`. In TI's display convention this is OS 5.8.2 (bytes are stored in reverse order vs. the marketing version). Consistent with ROM filename "OS 5.8.2.0029".

## 4. Certificate Helper Vector Usage

From `ti84pceg.inc`, all certificate-related vectors and their ROM usage:

| Vector | Name | Callers |
|--------|------|---------|
| `0x0002EC` | CleanupCertificate | 3 |
| `0x000308` | ChkCertSpace | 2 |
| `0x00030C` | GetFieldSizeFromType | 17 |
| `0x000310` | FindFirstCertField | 14 |
| `0x000314` | FindField | 9 |
| `0x000318` | FindNextField | 1 |
| `0x00031C` | GetCertificateEnd | 2 |
| `0x000320` | GetFieldSizeFromType_ | 0 |
| `0x000324` | GetFieldFromSize | 2 |
| `0x000328` | NextFieldFromSize | 3 |
| `0x00032C` | NextFieldFromType | 11 |
| `0x000330` | GetOffsetToNextField | 2 |
| `0x000338` | boot.GetCertCalcString | 3 |
| `0x00033C` | boot.GetCertCalcID | 5 |
| `0x000340` | GetSerial | 1 |
| `0x000368` | FindAppHeaderSubField | 1 |
| `0x000370` | FindAppHeaderTimestamp | 1 |

`GetFieldSizeFromType_` (`0x000320`) is the only vector with zero callers in this ROM -- it may be an alternate entry point or deprecated.

## 5. FindFirstCertField Caller Analysis

14 call sites resolved. Field types requested by callers:

| Field type | Name | Callers |
|-----------|------|---------|
| `0x0330` | Calc string | `0x0280BE`, `0x02849C` |
| `0x0340` | HW revision | `0x0283C3`, `0x028463` |
| `0x0B00` | Serial | `0x0246DB`, `0x0282A1` |
| `0x0C00` | Descriptor | `0x042065`, `0x04211B`, `0x0421AB` |
| `0x0C10` | Class list | `0x0422C4`, `0x042307` |
| `0x0300` | (unknown) | `0x028227` |
| `0x0230` | (unknown) | `0x02823C` |
| (dynamic) | via register | `0x046DD9` |

Field `0x0C10` (device class list) is searched for but does NOT exist in this ROM -- both callers handle the miss path. Field `0x0300` and `0x0230` are also searched but absent; they may appear in other ROM versions or app certificates.

## 6. Additional Field Types Referenced via FindField (0x000314)

The `FindField` vector is called with these additional type IDs (passed in DE, used after a `GetFieldSizeFromType` has already positioned within the cert structure):

- `0x8120` at `0x025441`
- `0x0400` at `0x028193`
- `0x0230` at `0x0281CB`, `0x0424E8`, `0x046E66`
- `0x0430` at `0x0284AA`
- `0x8010` at `0x09ECBF`

These represent sub-field lookups within app headers or nested certificate structures, not fields in the OS certificate region itself.

## 7. Transpile Implications

For the transpiler, the certificate region is read-only ROM data. The key insight is:

1. The TLV parser (`FindFirstCertField` and friends) does not need to be fully emulated -- the ROM image already contains the certificate data. Any code that calls these vectors simply needs the correct field data returned.

2. The `0x0C00` descriptor being all-zeros means all feature tests via `setClassResult` return false in this ROM. This simplifies emulation -- no special hardware capabilities are advertised.

3. The serial "ENGLISH" and product string content suggest this is either a development ROM or a ROM dump where the certificate was not fully personalized. This is not functionally relevant for transpilation.

4. OS version `2.8.5` (displayed as 5.8.2) matches the ROM filename and can be used to validate version-checking code paths.

## Artifacts

- `probe-phase311-cert-region.mjs` -- runnable probe (Node.js ESM)
- This report
