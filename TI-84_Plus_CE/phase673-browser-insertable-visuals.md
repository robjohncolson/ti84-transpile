# Phase 673: Browser Insertable Visual Coverage

Probe: `probe-phase673-browser-insertable-visuals.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase673-browser-insertable-visuals.mjs`

## Result

- Overall: **PASS**
- Insert assertions: PASS
- Canvas assertions: PASS
- Final buffer: 0x71 0x82 0x83 0x3A 0x10 0x11 0x00 0x00
- Final D0243A: 0xD1A8D2
- Final VRAM pixels: 8660
- Final bbox: 2,39..45,52
- Page errors: []

## Key Insert Assertions

| key | code | expected | shell expected | termination | steps | insert block | wipes | buffer | D0243A | D007CA | status |
|---|---|---:|---:|---|---:|---:|---:|---|---:|---:|---|
| - | Minus | 0x71 | 0x71 | insert_stop | 3763 | 2754 | 0 | 0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 0x0585E9 | PASS |
| * | NumpadMultiply | 0x82 | 0x82 | insert_stop | 3657 | 2648 | 0 | 0x71 0x82 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CE | 0x0585E9 | PASS |
| / | Slash | 0x83 | 0x83 | insert_stop | 3999 | 2987 | 0 | 0x71 0x82 0x83 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CF | 0x0585E9 | PASS |
| . | Period | 0x3A | 0x3A | insert_stop | 4018 | 3007 | 0 | 0x71 0x82 0x83 0x3A 0x00 0x00 0x00 0x00 | 0xD1A8D0 | 0x0585E9 | PASS |
| ( | BracketLeft | 0x10 | 0x10 | insert_stop | 3372 | 2365 | 0 | 0x71 0x82 0x83 0x3A 0x10 0x00 0x00 0x00 | 0xD1A8D1 | 0x0585E9 | PASS |
| ) | BracketRight | 0x11 | 0x11 | insert_stop | 3812 | 2803 | 0 | 0x71 0x82 0x83 0x3A 0x10 0x11 0x00 0x00 | 0xD1A8D2 | 0x0585E9 | PASS |

## Canvas Assertions

| sample | ROI | diff vs baseline | ink diff vs baseline | incremental diff | incremental ink | bbox | incremental bbox | incremental rows | status |
|---|---|---:|---:|---:|---:|---|---|---|---|
| baseline | x=0, y=34, w=128, h=24 | 0 | 0 | 0 | 0 | - | - |  | - |
| - | x=0, y=34, w=128, h=24 | 20 | 20 | 20 | 20 | 2,45..11,46 | 2,45..11,46 | 45:10 46:10 | PASS |
| * | x=0, y=34, w=128, h=24 | 58 | 58 | 38 | 38 | 2,42..22,48 | 15,42..22,48 | 42:6 43:6 44:6 45:4 46:8 47:4 48:4 | PASS |
| / | x=0, y=34, w=128, h=24 | 56 | 56 | 40 | 19 | 2,41..23,50 | 15,41..23,50 | 41:1 42:6 43:5 44:5 45:3 46:5 47:1 48:2 49:6 50:6 | PASS |
| . | x=0, y=34, w=128, h=24 | 36 | 36 | 40 | 10 | 2,45..19,52 | 15,41..23,52 | 41:1 42:2 43:3 44:3 45:3 46:3 47:3 48:6 49:4 50:4 51:4 52:4 | PASS |
| ( | x=0, y=34, w=128, h=24 | 74 | 74 | 38 | 38 | 2,39..33,52 | 28,39..33,52 | 39:3 40:2 41:3 42:2 43:3 44:3 45:3 46:3 47:3 48:3 49:2 50:3 51:2 52:3 | PASS |
| ) | x=0, y=34, w=128, h=24 | 111 | 111 | 37 | 37 | 2,39..45,52 | 40,39..45,52 | 39:3 40:2 41:2 42:2 43:3 44:3 45:3 46:3 47:3 48:3 49:2 50:3 51:2 52:3 | PASS |

## Final ROI ASCII Diff

Baseline-relative changed dark pixels are `#`; changed light pixels are `+`.

```text
037|                                                
038|                                                
039|                               ###      ###     
040|                              ##          ##    
041|                             ###           ##   
042|                             ##            ##   
043|                            ###            ###  
044|                            ###            ###  
045|  ##########                ###            ###  
046|  ##########                ###            ###  
047|                            ###            ###  
048|                            ###            ###  
049|                ####         ##            ##   
050|                ####         ###          ###   
051|                ####          ##          ##    
052|                ####           ###      ###     
053|                                                
054|                                                
```

## Incremental ROI ASCII Diffs

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
048|   ####     
049|            
050|            
```

### /

```text
039|             
040|             
041|          #  
042|  ++ ++ + #  
043|  ++ ++   #  
044|   ++++  #   
045|    ++  #    
046|  +++   ++   
047|       +     
048|       ##    
049|  ## ## ##   
050|  ## ## ##   
051|             
052|             
```

### .

```text
039|             
040|             
041|          +  
042|         ++  
043|        +++  
044|       +++   
045|      +++    
046|     +++     
047|    +++      
048|   ++++++    
049|  + #   ++   
050|  + #   ++   
051|   ####      
052|   ####      
053|             
054|             
```

### (

```text
037|          
038|          
039|     ###  
040|    ##    
041|   ###    
042|   ##     
043|  ###     
044|  ###     
045|  ###     
046|  ###     
047|  ###     
048|  ###     
049|   ##     
050|   ###    
051|    ##    
052|     ###  
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


## Full JSON

```json
{
  "probe": "phase673-browser-insertable-visuals",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:57323/browser-shell.html",
  "pass": true,
  "insertPass": true,
  "canvasPass": true,
  "keys": [
    {
      "code": "Minus",
      "label": "-",
      "expectedInsertByte": 113,
      "cursorBefore": 13740236,
      "insertBlock": 2754,
      "stoppedAfterInsert": true,
      "steps": 3763,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740237,
      "D007CA": 361961,
      "buffer": [
        113,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8569,
      "expected": 113,
      "pass": true
    },
    {
      "code": "NumpadMultiply",
      "label": "*",
      "expectedInsertByte": 130,
      "cursorBefore": 13740237,
      "insertBlock": 2648,
      "stoppedAfterInsert": true,
      "steps": 3657,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740238,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8607,
      "expected": 130,
      "pass": true
    },
    {
      "code": "Slash",
      "label": "/",
      "expectedInsertByte": 131,
      "cursorBefore": 13740238,
      "insertBlock": 2987,
      "stoppedAfterInsert": true,
      "steps": 3999,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740239,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8605,
      "expected": 131,
      "pass": true
    },
    {
      "code": "Period",
      "label": ".",
      "expectedInsertByte": 58,
      "cursorBefore": 13740239,
      "insertBlock": 3007,
      "stoppedAfterInsert": true,
      "steps": 4018,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740240,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        58,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8585,
      "expected": 58,
      "pass": true
    },
    {
      "code": "BracketLeft",
      "label": "(",
      "expectedInsertByte": 16,
      "cursorBefore": 13740240,
      "insertBlock": 2365,
      "stoppedAfterInsert": true,
      "steps": 3372,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740241,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        58,
        16,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8623,
      "expected": 16,
      "pass": true
    },
    {
      "code": "BracketRight",
      "label": ")",
      "expectedInsertByte": 17,
      "cursorBefore": 13740241,
      "insertBlock": 2803,
      "stoppedAfterInsert": true,
      "steps": 3812,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740242,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        58,
        16,
        17,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8660,
      "expected": 17,
      "pass": true
    }
  ],
  "glyphs": [
    {
      "label": "baseline",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 24
      },
      "inkPixels": 0,
      "diffFromBaseline": 0,
      "inkDiffFromBaseline": 0,
      "diffFromPrevious": 0,
      "inkDiffFromPrevious": 0,
      "bbox": null,
      "incrementalBbox": null,
      "changedRows": [],
      "incrementalRows": [],
      "ascii": "",
      "incrementalAscii": ""
    },
    {
      "label": "-",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 24
      },
      "inkPixels": 20,
      "diffFromBaseline": 20,
      "inkDiffFromBaseline": 20,
      "diffFromPrevious": 20,
      "inkDiffFromPrevious": 20,
      "bbox": {
        "x0": 2,
        "y0": 45,
        "x1": 11,
        "y1": 46
      },
      "incrementalBbox": {
        "x0": 2,
        "y0": 45,
        "x1": 11,
        "y1": 46
      },
      "changedRows": [
        {
          "y": 45,
          "count": 10
        },
        {
          "y": 46,
          "count": 10
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
      "ascii": "043|              \n044|              \n045|  ##########  \n046|  ##########  \n047|              \n048|              ",
      "incrementalAscii": "043|              \n044|              \n045|  ##########  \n046|  ##########  \n047|              \n048|              ",
      "pass": true
    },
    {
      "label": "*",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 24
      },
      "inkPixels": 58,
      "diffFromBaseline": 58,
      "inkDiffFromBaseline": 58,
      "diffFromPrevious": 38,
      "inkDiffFromPrevious": 38,
      "bbox": {
        "x0": 2,
        "y0": 42,
        "x1": 22,
        "y1": 48
      },
      "incrementalBbox": {
        "x0": 15,
        "y0": 42,
        "x1": 22,
        "y1": 48
      },
      "changedRows": [
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
          "count": 14
        },
        {
          "y": 46,
          "count": 18
        },
        {
          "y": 47,
          "count": 4
        },
        {
          "y": 48,
          "count": 4
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
          "count": 4
        }
      ],
      "ascii": "040|                         \n041|                         \n042|               ## ## ##  \n043|               ## ## ##  \n044|                ######   \n045|  ##########     ####    \n046|  ##########   ########  \n047|                 ####    \n048|                ####     \n049|                         \n050|                         ",
      "incrementalAscii": "040|            \n041|            \n042|  ## ## ##  \n043|  ## ## ##  \n044|   ######   \n045|    ####    \n046|  ########  \n047|    ####    \n048|   ####     \n049|            \n050|            ",
      "pass": true
    },
    {
      "label": "/",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 24
      },
      "inkPixels": 56,
      "diffFromBaseline": 56,
      "inkDiffFromBaseline": 56,
      "diffFromPrevious": 40,
      "inkDiffFromPrevious": 19,
      "bbox": {
        "x0": 2,
        "y0": 41,
        "x1": 23,
        "y1": 50
      },
      "incrementalBbox": {
        "x0": 15,
        "y0": 41,
        "x1": 23,
        "y1": 50
      },
      "changedRows": [
        {
          "y": 41,
          "count": 1
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
      "incrementalRows": [
        {
          "y": 41,
          "count": 1
        },
        {
          "y": 42,
          "count": 6
        },
        {
          "y": 43,
          "count": 5
        },
        {
          "y": 44,
          "count": 5
        },
        {
          "y": 45,
          "count": 3
        },
        {
          "y": 46,
          "count": 5
        },
        {
          "y": 47,
          "count": 1
        },
        {
          "y": 48,
          "count": 2
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
      "ascii": "039|                          \n040|                          \n041|                       #  \n042|                      ##  \n043|                     ###  \n044|                    ###   \n045|  ##########       ###    \n046|  ##########      ###     \n047|                 ###      \n048|                ######    \n049|               ## ## ##   \n050|               ## ## ##   \n051|                          \n052|                          ",
      "incrementalAscii": "039|             \n040|             \n041|          #  \n042|  ++ ++ + #  \n043|  ++ ++   #  \n044|   ++++  #   \n045|    ++  #    \n046|  +++   ++   \n047|       +     \n048|       ##    \n049|  ## ## ##   \n050|  ## ## ##   \n051|             \n052|             ",
      "pass": true
    },
    {
      "label": ".",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 24
      },
      "inkPixels": 36,
      "diffFromBaseline": 36,
      "inkDiffFromBaseline": 36,
      "diffFromPrevious": 40,
      "inkDiffFromPrevious": 10,
      "bbox": {
        "x0": 2,
        "y0": 45,
        "x1": 19,
        "y1": 52
      },
      "incrementalBbox": {
        "x0": 15,
        "y0": 41,
        "x1": 23,
        "y1": 52
      },
      "changedRows": [
        {
          "y": 45,
          "count": 10
        },
        {
          "y": 46,
          "count": 10
        },
        {
          "y": 49,
          "count": 4
        },
        {
          "y": 50,
          "count": 4
        },
        {
          "y": 51,
          "count": 4
        },
        {
          "y": 52,
          "count": 4
        }
      ],
      "incrementalRows": [
        {
          "y": 41,
          "count": 1
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
          "count": 6
        },
        {
          "y": 49,
          "count": 4
        },
        {
          "y": 50,
          "count": 4
        },
        {
          "y": 51,
          "count": 4
        },
        {
          "y": 52,
          "count": 4
        }
      ],
      "ascii": "043|                      \n044|                      \n045|  ##########          \n046|  ##########          \n047|                      \n048|                      \n049|                ####  \n050|                ####  \n051|                ####  \n052|                ####  \n053|                      \n054|                      ",
      "incrementalAscii": "039|             \n040|             \n041|          +  \n042|         ++  \n043|        +++  \n044|       +++   \n045|      +++    \n046|     +++     \n047|    +++      \n048|   ++++++    \n049|  + #   ++   \n050|  + #   ++   \n051|   ####      \n052|   ####      \n053|             \n054|             ",
      "pass": true
    },
    {
      "label": "(",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 24
      },
      "inkPixels": 74,
      "diffFromBaseline": 74,
      "inkDiffFromBaseline": 74,
      "diffFromPrevious": 38,
      "inkDiffFromPrevious": 38,
      "bbox": {
        "x0": 2,
        "y0": 39,
        "x1": 33,
        "y1": 52
      },
      "incrementalBbox": {
        "x0": 28,
        "y0": 39,
        "x1": 33,
        "y1": 52
      },
      "changedRows": [
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
          "count": 6
        },
        {
          "y": 50,
          "count": 7
        },
        {
          "y": 51,
          "count": 6
        },
        {
          "y": 52,
          "count": 7
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
      "ascii": "037|                                    \n038|                                    \n039|                               ###  \n040|                              ##    \n041|                             ###    \n042|                             ##     \n043|                            ###     \n044|                            ###     \n045|  ##########                ###     \n046|  ##########                ###     \n047|                            ###     \n048|                            ###     \n049|                ####         ##     \n050|                ####         ###    \n051|                ####          ##    \n052|                ####           ###  \n053|                                    \n054|                                    ",
      "incrementalAscii": "037|          \n038|          \n039|     ###  \n040|    ##    \n041|   ###    \n042|   ##     \n043|  ###     \n044|  ###     \n045|  ###     \n046|  ###     \n047|  ###     \n048|  ###     \n049|   ##     \n050|   ###    \n051|    ##    \n052|     ###  \n053|          \n054|          ",
      "pass": true
    },
    {
      "label": ")",
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 24
      },
      "inkPixels": 111,
      "diffFromBaseline": 111,
      "inkDiffFromBaseline": 111,
      "diffFromPrevious": 37,
      "inkDiffFromPrevious": 37,
      "bbox": {
        "x0": 2,
        "y0": 39,
        "x1": 45,
        "y1": 52
      },
      "incrementalBbox": {
        "x0": 40,
        "y0": 39,
        "x1": 45,
        "y1": 52
      },
      "changedRows": [
        {
          "y": 39,
          "count": 6
        },
        {
          "y": 40,
          "count": 4
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
          "count": 6
        },
        {
          "y": 44,
          "count": 6
        },
        {
          "y": 45,
          "count": 16
        },
        {
          "y": 46,
          "count": 16
        },
        {
          "y": 47,
          "count": 6
        },
        {
          "y": 48,
          "count": 6
        },
        {
          "y": 49,
          "count": 8
        },
        {
          "y": 50,
          "count": 10
        },
        {
          "y": 51,
          "count": 8
        },
        {
          "y": 52,
          "count": 10
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
      "ascii": "037|                                                \n038|                                                \n039|                               ###      ###     \n040|                              ##          ##    \n041|                             ###           ##   \n042|                             ##            ##   \n043|                            ###            ###  \n044|                            ###            ###  \n045|  ##########                ###            ###  \n046|  ##########                ###            ###  \n047|                            ###            ###  \n048|                            ###            ###  \n049|                ####         ##            ##   \n050|                ####         ###          ###   \n051|                ####          ##          ##    \n052|                ####           ###      ###     \n053|                                                \n054|                                                ",
      "incrementalAscii": "037|          \n038|          \n039|  ###     \n040|    ##    \n041|     ##   \n042|     ##   \n043|     ###  \n044|     ###  \n045|     ###  \n046|     ###  \n047|     ###  \n048|     ###  \n049|     ##   \n050|    ###   \n051|    ##    \n052|  ###     \n053|          \n054|          ",
      "pass": true
    }
  ],
  "final": {
    "lastKey": {
      "code": "BracketRight",
      "label": ")",
      "expectedInsertByte": 17,
      "cursorBefore": 13740241,
      "insertBlock": 2803,
      "stoppedAfterInsert": true,
      "steps": 3812,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740242,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        58,
        16,
        17,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8660
    },
    "status": "Key: ) ? 3812 steps (insert_stop, insert=0x11 @0xd1a8d1, peak 0px)",
    "errors": [],
    "vram": 8660,
    "buffer": [
      113,
      130,
      131,
      58,
      16,
      17,
      0,
      0
    ],
    "D0243A": 13740242
  },
  "errors": []
}
```

