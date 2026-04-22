# Phase 25AG - cx Init + NewContext(A=0x40) + CoorMon Dispatch Probe

## Date

2026-04-22

## Objective

Compare two ways of initializing the TI-84 CE context before running `CoorMon`:
- Manual seed of `cxMain..cxCurApp` with `cxMain=0x058241` and `cxCurApp=0x40`
- `NewContext(0x40)` after `MEM_INIT`

Both scenarios also seed `kbdKey=0x05`, `kbdGetKy=0x05`, `keyMatrix[1]=0xFE`, `errSP=0x7FFFFA`, and push `FAKE_RET=0x7FFFFE` before entering `CoorMon`.

## Comparison

| Scenario | Init Result | Pre cxCurApp | GetCSC | ParseInp | RAM CLEAR | Final cxCurApp | CoorMon Termination |
|----------|-------------|--------------|--------|----------|-----------|----------------|---------------------|
| Scenario A - Manual cx seed | manual seed | 0x40 | yes | no | yes | 0x00 | max_steps |
| Scenario B - NewContext(A=0x40) | max_steps/100000 | 0x00 | yes | no | yes | 0x00 | max_steps |

## Scenario A - Manual cx seed

- Boot: steps=3025 term=halt lastPc=0x0019b5
- Post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
- Post-boot cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
- MEM_INIT: term=return_hit steps=18 finalPc=0x7ffff6
- Post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTempCnt=0x000000 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 flashSize=0x0c0000 errSP=0x000000 errNo=0x00
- Post-MEM_INIT cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]

### Manual cx Seed

- Seeded cx context: cxMain=0x058241 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x40 tailE1=0x00 raw=[41 82 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 40 00]

### Pre-CoorMon Seed State

- keyMatrix[1]: 0xfe
- kbdKey: 0x05
- kbdGetKy: 0x05
- errSP: 0x7ffffa
- Pre-CoorMon pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTempCnt=0x000000 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 flashSize=0x0c0000 errSP=0x7ffffa errNo=0x00
- Pre-CoorMon cx context: cxMain=0x058241 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x40 tailE1=0x00 raw=[41 82 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 40 00]

### CoorMon Result

- Termination: max_steps
- Steps: 100000
- Loops forced: 11
- Final PC: 0x006202
- GetCSC hit steps: 1643
- ParseInp hit steps: (none)
- RAM CLEAR hit count: 1
- cxCurApp before CoorMon: 0x40
- cxCurApp after CoorMon: 0x00
- cxCurApp zeroed during run: yes (step=3584 pc=0x001881)
- Final OP1 bytes: 00 00 00 00 00 00 00 00 00
- Final errNo: 0x00
- Final errSP: 0x000000
- Final pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
- Final cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]

### RAM CLEAR Snapshot

- First hit: step=3584 pc=0x001881
- cx context at entry: cxMain=0x058241 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x40 tailE1=0x00 raw=[41 82 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 40 00]
- pointer snapshot at entry: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTempCnt=0x000000 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 flashSize=0x0c0000 errSP=0x7ffffa errNo=0x00

### cxCurApp Change Log

- step=3584 pc=0x001881 0x40 -> 0x00

### First 200 Unique PCs

1. 0x08c331 (CoorMon)
2. 0x05c634
3. 0x05c67c
4. 0x08c339 (CoorMon)
5. 0x06ce73
6. 0x06ce7f
7. 0x06ce7b
8. 0x06c8ab
9. 0x08c33d (CoorMon)
10. 0x0a349a
11. 0x0a349f
12. 0x0a32f9
13. 0x0a3301
14. 0x08c308
15. 0x0a331e
16. 0x0a336f
17. 0x0a3383
18. 0x0a338a
19. 0x0a33fb
20. 0x0a3408
21. 0x0a3404
22. 0x0a340f
23. 0x0a3392
24. 0x0a339a
25. 0x0a33e6
26. 0x0a33ff
27. 0x0a33ee
28. 0x0a3403
29. 0x0a33a2
30. 0x0a33aa
31. 0x0a33b2
32. 0x0a33ba
33. 0x0a33c2
34. 0x0a33ca
35. 0x0a33da
36. 0x0a33e4
37. 0x0a34ae
38. 0x08c341 (CoorMon)
39. 0x05c75b
40. 0x05c760
41. 0x05c768
42. 0x05c771
43. 0x05c795
44. 0x05c7a5
45. 0x05c7ad
46. 0x05c7b5
47. 0x05c7c1
48. 0x05c7d7
49. 0x05c7dd
50. 0x05c7ed
51. 0x05c815
52. 0x0a237e
53. 0x0a2a37
54. 0x0a2389
55. 0x05c819
56. 0x05c82c
57. 0x05c832
58. 0x05e3d6
59. 0x04c973
60. 0x05c836
61. 0x05c838
62. 0x05c83e
63. 0x05e3f5
64. 0x05c842
65. 0x05c849
66. 0x05c875
67. 0x05c87e
68. 0x0a1799
69. 0x0a17af
70. 0x0a17b2
71. 0x0a17b8
72. 0x07bf3e
73. 0x07bf4d
74. 0x07bf5c
75. 0x000380
76. 0x003d85
77. 0x07bf61
78. 0x0a17c5
79. 0x0a2d4c
80. 0x0a17d0
81. 0x00038c
82. 0x005a53
83. 0x0a17e9
84. 0x0a17ef
85. 0x0a17f7
86. 0x0a1805
87. 0x0a1842
88. 0x0a184a
89. 0x0a1854
90. 0x0a187c
91. 0x0a188a
92. 0x0a189e
93. 0x0a190d
94. 0x0a1965
95. 0x0a1a3b
96. 0x0a1a3f
97. 0x0a1a48
98. 0x0a1a44
99. 0x0a1a4e
100. 0x0a1969
101. 0x0a1976
102. 0x0a1980
103. 0x0a19cc
104. 0x0a1a17
105. 0x0a1a1d
106. 0x0a1a58
107. 0x0a1a61
108. 0x0a1a5d
109. 0x0a1a4f
110. 0x0a1a68
111. 0x0a1a67
112. 0x0a1a30
113. 0x05c883
114. 0x08c345 (CoorMon)
115. 0x08c359 (CoorMon)
116. 0x02fcb3
117. 0x02fcb9
118. 0x02fd8f
119. 0x02fda6
120. 0x03013a
121. 0x03013f
122. 0x030145
123. 0x03014b
124. 0x030151
125. 0x030157
126. 0x02fdac
127. 0x05c76c
128. 0x05c81e
129. 0x02fdb6
130. 0x03fa09 (GetCSC)
131. 0x03fa1c
132. 0x03fa93
133. 0x03fa9c
134. 0x03faa2
135. 0x03fabc
136. 0x02515c
137. 0x025196
138. 0x0251a1
139. 0x0251cb
140. 0x03fac1
141. 0x0005f4
142. 0x0158b1
143. 0x03fac5
144. 0x03fac9
145. 0x03fad6
146. 0x03fae2
147. 0x03fae8
148. 0x048ac4
149. 0x00012c
150. 0x002197
151. 0x048acc
152. 0x048ae0
153. 0x048ae5
154. 0x03f26d
155. 0x048ae9
156. 0x048b07
157. 0x048b11
158. 0x048b21
159. 0x048b26
160. 0x05206e
161. 0x052089
162. 0x048b3c
163. 0x048b5b
164. 0x0000b0
165. 0x00285f
166. 0x002873
167. 0x00287d
168. 0x048b69
169. 0x048b81
170. 0x048b91
171. 0x048ba1
172. 0x048bb1
173. 0x048bc1
174. 0x048bd1
175. 0x0457b2
176. 0x04586b
177. 0x048bd7
178. 0x048beb
179. 0x04e07b
180. 0x000130
181. 0x00218a
182. 0x04e07f
183. 0x04e091
184. 0x04e0a1
185. 0x04e0b1
186. 0x052013
187. 0x04e0cc
188. 0x0bcd24
189. 0x04e0d1
190. 0x04e0d6
191. 0x048bfb
192. 0x049cca
193. 0x049cd2
194. 0x049d11
195. 0x049d19
196. 0x049a23
197. 0x049a2b
198. 0x049a3a
199. 0x000124
200. 0x00211b

## Scenario B - NewContext(A=0x40)

- Boot: steps=3025 term=halt lastPc=0x0019b5
- Post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
- Post-boot cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
- MEM_INIT: term=return_hit steps=18 finalPc=0x7ffff6
- Post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTempCnt=0x000000 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 flashSize=0x0c0000 errSP=0x000000 errNo=0x00
- Post-MEM_INIT cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]

### NewContext(A=0x40)

- Run result: term=max_steps steps=100000 finalPc=0x006202
- Pre-NewContext pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTempCnt=0x000000 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 flashSize=0x0c0000 errSP=0x7ffffa errNo=0x00
- Pre-NewContext cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
- Post-NewContext pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
- Post-NewContext cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]

### Pre-CoorMon Seed State

- keyMatrix[1]: 0xfe
- kbdKey: 0x05
- kbdGetKy: 0x05
- errSP: 0x7ffffa
- Pre-CoorMon pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x7ffffa errNo=0x00
- Pre-CoorMon cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]

### CoorMon Result

- Termination: max_steps
- Steps: 100000
- Loops forced: 11
- Final PC: 0x006202
- GetCSC hit steps: 651
- ParseInp hit steps: (none)
- RAM CLEAR hit count: 1
- cxCurApp before CoorMon: 0x00
- cxCurApp after CoorMon: 0x00
- cxCurApp zeroed during run: no
- Final OP1 bytes: 00 00 00 00 00 00 00 00 00
- Final errNo: 0x00
- Final errSP: 0x000000
- Final pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
- Final cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]

### RAM CLEAR Snapshot

- First hit: step=2592 pc=0x001881
- cx context at entry: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
- pointer snapshot at entry: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x7ffffa errNo=0x00

### cxCurApp Change Log

(none)

### First 200 Unique PCs

1. 0x08c331 (CoorMon)
2. 0x05c634
3. 0x05c67c
4. 0x08c339 (CoorMon)
5. 0x06ce73
6. 0x06ce7f
7. 0x06ce7b
8. 0x06c8ab
9. 0x08c33d (CoorMon)
10. 0x0a349a
11. 0x0a349f
12. 0x0a32f9
13. 0x0a3301
14. 0x08c308
15. 0x0a331e
16. 0x0a336f
17. 0x0a3383
18. 0x0a338a
19. 0x0a33fb
20. 0x0a3408
21. 0x0a3404
22. 0x0a340f
23. 0x0a3392
24. 0x0a339a
25. 0x0a33e6
26. 0x0a33ff
27. 0x0a33ee
28. 0x0a3403
29. 0x0a33a2
30. 0x0a33aa
31. 0x0a33b2
32. 0x0a33ba
33. 0x0a33c2
34. 0x0a33ca
35. 0x0a33da
36. 0x0a33e4
37. 0x0a34ae
38. 0x08c341 (CoorMon)
39. 0x05c75b
40. 0x05c760
41. 0x05c768
42. 0x05c771
43. 0x05c795
44. 0x05c7a5
45. 0x05c7ad
46. 0x05c7b5
47. 0x05c7c1
48. 0x05c7d7
49. 0x05c7dd
50. 0x05c7ed
51. 0x05c815
52. 0x0a237e
53. 0x0a2a37
54. 0x0a2389
55. 0x05c819
56. 0x05c82c
57. 0x05c832
58. 0x05e3d6
59. 0x04c973
60. 0x05c836
61. 0x05c838
62. 0x05c83e
63. 0x05e3f5
64. 0x05c842
65. 0x05c849
66. 0x05c875
67. 0x05c87e
68. 0x0a1799
69. 0x0a17af
70. 0x0a17b2
71. 0x0a17b8
72. 0x07bf3e
73. 0x07bf4d
74. 0x07bf5c
75. 0x000380
76. 0x003d85
77. 0x07bf61
78. 0x0a17c5
79. 0x0a2d4c
80. 0x0a17d0
81. 0x00038c
82. 0x005a53
83. 0x0a17e9
84. 0x0a17ef
85. 0x0a17f7
86. 0x0a1805
87. 0x0a1842
88. 0x0a184a
89. 0x0a1854
90. 0x0a187c
91. 0x0a188a
92. 0x0a189e
93. 0x0a190d
94. 0x0a191f
95. 0x0a1939
96. 0x0a1969
97. 0x0a1976
98. 0x0a1980
99. 0x0a19cc
100. 0x0a19d7
101. 0x0a1a1d
102. 0x0a1a30
103. 0x05c883
104. 0x08c345 (CoorMon)
105. 0x08c359 (CoorMon)
106. 0x02fcb3
107. 0x02fcb9
108. 0x02fd8f
109. 0x02fda6
110. 0x03013a
111. 0x03013f
112. 0x030145
113. 0x03014b
114. 0x030151
115. 0x030157
116. 0x02fdac
117. 0x05c76c
118. 0x05c81e
119. 0x02fdb6
120. 0x03fa09 (GetCSC)
121. 0x03fa1c
122. 0x03fa93
123. 0x03fa9c
124. 0x03faa2
125. 0x03fabc
126. 0x02515c
127. 0x025196
128. 0x0251a1
129. 0x0251cb
130. 0x03fac1
131. 0x0005f4
132. 0x0158b1
133. 0x03fac5
134. 0x03fac9
135. 0x03fad6
136. 0x03fae2
137. 0x03fae8
138. 0x048ac4
139. 0x00012c
140. 0x002197
141. 0x048acc
142. 0x048ae0
143. 0x048ae5
144. 0x03f26d
145. 0x048ae9
146. 0x048b07
147. 0x048b11
148. 0x048b21
149. 0x048b26
150. 0x05206e
151. 0x052089
152. 0x048b3c
153. 0x048b5b
154. 0x0000b0
155. 0x00285f
156. 0x002873
157. 0x00287d
158. 0x048b69
159. 0x048b81
160. 0x048b91
161. 0x048ba1
162. 0x048bb1
163. 0x048bc1
164. 0x048bd1
165. 0x0457b2
166. 0x04586b
167. 0x048bd7
168. 0x048beb
169. 0x04e07b
170. 0x000130
171. 0x00218a
172. 0x04e07f
173. 0x04e091
174. 0x04e0a1
175. 0x04e0b1
176. 0x052013
177. 0x04e0cc
178. 0x0bcd24
179. 0x04e0d1
180. 0x04e0d6
181. 0x048bfb
182. 0x049cca
183. 0x049cd2
184. 0x049d11
185. 0x049d19
186. 0x049a23
187. 0x049a2b
188. 0x049a3a
189. 0x000124
190. 0x00211b
191. 0x002147
192. 0x049aa7
193. 0x000210
194. 0x002623
195. 0x00263e
196. 0x002649
197. 0x049ac9
198. 0x049cc2
199. 0x049d23
200. 0x049d2f

## Console Output

```text
=== Phase 25AG: cx init + NewContext(A=0x40) + CoorMon ===

=== Scenario A - Manual cx seed ===
boot: steps=3025 term=halt lastPc=0x0019b5
post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
post-boot cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
MEM_INIT: term=return_hit steps=18 finalPc=0x7ffff6
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTempCnt=0x000000 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 flashSize=0x0c0000 errSP=0x000000 errNo=0x00
post-MEM_INIT cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
manual cx seed: cxMain=0x058241 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x40 tailE1=0x00 raw=[41 82 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 40 00]
keyboard seed: keyMatrix[1]=0xfe kbdKey=0x05 kbdGetKy=0x05
errSP before CoorMon: 0x7ffffa
pre-CoorMon pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTempCnt=0x000000 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 flashSize=0x0c0000 errSP=0x7ffffa errNo=0x00
pre-CoorMon cx context: cxMain=0x058241 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x40 tailE1=0x00 raw=[41 82 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 40 00]
CoorMon: term=max_steps steps=100000 loopsForced=11 finalPc=0x006202
CoorMon hits: GetCSC=1 ParseInp=0 RAM_CLEAR=1
post-CoorMon pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
post-CoorMon cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
post-CoorMon OP1: 00 00 00 00 00 00 00 00 00

=== Scenario B - NewContext(A=0x40) ===
boot: steps=3025 term=halt lastPc=0x0019b5
post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
post-boot cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
MEM_INIT: term=return_hit steps=18 finalPc=0x7ffff6
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTempCnt=0x000000 pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 flashSize=0x0c0000 errSP=0x000000 errNo=0x00
post-MEM_INIT cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
NewContext: term=max_steps steps=100000 finalPc=0x006202
pre-NewContext cx: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
post-NewContext cx: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
post-NewContext pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
keyboard seed: keyMatrix[1]=0xfe kbdKey=0x05 kbdGetKy=0x05
errSP before CoorMon: 0x7ffffa
pre-CoorMon pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x7ffffa errNo=0x00
pre-CoorMon cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
CoorMon: term=max_steps steps=100000 loopsForced=11 finalPc=0x006202
CoorMon hits: GetCSC=1 ParseInp=0 RAM_CLEAR=1
post-CoorMon pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTempCnt=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 flashSize=0x000000 errSP=0x000000 errNo=0x00
post-CoorMon cx context: cxMain=0x000000 cxPPutAway=0x000000 cxPutAway=0x000000 cxReDisp=0x000000 cxErrorEP=0x000000 cxSizeWind=0x000000 cxPage=0x000000 cxCurApp=0x00 tailE1=0x00 raw=[00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
post-CoorMon OP1: 00 00 00 00 00 00 00 00 00
```
