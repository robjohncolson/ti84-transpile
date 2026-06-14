# Phase 671: Browser Glyph Assert

Probe: `probe-phase671-browser-glyph-assert.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase671-browser-glyph-assert.mjs`

## Result

- Overall: **PASS**
- Final buffer: 0x32 0x33 0x9E 0x00 0x00 0x00 0x00 0x00
- Final D0243A: 0xD1A8CF
- Final VRAM pixels: 8680
- Final glyph ROI ink diff from baseline: 131
- Final glyph bbox: 2,39..23,52
- Page errors: []

## Key Insert Assertions

| key | termination | steps | insert block | wipes | buffer | D0243A | D007CA |
|---|---:|---:|---:|---:|---|---:|---:|
| 2 | insert_stop | 3609 | 2601 | 0 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 0x0585E9 |
| 3 | insert_stop | 3788 | 2778 | 0 | 0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CE | 0x0585E9 |
| + | insert_stop | 4030 | 3019 | 0 | 0x32 0x33 0x9E 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CF | 0x0585E9 |

## Canvas Glyph Assertions

| sample | ROI | diff vs baseline | ink diff vs baseline | incremental ink diff | bbox | changed rows |
|---|---|---:|---:|---:|---|---|
| baseline | x=0, y=34, w=64, h=24 | 0 | 0 | 0 | - |  |
| 2 | x=0, y=34, w=64, h=24 | 65 | 65 | 65 | 2,39..11,52 | 39:6 40:8 41:4 42:4 43:2 44:3 45:3 46:3 47:3 48:3 49:3 50:3 51:10 52:10 |
| 3 | x=0, y=34, w=64, h=24 | 107 | 107 | 42 | 2,39..23,52 | 39:12 40:16 41:9 42:8 43:4 44:6 45:9 46:8 47:5 48:4 49:3 50:3 51:10 52:10 |
| + | x=0, y=34, w=64, h=24 | 131 | 131 | 32 | 2,39..23,52 | 39:14 40:17 41:9 42:8 43:6 44:7 45:8 46:12 47:11 48:5 49:5 50:5 51:12 52:12 |

## Final ROI ASCII Diff

Baseline-relative changed dark pixels are `#`; changed light pixels are `+`.

```text
037|                          
038|                          
039|    ######    ########    
040|   ########   #########   
041|  ##      ##  ##     ###  
042|  ##      ##  ##      ##  
043|          ##  ##      ##  
044|         ###  ##      ##  
045|        ###   ##     ###  
046|       ###    #########   
047|      ###     ########    
048|     ###      ##          
049|    ###       ##          
050|   ###        ##          
051|  ##########  ##          
052|  ##########  ##          
053|                          
054|                          
```

## Per-Sample ROI ASCII Diffs

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

### 3

```text
037|                          
038|                          
039|    ######      ######    
040|   ########    ########   
041|  ##      ##  ###    ##   
042|  ##      ##  ##      ##  
043|          ##          ##  
044|         ###         ###  
045|        ###      ######   
046|       ###       #####    
047|      ###            ##   
048|     ###           #      
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
039|    ######    ########    
040|   ########   #########   
041|  ##      ##  ##     ###  
042|  ##      ##  ##      ##  
043|          ##  ##      ##  
044|         ###  ##      ##  
045|        ###   ##     ###  
046|       ###    #########   
047|      ###     ########    
048|     ###      ##          
049|    ###       ##          
050|   ###        ##          
051|  ##########  ##          
052|  ##########  ##          
053|                          
054|                          
```


## Full JSON

```json
{
  "probe": "phase671-browser-glyph-assert",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:54401/browser-shell.html",
  "pass": true,
  "insertPass": true,
  "glyphPass": true,
  "keys": [
    {
      "code": "Digit2",
      "label": "2",
      "expectedInsertByte": 50,
      "cursorBefore": 13740236,
      "insertBlock": 2601,
      "stoppedAfterInsert": true,
      "steps": 3609,
      "termination": "insert_stop",
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
      "vramPeak": 0,
      "vramCurrent": 8614,
      "expected": 50
    },
    {
      "code": "Digit3",
      "label": "3",
      "expectedInsertByte": 51,
      "cursorBefore": 13740237,
      "insertBlock": 2778,
      "stoppedAfterInsert": true,
      "steps": 3788,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740238,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8656,
      "expected": 51
    },
    {
      "code": "Equal",
      "label": "+",
      "expectedInsertByte": 158,
      "cursorBefore": 13740238,
      "insertBlock": 3019,
      "stoppedAfterInsert": true,
      "steps": 4030,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740239,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8680,
      "expected": 158
    }
  ],
  "glyphs": [
    {
      "label": "baseline",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 64,
        "h": 24
      },
      "inkPixels": 0,
      "diffFromBaseline": 0,
      "inkDiffFromBaseline": 0,
      "diffFromPrevious": 0,
      "inkDiffFromPrevious": 0,
      "bbox": null,
      "changedRows": [],
      "changedCols": [],
      "ascii": ""
    },
    {
      "label": "2",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 64,
        "h": 24
      },
      "inkPixels": 65,
      "diffFromBaseline": 65,
      "inkDiffFromBaseline": 65,
      "diffFromPrevious": 65,
      "inkDiffFromPrevious": 65,
      "bbox": {
        "x0": 2,
        "y0": 39,
        "x1": 11,
        "y1": 52
      },
      "changedRows": [
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
      "changedCols": [
        {
          "x": 2,
          "count": 4
        },
        {
          "x": 3,
          "count": 6
        },
        {
          "x": 4,
          "count": 6
        },
        {
          "x": 5,
          "count": 7
        },
        {
          "x": 6,
          "count": 7
        },
        {
          "x": 7,
          "count": 7
        },
        {
          "x": 8,
          "count": 7
        },
        {
          "x": 9,
          "count": 7
        },
        {
          "x": 10,
          "count": 8
        },
        {
          "x": 11,
          "count": 6
        }
      ],
      "ascii": "037|              \n038|              \n039|    ######    \n040|   ########   \n041|  ##      ##  \n042|  ##      ##  \n043|          ##  \n044|         ###  \n045|        ###   \n046|       ###    \n047|      ###     \n048|     ###      \n049|    ###       \n050|   ###        \n051|  ##########  \n052|  ##########  \n053|              \n054|              "
    },
    {
      "label": "3",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 64,
        "h": 24
      },
      "inkPixels": 107,
      "diffFromBaseline": 107,
      "inkDiffFromBaseline": 107,
      "diffFromPrevious": 42,
      "inkDiffFromPrevious": 42,
      "bbox": {
        "x0": 2,
        "y0": 39,
        "x1": 23,
        "y1": 52
      },
      "changedRows": [
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
          "count": 4
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
      "changedCols": [
        {
          "x": 2,
          "count": 4
        },
        {
          "x": 3,
          "count": 6
        },
        {
          "x": 4,
          "count": 6
        },
        {
          "x": 5,
          "count": 7
        },
        {
          "x": 6,
          "count": 7
        },
        {
          "x": 7,
          "count": 7
        },
        {
          "x": 8,
          "count": 7
        },
        {
          "x": 9,
          "count": 7
        },
        {
          "x": 10,
          "count": 8
        },
        {
          "x": 11,
          "count": 6
        },
        {
          "x": 14,
          "count": 2
        },
        {
          "x": 15,
          "count": 3
        },
        {
          "x": 16,
          "count": 3
        },
        {
          "x": 17,
          "count": 4
        },
        {
          "x": 18,
          "count": 4
        },
        {
          "x": 19,
          "count": 5
        },
        {
          "x": 20,
          "count": 4
        },
        {
          "x": 21,
          "count": 7
        },
        {
          "x": 22,
          "count": 7
        },
        {
          "x": 23,
          "count": 3
        }
      ],
      "ascii": "037|                          \n038|                          \n039|    ######      ######    \n040|   ########    ########   \n041|  ##      ##  ###    ##   \n042|  ##      ##  ##      ##  \n043|          ##          ##  \n044|         ###         ###  \n045|        ###      ######   \n046|       ###       #####    \n047|      ###            ##   \n048|     ###           #      \n049|    ###                   \n050|   ###                    \n051|  ##########              \n052|  ##########              \n053|                          \n054|                          "
    },
    {
      "label": "+",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 64,
        "h": 24
      },
      "inkPixels": 131,
      "diffFromBaseline": 131,
      "inkDiffFromBaseline": 131,
      "diffFromPrevious": 40,
      "inkDiffFromPrevious": 32,
      "bbox": {
        "x0": 2,
        "y0": 39,
        "x1": 23,
        "y1": 52
      },
      "changedRows": [
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
          "count": 5
        },
        {
          "y": 49,
          "count": 5
        },
        {
          "y": 50,
          "count": 5
        },
        {
          "y": 51,
          "count": 12
        },
        {
          "y": 52,
          "count": 12
        }
      ],
      "changedCols": [
        {
          "x": 2,
          "count": 4
        },
        {
          "x": 3,
          "count": 6
        },
        {
          "x": 4,
          "count": 6
        },
        {
          "x": 5,
          "count": 7
        },
        {
          "x": 6,
          "count": 7
        },
        {
          "x": 7,
          "count": 7
        },
        {
          "x": 8,
          "count": 7
        },
        {
          "x": 9,
          "count": 7
        },
        {
          "x": 10,
          "count": 8
        },
        {
          "x": 11,
          "count": 6
        },
        {
          "x": 14,
          "count": 14
        },
        {
          "x": 15,
          "count": 14
        },
        {
          "x": 16,
          "count": 4
        },
        {
          "x": 17,
          "count": 4
        },
        {
          "x": 18,
          "count": 4
        },
        {
          "x": 19,
          "count": 4
        },
        {
          "x": 20,
          "count": 4
        },
        {
          "x": 21,
          "count": 6
        },
        {
          "x": 22,
          "count": 7
        },
        {
          "x": 23,
          "count": 5
        }
      ],
      "ascii": "037|                          \n038|                          \n039|    ######    ########    \n040|   ########   #########   \n041|  ##      ##  ##     ###  \n042|  ##      ##  ##      ##  \n043|          ##  ##      ##  \n044|         ###  ##      ##  \n045|        ###   ##     ###  \n046|       ###    #########   \n047|      ###     ########    \n048|     ###      ##          \n049|    ###       ##          \n050|   ###        ##          \n051|  ##########  ##          \n052|  ##########  ##          \n053|                          \n054|                          "
    }
  ],
  "errors": [],
  "final": {
    "lastKey": {
      "code": "Equal",
      "label": "+",
      "expectedInsertByte": 158,
      "cursorBefore": 13740238,
      "insertBlock": 3019,
      "stoppedAfterInsert": true,
      "steps": 4030,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740239,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8680
    },
    "status": "Key: + → 4030 steps (insert_stop, insert=0x9e @0xd1a8ce, peak 0px)",
    "errors": [],
    "vram": 8680,
    "buffer": [
      50,
      51,
      158,
      0,
      0,
      0,
      0,
      0
    ],
    "D0243A": 13740239
  }
}
```

