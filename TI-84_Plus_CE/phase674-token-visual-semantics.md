# Phase 674: Token Visual Semantics

Probe: `probe-phase674-token-visual-semantics.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase674-token-visual-semantics.mjs`

## Result

- Overall: **PASS**
- Scope: one booted browser-shell run; no browser-shell/runtime edits.
- Sequence: 2 + 3 - * / . ( )
- Final buffer: 0x32 0x9E 0x33 0x71 0x82 0x83 0x3A 0x10
- Final D0243A: 0xD1A8D5
- Page errors: []

## Findings

- 7/7 operator/punctuation deposit bytes have a different direct ROM-font bitmap than their intended ASCII symbol; these bytes must be treated as tokens, not direct character codes.
- The browser sequence exposed the first 8 deposited bytes as 0x32 0x9E 0x33 0x71 0x82 0x83 0x3A 0x10 and advanced D0243A to 0xD1A8D5 after 9 inserts, so the visual quirks are not buffer/cursor failures.
- Adjacent operator/punctuation rendering rewrites pixels in-place: "*" bbox 39,42..46,50, "/" bbox 50,39..71,51 with 0 light-pixel erasures, "." bbox 62,39..71,52 with 80 erasures.
- "(" still rewrites the dot band (62,39..71,52 with 35 erasures), while ")" advances to 76,39..81,52; the phase673 overlap is renderer context behavior rather than a frozen canvas or missing cursor advance.

## Direct ROM Font Comparison

| token | deposit | intended ASCII | deposit font ink/advance | ASCII font ink/advance | same bitmap | conclusion |
|---|---:|---:|---:|---:|---|---|
| + | 0x9E | 0x2B | 40 / 12 | 36 / 13 | no | deposit byte is a token code; direct font glyph is not the intended ASCII symbol |
| - | 0x71 | 0x2D | 55 / 13 | 20 / 13 | no | deposit byte is a token code; direct font glyph is not the intended ASCII symbol |
| * | 0x82 | 0x2A | 33 / 11 | 52 / 12 | no | deposit byte is a token code; direct font glyph is not the intended ASCII symbol |
| / | 0x83 | 0x2F | 32 / 11 | 29 / 13 | no | deposit byte is a token code; direct font glyph is not the intended ASCII symbol |
| . | 0x3A | 0x2E | 18 / 9 | 16 / 9 | no | deposit byte is a token code; direct font glyph is not the intended ASCII symbol |
| ( | 0x10 | 0x28 | 48 / 13 | 38 / 11 | no | deposit byte is a token code; direct font glyph is not the intended ASCII symbol |
| ) | 0x11 | 0x29 | 37 / 13 | 37 / 11 | no | deposit byte is a token code; direct font glyph is not the intended ASCII symbol |

## Browser Sequence

| step | key | deposit | key pass | cursor | ink prev | light prev | incremental bbox | final bbox from baseline |
|---:|---|---:|---|---:|---:|---:|---|---|
| 1 | 2 | 0x32 | PASS | 0xD1A8CD | 65 | 0 | 2,39..11,52 | 2,39..11,52 |
| 2 | + | 0x9E | PASS | 0xD1A8CE | 59 | 0 | 14,39..23,48 | 2,39..23,52 |
| 3 | 3 | 0x33 | PASS | 0xD1A8CF | 33 | 25 | 14,39..23,52 | 2,39..23,52 |
| 4 | - | 0x71 | PASS | 0xD1A8D0 | 20 | 0 | 26,45..35,46 | 2,39..35,52 |
| 5 | * | 0x82 | PASS | 0xD1A8D1 | 52 | 0 | 39,42..46,50 | 2,39..46,52 |
| 6 | / | 0x83 | PASS | 0xD1A8D2 | 109 | 0 | 50,39..71,51 | 2,39..71,52 |
| 7 | . | 0x3A | PASS | 0xD1A8D3 | 45 | 80 | 62,39..71,52 | 2,39..71,52 |
| 8 | ( | 0x10 | PASS | 0xD1A8D4 | 28 | 35 | 62,39..71,52 | 2,39..69,52 |
| 9 | ) | 0x11 | PASS | 0xD1A8D5 | 37 | 0 | 76,39..81,52 | 2,39..81,52 |

## Incremental ASCII Diffs

### 2

```text
037|              
038|              
039|    ######    
040|   ########   
041|  ##      ##  
042|  ##      ##  
043|          ##  
044|         ###  
045|        ###   
046|       ###    
047|      ###     
048|     ###      
049|    ###       
050|   ###        
051|  ##########  
052|  ##########  
053|              
054|              
```

### +

```text
037|              
038|              
039|  ########    
040|  #########   
041|  ##     ###  
042|  ##      ##  
043|  ##      ##  
044|  ##      ##  
045|  ##     ###  
046|  #########   
047|  ########    
048|  ##   #      
049|              
050|              
```

### 3

```text
037|              
038|              
039|  ++          
040|  +           
041|    #      +  
042|              
043|  ++          
044|  ++     #    
045|  ++ ####  +  
046|  +++     +   
047|  +++++++ #   
048|  ++   +  ##  
049|  ##      ##  
050|  ###    ###  
051|   ########   
052|    ######    
053|              
054|              
```

### -

```text
043|              
044|              
045|  ##########  
046|  ##########  
047|              
048|              
```

### *

```text
040|            
041|            
042|  ## ## ##  
043|  ## ## ##  
044|   ######   
045|    ####    
046|  ########  
047|    ####    
048|   ######   
049|  ## ## ##  
050|  ## ## ##  
051|            
052|            
```

### /

```text
037|                          
038|                          
039|              ##########  
040|              ##########  
041|           #  ##########  
042|          ##  ##########  
043|         ###  ##########  
044|        ###   ##########  
045|       ###    ##########  
046|      ###     ##########  
047|     ###                  
048|    ###                   
049|   ###                    
050|  ###                     
051|  ##                      
052|                          
053|                          
```

### .

```text
037|              
038|              
039|  ++++++++++  
040|  ++++++++++  
041|  ++++++++++  
042|  ++++++++++  
043|  ++++++++++  
044|  ++++++++++  
045|  ++++++++++  
046|  ++++++++++  
047|              
048|       #####  
049|  ##########  
050|  ##########  
051|  ##########  
052|  ##########  
053|              
054|              
```

### (

```text
037|              
038|              
039|       ###    
040|      ##      
041|     ###      
042|     ##       
043|    ###       
044|    ###       
045|    ###       
046|    ###       
047|    ###       
048|    ###+++++  
049|  +++  +++++  
050|  +++   ++++  
051|  ++++  ++++  
052|  +++++   ++  
053|              
054|              
```

### )

```text
037|          
038|          
039|  ###     
040|    ##    
041|     ##   
042|     ##   
043|     ###  
044|     ###  
045|     ###  
046|     ###  
047|     ###  
048|     ###  
049|     ##   
050|    ###   
051|    ##    
052|  ###     
053|          
054|          
```

## Final ASCII Diff

```text
037|                                                                                    
038|                                                                                    
039|    ######      ######                                             ###      ###     
040|   ########    ########                                           ##          ##    
041|  ##      ##  ###    ##                                    #     ###           ##   
042|  ##      ##  ##      ##               ## ## ##           ##     ##            ##   
043|          ##          ##               ## ## ##          ###    ###            ###  
044|         ###         ###                ######          ###     ###            ###  
045|        ###      ######   ##########     ####          ###      ###            ###  
046|       ###       #####    ##########   ########       ###       ###            ###  
047|      ###            ##                  ####        ###        ###            ###  
048|     ###              ##                ######      ###         ###            ###  
049|    ###       ##      ##               ## ## ##    ###           ##            ##   
050|   ###        ###    ###               ## ## ##   ###            ###          ###   
051|  ##########   ########                           ##              ##          ##    
052|  ##########    ######                                             ###      ###     
053|                                                                                    
054|                                                                                    
```

## Full JSON

```json
{
  "probe": "phase674-token-visual-semantics",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:55153/browser-shell.html",
  "pass": true,
  "sequence": [
    "2",
    "+",
    "3",
    "-",
    "*",
    "/",
    ".",
    "(",
    ")"
  ],
  "baseline": {
    "label": "baseline",
    "roi": {
      "x": 0,
      "y": 34,
      "w": 160,
      "h": 24
    },
    "inkPixels": 0,
    "diffFromBaseline": 0,
    "inkDiffFromBaseline": 0,
    "lightDiffFromBaseline": 0,
    "diffFromPrevious": 0,
    "inkDiffFromPrevious": 0,
    "lightDiffFromPrevious": 0,
    "bbox": null,
    "incrementalBbox": null,
    "rows": [],
    "incrementalRows": [],
    "ascii": "",
    "incrementalAscii": ""
  },
  "findings": [
    "7/7 operator/punctuation deposit bytes have a different direct ROM-font bitmap than their intended ASCII symbol; these bytes must be treated as tokens, not direct character codes.",
    "The browser sequence exposed the first 8 deposited bytes as 0x32 0x9E 0x33 0x71 0x82 0x83 0x3A 0x10 and advanced D0243A to 0xD1A8D5 after 9 inserts, so the visual quirks are not buffer/cursor failures.",
    "Adjacent operator/punctuation rendering rewrites pixels in-place: \"*\" bbox 39,42..46,50, \"/\" bbox 50,39..71,51 with 0 light-pixel erasures, \".\" bbox 62,39..71,52 with 80 erasures.",
    "\"(\" still rewrites the dot band (62,39..71,52 with 35 erasures), while \")\" advances to 76,39..81,52; the phase673 overlap is renderer context behavior rather than a frozen canvas or missing cursor advance."
  ],
  "directGlyphs": [
    {
      "label": "+",
      "deposit": 158,
      "asciiCode": 43,
      "depositGlyph": {
        "charCode": 158,
        "advance": 12,
        "ink": 40,
        "ascii": "00|         ##\n01|        ##\n02|    #   #\n03|\n04|\n05|  ###   #\n06|  ###   #\n07|    #   #\n08|    #   #\n09|    #   #\n10|    #   #\n11|    #   #\n12| ####   ####\n13| ####   ####"
      },
      "asciiGlyph": {
        "charCode": 43,
        "advance": 13,
        "ink": 36,
        "ascii": "00|\n01|\n02|    #   #\n03|    #   #\n04|    #   #\n05|    #   #\n06|#####   #####\n07|#####   #####\n08|    #   #\n09|    #   #\n10|    #   #\n11|    #   #\n12|\n13|"
      },
      "sameBitmap": false,
      "conclusion": "deposit byte is a token code; direct font glyph is not the intended ASCII symbol"
    },
    {
      "label": "-",
      "deposit": 113,
      "asciiCode": 45,
      "depositGlyph": {
        "charCode": 113,
        "advance": 13,
        "ink": 55,
        "ascii": "00|\n01|\n02|\n03|\n04|  ###   #####\n05| ####   #####\n06|###       ###\n07|##         ##\n08|###       ###\n09| ####   #####\n10|  ###   ## ##\n11|           ##\n12|           ##\n13|           ##"
      },
      "asciiGlyph": {
        "charCode": 45,
        "advance": 13,
        "ink": 20,
        "ascii": "00|\n01|\n02|\n03|\n04|\n05|\n06|#####   #####\n07|#####   #####\n08|\n09|\n10|\n11|\n12|\n13|"
      },
      "sameBitmap": false,
      "conclusion": "deposit byte is a token code; direct font glyph is not the intended ASCII symbol"
    },
    {
      "label": "*",
      "deposit": 130,
      "asciiCode": 42,
      "depositGlyph": {
        "charCode": 130,
        "advance": 11,
        "ink": 33,
        "ascii": "00|\n01|\n02|\n03|\n04|   ##   #\n05|  ###   ##\n06|  #      ##\n07|         ##\n08|        ##\n09|    #   #\n10|   ##\n11|  ##\n12|  ###   ###\n13|  ###   ###"
      },
      "asciiGlyph": {
        "charCode": 42,
        "advance": 12,
        "ink": 52,
        "ascii": "00|\n01|\n02|\n03| ## #   # ##\n04| ## #   # ##\n05|  ###   ###\n06|   ##   ##\n07| ####   ####\n08|   ##   ##\n09|  ###   ###\n10| ## #   # ##\n11| ## #   # ##\n12|\n13|"
      },
      "sameBitmap": false,
      "conclusion": "deposit byte is a token code; direct font glyph is not the intended ASCII symbol"
    },
    {
      "label": "/",
      "deposit": 131,
      "asciiCode": 47,
      "depositGlyph": {
        "charCode": 131,
        "advance": 11,
        "ink": 32,
        "ascii": "00|\n01|\n02|\n03|\n04|   ##   #\n05|  ###   ##\n06|  #      ##\n07|         ##\n08|    #   ##\n09|    #   ##\n10|         ##\n11|  #      ##\n12|  ###   ##\n13|   ##   #"
      },
      "asciiGlyph": {
        "charCode": 47,
        "advance": 13,
        "ink": 29,
        "ascii": "00|\n01|\n02|            #\n03|           ##\n04|          ###\n05|         ###\n06|        ###\n07|    #   ##\n08|   ##   #\n09|  ###\n10| ###\n11|###\n12|##\n13|"
      },
      "sameBitmap": false,
      "conclusion": "deposit byte is a token code; direct font glyph is not the intended ASCII symbol"
    },
    {
      "label": ".",
      "deposit": 58,
      "asciiCode": 46,
      "depositGlyph": {
        "charCode": 58,
        "advance": 9,
        "ink": 18,
        "ascii": "00|\n01|\n02|\n03|   ##   #\n04|   ##   #\n05|   ##   #\n06|\n07|\n08|\n09|   ##   #\n10|   ##   #\n11|   ##   #\n12|\n13|"
      },
      "asciiGlyph": {
        "charCode": 46,
        "advance": 9,
        "ink": 16,
        "ascii": "00|\n01|\n02|\n03|\n04|\n05|\n06|\n07|\n08|\n09|\n10|  ###   #\n11|  ###   #\n12|  ###   #\n13|  ###   #"
      },
      "sameBitmap": false,
      "conclusion": "deposit byte is a token code; direct font glyph is not the intended ASCII symbol"
    },
    {
      "label": "(",
      "deposit": 16,
      "asciiCode": 40,
      "depositGlyph": {
        "charCode": 16,
        "advance": 13,
        "ink": 48,
        "ascii": "00|    #   #####\n01|    #   #####\n02|    #   #\n03|    #   #\n04|    #   #\n05|    #   #\n06|    #   #\n07|#   #   #\n08|##  #   #\n09|### #   #\n10| ####   #\n11|  ###   #\n12|   ##   #\n13|    #   #"
      },
      "asciiGlyph": {
        "charCode": 40,
        "advance": 11,
        "ink": 38,
        "ascii": "00|        ###\n01|    #   #\n02|   ##   #\n03|   ##\n04|  ###\n05|  ###\n06|  ###\n07|  ###\n08|  ###\n09|  ###\n10|   ##\n11|   ##   #\n12|    #   #\n13|        ###"
      },
      "sameBitmap": false,
      "conclusion": "deposit byte is a token code; direct font glyph is not the intended ASCII symbol"
    },
    {
      "label": ")",
      "deposit": 17,
      "asciiCode": 41,
      "depositGlyph": {
        "charCode": 17,
        "advance": 13,
        "ink": 37,
        "ascii": "00|         ##\n01|        ###\n02|    #   ###\n03|         ##\n04|####     ##\n05|####     ##\n06|         ##\n07|    #   #####\n08|    #   #####\n09|\n10|\n11|\n12|\n13|"
      },
      "asciiGlyph": {
        "charCode": 41,
        "advance": 11,
        "ink": 37,
        "ascii": "00|  ###\n01|    #   #\n02|        ##\n03|        ##\n04|        ###\n05|        ###\n06|        ###\n07|        ###\n08|        ###\n09|        ###\n10|        ##\n11|    #   ##\n12|    #   #\n13|  ###"
      },
      "sameBitmap": false,
      "conclusion": "deposit byte is a token code; direct font glyph is not the intended ASCII symbol"
    }
  ],
  "steps": [
    {
      "label": "2",
      "code": "Digit2",
      "expected": 50,
      "pass": true,
      "steps": 3609,
      "termination": "insert_stop",
      "insertBlock": 2601,
      "wipes": 0,
      "D0243A": 13740237,
      "D007CA": 361961,
      "buffer": [
        50,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "sample": {
        "label": "2",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 65,
        "diffFromBaseline": 65,
        "inkDiffFromBaseline": 65,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 65,
        "inkDiffFromPrevious": 65,
        "lightDiffFromPrevious": 0,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 11,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 2,
          "y0": 39,
          "x1": 11,
          "y1": 52
        },
        "rows": [
          {
            "y": 39,
            "count": 6
          },
          {
            "y": 40,
            "count": 8
          },
          {
            "y": 41,
            "count": 4
          },
          {
            "y": 42,
            "count": 4
          },
          {
            "y": 43,
            "count": 2
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 3
          },
          {
            "y": 46,
            "count": 3
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 3
          },
          {
            "y": 49,
            "count": 3
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 10
          },
          {
            "y": 52,
            "count": 10
          }
        ],
        "incrementalRows": [
          {
            "y": 39,
            "count": 6
          },
          {
            "y": 40,
            "count": 8
          },
          {
            "y": 41,
            "count": 4
          },
          {
            "y": 42,
            "count": 4
          },
          {
            "y": 43,
            "count": 2
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 3
          },
          {
            "y": 46,
            "count": 3
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 3
          },
          {
            "y": 49,
            "count": 3
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 10
          },
          {
            "y": 52,
            "count": 10
          }
        ],
        "ascii": "037|              \n038|              \n039|    ######    \n040|   ########   \n041|  ##      ##  \n042|  ##      ##  \n043|          ##  \n044|         ###  \n045|        ###   \n046|       ###    \n047|      ###     \n048|     ###      \n049|    ###       \n050|   ###        \n051|  ##########  \n052|  ##########  \n053|              \n054|              ",
        "incrementalAscii": "037|              \n038|              \n039|    ######    \n040|   ########   \n041|  ##      ##  \n042|  ##      ##  \n043|          ##  \n044|         ###  \n045|        ###   \n046|       ###    \n047|      ###     \n048|     ###      \n049|    ###       \n050|   ###        \n051|  ##########  \n052|  ##########  \n053|              \n054|              "
      }
    },
    {
      "label": "+",
      "code": "Equal",
      "expected": 158,
      "pass": true,
      "steps": 3791,
      "termination": "insert_stop",
      "insertBlock": 2781,
      "wipes": 0,
      "D0243A": 13740238,
      "D007CA": 361961,
      "buffer": [
        50,
        158,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "sample": {
        "label": "+",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 124,
        "diffFromBaseline": 124,
        "inkDiffFromBaseline": 124,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 59,
        "inkDiffFromPrevious": 59,
        "lightDiffFromPrevious": 0,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 23,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 14,
          "y0": 39,
          "x1": 23,
          "y1": 48
        },
        "rows": [
          {
            "y": 39,
            "count": 14
          },
          {
            "y": 40,
            "count": 17
          },
          {
            "y": 41,
            "count": 9
          },
          {
            "y": 42,
            "count": 8
          },
          {
            "y": 43,
            "count": 6
          },
          {
            "y": 44,
            "count": 7
          },
          {
            "y": 45,
            "count": 8
          },
          {
            "y": 46,
            "count": 12
          },
          {
            "y": 47,
            "count": 11
          },
          {
            "y": 48,
            "count": 6
          },
          {
            "y": 49,
            "count": 3
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 10
          },
          {
            "y": 52,
            "count": 10
          }
        ],
        "incrementalRows": [
          {
            "y": 39,
            "count": 8
          },
          {
            "y": 40,
            "count": 9
          },
          {
            "y": 41,
            "count": 5
          },
          {
            "y": 42,
            "count": 4
          },
          {
            "y": 43,
            "count": 4
          },
          {
            "y": 44,
            "count": 4
          },
          {
            "y": 45,
            "count": 5
          },
          {
            "y": 46,
            "count": 9
          },
          {
            "y": 47,
            "count": 8
          },
          {
            "y": 48,
            "count": 3
          }
        ],
        "ascii": "037|                          \n038|                          \n039|    ######    ########    \n040|   ########   #########   \n041|  ##      ##  ##     ###  \n042|  ##      ##  ##      ##  \n043|          ##  ##      ##  \n044|         ###  ##      ##  \n045|        ###   ##     ###  \n046|       ###    #########   \n047|      ###     ########    \n048|     ###      ##   #      \n049|    ###                   \n050|   ###                    \n051|  ##########              \n052|  ##########              \n053|                          \n054|                          ",
        "incrementalAscii": "037|              \n038|              \n039|  ########    \n040|  #########   \n041|  ##     ###  \n042|  ##      ##  \n043|  ##      ##  \n044|  ##      ##  \n045|  ##     ###  \n046|  #########   \n047|  ########    \n048|  ##   #      \n049|              \n050|              "
      }
    },
    {
      "label": "3",
      "code": "Digit3",
      "expected": 51,
      "pass": true,
      "steps": 4027,
      "termination": "insert_stop",
      "insertBlock": 3016,
      "wipes": 0,
      "D0243A": 13740239,
      "D007CA": 361961,
      "buffer": [
        50,
        158,
        51,
        0,
        0,
        0,
        0,
        0
      ],
      "sample": {
        "label": "3",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 132,
        "diffFromBaseline": 132,
        "inkDiffFromBaseline": 132,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 58,
        "inkDiffFromPrevious": 33,
        "lightDiffFromPrevious": 25,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 23,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 14,
          "y0": 39,
          "x1": 23,
          "y1": 52
        },
        "rows": [
          {
            "y": 39,
            "count": 12
          },
          {
            "y": 40,
            "count": 16
          },
          {
            "y": 41,
            "count": 9
          },
          {
            "y": 42,
            "count": 8
          },
          {
            "y": 43,
            "count": 4
          },
          {
            "y": 44,
            "count": 6
          },
          {
            "y": 45,
            "count": 9
          },
          {
            "y": 46,
            "count": 8
          },
          {
            "y": 47,
            "count": 5
          },
          {
            "y": 48,
            "count": 5
          },
          {
            "y": 49,
            "count": 7
          },
          {
            "y": 50,
            "count": 9
          },
          {
            "y": 51,
            "count": 18
          },
          {
            "y": 52,
            "count": 16
          }
        ],
        "incrementalRows": [
          {
            "y": 39,
            "count": 2
          },
          {
            "y": 40,
            "count": 1
          },
          {
            "y": 41,
            "count": 2
          },
          {
            "y": 43,
            "count": 2
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 7
          },
          {
            "y": 46,
            "count": 4
          },
          {
            "y": 47,
            "count": 8
          },
          {
            "y": 48,
            "count": 5
          },
          {
            "y": 49,
            "count": 4
          },
          {
            "y": 50,
            "count": 6
          },
          {
            "y": 51,
            "count": 8
          },
          {
            "y": 52,
            "count": 6
          }
        ],
        "ascii": "037|                          \n038|                          \n039|    ######      ######    \n040|   ########    ########   \n041|  ##      ##  ###    ##   \n042|  ##      ##  ##      ##  \n043|          ##          ##  \n044|         ###         ###  \n045|        ###      ######   \n046|       ###       #####    \n047|      ###            ##   \n048|     ###              ##  \n049|    ###       ##      ##  \n050|   ###        ###    ###  \n051|  ##########   ########   \n052|  ##########    ######    \n053|                          \n054|                          ",
        "incrementalAscii": "037|              \n038|              \n039|  ++          \n040|  +           \n041|    #      +  \n042|              \n043|  ++          \n044|  ++     #    \n045|  ++ ####  +  \n046|  +++     +   \n047|  +++++++ #   \n048|  ++   +  ##  \n049|  ##      ##  \n050|  ###    ###  \n051|   ########   \n052|    ######    \n053|              \n054|              "
      }
    },
    {
      "label": "-",
      "code": "Minus",
      "expected": 113,
      "pass": true,
      "steps": 3617,
      "termination": "insert_stop",
      "insertBlock": 2608,
      "wipes": 0,
      "D0243A": 13740240,
      "D007CA": 361961,
      "buffer": [
        50,
        158,
        51,
        113,
        0,
        0,
        0,
        0
      ],
      "sample": {
        "label": "-",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 152,
        "diffFromBaseline": 152,
        "inkDiffFromBaseline": 152,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 20,
        "inkDiffFromPrevious": 20,
        "lightDiffFromPrevious": 0,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 35,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 26,
          "y0": 45,
          "x1": 35,
          "y1": 46
        },
        "rows": [
          {
            "y": 39,
            "count": 12
          },
          {
            "y": 40,
            "count": 16
          },
          {
            "y": 41,
            "count": 9
          },
          {
            "y": 42,
            "count": 8
          },
          {
            "y": 43,
            "count": 4
          },
          {
            "y": 44,
            "count": 6
          },
          {
            "y": 45,
            "count": 19
          },
          {
            "y": 46,
            "count": 18
          },
          {
            "y": 47,
            "count": 5
          },
          {
            "y": 48,
            "count": 5
          },
          {
            "y": 49,
            "count": 7
          },
          {
            "y": 50,
            "count": 9
          },
          {
            "y": 51,
            "count": 18
          },
          {
            "y": 52,
            "count": 16
          }
        ],
        "incrementalRows": [
          {
            "y": 45,
            "count": 10
          },
          {
            "y": 46,
            "count": 10
          }
        ],
        "ascii": "037|                                      \n038|                                      \n039|    ######      ######                \n040|   ########    ########               \n041|  ##      ##  ###    ##               \n042|  ##      ##  ##      ##              \n043|          ##          ##              \n044|         ###         ###              \n045|        ###      ######   ##########  \n046|       ###       #####    ##########  \n047|      ###            ##               \n048|     ###              ##              \n049|    ###       ##      ##              \n050|   ###        ###    ###              \n051|  ##########   ########               \n052|  ##########    ######                \n053|                                      \n054|                                      ",
        "incrementalAscii": "043|              \n044|              \n045|  ##########  \n046|  ##########  \n047|              \n048|              "
      }
    },
    {
      "label": "*",
      "code": "NumpadMultiply",
      "expected": 130,
      "pass": true,
      "steps": 3362,
      "termination": "insert_stop",
      "insertBlock": 2356,
      "wipes": 0,
      "D0243A": 13740241,
      "D007CA": 361961,
      "buffer": [
        50,
        158,
        51,
        113,
        130,
        0,
        0,
        0
      ],
      "sample": {
        "label": "*",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 204,
        "diffFromBaseline": 204,
        "inkDiffFromBaseline": 204,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 52,
        "inkDiffFromPrevious": 52,
        "lightDiffFromPrevious": 0,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 46,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 39,
          "y0": 42,
          "x1": 46,
          "y1": 50
        },
        "rows": [
          {
            "y": 39,
            "count": 12
          },
          {
            "y": 40,
            "count": 16
          },
          {
            "y": 41,
            "count": 9
          },
          {
            "y": 42,
            "count": 14
          },
          {
            "y": 43,
            "count": 10
          },
          {
            "y": 44,
            "count": 12
          },
          {
            "y": 45,
            "count": 23
          },
          {
            "y": 46,
            "count": 26
          },
          {
            "y": 47,
            "count": 9
          },
          {
            "y": 48,
            "count": 11
          },
          {
            "y": 49,
            "count": 13
          },
          {
            "y": 50,
            "count": 15
          },
          {
            "y": 51,
            "count": 18
          },
          {
            "y": 52,
            "count": 16
          }
        ],
        "incrementalRows": [
          {
            "y": 42,
            "count": 6
          },
          {
            "y": 43,
            "count": 6
          },
          {
            "y": 44,
            "count": 6
          },
          {
            "y": 45,
            "count": 4
          },
          {
            "y": 46,
            "count": 8
          },
          {
            "y": 47,
            "count": 4
          },
          {
            "y": 48,
            "count": 6
          },
          {
            "y": 49,
            "count": 6
          },
          {
            "y": 50,
            "count": 6
          }
        ],
        "ascii": "037|                                                 \n038|                                                 \n039|    ######      ######                           \n040|   ########    ########                          \n041|  ##      ##  ###    ##                          \n042|  ##      ##  ##      ##               ## ## ##  \n043|          ##          ##               ## ## ##  \n044|         ###         ###                ######   \n045|        ###      ######   ##########     ####    \n046|       ###       #####    ##########   ########  \n047|      ###            ##                  ####    \n048|     ###              ##                ######   \n049|    ###       ##      ##               ## ## ##  \n050|   ###        ###    ###               ## ## ##  \n051|  ##########   ########                          \n052|  ##########    ######                           \n053|                                                 \n054|                                                 ",
        "incrementalAscii": "040|            \n041|            \n042|  ## ## ##  \n043|  ## ## ##  \n044|   ######   \n045|    ####    \n046|  ########  \n047|    ####    \n048|   ######   \n049|  ## ## ##  \n050|  ## ## ##  \n051|            \n052|            "
      }
    },
    {
      "label": "/",
      "code": "Slash",
      "expected": 131,
      "pass": true,
      "steps": 2364,
      "termination": "insert_stop",
      "insertBlock": 1365,
      "wipes": 0,
      "D0243A": 13740242,
      "D007CA": 361961,
      "buffer": [
        50,
        158,
        51,
        113,
        130,
        131,
        0,
        0
      ],
      "sample": {
        "label": "/",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 313,
        "diffFromBaseline": 313,
        "inkDiffFromBaseline": 313,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 109,
        "inkDiffFromPrevious": 109,
        "lightDiffFromPrevious": 0,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 71,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 50,
          "y0": 39,
          "x1": 71,
          "y1": 51
        },
        "rows": [
          {
            "y": 39,
            "count": 22
          },
          {
            "y": 40,
            "count": 26
          },
          {
            "y": 41,
            "count": 20
          },
          {
            "y": 42,
            "count": 26
          },
          {
            "y": 43,
            "count": 23
          },
          {
            "y": 44,
            "count": 25
          },
          {
            "y": 45,
            "count": 36
          },
          {
            "y": 46,
            "count": 39
          },
          {
            "y": 47,
            "count": 12
          },
          {
            "y": 48,
            "count": 14
          },
          {
            "y": 49,
            "count": 16
          },
          {
            "y": 50,
            "count": 18
          },
          {
            "y": 51,
            "count": 20
          },
          {
            "y": 52,
            "count": 16
          }
        ],
        "incrementalRows": [
          {
            "y": 39,
            "count": 10
          },
          {
            "y": 40,
            "count": 10
          },
          {
            "y": 41,
            "count": 11
          },
          {
            "y": 42,
            "count": 12
          },
          {
            "y": 43,
            "count": 13
          },
          {
            "y": 44,
            "count": 13
          },
          {
            "y": 45,
            "count": 13
          },
          {
            "y": 46,
            "count": 13
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 3
          },
          {
            "y": 49,
            "count": 3
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 2
          }
        ],
        "ascii": "037|                                                                          \n038|                                                                          \n039|    ######      ######                                        ##########  \n040|   ########    ########                                       ##########  \n041|  ##      ##  ###    ##                                    #  ##########  \n042|  ##      ##  ##      ##               ## ## ##           ##  ##########  \n043|          ##          ##               ## ## ##          ###  ##########  \n044|         ###         ###                ######          ###   ##########  \n045|        ###      ######   ##########     ####          ###    ##########  \n046|       ###       #####    ##########   ########       ###     ##########  \n047|      ###            ##                  ####        ###                  \n048|     ###              ##                ######      ###                   \n049|    ###       ##      ##               ## ## ##    ###                    \n050|   ###        ###    ###               ## ## ##   ###                     \n051|  ##########   ########                           ##                      \n052|  ##########    ######                                                    \n053|                                                                          \n054|                                                                          ",
        "incrementalAscii": "037|                          \n038|                          \n039|              ##########  \n040|              ##########  \n041|           #  ##########  \n042|          ##  ##########  \n043|         ###  ##########  \n044|        ###   ##########  \n045|       ###    ##########  \n046|      ###     ##########  \n047|     ###                  \n048|    ###                   \n049|   ###                    \n050|  ###                     \n051|  ##                      \n052|                          \n053|                          "
      }
    },
    {
      "label": ".",
      "code": "Period",
      "expected": 58,
      "pass": true,
      "steps": 3874,
      "termination": "insert_stop",
      "insertBlock": 2863,
      "wipes": 0,
      "D0243A": 13740243,
      "D007CA": 361961,
      "buffer": [
        50,
        158,
        51,
        113,
        130,
        131,
        58,
        0
      ],
      "sample": {
        "label": ".",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 278,
        "diffFromBaseline": 278,
        "inkDiffFromBaseline": 278,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 125,
        "inkDiffFromPrevious": 45,
        "lightDiffFromPrevious": 80,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 71,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 62,
          "y0": 39,
          "x1": 71,
          "y1": 52
        },
        "rows": [
          {
            "y": 39,
            "count": 12
          },
          {
            "y": 40,
            "count": 16
          },
          {
            "y": 41,
            "count": 10
          },
          {
            "y": 42,
            "count": 16
          },
          {
            "y": 43,
            "count": 13
          },
          {
            "y": 44,
            "count": 15
          },
          {
            "y": 45,
            "count": 26
          },
          {
            "y": 46,
            "count": 29
          },
          {
            "y": 47,
            "count": 12
          },
          {
            "y": 48,
            "count": 19
          },
          {
            "y": 49,
            "count": 26
          },
          {
            "y": 50,
            "count": 28
          },
          {
            "y": 51,
            "count": 30
          },
          {
            "y": 52,
            "count": 26
          }
        ],
        "incrementalRows": [
          {
            "y": 39,
            "count": 10
          },
          {
            "y": 40,
            "count": 10
          },
          {
            "y": 41,
            "count": 10
          },
          {
            "y": 42,
            "count": 10
          },
          {
            "y": 43,
            "count": 10
          },
          {
            "y": 44,
            "count": 10
          },
          {
            "y": 45,
            "count": 10
          },
          {
            "y": 46,
            "count": 10
          },
          {
            "y": 48,
            "count": 5
          },
          {
            "y": 49,
            "count": 10
          },
          {
            "y": 50,
            "count": 10
          },
          {
            "y": 51,
            "count": 10
          },
          {
            "y": 52,
            "count": 10
          }
        ],
        "ascii": "037|                                                                          \n038|                                                                          \n039|    ######      ######                                                    \n040|   ########    ########                                                   \n041|  ##      ##  ###    ##                                    #              \n042|  ##      ##  ##      ##               ## ## ##           ##              \n043|          ##          ##               ## ## ##          ###              \n044|         ###         ###                ######          ###               \n045|        ###      ######   ##########     ####          ###                \n046|       ###       #####    ##########   ########       ###                 \n047|      ###            ##                  ####        ###                  \n048|     ###              ##                ######      ###            #####  \n049|    ###       ##      ##               ## ## ##    ###        ##########  \n050|   ###        ###    ###               ## ## ##   ###         ##########  \n051|  ##########   ########                           ##          ##########  \n052|  ##########    ######                                        ##########  \n053|                                                                          \n054|                                                                          ",
        "incrementalAscii": "037|              \n038|              \n039|  ++++++++++  \n040|  ++++++++++  \n041|  ++++++++++  \n042|  ++++++++++  \n043|  ++++++++++  \n044|  ++++++++++  \n045|  ++++++++++  \n046|  ++++++++++  \n047|              \n048|       #####  \n049|  ##########  \n050|  ##########  \n051|  ##########  \n052|  ##########  \n053|              \n054|              "
      }
    },
    {
      "label": "(",
      "code": "BracketLeft",
      "expected": 16,
      "pass": true,
      "steps": 4203,
      "termination": "insert_stop",
      "insertBlock": 3191,
      "wipes": 0,
      "D0243A": 13740244,
      "D007CA": 361961,
      "buffer": [
        50,
        158,
        51,
        113,
        130,
        131,
        58,
        16
      ],
      "sample": {
        "label": "(",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 271,
        "diffFromBaseline": 271,
        "inkDiffFromBaseline": 271,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 63,
        "inkDiffFromPrevious": 28,
        "lightDiffFromPrevious": 35,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 69,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 62,
          "y0": 39,
          "x1": 71,
          "y1": 52
        },
        "rows": [
          {
            "y": 39,
            "count": 15
          },
          {
            "y": 40,
            "count": 18
          },
          {
            "y": 41,
            "count": 13
          },
          {
            "y": 42,
            "count": 18
          },
          {
            "y": 43,
            "count": 16
          },
          {
            "y": 44,
            "count": 18
          },
          {
            "y": 45,
            "count": 29
          },
          {
            "y": 46,
            "count": 32
          },
          {
            "y": 47,
            "count": 15
          },
          {
            "y": 48,
            "count": 17
          },
          {
            "y": 49,
            "count": 18
          },
          {
            "y": 50,
            "count": 21
          },
          {
            "y": 51,
            "count": 22
          },
          {
            "y": 52,
            "count": 19
          }
        ],
        "incrementalRows": [
          {
            "y": 39,
            "count": 3
          },
          {
            "y": 40,
            "count": 2
          },
          {
            "y": 41,
            "count": 3
          },
          {
            "y": 42,
            "count": 2
          },
          {
            "y": 43,
            "count": 3
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 3
          },
          {
            "y": 46,
            "count": 3
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 8
          },
          {
            "y": 49,
            "count": 8
          },
          {
            "y": 50,
            "count": 7
          },
          {
            "y": 51,
            "count": 8
          },
          {
            "y": 52,
            "count": 7
          }
        ],
        "ascii": "037|                                                                        \n038|                                                                        \n039|    ######      ######                                             ###  \n040|   ########    ########                                           ##    \n041|  ##      ##  ###    ##                                    #     ###    \n042|  ##      ##  ##      ##               ## ## ##           ##     ##     \n043|          ##          ##               ## ## ##          ###    ###     \n044|         ###         ###                ######          ###     ###     \n045|        ###      ######   ##########     ####          ###      ###     \n046|       ###       #####    ##########   ########       ###       ###     \n047|      ###            ##                  ####        ###        ###     \n048|     ###              ##                ######      ###         ###     \n049|    ###       ##      ##               ## ## ##    ###           ##     \n050|   ###        ###    ###               ## ## ##   ###            ###    \n051|  ##########   ########                           ##              ##    \n052|  ##########    ######                                             ###  \n053|                                                                        \n054|                                                                        ",
        "incrementalAscii": "037|              \n038|              \n039|       ###    \n040|      ##      \n041|     ###      \n042|     ##       \n043|    ###       \n044|    ###       \n045|    ###       \n046|    ###       \n047|    ###       \n048|    ###+++++  \n049|  +++  +++++  \n050|  +++   ++++  \n051|  ++++  ++++  \n052|  +++++   ++  \n053|              \n054|              "
      }
    },
    {
      "label": ")",
      "code": "BracketRight",
      "expected": 17,
      "pass": true,
      "steps": 3224,
      "termination": "insert_stop",
      "insertBlock": 2218,
      "wipes": 0,
      "D0243A": 13740245,
      "D007CA": 361961,
      "buffer": [
        50,
        158,
        51,
        113,
        130,
        131,
        58,
        16
      ],
      "sample": {
        "label": ")",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 308,
        "diffFromBaseline": 308,
        "inkDiffFromBaseline": 308,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 37,
        "inkDiffFromPrevious": 37,
        "lightDiffFromPrevious": 0,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 81,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 76,
          "y0": 39,
          "x1": 81,
          "y1": 52
        },
        "rows": [
          {
            "y": 39,
            "count": 18
          },
          {
            "y": 40,
            "count": 20
          },
          {
            "y": 41,
            "count": 15
          },
          {
            "y": 42,
            "count": 20
          },
          {
            "y": 43,
            "count": 19
          },
          {
            "y": 44,
            "count": 21
          },
          {
            "y": 45,
            "count": 32
          },
          {
            "y": 46,
            "count": 35
          },
          {
            "y": 47,
            "count": 18
          },
          {
            "y": 48,
            "count": 20
          },
          {
            "y": 49,
            "count": 20
          },
          {
            "y": 50,
            "count": 24
          },
          {
            "y": 51,
            "count": 24
          },
          {
            "y": 52,
            "count": 22
          }
        ],
        "incrementalRows": [
          {
            "y": 39,
            "count": 3
          },
          {
            "y": 40,
            "count": 2
          },
          {
            "y": 41,
            "count": 2
          },
          {
            "y": 42,
            "count": 2
          },
          {
            "y": 43,
            "count": 3
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 3
          },
          {
            "y": 46,
            "count": 3
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 3
          },
          {
            "y": 49,
            "count": 2
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 2
          },
          {
            "y": 52,
            "count": 3
          }
        ],
        "ascii": "037|                                                                                    \n038|                                                                                    \n039|    ######      ######                                             ###      ###     \n040|   ########    ########                                           ##          ##    \n041|  ##      ##  ###    ##                                    #     ###           ##   \n042|  ##      ##  ##      ##               ## ## ##           ##     ##            ##   \n043|          ##          ##               ## ## ##          ###    ###            ###  \n044|         ###         ###                ######          ###     ###            ###  \n045|        ###      ######   ##########     ####          ###      ###            ###  \n046|       ###       #####    ##########   ########       ###       ###            ###  \n047|      ###            ##                  ####        ###        ###            ###  \n048|     ###              ##                ######      ###         ###            ###  \n049|    ###       ##      ##               ## ## ##    ###           ##            ##   \n050|   ###        ###    ###               ## ## ##   ###            ###          ###   \n051|  ##########   ########                           ##              ##          ##    \n052|  ##########    ######                                             ###      ###     \n053|                                                                                    \n054|                                                                                    ",
        "incrementalAscii": "037|          \n038|          \n039|  ###     \n040|    ##    \n041|     ##   \n042|     ##   \n043|     ###  \n044|     ###  \n045|     ###  \n046|     ###  \n047|     ###  \n048|     ###  \n049|     ##   \n050|    ###   \n051|    ##    \n052|  ###     \n053|          \n054|          "
      }
    }
  ],
  "final": {
    "lastKey": {
      "code": "BracketRight",
      "label": ")",
      "expectedInsertByte": 17,
      "cursorBefore": 13740244,
      "insertBlock": 2218,
      "stoppedAfterInsert": true,
      "steps": 3224,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740245,
      "D007CA": 361961,
      "buffer": [
        50,
        158,
        51,
        113,
        130,
        131,
        58,
        16
      ],
      "vramPeak": 0,
      "vramCurrent": 8857
    },
    "status": "Key: ) ? 3224 steps (insert_stop, insert=0x11 @0xd1a8d4, peak 0px)",
    "errors": [],
    "vram": 8857,
    "buffer": [
      50,
      158,
      51,
      113,
      130,
      131,
      58,
      16
    ],
    "D0243A": 13740245
  },
  "errors": []
}
```

