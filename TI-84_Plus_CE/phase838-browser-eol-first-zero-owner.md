# Phase 838 Browser EOL First Zero Owner

Probe: `probe-phase838-browser-eol-first-zero-owner.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase838-browser-eol-first-zero-owner.mjs`

Serves an instrumented in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, injects the smallest Phase 836 reproducer (`D0243A=0xD1A8F8`), dispatches browser EOL (`Escape`), and stops when `D0243A/D0243D/D02590` first become zero. The real shell file is not edited.

## Result

- The probe stopped at the first pointer-triple zero: block 4986, pc 0x0A31A2, prevPc 0x0A31E2, fields D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000.
- Inference: owned by the previously executed block 0x0A31E2; 0x0A31A2 is the first observed entry after the clear. The injected observer runs from the shell's onBlock callback before each lifted block executes, so a live state after 0x0A31E2 and zero state on entry to 0x0A31A2 assigns the write to the previous block.
- Hits before stop: 0x0A31E2=1, 0x0A31A2=1, 0x0A229D=0, 0x08F54B=0, 0x0018F8=0.
- Bounded route: termination=control_pre_stop, steps=4995, wipes=0; first wipe after the early stop was not observed.

## Case

| Case | Writes | Classification | Termination | Steps | Wipes | Control PC | Post D0243A | Post D0243D | Post D007CA | Post D02590 |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| D0243A_engine_cursor_only | D0243A=0xD1A8F8 | EARLY_POINTER_ZERO | control_pre_stop | 4995 | 0 | 0x000000 | 0x000000 | 0x000000 | 0x0585E9 | 0x000000 |

## Owner Finding

First pointer-triple zero: block 4986, pc 0x0A31A2, prevPc 0x0A31E2, fields D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000.

Conclusion: owned by the previously executed block 0x0A31E2; 0x0A31A2 is the first observed entry after the clear.

Stack at the zero point:

| Slot | Address | Value |
| ---: | --- | --- |
| 0 | 0xD1A818 | 0x000040 |
| 1 | 0xD1A81B | 0x0A323A |
| 2 | 0xD1A81E | 0x000044 |
| 3 | 0xD1A821 | 0xD1A860 |
| 4 | 0xD1A824 | 0xD02504 |
| 5 | 0xD1A827 | 0xD00595 |
| 6 | 0xD1A82A | 0x000100 |
| 7 | 0xD1A82D | 0x00FF38 |

CPU at the zero point:

```json
{
  "pc": 668066,
  "sp": 13740056,
  "af": 1664,
  "bc": 0,
  "de": 13635117,
  "hl": 13634317,
  "ix": 13640964,
  "iy": 13631616,
  "f": 128,
  "halted": false,
  "madl": 1,
  "stepCount": 4996
}
```

## Target Hits

| Target | Hits |
| --- | ---: |
| controlPreStop0A229D | 0 |
| engine08F54B | 0 |
| zeroPrev0A31E2 | 1 |
| zeroEntry0A31A2 | 1 |
| cleanup0018F8 | 0 |
| prewipe001879 | 0 |
| low000862 | 0 |
| low000A92 | 0 |
| low03D044 | 11 |
| caller058A16 | 0 |
| spaceFill0A2A37 | 7 |
| tokenOuter08F3B8 | 0 |

## 0x0A31xx Neighborhood

| Block | PC | Prev PC | Fields | CPU |
| ---: | --- | --- | --- | --- |
| 4970 | 0x0A321D | 0x0A20EA | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A830 AF=0xFF38 BC=0x000100 DE=0xD00595 HL=0xD02504 |
| 4972 | 0x0A31FD | 0x0A322B | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A81B AF=0x0044 BC=0x000100 DE=0xD00595 HL=0xD02504 |
| 4973 | 0x0A3205 | 0x0A31FD | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A81B AF=0xFFBA BC=0x000100 DE=0xD00595 HL=0xD02504 |
| 4975 | 0x0A3216 | 0x0A2D4C | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A81B AF=0x2520 BC=0x00EC00 DE=0xD00595 HL=0x0013EC |
| 4978 | 0x0A31F6 | 0x0A314D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A80F AF=0x0040 BC=0x00EC14 DE=0xD02495 HL=0x001314 |
| 4980 | 0x0A31A6 | 0x0A3158 | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A80F AF=0x0090 BC=0x00EC14 DE=0xD02495 HL=0x003200 |
| 4981 | 0x0A31F6 | 0x0A31A6 | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A80C AF=0x0020 BC=0x00EC14 DE=0xD02495 HL=0x003225 |
| 4982 | 0x0A31AC | 0x0A31F6 | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A80F AF=0x0020 BC=0x00EC14 DE=0xD02495 HL=0x005C80 |
| 4983 | 0x0A31F6 | 0x0A31AC | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A80C AF=0x0020 BC=0x00EC14 DE=0xD45C7F HL=0xD400EC |
| 4984 | 0x0A31B8 | 0x0A31F6 | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A80F AF=0x0020 BC=0x00EC14 DE=0xD45C7F HL=0x024E00 |
| 4985 | 0x0A31E2 | 0x0A31B8 | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 | SP=0xD1A815 AF=0x0654 BC=0x00EC14 DE=0xD031F6 HL=0x000117 |
| 4986 | 0x0A31A2 | 0x0A31E2 | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0x000000, D0243D=0x000000, D02590=0x000000, D02A40=0x000000, D00595=0x00, D00596=0x19, D00587=0x00, D0058C=0x09, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x004E06, D01150=0x000000, D0059A=0x00 | SP=0xD1A818 AF=0x0680 BC=0x000000 DE=0xD00E2D HL=0xD00B0D |

## Wipes

First wipe: not observed.

| # | Block | PC | Prev PC | Stack owner return | Prior wipe count | Fields |
| ---: | ---: | --- | --- | --- | ---: | --- |
| - | - | - | - | - | - | - |

## Field Zero Points

First pointer-triple zero: block 4986, pc 0x0A31A2, prevPc 0x0A31E2, fields D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000.

First all-zero: not observed.

| Field | Timing | Block | PC | Prev PC | Value |
| --- | --- | ---: | --- | --- | --- |
| D0243A | entry-vs-previous-block | 4986 | 0x0A31A2 | 0x0A31E2 | 0xD1A8F7 -> 0x000000 |
| D0243D | entry-vs-previous-block | 4986 | 0x0A31A2 | 0x0A31E2 | 0xD2A83D -> 0x000000 |
| D02590 | entry-vs-previous-block | 4986 | 0x0A31A2 | 0x0A31E2 | 0xD3FE81 -> 0x000000 |

## Top Repeated PCs

| PC | Count |
| --- | ---: |
| 0x0A19A4 | 560 |
| 0x0A1A83 | 160 |
| 0x0A3408 | 96 |
| 0x0A3404 | 96 |
| 0x0A1854 | 80 |
| 0x0A187C | 80 |
| 0x0A188A | 80 |
| 0x0A189E | 80 |
| 0x0A18A6 | 80 |
| 0x0A18AF | 80 |
| 0x0A18C1 | 80 |
| 0x0A18C4 | 80 |
| 0x0A18CA | 80 |
| 0x0A18E9 | 80 |
| 0x0A18EB | 80 |
| 0x0A190D | 80 |
| 0x0A191F | 80 |
| 0x0A1939 | 80 |
| 0x0A1969 | 80 |
| 0x0A1976 | 80 |

## 120-PC History Before Pointer Zero

4867:0x001C81 4868:0x001C82 4869:0x001C48 4870:0x001C33 4871:0x001C38 4872:0x001C3C 4873:0x001C42 4874:0x006810 4875:0x006812 4876:0x001C4F 4877:0x001CA6 4878:0x001CC0 4879:0x001CCA 4880:0x001CE4 4881:0x001C54 4882:0x006816 4883:0x00681E 4884:0x006828 4885:0x001727 4886:0x000719 4887:0x00071D 4888:0x02010C 4889:0x03CF7D 4890:0x03CFA4 4891:0x03CFCF 4892:0x03CFD4 4893:0x03CFDB 4894:0x03CFE0 4895:0x03CFE5 4896:0x03CFEA 4897:0x03D029 4898:0x03D033 4899:0x03D038 4900:0x03D044 4901:0x03D1C3 4902:0x03D04C 4903:0x03D054 4904:0x03F994 4905:0x0003D4 4906:0x003CC2 4907:0x003CD4 4908:0x003CE0 4909:0x003CEE 4910:0x003CF3 4911:0x03F998 4912:0x03F99A 4913:0x03F9AB 4914:0x03F9AE 4915:0x03D058 4916:0x03D060 4917:0x03D0E0 4918:0x080259 4919:0x0800B2 4920:0x058D60 4921:0x058D89 4922:0x0589E9 4923:0x0589EF 4924:0x058A0C 4925:0x058A10 4926:0x058212 4927:0x0800B8 4928:0x058216 4929:0x05821D 4930:0x05E3E3 4931:0x05E3F5 4932:0x04C973 4933:0x05E3E7 4934:0x05E3E8 4935:0x04C973 4936:0x058221 4937:0x058A14 4938:0x058A2C 4939:0x0800B8 4940:0x058A30 4941:0x058A4C 4942:0x05E7CD 4943:0x05E242 4944:0x05E3E8 4945:0x04C973 4946:0x05E246 4947:0x05E247 4948:0x05E3EC 4949:0x04C973 4950:0x05E24C 4951:0x05E250 4952:0x080064 4953:0x05E256 4954:0x05E26C 4955:0x05E7D1 4956:0x05E7D2 4957:0x0A2B72 4958:0x0A2A68 4959:0x0A2AF9 4960:0x0A2B16 4961:0x0A2B51 4962:0x0A2B7E 4963:0x0A2B8F 4964:0x0A2BEB 4965:0x0A2C0C 4966:0x0A2C10 4967:0x0A20CC 4968:0x0A20E4 4969:0x0A20EA 4970:0x0A321D 4971:0x0A322B 4972:0x0A31FD 4973:0x0A3205 4974:0x0A2D4C 4975:0x0A3216 4976:0x0A3146 4977:0x0A314D 4978:0x0A31F6 4979:0x0A3158 4980:0x0A31A6 4981:0x0A31F6 4982:0x0A31AC 4983:0x0A31F6 4984:0x0A31B8 4985:0x0A31E2 4986:0x0A31A2

## Full JSON

```json
{
  "probe": "phase838-browser-eol-first-zero-owner",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:58971/browser-shell.html",
  "pass": true,
  "result": {
    "name": "D0243A_engine_cursor_only",
    "label": "D0243A engine cursor only",
    "writes": [
      {
        "field": "D0243A",
        "value": 13740280
      }
    ],
    "beforeInjection": {
      "editLine": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D00595": 0,
        "D00596": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 8549,
        "lastKey": null
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "traceRead": {
        "label": "beforeInjection",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": 6581,
          "sp": 13740134,
          "af": 4180,
          "bc": 0,
          "de": 13805589,
          "hl": 13740195,
          "ix": 13740128,
          "iy": 13631616,
          "f": 84,
          "halted": true,
          "madl": 1,
          "stepCount": 49473
        },
        "fields": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D02A40": 13805630,
          "D00595": 0,
          "D00596": 0,
          "D00587": 0,
          "D0058C": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D02A28": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D01150": 0,
          "D0059A": 0
        },
        "stackTop": [
          {
            "addr": 13740134,
            "value": 16777215
          },
          {
            "addr": 13740137,
            "value": 16777215
          },
          {
            "addr": 13740140,
            "value": 16777215
          },
          {
            "addr": 13740143,
            "value": 16777215
          },
          {
            "addr": 13740146,
            "value": 16777215
          },
          {
            "addr": 13740149,
            "value": 16777215
          },
          {
            "addr": 13740152,
            "value": 16777215
          },
          {
            "addr": 13740155,
            "value": 16777215
          }
        ],
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D00595": 0,
          "D00596": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 0
          },
          "vramCurrent": 8549,
          "lastKey": null
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 13805630,
            "D02A40": 13805630,
            "D02A28": 0
          }
        },
        "vram": 8549,
        "lastKey": null,
        "pageErrors": []
      },
      "status": "Coldboot complete. OS event loop is ready.",
      "pageErrors": [],
      "extra": {
        "stage": "beforeInjection"
      }
    },
    "traceStart": {
      "label": "start",
      "status": "Coldboot complete. OS event loop is ready.",
      "runtimeMode": "coldboot",
      "lastPc": 574257,
      "lastMode": "adl",
      "totalSteps": 637707,
      "cpu": {
        "pc": 6581,
        "sp": 13740134,
        "af": 4180,
        "bc": 0,
        "de": 13805589,
        "hl": 13740195,
        "ix": 13740128,
        "iy": 13631616,
        "f": 84,
        "halted": true,
        "madl": 1,
        "stepCount": 49473
      },
      "fields": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D02A40": 13805630,
        "D00595": 0,
        "D00596": 0,
        "D00587": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00080": 0,
        "D0009F": 0,
        "D02A28": 0,
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D01150": 0,
        "D0059A": 0
      },
      "stackTop": [
        {
          "addr": 13740134,
          "value": 16777215
        },
        {
          "addr": 13740137,
          "value": 16777215
        },
        {
          "addr": 13740140,
          "value": 16777215
        },
        {
          "addr": 13740143,
          "value": 16777215
        },
        {
          "addr": 13740146,
          "value": 16777215
        },
        {
          "addr": 13740149,
          "value": 16777215
        },
        {
          "addr": 13740152,
          "value": 16777215
        },
        {
          "addr": 13740155,
          "value": 16777215
        }
      ],
      "editLine": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D00595": 0,
        "D00596": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 8549,
        "lastKey": null
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8549,
      "lastKey": null,
      "pageErrors": []
    },
    "injection": {
      "ok": true,
      "before": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D02A40": 13805630,
        "D00595": 0,
        "D00596": 0,
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D01150": 0,
        "D0059A": 0,
        "D02A28": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ]
      },
      "after": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740280,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D02A40": 13805630,
        "D00595": 0,
        "D00596": 0,
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D01150": 0,
        "D0059A": 0,
        "D02A28": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ]
      },
      "writes": [
        {
          "field": "D0243A",
          "value": 13740280
        }
      ]
    },
    "preKey": {
      "editLine": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740280,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D00595": 0,
        "D00596": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 8549,
        "lastKey": null
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "traceRead": {
        "label": "afterInjection",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": 6581,
          "sp": 13740134,
          "af": 4180,
          "bc": 0,
          "de": 13805589,
          "hl": 13740195,
          "ix": 13740128,
          "iy": 13631616,
          "f": 84,
          "halted": true,
          "madl": 1,
          "stepCount": 49473
        },
        "fields": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740280,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D02A40": 13805630,
          "D00595": 0,
          "D00596": 0,
          "D00587": 0,
          "D0058C": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D02A28": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D01150": 0,
          "D0059A": 0
        },
        "stackTop": [
          {
            "addr": 13740134,
            "value": 16777215
          },
          {
            "addr": 13740137,
            "value": 16777215
          },
          {
            "addr": 13740140,
            "value": 16777215
          },
          {
            "addr": 13740143,
            "value": 16777215
          },
          {
            "addr": 13740146,
            "value": 16777215
          },
          {
            "addr": 13740149,
            "value": 16777215
          },
          {
            "addr": 13740152,
            "value": 16777215
          },
          {
            "addr": 13740155,
            "value": 16777215
          }
        ],
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740280,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D00595": 0,
          "D00596": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 0
          },
          "vramCurrent": 8549,
          "lastKey": null
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 13805630,
            "D02A40": 13805630,
            "D02A28": 0
          }
        },
        "vram": 8549,
        "lastKey": null,
        "pageErrors": []
      },
      "status": "Coldboot complete. OS event loop is ready.",
      "pageErrors": [],
      "extra": {
        "stage": "afterInjection",
        "injection": {
          "ok": true,
          "before": {
            "D007CA": 361961,
            "D008E0": 0,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0,
            "D02A28": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ]
          },
          "after": {
            "D007CA": 361961,
            "D008E0": 0,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0,
            "D02A28": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ]
          },
          "writes": [
            {
              "field": "D0243A",
              "value": 13740280
            }
          ]
        }
      }
    },
    "classification": {
      "classification": "EARLY_POINTER_ZERO",
      "checks": {
        "code": true,
        "label": true,
        "controlPreStopPc": true,
        "controlPreStopLabel": true,
        "termination": true,
        "controlStopPc": false,
        "stoppedBeforeControlClear": false,
        "uiClearApplied": false,
        "noWipes": true,
        "D007CA": true,
        "D02590": false,
        "vramPreserved": true,
        "noPageErrors": true
      },
      "preStop0A229D": false,
      "engine08F54B": false,
      "tupleCoreSignal": false,
      "tupleDiffs": {
        "D02A1B": {
          "before": 0,
          "after": 19974
        },
        "D0243D": {
          "before": 13805630,
          "after": 0
        },
        "D02A40": {
          "before": 13805630,
          "after": 0
        }
      },
      "hasTupleRestoreLog": false,
      "low006D": false,
      "missing202020": false
    },
    "state": {
      "status": "Key: CLEAR → 4995 steps (control_pre_stop, peak 0px)",
      "scanText": "0x00",
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 664221,
        "controlPreStopLabel": "clear-eol-bc-zero-owner",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": null,
        "controlStopPc": null,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 4995,
        "termination": "control_pre_stop",
        "wipes": 0,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 361961,
        "D008E0": 13740131,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 0,
        "vramCurrent": 10825
      },
      "diagnostics": {
        "D007CA": 361961,
        "D008E0": 13740131,
        "D0243A": 0,
        "D0243D": 0,
        "D02590": 0,
        "D00595": 0,
        "D00596": 25,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 420
        },
        "vramCurrent": 10825,
        "lastKey": {
          "code": "Escape",
          "label": "CLEAR",
          "expectedInsertByte": null,
          "controlPreStopPc": 664221,
          "controlPreStopLabel": "clear-eol-bc-zero-owner",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": null,
          "controlStopPc": null,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "steps": 4995,
          "termination": "control_pre_stop",
          "wipes": 0,
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 361961,
          "D008E0": 13740131,
          "D02590": 0,
          "D000C2": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 0,
          "vramCurrent": 10825
        }
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 19974,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D02A40": 0,
          "D02A28": 0
        }
      },
      "logText": "Click Boot to load ROM (~15 MB compressed)--- Decoding ROM (145932 blocks, 17.0149% coverage) ------ Coldboot Phase 1: Z80 cold boot (0x000000, 20K steps) ------ Phase 1 done: 20000 steps, max_steps at 0x001cc0 ------ Coldboot Phase 2: Kernel init (0x08C331, 100K steps) ------ Phase 2 done: 100000 steps, max_steps at 0x000a92 ------ Coldboot Phase 3: Post-init (0x0802B2, 100 steps) ------ Phase 3 done: 100 steps, max_steps at 0x0158bc ------ Coldboot Phase 4: Warm idle continuation (0x0019be, 1.5M step cap) ------ Phase 4 done: 192290 steps, halt at 0x0019b5 ------ Coldboot Phase 5: Launch-home init (0x09dd62, 300K step cap) ------ Phase 5 done: 275843 steps, halt at 0x0019b5 (VAT snapshot captured) ------ Coldboot Phase 6: Home repaint (0x058241, 300K step cap) ------ Phase 6 done: 49474 steps, halt at 0x0019b5; D007CA=0x0585e9, VAT=0xd3fe81, VRAM=8549px ------ Edit context seeded (cursor=0xD1A8CC, ready for typed input) ------ Coldboot seeded (entry=0x08c331, halt=0x0019b5, SP=0xd1a866, IY=0xD00080, timerInterrupt=true) ---Re-armed D007CA for next keypress",
      "pageErrors": [],
      "preKey": {
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740280,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D00595": 0,
          "D00596": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 0
          },
          "vramCurrent": 8549,
          "lastKey": null
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 13805630,
            "D02A40": 13805630,
            "D02A28": 0
          }
        },
        "status": "Coldboot complete. OS event loop is ready.",
        "injection": {
          "ok": true,
          "before": {
            "D007CA": 361961,
            "D008E0": 0,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0,
            "D02A28": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ]
          },
          "after": {
            "D007CA": 361961,
            "D008E0": 0,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0,
            "D02A28": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ]
          },
          "writes": [
            {
              "field": "D0243A",
              "value": 13740280
            }
          ]
        }
      }
    },
    "traceRecord": {
      "label": "D0243A engine cursor only",
      "start": {
        "label": "start",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": 6581,
          "sp": 13740134,
          "af": 4180,
          "bc": 0,
          "de": 13805589,
          "hl": 13740195,
          "ix": 13740128,
          "iy": 13631616,
          "f": 84,
          "halted": true,
          "madl": 1,
          "stepCount": 49473
        },
        "fields": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D02A40": 13805630,
          "D00595": 0,
          "D00596": 0,
          "D00587": 0,
          "D0058C": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D02A28": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D01150": 0,
          "D0059A": 0
        },
        "stackTop": [
          {
            "addr": 13740134,
            "value": 16777215
          },
          {
            "addr": 13740137,
            "value": 16777215
          },
          {
            "addr": 13740140,
            "value": 16777215
          },
          {
            "addr": 13740143,
            "value": 16777215
          },
          {
            "addr": 13740146,
            "value": 16777215
          },
          {
            "addr": 13740149,
            "value": 16777215
          },
          {
            "addr": 13740152,
            "value": 16777215
          },
          {
            "addr": 13740155,
            "value": 16777215
          }
        ],
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D00595": 0,
          "D00596": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 0
          },
          "vramCurrent": 8549,
          "lastKey": null
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 13805630,
            "D02A40": 13805630,
            "D02A28": 0
          }
        },
        "vram": 8549,
        "lastKey": null,
        "pageErrors": []
      },
      "end": {
        "label": "end",
        "status": "Key: CLEAR → 4995 steps (control_pre_stop, peak 0px)",
        "runtimeMode": "coldboot",
        "lastPc": 668130,
        "lastMode": "adl",
        "totalSteps": 642702,
        "cpu": {
          "pc": 668066,
          "sp": 13740056,
          "af": 1664,
          "bc": 0,
          "de": 13635117,
          "hl": 13634317,
          "ix": 13640964,
          "iy": 13631616,
          "f": 128,
          "halted": false,
          "madl": 1,
          "stepCount": 4996
        },
        "fields": {
          "D007CA": 361961,
          "D008E0": 13740131,
          "D0243A": 0,
          "D0243D": 0,
          "D02590": 0,
          "D02A40": 0,
          "D00595": 0,
          "D00596": 25,
          "D00587": 0,
          "D0058C": 9,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D02A28": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 19974,
          "D01150": 0,
          "D0059A": 0
        },
        "stackTop": [
          {
            "addr": 13740056,
            "value": 64
          },
          {
            "addr": 13740059,
            "value": 668218
          },
          {
            "addr": 13740062,
            "value": 68
          },
          {
            "addr": 13740065,
            "value": 13740128
          },
          {
            "addr": 13740068,
            "value": 13640964
          },
          {
            "addr": 13740071,
            "value": 13632917
          },
          {
            "addr": 13740074,
            "value": 256
          },
          {
            "addr": 13740077,
            "value": 65336
          }
        ],
        "editLine": {
          "D007CA": 361961,
          "D008E0": 13740131,
          "D0243A": 0,
          "D0243D": 0,
          "D02590": 0,
          "D00595": 0,
          "D00596": 25,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 420
          },
          "vramCurrent": 10825,
          "lastKey": {
            "code": "Escape",
            "label": "CLEAR",
            "expectedInsertByte": null,
            "controlPreStopPc": 664221,
            "controlPreStopLabel": "clear-eol-bc-zero-owner",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 4995,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 361961,
            "D008E0": 13740131,
            "D02590": 0,
            "D000C2": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 0,
            "vramCurrent": 10825
          }
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 0,
            "D02A40": 0,
            "D02A28": 0
          }
        },
        "vram": 10825,
        "lastKey": {
          "code": "Escape",
          "label": "CLEAR",
          "expectedInsertByte": null,
          "controlPreStopPc": 664221,
          "controlPreStopLabel": "clear-eol-bc-zero-owner",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": null,
          "controlStopPc": null,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "steps": 4995,
          "termination": "control_pre_stop",
          "wipes": 0,
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 361961,
          "D008E0": 13740131,
          "D02590": 0,
          "D000C2": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 0,
          "vramCurrent": 10825
        },
        "pageErrors": []
      },
      "totalBlocks": 4986,
      "prevPc": "0x0A31E2",
      "lastPcs": [
        {
          "block": 4867,
          "pc": "0x001C81",
          "prevPc": "0x001CE4"
        },
        {
          "block": 4868,
          "pc": "0x001C82",
          "prevPc": "0x001C81"
        },
        {
          "block": 4869,
          "pc": "0x001C48",
          "prevPc": "0x001C82"
        },
        {
          "block": 4870,
          "pc": "0x001C33",
          "prevPc": "0x001C48"
        },
        {
          "block": 4871,
          "pc": "0x001C38",
          "prevPc": "0x001C33"
        },
        {
          "block": 4872,
          "pc": "0x001C3C",
          "prevPc": "0x001C38"
        },
        {
          "block": 4873,
          "pc": "0x001C42",
          "prevPc": "0x001C3C"
        },
        {
          "block": 4874,
          "pc": "0x006810",
          "prevPc": "0x001C42"
        },
        {
          "block": 4875,
          "pc": "0x006812",
          "prevPc": "0x006810"
        },
        {
          "block": 4876,
          "pc": "0x001C4F",
          "prevPc": "0x006812"
        },
        {
          "block": 4877,
          "pc": "0x001CA6",
          "prevPc": "0x001C4F"
        },
        {
          "block": 4878,
          "pc": "0x001CC0",
          "prevPc": "0x001CA6"
        },
        {
          "block": 4879,
          "pc": "0x001CCA",
          "prevPc": "0x001CC0"
        },
        {
          "block": 4880,
          "pc": "0x001CE4",
          "prevPc": "0x001CCA"
        },
        {
          "block": 4881,
          "pc": "0x001C54",
          "prevPc": "0x001CE4"
        },
        {
          "block": 4882,
          "pc": "0x006816",
          "prevPc": "0x001C54"
        },
        {
          "block": 4883,
          "pc": "0x00681E",
          "prevPc": "0x006816"
        },
        {
          "block": 4884,
          "pc": "0x006828",
          "prevPc": "0x00681E"
        },
        {
          "block": 4885,
          "pc": "0x001727",
          "prevPc": "0x006828"
        },
        {
          "block": 4886,
          "pc": "0x000719",
          "prevPc": "0x001727"
        },
        {
          "block": 4887,
          "pc": "0x00071D",
          "prevPc": "0x000719"
        },
        {
          "block": 4888,
          "pc": "0x02010C",
          "prevPc": "0x00071D"
        },
        {
          "block": 4889,
          "pc": "0x03CF7D",
          "prevPc": "0x02010C"
        },
        {
          "block": 4890,
          "pc": "0x03CFA4",
          "prevPc": "0x03CF7D"
        },
        {
          "block": 4891,
          "pc": "0x03CFCF",
          "prevPc": "0x03CFA4"
        },
        {
          "block": 4892,
          "pc": "0x03CFD4",
          "prevPc": "0x03CFCF"
        },
        {
          "block": 4893,
          "pc": "0x03CFDB",
          "prevPc": "0x03CFD4"
        },
        {
          "block": 4894,
          "pc": "0x03CFE0",
          "prevPc": "0x03CFDB"
        },
        {
          "block": 4895,
          "pc": "0x03CFE5",
          "prevPc": "0x03CFE0"
        },
        {
          "block": 4896,
          "pc": "0x03CFEA",
          "prevPc": "0x03CFE5"
        },
        {
          "block": 4897,
          "pc": "0x03D029",
          "prevPc": "0x03CFEA"
        },
        {
          "block": 4898,
          "pc": "0x03D033",
          "prevPc": "0x03D029"
        },
        {
          "block": 4899,
          "pc": "0x03D038",
          "prevPc": "0x03D033"
        },
        {
          "block": 4900,
          "pc": "0x03D044",
          "prevPc": "0x03D038"
        },
        {
          "block": 4901,
          "pc": "0x03D1C3",
          "prevPc": "0x03D044"
        },
        {
          "block": 4902,
          "pc": "0x03D04C",
          "prevPc": "0x03D1C3"
        },
        {
          "block": 4903,
          "pc": "0x03D054",
          "prevPc": "0x03D04C"
        },
        {
          "block": 4904,
          "pc": "0x03F994",
          "prevPc": "0x03D054"
        },
        {
          "block": 4905,
          "pc": "0x0003D4",
          "prevPc": "0x03F994"
        },
        {
          "block": 4906,
          "pc": "0x003CC2",
          "prevPc": "0x0003D4"
        },
        {
          "block": 4907,
          "pc": "0x003CD4",
          "prevPc": "0x003CC2"
        },
        {
          "block": 4908,
          "pc": "0x003CE0",
          "prevPc": "0x003CD4"
        },
        {
          "block": 4909,
          "pc": "0x003CEE",
          "prevPc": "0x003CE0"
        },
        {
          "block": 4910,
          "pc": "0x003CF3",
          "prevPc": "0x003CEE"
        },
        {
          "block": 4911,
          "pc": "0x03F998",
          "prevPc": "0x003CF3"
        },
        {
          "block": 4912,
          "pc": "0x03F99A",
          "prevPc": "0x03F998"
        },
        {
          "block": 4913,
          "pc": "0x03F9AB",
          "prevPc": "0x03F99A"
        },
        {
          "block": 4914,
          "pc": "0x03F9AE",
          "prevPc": "0x03F9AB"
        },
        {
          "block": 4915,
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 4916,
          "pc": "0x03D060",
          "prevPc": "0x03D058"
        },
        {
          "block": 4917,
          "pc": "0x03D0E0",
          "prevPc": "0x03D060"
        },
        {
          "block": 4918,
          "pc": "0x080259",
          "prevPc": "0x03D0E0"
        },
        {
          "block": 4919,
          "pc": "0x0800B2",
          "prevPc": "0x080259"
        },
        {
          "block": 4920,
          "pc": "0x058D60",
          "prevPc": "0x0800B2"
        },
        {
          "block": 4921,
          "pc": "0x058D89",
          "prevPc": "0x058D60"
        },
        {
          "block": 4922,
          "pc": "0x0589E9",
          "prevPc": "0x058D89"
        },
        {
          "block": 4923,
          "pc": "0x0589EF",
          "prevPc": "0x0589E9"
        },
        {
          "block": 4924,
          "pc": "0x058A0C",
          "prevPc": "0x0589EF"
        },
        {
          "block": 4925,
          "pc": "0x058A10",
          "prevPc": "0x058A0C"
        },
        {
          "block": 4926,
          "pc": "0x058212",
          "prevPc": "0x058A10"
        },
        {
          "block": 4927,
          "pc": "0x0800B8",
          "prevPc": "0x058212"
        },
        {
          "block": 4928,
          "pc": "0x058216",
          "prevPc": "0x0800B8"
        },
        {
          "block": 4929,
          "pc": "0x05821D",
          "prevPc": "0x058216"
        },
        {
          "block": 4930,
          "pc": "0x05E3E3",
          "prevPc": "0x05821D"
        },
        {
          "block": 4931,
          "pc": "0x05E3F5",
          "prevPc": "0x05E3E3"
        },
        {
          "block": 4932,
          "pc": "0x04C973",
          "prevPc": "0x05E3F5"
        },
        {
          "block": 4933,
          "pc": "0x05E3E7",
          "prevPc": "0x04C973"
        },
        {
          "block": 4934,
          "pc": "0x05E3E8",
          "prevPc": "0x05E3E7"
        },
        {
          "block": 4935,
          "pc": "0x04C973",
          "prevPc": "0x05E3E8"
        },
        {
          "block": 4936,
          "pc": "0x058221",
          "prevPc": "0x04C973"
        },
        {
          "block": 4937,
          "pc": "0x058A14",
          "prevPc": "0x058221"
        },
        {
          "block": 4938,
          "pc": "0x058A2C",
          "prevPc": "0x058A14"
        },
        {
          "block": 4939,
          "pc": "0x0800B8",
          "prevPc": "0x058A2C"
        },
        {
          "block": 4940,
          "pc": "0x058A30",
          "prevPc": "0x0800B8"
        },
        {
          "block": 4941,
          "pc": "0x058A4C",
          "prevPc": "0x058A30"
        },
        {
          "block": 4942,
          "pc": "0x05E7CD",
          "prevPc": "0x058A4C"
        },
        {
          "block": 4943,
          "pc": "0x05E242",
          "prevPc": "0x05E7CD"
        },
        {
          "block": 4944,
          "pc": "0x05E3E8",
          "prevPc": "0x05E242"
        },
        {
          "block": 4945,
          "pc": "0x04C973",
          "prevPc": "0x05E3E8"
        },
        {
          "block": 4946,
          "pc": "0x05E246",
          "prevPc": "0x04C973"
        },
        {
          "block": 4947,
          "pc": "0x05E247",
          "prevPc": "0x05E246"
        },
        {
          "block": 4948,
          "pc": "0x05E3EC",
          "prevPc": "0x05E247"
        },
        {
          "block": 4949,
          "pc": "0x04C973",
          "prevPc": "0x05E3EC"
        },
        {
          "block": 4950,
          "pc": "0x05E24C",
          "prevPc": "0x04C973"
        },
        {
          "block": 4951,
          "pc": "0x05E250",
          "prevPc": "0x05E24C"
        },
        {
          "block": 4952,
          "pc": "0x080064",
          "prevPc": "0x05E250"
        },
        {
          "block": 4953,
          "pc": "0x05E256",
          "prevPc": "0x080064"
        },
        {
          "block": 4954,
          "pc": "0x05E26C",
          "prevPc": "0x05E256"
        },
        {
          "block": 4955,
          "pc": "0x05E7D1",
          "prevPc": "0x05E26C"
        },
        {
          "block": 4956,
          "pc": "0x05E7D2",
          "prevPc": "0x05E7D1"
        },
        {
          "block": 4957,
          "pc": "0x0A2B72",
          "prevPc": "0x05E7D2"
        },
        {
          "block": 4958,
          "pc": "0x0A2A68",
          "prevPc": "0x0A2B72"
        },
        {
          "block": 4959,
          "pc": "0x0A2AF9",
          "prevPc": "0x0A2A68"
        },
        {
          "block": 4960,
          "pc": "0x0A2B16",
          "prevPc": "0x0A2AF9"
        },
        {
          "block": 4961,
          "pc": "0x0A2B51",
          "prevPc": "0x0A2B16"
        },
        {
          "block": 4962,
          "pc": "0x0A2B7E",
          "prevPc": "0x0A2B51"
        },
        {
          "block": 4963,
          "pc": "0x0A2B8F",
          "prevPc": "0x0A2B7E"
        },
        {
          "block": 4964,
          "pc": "0x0A2BEB",
          "prevPc": "0x0A2B8F"
        },
        {
          "block": 4965,
          "pc": "0x0A2C0C",
          "prevPc": "0x0A2BEB"
        },
        {
          "block": 4966,
          "pc": "0x0A2C10",
          "prevPc": "0x0A2C0C"
        },
        {
          "block": 4967,
          "pc": "0x0A20CC",
          "prevPc": "0x0A2C10"
        },
        {
          "block": 4968,
          "pc": "0x0A20E4",
          "prevPc": "0x0A20CC"
        },
        {
          "block": 4969,
          "pc": "0x0A20EA",
          "prevPc": "0x0A20E4"
        },
        {
          "block": 4970,
          "pc": "0x0A321D",
          "prevPc": "0x0A20EA"
        },
        {
          "block": 4971,
          "pc": "0x0A322B",
          "prevPc": "0x0A321D"
        },
        {
          "block": 4972,
          "pc": "0x0A31FD",
          "prevPc": "0x0A322B"
        },
        {
          "block": 4973,
          "pc": "0x0A3205",
          "prevPc": "0x0A31FD"
        },
        {
          "block": 4974,
          "pc": "0x0A2D4C",
          "prevPc": "0x0A3205"
        },
        {
          "block": 4975,
          "pc": "0x0A3216",
          "prevPc": "0x0A2D4C"
        },
        {
          "block": 4976,
          "pc": "0x0A3146",
          "prevPc": "0x0A3216"
        },
        {
          "block": 4977,
          "pc": "0x0A314D",
          "prevPc": "0x0A3146"
        },
        {
          "block": 4978,
          "pc": "0x0A31F6",
          "prevPc": "0x0A314D"
        },
        {
          "block": 4979,
          "pc": "0x0A3158",
          "prevPc": "0x0A31F6"
        },
        {
          "block": 4980,
          "pc": "0x0A31A6",
          "prevPc": "0x0A3158"
        },
        {
          "block": 4981,
          "pc": "0x0A31F6",
          "prevPc": "0x0A31A6"
        },
        {
          "block": 4982,
          "pc": "0x0A31AC",
          "prevPc": "0x0A31F6"
        },
        {
          "block": 4983,
          "pc": "0x0A31F6",
          "prevPc": "0x0A31AC"
        },
        {
          "block": 4984,
          "pc": "0x0A31B8",
          "prevPc": "0x0A31F6"
        },
        {
          "block": 4985,
          "pc": "0x0A31E2",
          "prevPc": "0x0A31B8"
        },
        {
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2"
        }
      ],
      "hotBlocks": {
        "0x08C331": 1,
        "0x05C634": 3,
        "0x000038": 11,
        "0x0006F3": 11,
        "0x000704": 11,
        "0x000710": 11,
        "0x001713": 11,
        "0x0008BB": 11,
        "0x001717": 11,
        "0x001718": 11,
        "0x00171E": 11,
        "0x0067F8": 11,
        "0x001C4F": 22,
        "0x001CA6": 66,
        "0x001CC0": 66,
        "0x001CCA": 66,
        "0x001CCE": 11,
        "0x001CD5": 11,
        "0x001CE5": 11,
        "0x001C54": 22,
        "0x006808": 11,
        "0x001C33": 55,
        "0x001C38": 55,
        "0x001C3C": 55,
        "0x001C44": 44,
        "0x001C7D": 44,
        "0x001CE4": 55,
        "0x001C81": 44,
        "0x001C82": 44,
        "0x001C48": 44,
        "0x001C42": 11,
        "0x006810": 11,
        "0x006812": 11,
        "0x006816": 11,
        "0x00681E": 11,
        "0x006828": 11,
        "0x001727": 11,
        "0x000719": 11,
        "0x00071D": 11,
        "0x02010C": 11,
        "0x03CF7D": 11,
        "0x03CFA4": 11,
        "0x03CFCF": 11,
        "0x03CFD4": 11,
        "0x03CFDB": 11,
        "0x03CFE0": 11,
        "0x03CFE5": 11,
        "0x03CFEA": 11,
        "0x03D029": 11,
        "0x03D033": 11,
        "0x03D038": 11,
        "0x03D044": 11,
        "0x03D04C": 11,
        "0x03D054": 11,
        "0x03F994": 11,
        "0x0003D4": 11,
        "0x003CC2": 11,
        "0x003CD4": 11,
        "0x003CE0": 11,
        "0x003CEE": 11,
        "0x003CF3": 11,
        "0x03F998": 11,
        "0x03F99A": 11,
        "0x03F9AB": 11,
        "0x03F9AE": 11,
        "0x03D058": 11,
        "0x03D060": 11,
        "0x03D0E0": 11,
        "0x05C67C": 3,
        "0x08C339": 1,
        "0x06CE73": 1,
        "0x06CE7F": 1,
        "0x06CE7B": 1,
        "0x06C8AB": 1,
        "0x08C33D": 2,
        "0x0A349A": 2,
        "0x0A349F": 2,
        "0x0A32F9": 4,
        "0x0A3301": 2,
        "0x08C308": 4,
        "0x0A331E": 4,
        "0x0A336F": 4,
        "0x0A3383": 4,
        "0x0A338A": 4,
        "0x0A33FB": 16,
        "0x0A3408": 96,
        "0x0A3404": 96,
        "0x0A340F": 32,
        "0x0A3392": 4,
        "0x0A339A": 4,
        "0x0A33E6": 16,
        "0x0A33FF": 16,
        "0x0A33EE": 16,
        "0x0A3403": 16,
        "0x0A33A2": 4,
        "0x0A33AA": 4,
        "0x0A33B2": 4,
        "0x0A33BA": 4,
        "0x0A33C2": 4,
        "0x0A33CA": 4,
        "0x0A33DA": 4,
        "0x0A33E4": 2,
        "0x0A34AE": 2,
        "0x08C341": 2,
        "0x05C75B": 2,
        "0x05C760": 2,
        "0x05C768": 2,
        "0x05C771": 3,
        "0x05C795": 3,
        "0x05C7A5": 3,
        "0x05C7AD": 3,
        "0x05C7B5": 3,
        "0x05C7C1": 3,
        "0x05C7D7": 3,
        "0x05C7DD": 2,
        "0x05C7ED": 2,
        "0x05C815": 2,
        "0x0A237E": 7,
        "0x0A2A37": 7,
        "0x0A2389": 7,
        "0x05C819": 2,
        "0x05C82C": 3,
        "0x05C832": 3,
        "0x05E3D6": 3,
        "0x04C973": 8,
        "0x05C836": 3,
        "0x05C84D": 3,
        "0x05CA44": 3,
        "0x05CA4E": 3,
        "0x05CA57": 3,
        "0x05C851": 3,
        "0x05CBC0": 3,
        "0x05CBC3": 3,
        "0x05CBC9": 3,
        "0x05C855": 3,
        "0x05C875": 3,
        "0x05C87E": 3,
        "0x0A1799": 5,
        "0x0A17AA": 5,
        "0x0A17AE": 5,
        "0x0A17B2": 3,
        "0x0A17B8": 3,
        "0x07BF3E": 5,
        "0x07BF4D": 5,
        "0x07BF5C": 5,
        "0x000380": 5,
        "0x003D85": 5,
        "0x07BF61": 5,
        "0x0A17C5": 5,
        "0x0A2D4C": 6,
        "0x0A17D0": 5,
        "0x00038C": 5,
        "0x005A53": 5,
        "0x0A17E9": 5,
        "0x0A17EF": 5,
        "0x0A17F7": 5,
        "0x0A1805": 5,
        "0x0A180B": 5,
        "0x0A1838": 5,
        "0x0A1A8F": 5,
        "0x0A183D": 5,
        "0x0A184A": 5,
        "0x0A1854": 80,
        "0x0A187C": 80,
        "0x0A188A": 80,
        "0x0A189E": 80,
        "0x0A18A6": 80,
        "0x0A1A83": 160,
        "0x0A18AF": 80,
        "0x0A18C1": 80,
        "0x0A18C4": 80,
        "0x0A18CA": 80,
        "0x0A18E9": 80,
        "0x0A18EB": 80,
        "0x0A190D": 80,
        "0x0A191F": 80,
        "0x0A1939": 80,
        "0x0A1969": 80,
        "0x0A1976": 80,
        "0x0A1980": 80,
        "0x0A1988": 80,
        "0x0A1994": 80,
        "0x0A19A4": 560,
        "0x0A19AA": 80,
        "0x0A19B5": 80,
        "0x0A19B7": 80,
        "0x0A19D7": 80,
        "0x0A1A1D": 80,
        "0x0A1A30": 5,
        "0x05C883": 3,
        "0x08C345": 2,
        "0x08C34F": 1,
        "0x08C366": 2,
        "0x08C38A": 2,
        "0x08C3A0": 2,
        "0x05C689": 2,
        "0x05C696": 2,
        "0x05C6A6": 2,
        "0x05C6AE": 2,
        "0x05C6B6": 2,
        "0x05C6C2": 2,
        "0x05C6D3": 2,
        "0x05C6E6": 2,
        "0x05C6FC": 2,
        "0x0A17B6": 2,
        "0x05C700": 2,
        "0x08C3A8": 2,
        "0x0A27DD": 2,
        "0x0A27E7": 2,
        "0x03D1C3": 7,
        "0x03D1C9": 2,
        "0x0A32FF": 2,
        "0x0A3411": 48,
        "0x0A3418": 16,
        "0x03D1D1": 2,
        "0x0A27F9": 2,
        "0x0A1A36": 2,
        "0x08C3AC": 2,
        "0x08C3C3": 2,
        "0x08C3C9": 2,
        "0x08C3EE": 2,
        "0x08C3F2": 2,
        "0x084989": 2,
        "0x084998": 2,
        "0x0849A5": 2,
        "0x0849B3": 2,
        "0x0849B9": 2,
        "0x0849C4": 2,
        "0x089092": 2,
        "0x0849C8": 2,
        "0x0849CA": 2,
        "0x08909E": 2,
        "0x0849CE": 2,
        "0x0849D2": 2,
        "0x0890C2": 2,
        "0x0849D6": 2,
        "0x0849DA": 2,
        "0x0890AA": 2,
        "0x0849DE": 2,
        "0x0849E6": 2,
        "0x084B7F": 2,
        "0x084B82": 2,
        "0x0849EA": 2,
        "0x0849EE": 2,
        "0x0849F8": 2,
        "0x084ADF": 2,
        "0x084AE7": 2,
        "0x0849FC": 2,
        "0x084A00": 4,
        "0x0851D2": 4,
        "0x08C3F6": 2,
        "0x08C3FA": 2,
        "0x08C3FC": 2,
        "0x08C401": 2,
        "0x04E0E4": 2,
        "0x04E0E8": 2,
        "0x084AD6": 2,
        "0x04E0EC": 2,
        "0x04E0F0": 2,
        "0x04E0F4": 2,
        "0x08C405": 2,
        "0x08C407": 2,
        "0x08C413": 2,
        "0x08C417": 2,
        "0x08C41B": 2,
        "0x08C44D": 2,
        "0x08C59B": 2,
        "0x08C5A7": 2,
        "0x08C509": 2,
        "0x08C511": 2,
        "0x08C519": 2,
        "0x08C526": 2,
        "0x08C532": 2,
        "0x022331": 2,
        "0x000578": 3,
        "0x0158A6": 3,
        "0x022336": 2,
        "0x022344": 2,
        "0x08C536": 2,
        "0x08C72F": 2,
        "0x05622E": 2,
        "0x05623D": 2,
        "0x056244": 2,
        "0x056248": 2,
        "0x056253": 2,
        "0x08C734": 2,
        "0x08C745": 2,
        "0x0585E9": 2,
        "0x0585F8": 2,
        "0x0585F9": 2,
        "0x058602": 2,
        "0x05877A": 2,
        "0x0587A3": 2,
        "0x080259": 5,
        "0x0587A7": 2,
        "0x0587E9": 2,
        "0x058B73": 2,
        "0x0587F1": 2,
        "0x0587F3": 2,
        "0x05884C": 2,
        "0x058EDA": 2,
        "0x058850": 2,
        "0x05899D": 2,
        "0x058D54": 3,
        "0x058EC6": 3,
        "0x058D58": 3,
        "0x0800A8": 3,
        "0x0800AE": 3,
        "0x0800B2": 3,
        "0x058D60": 3,
        "0x058D89": 3,
        "0x0589A1": 2,
        "0x0589AE": 2,
        "0x0589B2": 1,
        "0x0581A3": 1,
        "0x0800B8": 3,
        "0x0581A7": 1,
        "0x0589B6": 1,
        "0x05E42A": 1,
        "0x05E37D": 1,
        "0x05E38A": 1,
        "0x05E432": 1,
        "0x0589BA": 1,
        "0x08C73D": 1,
        "0x08C53A": 1,
        "0x08C543": 1,
        "0x08C593": 1,
        "0x08C359": 1,
        "0x02FCB3": 1,
        "0x02FCB9": 1,
        "0x02FD8F": 1,
        "0x02FDA6": 1,
        "0x03013A": 1,
        "0x03013F": 1,
        "0x030145": 1,
        "0x03014B": 1,
        "0x030151": 1,
        "0x030157": 1,
        "0x02FDAC": 1,
        "0x05C76C": 1,
        "0x05C81E": 1,
        "0x02FDB6": 1,
        "0x03FA09": 1,
        "0x05C623": 2,
        "0x03FB9A": 1,
        "0x03FBC0": 1,
        "0x03FBC3": 1,
        "0x03FBE8": 1,
        "0x02FDC2": 1,
        "0x02FDC8": 1,
        "0x02FDD8": 1,
        "0x02FDE6": 1,
        "0x02FE89": 1,
        "0x02FE9D": 1,
        "0x02FEB7": 1,
        "0x02FECF": 1,
        "0x02FED7": 1,
        "0x02FEDF": 1,
        "0x02FEF3": 1,
        "0x02FF09": 1,
        "0x022346": 1,
        "0x02234B": 1,
        "0x022357": 1,
        "0x02FF1A": 1,
        "0x0302EB": 1,
        "0x0302F0": 1,
        "0x02FF1F": 1,
        "0x02FF23": 1,
        "0x02FFAE": 1,
        "0x02FFB7": 1,
        "0x02FFBF": 1,
        "0x02FFC4": 1,
        "0x02FFCC": 1,
        "0x02FFD2": 1,
        "0x02FFDA": 1,
        "0x02FFDE": 1,
        "0x02FFE3": 1,
        "0x02FFE7": 1,
        "0x02FFED": 1,
        "0x02FE84": 1,
        "0x030300": 1,
        "0x02FE88": 1,
        "0x02FCC6": 1,
        "0x02FCF9": 1,
        "0x02FCFD": 1,
        "0x02FCE0": 1,
        "0x0589BB": 1,
        "0x0589E5": 1,
        "0x0589E9": 1,
        "0x0589EF": 1,
        "0x058A0C": 1,
        "0x058A10": 1,
        "0x058212": 1,
        "0x058216": 1,
        "0x05821D": 1,
        "0x05E3E3": 1,
        "0x05E3F5": 1,
        "0x05E3E7": 1,
        "0x05E3E8": 2,
        "0x058221": 1,
        "0x058A14": 1,
        "0x058A2C": 1,
        "0x058A30": 1,
        "0x058A4C": 1,
        "0x05E7CD": 1,
        "0x05E242": 1,
        "0x05E246": 1,
        "0x05E247": 1,
        "0x05E3EC": 1,
        "0x05E24C": 1,
        "0x05E250": 1,
        "0x080064": 1,
        "0x05E256": 1,
        "0x05E26C": 1,
        "0x05E7D1": 1,
        "0x05E7D2": 1,
        "0x0A2B72": 1,
        "0x0A2A68": 1,
        "0x0A2AF9": 1,
        "0x0A2B16": 1,
        "0x0A2B51": 1,
        "0x0A2B7E": 1,
        "0x0A2B8F": 1,
        "0x0A2BEB": 1,
        "0x0A2C0C": 1,
        "0x0A2C10": 1,
        "0x0A20CC": 1,
        "0x0A20E4": 1,
        "0x0A20EA": 1,
        "0x0A321D": 1,
        "0x0A322B": 1,
        "0x0A31FD": 1,
        "0x0A3205": 1,
        "0x0A3216": 1,
        "0x0A3146": 1,
        "0x0A314D": 1,
        "0x0A31F6": 3,
        "0x0A3158": 1,
        "0x0A31A6": 1,
        "0x0A31AC": 1,
        "0x0A31B8": 1,
        "0x0A31E2": 1,
        "0x0A31A2": 1
      },
      "topHotBlocks": [
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0A1A83",
          "count": 160
        },
        {
          "pc": "0x0A3408",
          "count": 96
        },
        {
          "pc": "0x0A3404",
          "count": 96
        },
        {
          "pc": "0x0A1854",
          "count": 80
        },
        {
          "pc": "0x0A187C",
          "count": 80
        },
        {
          "pc": "0x0A188A",
          "count": 80
        },
        {
          "pc": "0x0A189E",
          "count": 80
        },
        {
          "pc": "0x0A18A6",
          "count": 80
        },
        {
          "pc": "0x0A18AF",
          "count": 80
        },
        {
          "pc": "0x0A18C1",
          "count": 80
        },
        {
          "pc": "0x0A18C4",
          "count": 80
        },
        {
          "pc": "0x0A18CA",
          "count": 80
        },
        {
          "pc": "0x0A18E9",
          "count": 80
        },
        {
          "pc": "0x0A18EB",
          "count": 80
        },
        {
          "pc": "0x0A190D",
          "count": 80
        },
        {
          "pc": "0x0A191F",
          "count": 80
        },
        {
          "pc": "0x0A1939",
          "count": 80
        },
        {
          "pc": "0x0A1969",
          "count": 80
        },
        {
          "pc": "0x0A1976",
          "count": 80
        },
        {
          "pc": "0x0A1980",
          "count": 80
        },
        {
          "pc": "0x0A1988",
          "count": 80
        },
        {
          "pc": "0x0A1994",
          "count": 80
        },
        {
          "pc": "0x0A19AA",
          "count": 80
        },
        {
          "pc": "0x0A19B5",
          "count": 80
        },
        {
          "pc": "0x0A19B7",
          "count": 80
        },
        {
          "pc": "0x0A19D7",
          "count": 80
        },
        {
          "pc": "0x0A1A1D",
          "count": 80
        },
        {
          "pc": "0x001CA6",
          "count": 66
        },
        {
          "pc": "0x001CC0",
          "count": 66
        },
        {
          "pc": "0x001CCA",
          "count": 66
        },
        {
          "pc": "0x001C33",
          "count": 55
        },
        {
          "pc": "0x001C38",
          "count": 55
        },
        {
          "pc": "0x001C3C",
          "count": 55
        },
        {
          "pc": "0x001CE4",
          "count": 55
        },
        {
          "pc": "0x0A3411",
          "count": 48
        },
        {
          "pc": "0x001C44",
          "count": 44
        },
        {
          "pc": "0x001C7D",
          "count": 44
        },
        {
          "pc": "0x001C81",
          "count": 44
        },
        {
          "pc": "0x001C82",
          "count": 44
        }
      ],
      "targetCounts": {
        "controlPreStop0A229D": 0,
        "engine08F54B": 0,
        "zeroPrev0A31E2": 1,
        "zeroEntry0A31A2": 1,
        "cleanup0018F8": 0,
        "prewipe001879": 0,
        "low000862": 0,
        "low000A92": 0,
        "low03D044": 11,
        "caller058A16": 0,
        "spaceFill0A2A37": 7,
        "tokenOuter08F3B8": 0
      },
      "targetFirst": {
        "low03D044": {
          "block": 100,
          "step": 100,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 100
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 378492
            },
            {
              "addr": 13740128,
              "value": 574265
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8549,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          }
        },
        "spaceFill0A2A37": {
          "block": 365,
          "step": 366,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740098,
            "af": 117,
            "bc": 0,
            "de": 13805589,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 117,
            "halted": false,
            "madl": 1,
            "stepCount": 366
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 664457
            },
            {
              "addr": 13740101,
              "value": 13805589
            },
            {
              "addr": 13740104,
              "value": 0
            },
            {
              "addr": 13740107,
              "value": 117
            },
            {
              "addr": 13740110,
              "value": 378905
            },
            {
              "addr": 13740113,
              "value": 0
            },
            {
              "addr": 13740116,
              "value": 13740128
            },
            {
              "addr": 13740119,
              "value": 65535
            }
          ],
          "vram": 8549,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          }
        },
        "zeroPrev0A31E2": {
          "block": 4985,
          "step": 4995,
          "pc": 668130,
          "prevPc": "0x0A31B8",
          "cpu": {
            "pc": 668130,
            "sp": 13740053,
            "af": 1620,
            "bc": 60436,
            "de": 13644278,
            "hl": 279,
            "ix": 13640964,
            "iy": 13631616,
            "f": 84,
            "halted": false,
            "madl": 1,
            "stepCount": 4995
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740053,
              "value": 800
            },
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            }
          ],
          "vram": 10825,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 420
            },
            "vramCurrent": 10825,
            "lastKey": null
          }
        },
        "zeroEntry0A31A2": {
          "block": 4986,
          "step": 4996,
          "pc": 668066,
          "prevPc": "0x0A31E2",
          "cpu": {
            "pc": 668066,
            "sp": 13740056,
            "af": 1664,
            "bc": 0,
            "de": 13635117,
            "hl": 13634317,
            "ix": 13640964,
            "iy": 13631616,
            "f": 128,
            "halted": false,
            "madl": 1,
            "stepCount": 4996
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            },
            {
              "addr": 13740077,
              "value": 65336
            }
          ],
          "vram": 10825,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 420
            },
            "vramCurrent": 10825,
            "lastKey": null
          }
        }
      },
      "targetSamples": [
        {
          "target": "low03D044",
          "block": 100,
          "step": 100,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 100
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 378492
            },
            {
              "addr": 13740128,
              "value": 574265
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8549,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 332,
          "step": 333,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740107,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 333
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740107,
              "value": 13740193
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 668846
            },
            {
              "addr": 13740119,
              "value": 65535
            },
            {
              "addr": 13740122,
              "value": 13805589
            },
            {
              "addr": 13740125,
              "value": 0
            },
            {
              "addr": 13740128,
              "value": 574273
            }
          ],
          "vram": 8549,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 365,
          "step": 366,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740098,
            "af": 117,
            "bc": 0,
            "de": 13805589,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 117,
            "halted": false,
            "madl": 1,
            "stepCount": 366
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 664457
            },
            {
              "addr": 13740101,
              "value": 13805589
            },
            {
              "addr": 13740104,
              "value": 0
            },
            {
              "addr": 13740107,
              "value": 117
            },
            {
              "addr": 13740110,
              "value": 378905
            },
            {
              "addr": 13740113,
              "value": 0
            },
            {
              "addr": 13740116,
              "value": 13740128
            },
            {
              "addr": 13740119,
              "value": 65535
            }
          ],
          "vram": 8549,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 387,
          "step": 388,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740080,
            "af": 16,
            "bc": 57344,
            "de": 13805630,
            "hl": 13697272,
            "ix": 13740128,
            "iy": 13631616,
            "f": 16,
            "halted": false,
            "madl": 1,
            "stepCount": 388
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740080,
              "value": 664457
            },
            {
              "addr": 13740083,
              "value": 13805630
            },
            {
              "addr": 13740086,
              "value": 57344
            },
            {
              "addr": 13740089,
              "value": 57360
            },
            {
              "addr": 13740092,
              "value": 661422
            },
            {
              "addr": 13740095,
              "value": 13740128
            },
            {
              "addr": 13740098,
              "value": 13697272
            },
            {
              "addr": 13740101,
              "value": 13805630
            }
          ],
          "vram": 8549,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 961,
          "step": 962,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740092,
            "af": 49,
            "bc": 57344,
            "de": 13805589,
            "hl": 65535,
            "ix": 13740128,
            "iy": 13631616,
            "f": 49,
            "halted": false,
            "madl": 1,
            "stepCount": 962
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740092,
              "value": 664457
            },
            {
              "addr": 13740095,
              "value": 13805589
            },
            {
              "addr": 13740098,
              "value": 57344
            },
            {
              "addr": 13740101,
              "value": 49
            },
            {
              "addr": 13740104,
              "value": 661422
            },
            {
              "addr": 13740107,
              "value": 13740128
            },
            {
              "addr": 13740110,
              "value": 65535
            },
            {
              "addr": 13740113,
              "value": 13805589
            }
          ],
          "vram": 8689,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 1727,
          "step": 1729,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740104,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 1729
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740104,
              "value": 13740193
            },
            {
              "addr": 13740107,
              "value": 13631616
            },
            {
              "addr": 13740110,
              "value": 13740128
            },
            {
              "addr": 13740113,
              "value": 662070
            },
            {
              "addr": 13740116,
              "value": 65535
            },
            {
              "addr": 13740119,
              "value": 13805589
            },
            {
              "addr": 13740122,
              "value": 57344
            },
            {
              "addr": 13740125,
              "value": 3856
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 1900,
          "step": 1903,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 1903
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 574770
            },
            {
              "addr": 13740128,
              "value": 4003
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 2184,
          "step": 2188,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740107,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 2188
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740107,
              "value": 13740193
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 668846
            },
            {
              "addr": 13740119,
              "value": 65535
            },
            {
              "addr": 13740122,
              "value": 13805630
            },
            {
              "addr": 13740125,
              "value": 3840
            },
            {
              "addr": 13740128,
              "value": 574273
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 2300,
          "step": 2305,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 2305
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 378715
            },
            {
              "addr": 13740128,
              "value": 574277
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 2331,
          "step": 2336,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740098,
            "af": 117,
            "bc": 3840,
            "de": 13805630,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 117,
            "halted": false,
            "madl": 1,
            "stepCount": 2336
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 664457
            },
            {
              "addr": 13740101,
              "value": 13805630
            },
            {
              "addr": 13740104,
              "value": 3840
            },
            {
              "addr": 13740107,
              "value": 117
            },
            {
              "addr": 13740110,
              "value": 378905
            },
            {
              "addr": 13740113,
              "value": 0
            },
            {
              "addr": 13740116,
              "value": 13740128
            },
            {
              "addr": 13740119,
              "value": 65535
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 2353,
          "step": 2358,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740080,
            "af": 16,
            "bc": 57344,
            "de": 13805630,
            "hl": 13697272,
            "ix": 13740128,
            "iy": 13631616,
            "f": 16,
            "halted": false,
            "madl": 1,
            "stepCount": 2358
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740080,
              "value": 664457
            },
            {
              "addr": 13740083,
              "value": 13805630
            },
            {
              "addr": 13740086,
              "value": 57344
            },
            {
              "addr": 13740089,
              "value": 57360
            },
            {
              "addr": 13740092,
              "value": 661422
            },
            {
              "addr": 13740095,
              "value": 13740128
            },
            {
              "addr": 13740098,
              "value": 13697272
            },
            {
              "addr": 13740101,
              "value": 13805630
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 2949,
          "step": 2954,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740074,
            "af": 16,
            "bc": 57344,
            "de": 13805630,
            "hl": 13697272,
            "ix": 13740128,
            "iy": 13631616,
            "f": 16,
            "halted": false,
            "madl": 1,
            "stepCount": 2954
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740074,
              "value": 664457
            },
            {
              "addr": 13740077,
              "value": 13805630
            },
            {
              "addr": 13740080,
              "value": 57344
            },
            {
              "addr": 13740083,
              "value": 57360
            },
            {
              "addr": 13740086,
              "value": 661422
            },
            {
              "addr": 13740089,
              "value": 13740128
            },
            {
              "addr": 13740092,
              "value": 13697272
            },
            {
              "addr": 13740095,
              "value": 13805630
            }
          ],
          "vram": 8689,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 3603,
          "step": 3609,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740107,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 3609
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740107,
              "value": 13740193
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 261018
            },
            {
              "addr": 13740119,
              "value": 3856
            },
            {
              "addr": 13740122,
              "value": 196034
            },
            {
              "addr": 13740125,
              "value": 195782
            },
            {
              "addr": 13740128,
              "value": 574310
            }
          ],
          "vram": 8689,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 3718,
          "step": 3725,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740107,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 3725
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740107,
              "value": 13740193
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 261018
            },
            {
              "addr": 13740119,
              "value": 3856
            },
            {
              "addr": 13740122,
              "value": 196034
            },
            {
              "addr": 13740125,
              "value": 195782
            },
            {
              "addr": 13740128,
              "value": 574310
            }
          ],
          "vram": 8689,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 3797,
          "step": 3804,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740092,
            "af": 49,
            "bc": 57344,
            "de": 13762622,
            "hl": 653226,
            "ix": 13740128,
            "iy": 13631616,
            "f": 49,
            "halted": false,
            "madl": 1,
            "stepCount": 3804
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740092,
              "value": 664457
            },
            {
              "addr": 13740095,
              "value": 13762622
            },
            {
              "addr": 13740098,
              "value": 57344
            },
            {
              "addr": 13740101,
              "value": 49
            },
            {
              "addr": 13740104,
              "value": 661422
            },
            {
              "addr": 13740107,
              "value": 13740128
            },
            {
              "addr": 13740110,
              "value": 653226
            },
            {
              "addr": 13740113,
              "value": 13762622
            }
          ],
          "vram": 8689,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 4563,
          "step": 4571,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740104,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 4571
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740104,
              "value": 13740193
            },
            {
              "addr": 13740107,
              "value": 13631616
            },
            {
              "addr": 13740110,
              "value": 13740128
            },
            {
              "addr": 13740113,
              "value": 662070
            },
            {
              "addr": 13740116,
              "value": 653226
            },
            {
              "addr": 13740119,
              "value": 13762622
            },
            {
              "addr": 13740122,
              "value": 57344
            },
            {
              "addr": 13740125,
              "value": 2353
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 4700,
          "step": 4709,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 4709
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 543198
            },
            {
              "addr": 13740128,
              "value": 574454
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 4900,
          "step": 4910,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740095,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 4910
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740095,
              "value": 13740193
            },
            {
              "addr": 13740098,
              "value": 13631616
            },
            {
              "addr": 13740101,
              "value": 13740128
            },
            {
              "addr": 13740104,
              "value": 524889
            },
            {
              "addr": 13740107,
              "value": 524466
            },
            {
              "addr": 13740110,
              "value": 363872
            },
            {
              "addr": 13740113,
              "value": 362985
            },
            {
              "addr": 13740116,
              "value": 575293
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          }
        },
        {
          "target": "zeroPrev0A31E2",
          "block": 4985,
          "step": 4995,
          "pc": 668130,
          "prevPc": "0x0A31B8",
          "cpu": {
            "pc": 668130,
            "sp": 13740053,
            "af": 1620,
            "bc": 60436,
            "de": 13644278,
            "hl": 279,
            "ix": 13640964,
            "iy": 13631616,
            "f": 84,
            "halted": false,
            "madl": 1,
            "stepCount": 4995
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740053,
              "value": 800
            },
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            }
          ],
          "vram": 10825,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 420
            },
            "vramCurrent": 10825,
            "lastKey": null
          }
        },
        {
          "target": "zeroEntry0A31A2",
          "block": 4986,
          "step": 4996,
          "pc": 668066,
          "prevPc": "0x0A31E2",
          "cpu": {
            "pc": 668066,
            "sp": 13740056,
            "af": 1664,
            "bc": 0,
            "de": 13635117,
            "hl": 13634317,
            "ix": 13640964,
            "iy": 13631616,
            "f": 128,
            "halted": false,
            "madl": 1,
            "stepCount": 4996
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            },
            {
              "addr": 13740077,
              "value": 65336
            }
          ],
          "vram": 10825,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 420
            },
            "vramCurrent": 10825,
            "lastKey": null
          }
        }
      ],
      "zeroNeighborhoodSamples": [
        {
          "block": 4970,
          "step": 4980,
          "pc": "0x0A321D",
          "prevPc": "0x0A20EA",
          "cpu": {
            "pc": 668189,
            "sp": 13740080,
            "af": 65336,
            "bc": 256,
            "de": 13632917,
            "hl": 13640964,
            "ix": 13740128,
            "iy": 13631616,
            "f": 56,
            "halted": false,
            "madl": 1,
            "stepCount": 4980
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740080,
              "value": 663790
            },
            {
              "addr": 13740083,
              "value": 659812
            },
            {
              "addr": 13740086,
              "value": 0
            },
            {
              "addr": 13740089,
              "value": 68
            },
            {
              "addr": 13740092,
              "value": 666646
            },
            {
              "addr": 13740095,
              "value": 0
            },
            {
              "addr": 13740098,
              "value": 68
            },
            {
              "addr": 13740101,
              "value": 13805629
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4955,
              "pc": "0x05E7D1",
              "prevPc": "0x05E26C"
            },
            {
              "block": 4956,
              "pc": "0x05E7D2",
              "prevPc": "0x05E7D1"
            },
            {
              "block": 4957,
              "pc": "0x0A2B72",
              "prevPc": "0x05E7D2"
            },
            {
              "block": 4958,
              "pc": "0x0A2A68",
              "prevPc": "0x0A2B72"
            },
            {
              "block": 4959,
              "pc": "0x0A2AF9",
              "prevPc": "0x0A2A68"
            },
            {
              "block": 4960,
              "pc": "0x0A2B16",
              "prevPc": "0x0A2AF9"
            },
            {
              "block": 4961,
              "pc": "0x0A2B51",
              "prevPc": "0x0A2B16"
            },
            {
              "block": 4962,
              "pc": "0x0A2B7E",
              "prevPc": "0x0A2B51"
            },
            {
              "block": 4963,
              "pc": "0x0A2B8F",
              "prevPc": "0x0A2B7E"
            },
            {
              "block": 4964,
              "pc": "0x0A2BEB",
              "prevPc": "0x0A2B8F"
            },
            {
              "block": 4965,
              "pc": "0x0A2C0C",
              "prevPc": "0x0A2BEB"
            },
            {
              "block": 4966,
              "pc": "0x0A2C10",
              "prevPc": "0x0A2C0C"
            },
            {
              "block": 4967,
              "pc": "0x0A20CC",
              "prevPc": "0x0A2C10"
            },
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            }
          ]
        },
        {
          "block": 4972,
          "step": 4982,
          "pc": "0x0A31FD",
          "prevPc": "0x0A322B",
          "cpu": {
            "pc": 668157,
            "sp": 13740059,
            "af": 68,
            "bc": 256,
            "de": 13632917,
            "hl": 13640964,
            "ix": 13640964,
            "iy": 13631616,
            "f": 68,
            "halted": false,
            "madl": 1,
            "stepCount": 4982
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            },
            {
              "addr": 13740077,
              "value": 65336
            },
            {
              "addr": 13740080,
              "value": 663790
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4957,
              "pc": "0x0A2B72",
              "prevPc": "0x05E7D2"
            },
            {
              "block": 4958,
              "pc": "0x0A2A68",
              "prevPc": "0x0A2B72"
            },
            {
              "block": 4959,
              "pc": "0x0A2AF9",
              "prevPc": "0x0A2A68"
            },
            {
              "block": 4960,
              "pc": "0x0A2B16",
              "prevPc": "0x0A2AF9"
            },
            {
              "block": 4961,
              "pc": "0x0A2B51",
              "prevPc": "0x0A2B16"
            },
            {
              "block": 4962,
              "pc": "0x0A2B7E",
              "prevPc": "0x0A2B51"
            },
            {
              "block": 4963,
              "pc": "0x0A2B8F",
              "prevPc": "0x0A2B7E"
            },
            {
              "block": 4964,
              "pc": "0x0A2BEB",
              "prevPc": "0x0A2B8F"
            },
            {
              "block": 4965,
              "pc": "0x0A2C0C",
              "prevPc": "0x0A2BEB"
            },
            {
              "block": 4966,
              "pc": "0x0A2C10",
              "prevPc": "0x0A2C0C"
            },
            {
              "block": 4967,
              "pc": "0x0A20CC",
              "prevPc": "0x0A2C10"
            },
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            }
          ]
        },
        {
          "block": 4973,
          "step": 4983,
          "pc": "0x0A3205",
          "prevPc": "0x0A31FD",
          "cpu": {
            "pc": 668165,
            "sp": 13740059,
            "af": 65466,
            "bc": 256,
            "de": 13632917,
            "hl": 13640964,
            "ix": 13640964,
            "iy": 13631616,
            "f": 186,
            "halted": false,
            "madl": 1,
            "stepCount": 4983
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            },
            {
              "addr": 13740077,
              "value": 65336
            },
            {
              "addr": 13740080,
              "value": 663790
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4958,
              "pc": "0x0A2A68",
              "prevPc": "0x0A2B72"
            },
            {
              "block": 4959,
              "pc": "0x0A2AF9",
              "prevPc": "0x0A2A68"
            },
            {
              "block": 4960,
              "pc": "0x0A2B16",
              "prevPc": "0x0A2AF9"
            },
            {
              "block": 4961,
              "pc": "0x0A2B51",
              "prevPc": "0x0A2B16"
            },
            {
              "block": 4962,
              "pc": "0x0A2B7E",
              "prevPc": "0x0A2B51"
            },
            {
              "block": 4963,
              "pc": "0x0A2B8F",
              "prevPc": "0x0A2B7E"
            },
            {
              "block": 4964,
              "pc": "0x0A2BEB",
              "prevPc": "0x0A2B8F"
            },
            {
              "block": 4965,
              "pc": "0x0A2C0C",
              "prevPc": "0x0A2BEB"
            },
            {
              "block": 4966,
              "pc": "0x0A2C10",
              "prevPc": "0x0A2C0C"
            },
            {
              "block": 4967,
              "pc": "0x0A20CC",
              "prevPc": "0x0A2C10"
            },
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            }
          ]
        },
        {
          "block": 4975,
          "step": 4985,
          "pc": "0x0A3216",
          "prevPc": "0x0A2D4C",
          "cpu": {
            "pc": 668182,
            "sp": 13740059,
            "af": 9504,
            "bc": 60416,
            "de": 13632917,
            "hl": 5100,
            "ix": 13640964,
            "iy": 13631616,
            "f": 32,
            "halted": false,
            "madl": 1,
            "stepCount": 4985
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            },
            {
              "addr": 13740077,
              "value": 65336
            },
            {
              "addr": 13740080,
              "value": 663790
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4960,
              "pc": "0x0A2B16",
              "prevPc": "0x0A2AF9"
            },
            {
              "block": 4961,
              "pc": "0x0A2B51",
              "prevPc": "0x0A2B16"
            },
            {
              "block": 4962,
              "pc": "0x0A2B7E",
              "prevPc": "0x0A2B51"
            },
            {
              "block": 4963,
              "pc": "0x0A2B8F",
              "prevPc": "0x0A2B7E"
            },
            {
              "block": 4964,
              "pc": "0x0A2BEB",
              "prevPc": "0x0A2B8F"
            },
            {
              "block": 4965,
              "pc": "0x0A2C0C",
              "prevPc": "0x0A2BEB"
            },
            {
              "block": 4966,
              "pc": "0x0A2C10",
              "prevPc": "0x0A2C0C"
            },
            {
              "block": 4967,
              "pc": "0x0A20CC",
              "prevPc": "0x0A2C10"
            },
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            }
          ]
        },
        {
          "block": 4978,
          "step": 4988,
          "pc": "0x0A31F6",
          "prevPc": "0x0A314D",
          "cpu": {
            "pc": 668150,
            "sp": 13740047,
            "af": 64,
            "bc": 60436,
            "de": 13640853,
            "hl": 4884,
            "ix": 13640964,
            "iy": 13631616,
            "f": 64,
            "halted": false,
            "madl": 1,
            "stepCount": 4988
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740047,
              "value": 667992
            },
            {
              "addr": 13740050,
              "value": 60436
            },
            {
              "addr": 13740053,
              "value": 13640853
            },
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4963,
              "pc": "0x0A2B8F",
              "prevPc": "0x0A2B7E"
            },
            {
              "block": 4964,
              "pc": "0x0A2BEB",
              "prevPc": "0x0A2B8F"
            },
            {
              "block": 4965,
              "pc": "0x0A2C0C",
              "prevPc": "0x0A2BEB"
            },
            {
              "block": 4966,
              "pc": "0x0A2C10",
              "prevPc": "0x0A2C0C"
            },
            {
              "block": 4967,
              "pc": "0x0A20CC",
              "prevPc": "0x0A2C10"
            },
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            },
            {
              "block": 4976,
              "pc": "0x0A3146",
              "prevPc": "0x0A3216"
            },
            {
              "block": 4977,
              "pc": "0x0A314D",
              "prevPc": "0x0A3146"
            },
            {
              "block": 4978,
              "pc": "0x0A31F6",
              "prevPc": "0x0A314D"
            }
          ]
        },
        {
          "block": 4980,
          "step": 4990,
          "pc": "0x0A31A6",
          "prevPc": "0x0A3158",
          "cpu": {
            "pc": 668070,
            "sp": 13740047,
            "af": 144,
            "bc": 60436,
            "de": 13640853,
            "hl": 12800,
            "ix": 13640964,
            "iy": 13631616,
            "f": 144,
            "halted": false,
            "madl": 1,
            "stepCount": 4990
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740047,
              "value": 12800
            },
            {
              "addr": 13740050,
              "value": 60436
            },
            {
              "addr": 13740053,
              "value": 13640853
            },
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4965,
              "pc": "0x0A2C0C",
              "prevPc": "0x0A2BEB"
            },
            {
              "block": 4966,
              "pc": "0x0A2C10",
              "prevPc": "0x0A2C0C"
            },
            {
              "block": 4967,
              "pc": "0x0A20CC",
              "prevPc": "0x0A2C10"
            },
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            },
            {
              "block": 4976,
              "pc": "0x0A3146",
              "prevPc": "0x0A3216"
            },
            {
              "block": 4977,
              "pc": "0x0A314D",
              "prevPc": "0x0A3146"
            },
            {
              "block": 4978,
              "pc": "0x0A31F6",
              "prevPc": "0x0A314D"
            },
            {
              "block": 4979,
              "pc": "0x0A3158",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4980,
              "pc": "0x0A31A6",
              "prevPc": "0x0A3158"
            }
          ]
        },
        {
          "block": 4981,
          "step": 4991,
          "pc": "0x0A31F6",
          "prevPc": "0x0A31A6",
          "cpu": {
            "pc": 668150,
            "sp": 13740044,
            "af": 32,
            "bc": 60436,
            "de": 13640853,
            "hl": 12837,
            "ix": 13640964,
            "iy": 13631616,
            "f": 32,
            "halted": false,
            "madl": 1,
            "stepCount": 4991
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740044,
              "value": 668076
            },
            {
              "addr": 13740047,
              "value": 12800
            },
            {
              "addr": 13740050,
              "value": 60436
            },
            {
              "addr": 13740053,
              "value": 13640853
            },
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4966,
              "pc": "0x0A2C10",
              "prevPc": "0x0A2C0C"
            },
            {
              "block": 4967,
              "pc": "0x0A20CC",
              "prevPc": "0x0A2C10"
            },
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            },
            {
              "block": 4976,
              "pc": "0x0A3146",
              "prevPc": "0x0A3216"
            },
            {
              "block": 4977,
              "pc": "0x0A314D",
              "prevPc": "0x0A3146"
            },
            {
              "block": 4978,
              "pc": "0x0A31F6",
              "prevPc": "0x0A314D"
            },
            {
              "block": 4979,
              "pc": "0x0A3158",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4980,
              "pc": "0x0A31A6",
              "prevPc": "0x0A3158"
            },
            {
              "block": 4981,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31A6"
            }
          ]
        },
        {
          "block": 4982,
          "step": 4992,
          "pc": "0x0A31AC",
          "prevPc": "0x0A31F6",
          "cpu": {
            "pc": 668076,
            "sp": 13740047,
            "af": 32,
            "bc": 60436,
            "de": 13640853,
            "hl": 23680,
            "ix": 13640964,
            "iy": 13631616,
            "f": 32,
            "halted": false,
            "madl": 1,
            "stepCount": 4992
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740047,
              "value": 12800
            },
            {
              "addr": 13740050,
              "value": 60436
            },
            {
              "addr": 13740053,
              "value": 13640853
            },
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4967,
              "pc": "0x0A20CC",
              "prevPc": "0x0A2C10"
            },
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            },
            {
              "block": 4976,
              "pc": "0x0A3146",
              "prevPc": "0x0A3216"
            },
            {
              "block": 4977,
              "pc": "0x0A314D",
              "prevPc": "0x0A3146"
            },
            {
              "block": 4978,
              "pc": "0x0A31F6",
              "prevPc": "0x0A314D"
            },
            {
              "block": 4979,
              "pc": "0x0A3158",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4980,
              "pc": "0x0A31A6",
              "prevPc": "0x0A3158"
            },
            {
              "block": 4981,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31A6"
            },
            {
              "block": 4982,
              "pc": "0x0A31AC",
              "prevPc": "0x0A31F6"
            }
          ]
        },
        {
          "block": 4983,
          "step": 4993,
          "pc": "0x0A31F6",
          "prevPc": "0x0A31AC",
          "cpu": {
            "pc": 668150,
            "sp": 13740044,
            "af": 32,
            "bc": 60436,
            "de": 13917311,
            "hl": 13893868,
            "ix": 13640964,
            "iy": 13631616,
            "f": 32,
            "halted": false,
            "madl": 1,
            "stepCount": 4993
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740044,
              "value": 668088
            },
            {
              "addr": 13740047,
              "value": 12800
            },
            {
              "addr": 13740050,
              "value": 60436
            },
            {
              "addr": 13740053,
              "value": 13640853
            },
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            },
            {
              "block": 4976,
              "pc": "0x0A3146",
              "prevPc": "0x0A3216"
            },
            {
              "block": 4977,
              "pc": "0x0A314D",
              "prevPc": "0x0A3146"
            },
            {
              "block": 4978,
              "pc": "0x0A31F6",
              "prevPc": "0x0A314D"
            },
            {
              "block": 4979,
              "pc": "0x0A3158",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4980,
              "pc": "0x0A31A6",
              "prevPc": "0x0A3158"
            },
            {
              "block": 4981,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31A6"
            },
            {
              "block": 4982,
              "pc": "0x0A31AC",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4983,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31AC"
            }
          ]
        },
        {
          "block": 4984,
          "step": 4994,
          "pc": "0x0A31B8",
          "prevPc": "0x0A31F6",
          "cpu": {
            "pc": 668088,
            "sp": 13740047,
            "af": 32,
            "bc": 60436,
            "de": 13917311,
            "hl": 151040,
            "ix": 13640964,
            "iy": 13631616,
            "f": 32,
            "halted": false,
            "madl": 1,
            "stepCount": 4994
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740047,
              "value": 12800
            },
            {
              "addr": 13740050,
              "value": 60436
            },
            {
              "addr": 13740053,
              "value": 13640853
            },
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            }
          ],
          "vram": 8585,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            },
            {
              "block": 4976,
              "pc": "0x0A3146",
              "prevPc": "0x0A3216"
            },
            {
              "block": 4977,
              "pc": "0x0A314D",
              "prevPc": "0x0A3146"
            },
            {
              "block": 4978,
              "pc": "0x0A31F6",
              "prevPc": "0x0A314D"
            },
            {
              "block": 4979,
              "pc": "0x0A3158",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4980,
              "pc": "0x0A31A6",
              "prevPc": "0x0A3158"
            },
            {
              "block": 4981,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31A6"
            },
            {
              "block": 4982,
              "pc": "0x0A31AC",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4983,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31AC"
            },
            {
              "block": 4984,
              "pc": "0x0A31B8",
              "prevPc": "0x0A31F6"
            }
          ]
        },
        {
          "block": 4985,
          "step": 4995,
          "pc": "0x0A31E2",
          "prevPc": "0x0A31B8",
          "cpu": {
            "pc": 668130,
            "sp": 13740053,
            "af": 1620,
            "bc": 60436,
            "de": 13644278,
            "hl": 279,
            "ix": 13640964,
            "iy": 13631616,
            "f": 84,
            "halted": false,
            "madl": 1,
            "stepCount": 4995
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740053,
              "value": 800
            },
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            }
          ],
          "vram": 10825,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805629,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 420
            },
            "vramCurrent": 10825,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            },
            {
              "block": 4976,
              "pc": "0x0A3146",
              "prevPc": "0x0A3216"
            },
            {
              "block": 4977,
              "pc": "0x0A314D",
              "prevPc": "0x0A3146"
            },
            {
              "block": 4978,
              "pc": "0x0A31F6",
              "prevPc": "0x0A314D"
            },
            {
              "block": 4979,
              "pc": "0x0A3158",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4980,
              "pc": "0x0A31A6",
              "prevPc": "0x0A3158"
            },
            {
              "block": 4981,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31A6"
            },
            {
              "block": 4982,
              "pc": "0x0A31AC",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4983,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31AC"
            },
            {
              "block": 4984,
              "pc": "0x0A31B8",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4985,
              "pc": "0x0A31E2",
              "prevPc": "0x0A31B8"
            }
          ]
        },
        {
          "block": 4986,
          "step": 4996,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "cpu": {
            "pc": 668066,
            "sp": 13740056,
            "af": 1664,
            "bc": 0,
            "de": 13635117,
            "hl": 13634317,
            "ix": 13640964,
            "iy": 13631616,
            "f": 128,
            "halted": false,
            "madl": 1,
            "stepCount": 4996
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            },
            {
              "addr": 13740077,
              "value": 65336
            }
          ],
          "vram": 10825,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 420
            },
            "vramCurrent": 10825,
            "lastKey": null
          },
          "historyTail": [
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            },
            {
              "block": 4976,
              "pc": "0x0A3146",
              "prevPc": "0x0A3216"
            },
            {
              "block": 4977,
              "pc": "0x0A314D",
              "prevPc": "0x0A3146"
            },
            {
              "block": 4978,
              "pc": "0x0A31F6",
              "prevPc": "0x0A314D"
            },
            {
              "block": 4979,
              "pc": "0x0A3158",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4980,
              "pc": "0x0A31A6",
              "prevPc": "0x0A3158"
            },
            {
              "block": 4981,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31A6"
            },
            {
              "block": 4982,
              "pc": "0x0A31AC",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4983,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31AC"
            },
            {
              "block": 4984,
              "pc": "0x0A31B8",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4985,
              "pc": "0x0A31E2",
              "prevPc": "0x0A31B8"
            },
            {
              "block": 4986,
              "pc": "0x0A31A2",
              "prevPc": "0x0A31E2"
            }
          ]
        }
      ],
      "wipeSamples": [],
      "firstWipe": null,
      "firstZeroByField": {
        "D0243A": {
          "timing": "entry-vs-previous-block",
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "before": 13740279,
          "after": 0,
          "fields": {
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 361961,
            "D02590": 0
          },
          "snapshot": {
            "block": 4986,
            "step": 4996,
            "pc": 668066,
            "prevPc": "0x0A31E2",
            "cpu": {
              "pc": 668066,
              "sp": 13740056,
              "af": 1664,
              "bc": 0,
              "de": 13635117,
              "hl": 13634317,
              "ix": 13640964,
              "iy": 13631616,
              "f": 128,
              "halted": false,
              "madl": 1,
              "stepCount": 4996
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 25,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740056,
                "value": 64
              },
              {
                "addr": 13740059,
                "value": 668218
              },
              {
                "addr": 13740062,
                "value": 68
              },
              {
                "addr": 13740065,
                "value": 13740128
              },
              {
                "addr": 13740068,
                "value": 13640964
              },
              {
                "addr": 13740071,
                "value": 13632917
              },
              {
                "addr": 13740074,
                "value": 256
              },
              {
                "addr": 13740077,
                "value": 65336
              }
            ],
            "vram": 10825,
            "persistence": {
              "tokenGate": 0,
              "tokenA": 0,
              "tokenB": 0,
              "tuple": {
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 19974,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D00595": 0,
              "D00596": 25,
              "buffer": [
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0
              ],
              "entryLineRoi": {
                "x": 0,
                "y": 34,
                "width": 128,
                "height": 26,
                "nonWhite": 420
              },
              "vramCurrent": 10825,
              "lastKey": null
            }
          }
        },
        "D0243D": {
          "timing": "entry-vs-previous-block",
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "before": 13805629,
          "after": 0,
          "fields": {
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 361961,
            "D02590": 0
          },
          "snapshot": {
            "block": 4986,
            "step": 4996,
            "pc": 668066,
            "prevPc": "0x0A31E2",
            "cpu": {
              "pc": 668066,
              "sp": 13740056,
              "af": 1664,
              "bc": 0,
              "de": 13635117,
              "hl": 13634317,
              "ix": 13640964,
              "iy": 13631616,
              "f": 128,
              "halted": false,
              "madl": 1,
              "stepCount": 4996
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 25,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740056,
                "value": 64
              },
              {
                "addr": 13740059,
                "value": 668218
              },
              {
                "addr": 13740062,
                "value": 68
              },
              {
                "addr": 13740065,
                "value": 13740128
              },
              {
                "addr": 13740068,
                "value": 13640964
              },
              {
                "addr": 13740071,
                "value": 13632917
              },
              {
                "addr": 13740074,
                "value": 256
              },
              {
                "addr": 13740077,
                "value": 65336
              }
            ],
            "vram": 10825,
            "persistence": {
              "tokenGate": 0,
              "tokenA": 0,
              "tokenB": 0,
              "tuple": {
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 19974,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D00595": 0,
              "D00596": 25,
              "buffer": [
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0
              ],
              "entryLineRoi": {
                "x": 0,
                "y": 34,
                "width": 128,
                "height": 26,
                "nonWhite": 420
              },
              "vramCurrent": 10825,
              "lastKey": null
            }
          }
        },
        "D02590": {
          "timing": "entry-vs-previous-block",
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "before": 13893249,
          "after": 0,
          "fields": {
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 361961,
            "D02590": 0
          },
          "snapshot": {
            "block": 4986,
            "step": 4996,
            "pc": 668066,
            "prevPc": "0x0A31E2",
            "cpu": {
              "pc": 668066,
              "sp": 13740056,
              "af": 1664,
              "bc": 0,
              "de": 13635117,
              "hl": 13634317,
              "ix": 13640964,
              "iy": 13631616,
              "f": 128,
              "halted": false,
              "madl": 1,
              "stepCount": 4996
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 25,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740056,
                "value": 64
              },
              {
                "addr": 13740059,
                "value": 668218
              },
              {
                "addr": 13740062,
                "value": 68
              },
              {
                "addr": 13740065,
                "value": 13740128
              },
              {
                "addr": 13740068,
                "value": 13640964
              },
              {
                "addr": 13740071,
                "value": 13632917
              },
              {
                "addr": 13740074,
                "value": 256
              },
              {
                "addr": 13740077,
                "value": 65336
              }
            ],
            "vram": 10825,
            "persistence": {
              "tokenGate": 0,
              "tokenA": 0,
              "tokenB": 0,
              "tuple": {
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 19974,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D00595": 0,
              "D00596": 25,
              "buffer": [
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0
              ],
              "entryLineRoi": {
                "x": 0,
                "y": 34,
                "width": 128,
                "height": 26,
                "nonWhite": 420
              },
              "vramCurrent": 10825,
              "lastKey": null
            }
          }
        }
      },
      "firstPointerTripleZero": {
        "timing": "entry-vs-previous-block",
        "block": 4986,
        "pc": "0x0A31A2",
        "prevPc": "0x0A31E2",
        "before": {
          "D0243A": 13740279,
          "D0243D": 13805629,
          "D007CA": 361961,
          "D02590": 13893249
        },
        "after": {
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 361961,
          "D02590": 0
        },
        "history120": [
          {
            "block": 4867,
            "pc": "0x001C81",
            "prevPc": "0x001CE4"
          },
          {
            "block": 4868,
            "pc": "0x001C82",
            "prevPc": "0x001C81"
          },
          {
            "block": 4869,
            "pc": "0x001C48",
            "prevPc": "0x001C82"
          },
          {
            "block": 4870,
            "pc": "0x001C33",
            "prevPc": "0x001C48"
          },
          {
            "block": 4871,
            "pc": "0x001C38",
            "prevPc": "0x001C33"
          },
          {
            "block": 4872,
            "pc": "0x001C3C",
            "prevPc": "0x001C38"
          },
          {
            "block": 4873,
            "pc": "0x001C42",
            "prevPc": "0x001C3C"
          },
          {
            "block": 4874,
            "pc": "0x006810",
            "prevPc": "0x001C42"
          },
          {
            "block": 4875,
            "pc": "0x006812",
            "prevPc": "0x006810"
          },
          {
            "block": 4876,
            "pc": "0x001C4F",
            "prevPc": "0x006812"
          },
          {
            "block": 4877,
            "pc": "0x001CA6",
            "prevPc": "0x001C4F"
          },
          {
            "block": 4878,
            "pc": "0x001CC0",
            "prevPc": "0x001CA6"
          },
          {
            "block": 4879,
            "pc": "0x001CCA",
            "prevPc": "0x001CC0"
          },
          {
            "block": 4880,
            "pc": "0x001CE4",
            "prevPc": "0x001CCA"
          },
          {
            "block": 4881,
            "pc": "0x001C54",
            "prevPc": "0x001CE4"
          },
          {
            "block": 4882,
            "pc": "0x006816",
            "prevPc": "0x001C54"
          },
          {
            "block": 4883,
            "pc": "0x00681E",
            "prevPc": "0x006816"
          },
          {
            "block": 4884,
            "pc": "0x006828",
            "prevPc": "0x00681E"
          },
          {
            "block": 4885,
            "pc": "0x001727",
            "prevPc": "0x006828"
          },
          {
            "block": 4886,
            "pc": "0x000719",
            "prevPc": "0x001727"
          },
          {
            "block": 4887,
            "pc": "0x00071D",
            "prevPc": "0x000719"
          },
          {
            "block": 4888,
            "pc": "0x02010C",
            "prevPc": "0x00071D"
          },
          {
            "block": 4889,
            "pc": "0x03CF7D",
            "prevPc": "0x02010C"
          },
          {
            "block": 4890,
            "pc": "0x03CFA4",
            "prevPc": "0x03CF7D"
          },
          {
            "block": 4891,
            "pc": "0x03CFCF",
            "prevPc": "0x03CFA4"
          },
          {
            "block": 4892,
            "pc": "0x03CFD4",
            "prevPc": "0x03CFCF"
          },
          {
            "block": 4893,
            "pc": "0x03CFDB",
            "prevPc": "0x03CFD4"
          },
          {
            "block": 4894,
            "pc": "0x03CFE0",
            "prevPc": "0x03CFDB"
          },
          {
            "block": 4895,
            "pc": "0x03CFE5",
            "prevPc": "0x03CFE0"
          },
          {
            "block": 4896,
            "pc": "0x03CFEA",
            "prevPc": "0x03CFE5"
          },
          {
            "block": 4897,
            "pc": "0x03D029",
            "prevPc": "0x03CFEA"
          },
          {
            "block": 4898,
            "pc": "0x03D033",
            "prevPc": "0x03D029"
          },
          {
            "block": 4899,
            "pc": "0x03D038",
            "prevPc": "0x03D033"
          },
          {
            "block": 4900,
            "pc": "0x03D044",
            "prevPc": "0x03D038"
          },
          {
            "block": 4901,
            "pc": "0x03D1C3",
            "prevPc": "0x03D044"
          },
          {
            "block": 4902,
            "pc": "0x03D04C",
            "prevPc": "0x03D1C3"
          },
          {
            "block": 4903,
            "pc": "0x03D054",
            "prevPc": "0x03D04C"
          },
          {
            "block": 4904,
            "pc": "0x03F994",
            "prevPc": "0x03D054"
          },
          {
            "block": 4905,
            "pc": "0x0003D4",
            "prevPc": "0x03F994"
          },
          {
            "block": 4906,
            "pc": "0x003CC2",
            "prevPc": "0x0003D4"
          },
          {
            "block": 4907,
            "pc": "0x003CD4",
            "prevPc": "0x003CC2"
          },
          {
            "block": 4908,
            "pc": "0x003CE0",
            "prevPc": "0x003CD4"
          },
          {
            "block": 4909,
            "pc": "0x003CEE",
            "prevPc": "0x003CE0"
          },
          {
            "block": 4910,
            "pc": "0x003CF3",
            "prevPc": "0x003CEE"
          },
          {
            "block": 4911,
            "pc": "0x03F998",
            "prevPc": "0x003CF3"
          },
          {
            "block": 4912,
            "pc": "0x03F99A",
            "prevPc": "0x03F998"
          },
          {
            "block": 4913,
            "pc": "0x03F9AB",
            "prevPc": "0x03F99A"
          },
          {
            "block": 4914,
            "pc": "0x03F9AE",
            "prevPc": "0x03F9AB"
          },
          {
            "block": 4915,
            "pc": "0x03D058",
            "prevPc": "0x03F9AE"
          },
          {
            "block": 4916,
            "pc": "0x03D060",
            "prevPc": "0x03D058"
          },
          {
            "block": 4917,
            "pc": "0x03D0E0",
            "prevPc": "0x03D060"
          },
          {
            "block": 4918,
            "pc": "0x080259",
            "prevPc": "0x03D0E0"
          },
          {
            "block": 4919,
            "pc": "0x0800B2",
            "prevPc": "0x080259"
          },
          {
            "block": 4920,
            "pc": "0x058D60",
            "prevPc": "0x0800B2"
          },
          {
            "block": 4921,
            "pc": "0x058D89",
            "prevPc": "0x058D60"
          },
          {
            "block": 4922,
            "pc": "0x0589E9",
            "prevPc": "0x058D89"
          },
          {
            "block": 4923,
            "pc": "0x0589EF",
            "prevPc": "0x0589E9"
          },
          {
            "block": 4924,
            "pc": "0x058A0C",
            "prevPc": "0x0589EF"
          },
          {
            "block": 4925,
            "pc": "0x058A10",
            "prevPc": "0x058A0C"
          },
          {
            "block": 4926,
            "pc": "0x058212",
            "prevPc": "0x058A10"
          },
          {
            "block": 4927,
            "pc": "0x0800B8",
            "prevPc": "0x058212"
          },
          {
            "block": 4928,
            "pc": "0x058216",
            "prevPc": "0x0800B8"
          },
          {
            "block": 4929,
            "pc": "0x05821D",
            "prevPc": "0x058216"
          },
          {
            "block": 4930,
            "pc": "0x05E3E3",
            "prevPc": "0x05821D"
          },
          {
            "block": 4931,
            "pc": "0x05E3F5",
            "prevPc": "0x05E3E3"
          },
          {
            "block": 4932,
            "pc": "0x04C973",
            "prevPc": "0x05E3F5"
          },
          {
            "block": 4933,
            "pc": "0x05E3E7",
            "prevPc": "0x04C973"
          },
          {
            "block": 4934,
            "pc": "0x05E3E8",
            "prevPc": "0x05E3E7"
          },
          {
            "block": 4935,
            "pc": "0x04C973",
            "prevPc": "0x05E3E8"
          },
          {
            "block": 4936,
            "pc": "0x058221",
            "prevPc": "0x04C973"
          },
          {
            "block": 4937,
            "pc": "0x058A14",
            "prevPc": "0x058221"
          },
          {
            "block": 4938,
            "pc": "0x058A2C",
            "prevPc": "0x058A14"
          },
          {
            "block": 4939,
            "pc": "0x0800B8",
            "prevPc": "0x058A2C"
          },
          {
            "block": 4940,
            "pc": "0x058A30",
            "prevPc": "0x0800B8"
          },
          {
            "block": 4941,
            "pc": "0x058A4C",
            "prevPc": "0x058A30"
          },
          {
            "block": 4942,
            "pc": "0x05E7CD",
            "prevPc": "0x058A4C"
          },
          {
            "block": 4943,
            "pc": "0x05E242",
            "prevPc": "0x05E7CD"
          },
          {
            "block": 4944,
            "pc": "0x05E3E8",
            "prevPc": "0x05E242"
          },
          {
            "block": 4945,
            "pc": "0x04C973",
            "prevPc": "0x05E3E8"
          },
          {
            "block": 4946,
            "pc": "0x05E246",
            "prevPc": "0x04C973"
          },
          {
            "block": 4947,
            "pc": "0x05E247",
            "prevPc": "0x05E246"
          },
          {
            "block": 4948,
            "pc": "0x05E3EC",
            "prevPc": "0x05E247"
          },
          {
            "block": 4949,
            "pc": "0x04C973",
            "prevPc": "0x05E3EC"
          },
          {
            "block": 4950,
            "pc": "0x05E24C",
            "prevPc": "0x04C973"
          },
          {
            "block": 4951,
            "pc": "0x05E250",
            "prevPc": "0x05E24C"
          },
          {
            "block": 4952,
            "pc": "0x080064",
            "prevPc": "0x05E250"
          },
          {
            "block": 4953,
            "pc": "0x05E256",
            "prevPc": "0x080064"
          },
          {
            "block": 4954,
            "pc": "0x05E26C",
            "prevPc": "0x05E256"
          },
          {
            "block": 4955,
            "pc": "0x05E7D1",
            "prevPc": "0x05E26C"
          },
          {
            "block": 4956,
            "pc": "0x05E7D2",
            "prevPc": "0x05E7D1"
          },
          {
            "block": 4957,
            "pc": "0x0A2B72",
            "prevPc": "0x05E7D2"
          },
          {
            "block": 4958,
            "pc": "0x0A2A68",
            "prevPc": "0x0A2B72"
          },
          {
            "block": 4959,
            "pc": "0x0A2AF9",
            "prevPc": "0x0A2A68"
          },
          {
            "block": 4960,
            "pc": "0x0A2B16",
            "prevPc": "0x0A2AF9"
          },
          {
            "block": 4961,
            "pc": "0x0A2B51",
            "prevPc": "0x0A2B16"
          },
          {
            "block": 4962,
            "pc": "0x0A2B7E",
            "prevPc": "0x0A2B51"
          },
          {
            "block": 4963,
            "pc": "0x0A2B8F",
            "prevPc": "0x0A2B7E"
          },
          {
            "block": 4964,
            "pc": "0x0A2BEB",
            "prevPc": "0x0A2B8F"
          },
          {
            "block": 4965,
            "pc": "0x0A2C0C",
            "prevPc": "0x0A2BEB"
          },
          {
            "block": 4966,
            "pc": "0x0A2C10",
            "prevPc": "0x0A2C0C"
          },
          {
            "block": 4967,
            "pc": "0x0A20CC",
            "prevPc": "0x0A2C10"
          },
          {
            "block": 4968,
            "pc": "0x0A20E4",
            "prevPc": "0x0A20CC"
          },
          {
            "block": 4969,
            "pc": "0x0A20EA",
            "prevPc": "0x0A20E4"
          },
          {
            "block": 4970,
            "pc": "0x0A321D",
            "prevPc": "0x0A20EA"
          },
          {
            "block": 4971,
            "pc": "0x0A322B",
            "prevPc": "0x0A321D"
          },
          {
            "block": 4972,
            "pc": "0x0A31FD",
            "prevPc": "0x0A322B"
          },
          {
            "block": 4973,
            "pc": "0x0A3205",
            "prevPc": "0x0A31FD"
          },
          {
            "block": 4974,
            "pc": "0x0A2D4C",
            "prevPc": "0x0A3205"
          },
          {
            "block": 4975,
            "pc": "0x0A3216",
            "prevPc": "0x0A2D4C"
          },
          {
            "block": 4976,
            "pc": "0x0A3146",
            "prevPc": "0x0A3216"
          },
          {
            "block": 4977,
            "pc": "0x0A314D",
            "prevPc": "0x0A3146"
          },
          {
            "block": 4978,
            "pc": "0x0A31F6",
            "prevPc": "0x0A314D"
          },
          {
            "block": 4979,
            "pc": "0x0A3158",
            "prevPc": "0x0A31F6"
          },
          {
            "block": 4980,
            "pc": "0x0A31A6",
            "prevPc": "0x0A3158"
          },
          {
            "block": 4981,
            "pc": "0x0A31F6",
            "prevPc": "0x0A31A6"
          },
          {
            "block": 4982,
            "pc": "0x0A31AC",
            "prevPc": "0x0A31F6"
          },
          {
            "block": 4983,
            "pc": "0x0A31F6",
            "prevPc": "0x0A31AC"
          },
          {
            "block": 4984,
            "pc": "0x0A31B8",
            "prevPc": "0x0A31F6"
          },
          {
            "block": 4985,
            "pc": "0x0A31E2",
            "prevPc": "0x0A31B8"
          },
          {
            "block": 4986,
            "pc": "0x0A31A2",
            "prevPc": "0x0A31E2"
          }
        ],
        "snapshot": {
          "block": 4986,
          "step": 4996,
          "pc": 668066,
          "prevPc": "0x0A31E2",
          "cpu": {
            "pc": 668066,
            "sp": 13740056,
            "af": 1664,
            "bc": 0,
            "de": 13635117,
            "hl": 13634317,
            "ix": 13640964,
            "iy": 13631616,
            "f": 128,
            "halted": false,
            "madl": 1,
            "stepCount": 4996
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740056,
              "value": 64
            },
            {
              "addr": 13740059,
              "value": 668218
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            },
            {
              "addr": 13740077,
              "value": 65336
            }
          ],
          "vram": 10825,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 0,
            "D00596": 25,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 420
            },
            "vramCurrent": 10825,
            "lastKey": null
          }
        },
        "inferredOwner": "0x0A31E2",
        "evidence": "onBlock observes state before each lifted block executes; the pointer triple was live after the previous observed block and zero on entry to this block"
      },
      "firstAllZero": null,
      "stopRequested": {
        "reason": "first_pointer_triple_zero",
        "block": 4986,
        "pc": "0x0A31A2",
        "prevPc": "0x0A31E2"
      },
      "fieldTransitions": [],
      "lastWatchFields": {
        "D0243A": 13740279,
        "D0243D": 13805629,
        "D007CA": 361961,
        "D02590": 13893249
      }
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.

