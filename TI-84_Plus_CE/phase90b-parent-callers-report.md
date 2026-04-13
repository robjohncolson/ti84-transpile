# Phase 90b — Parent Caller Probe

Goal: find which caller of fn-containing-CALL-0x0a29ec draws the full home screen.


## Summary

| probe | drawn | fg | bg | bbox | called | steps | term |
|-------|------:|---:|---:|------|--------|------:|------|
| caller_7907a | 21804 | 18204 | 3600 | r37-114 c0-313 |   | 80000 | max_steps |
| caller_86132 | 21804 | 18204 | 3600 | r37-114 c0-313 |   | 80000 | max_steps |
| caller_86170 | 21804 | 18204 | 3600 | r37-114 c0-313 |   | 80000 | max_steps |
| caller_86198 | 21804 | 18204 | 3600 | r37-114 c0-313 |   | 80000 | max_steps |
| caller_861d4 | 21804 | 18204 | 3600 | r37-114 c0-313 |   | 80000 | max_steps |
| caller_86324 | 21804 | 18204 | 3600 | r37-114 c0-313 |   | 80000 | max_steps |
| caller_8633a | 21804 | 18204 | 3600 | r37-114 c0-313 |   | 80000 | max_steps |
| caller_863fd | 21804 | 18204 | 3600 | r37-114 c0-313 |   | 80000 | max_steps |
| fn_25afe | 0 | 0 | 0 | none |   | 80000 | max_steps |
| fn_609be | 8090 | 4002 | 4088 | r17-42 c0-319 | ✓29ec  | 80000 | max_steps |
| fn_6c861 | 5652 | 4716 | 936 | r17-34 c0-313 | ✓29ec  | 24049 | missing_block |
| fn_78f42 | 0 | 0 | 0 | none |   | 16 | missing_block |
| fn_88471 | 21804 | 18204 | 3600 | r37-114 c0-313 |   | 80000 | max_steps |