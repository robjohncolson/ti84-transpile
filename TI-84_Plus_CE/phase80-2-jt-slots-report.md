# Phase 80-2 - JT Slot Entry Probes

Direct-entry probes for the remaining 0x0a2xxx JT slot targets from the phase77 0x0a2xxx family.

Note: the task prompt named 11 slots but described 12 untested entries; this run also includes inferred missing `slot623_0a2802`.

## Results

| probe | entry | variant | drawn | fg | bg | bbox | steps | termination |
|-------|-------|---------|------:|---:|---:|------|------:|-------------|
| `slot591_0a2032` | 0x0a2032 (= NewLine) | `default` | 0 | 0 | 0 | none | 7 | missing_block |
| `slot591_0a2032` | 0x0a2032 (= NewLine) | `de_4f` | 0 | 0 | 0 | none | 7 | missing_block |
| `slot595_0a215b` | 0x0a215b (= ShrinkWindow) | `default` | 0 | 0 | 0 | none | 1 | missing_block |
| `slot595_0a215b` | 0x0a215b (= ShrinkWindow) | `de_4f` | 0 | 0 | 0 | none | 1 | missing_block |
| `slot599_0a21bb` | 0x0a21bb (= ClrLCDFull) | `default` | 0 | 0 | 0 | none | 34243 | missing_block |
| `slot599_0a21bb` | 0x0a21bb (= ClrLCDFull) | `de_4f` | 0 | 0 | 0 | none | 34243 | missing_block |
| `slot603_0a21f2` | 0x0a21f2 (= ClrScrn) | `default` | 0 | 0 | 0 | none | 34249 | missing_block |
| `slot603_0a21f2` | 0x0a21f2 (= ClrScrn) | `de_4f` | 0 | 0 | 0 | none | 34249 | missing_block |
| `slot607_0a22b1` | 0x0a22b1 (= EraseEOL) | `default` | 0 | 0 | 0 | none | 47 | missing_block |
| `slot607_0a22b1` | 0x0a22b1 (= EraseEOL) | `de_4f` | 0 | 0 | 0 | none | 47 | missing_block |
| `slot611_0a237e` | 0x0a237e (= GetCurloc) | `default` | 0 | 0 | 0 | none | 3 | missing_block |
| `slot611_0a237e` | 0x0a237e (= GetCurloc) | `de_4f` | 0 | 0 | 0 | none | 3 | missing_block |
| `slot615_0a26ee` | 0x0a26ee (= VPutSN) | `default` | 0 | 0 | 0 | none | 39 | missing_block |
| `slot615_0a26ee` | 0x0a26ee (= VPutSN) | `de_4f` | 0 | 0 | 0 | none | 39 | missing_block |
| `slot619_0a27dd` | 0x0a27dd (= RunIndicOn) | `default` | 0 | 0 | 0 | none | 3 | missing_block |
| `slot619_0a27dd` | 0x0a27dd (= RunIndicOn) | `de_4f` | 0 | 0 | 0 | none | 3 | missing_block |
| `slot623_0a2802` | 0x0a2802 (= SaveShadow) | `default` | 0 | 0 | 0 | none | 1 | missing_block |
| `slot623_0a2802` | 0x0a2802 (= SaveShadow) | `de_4f` | 0 | 0 | 0 | none | 1 | missing_block |
| `slot631_0a2a3e` | 0x0a2a3e (= GetKeypress) | `default` | 0 | 0 | 0 | none | 29 | missing_block |
| `slot631_0a2a3e` | 0x0a2a3e (= GetKeypress) | `de_4f` | 0 | 0 | 0 | none | 17 | missing_block |
| `slot643_0a2ca6` | 0x0a2ca6 (= FDispEOL) | `default` | 0 | 0 | 0 | none | 60 | missing_block |
| `slot643_0a2ca6` | 0x0a2ca6 (= FDispEOL) | `de_4f` | 0 | 0 | 0 | none | 60 | missing_block |
| `slot851_0a5424` | 0x0a5424 (= Load_Sfont) | `default` | 0 | 0 | 0 | none | 8 | missing_block |
| `slot851_0a5424` | 0x0a5424 (= Load_Sfont) | `de_4f` | 0 | 0 | 0 | none | 8 | missing_block |

## Block Traces (>1000 px)

None.

## ASCII Previews (>300 px)

None.

## Verdict

### Renderers

- None.

### State Helpers

- `slot591_0a2032` (0x0a2032 (= NewLine)): slot 591 - register save routine; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot595_0a215b` (0x0a215b (= ShrinkWindow)): slot 595 - cursor arithmetic at 0xd00595; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot599_0a21bb` (0x0a21bb (= ClrLCDFull)): slot 599 - short load; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot603_0a21f2` (0x0a21f2 (= ClrScrn)): slot 603 - call wrapper; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot607_0a22b1` (0x0a22b1 (= EraseEOL)): slot 607 - iy+42 flag check + 0x025c33; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot611_0a237e` (0x0a237e (= GetCurloc)): slot 611 - cursor+text prep (called by 0a29ec); `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot615_0a26ee` (0x0a26ee (= VPutSN)): slot 615 - push af + call 0a26f5; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot619_0a27dd` (0x0a27dd (= RunIndicOn)): slot 619 - iy+27 flag + state setup; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot623_0a2802` (0x0a2802 (= SaveShadow)): slot 623 - state snapshot to 0x0007c4/0xd007c7-0xd007c9; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot631_0a2a3e` (0x0a2a3e (= GetKeypress)): slot 631 - wraps 0a2a68; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot643_0a2ca6` (0x0a2ca6 (= FDispEOL)): slot 643 - iy+42 flag + 0x025dea; `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.
- `slot851_0a5424` (0x0a5424 (= Load_Sfont)): slot 851 - iy+53 flag + 0x02398e (= CallLocalizeHook) (icon renderer?); `default`=0, `de_4f`=0; best bbox=none, best termination=missing_block.

### Home-Screen Candidates

- None.