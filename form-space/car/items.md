# Cars: everything a person can see, hear, feel or do

Stage 1 of Spec 1. Written from memory, unverified. Sizes are approximate. This covers the outside of a car. The inside is one line near the end, and it is a gap.

Each line starts with a tag that says what became of the item in the space:

- `[id, id]` the axes that say it
- `[part: id]` an axis says some of it, and something is still missing
- `[derived]` it follows from other choices and is not a choice of its own
- `[gap]` the space cannot say it yet
- `[out]` left out on purpose by the kit's rules

The Base set brief for a car is the minimum. Every family it lists is here, and the list goes further.

## 1. Form, across the street

Silhouette, proportion, stance.

1. `[wb]` Wheelbase, 2.3 to 3.2 m in ordinary practice
2. `[fo]` Front overhang
3. `[ro]` Rear overhang
4. `[derived]` Overall length
5. `[height]` Height, 1.15 to 1.9 m in ordinary practice
6. `[width]` Width
7. `[wheel]` Wheel size against the body
8. `[clear]` Ground clearance
9. `[archgap]` Space between tyre and arch
10. `[track]` How far the wheels sit inside the body
11. `[tumble]` How far the cabin leans in toward the roof
12. `[cowl]` Where the cabin sits between the axles
13. `[cowl, nose]` Long bonnet, short bonnet, no bonnet
14. `[nose]` Height of the nose
15. `[nrake]` Rake of the front face, upright to wedge
16. `[bonnet]` Bow of the bonnet
17. `[screen]` Windscreen angle, from laid back to upright
18. `[peak, crown]` Where the roof peaks and how much it arcs
19. `[roofend]` How far back the roof runs
20. `[rdrop]` How far the roof falls before it stops
21. `[fall]` The angle at which the back falls away
22. `[roofend, fall, tailh]` Three boxes: bonnet, cabin, boot (saloon)
23. `[roofend, fall]` Two boxes with a sloping back (hatchback)
24. `[roofend, fall]` Two boxes with an upright back (estate)
25. `[roofend, fall, rdrop]` One sweeping line to the tail (fastback, coupe)
26. `[cowl, screen, height]` One box (van, people carrier)
27. `[bed]` Open bed behind a separate cabin (pickup)
28. `[tailh]` Height of the tail against the belt
29. `[trake]` Rake of the tail face
30. `[fall, trake]` A back cut off flat
31. `[plan]` How rounded the corners are from above
32. `[waist]` A body pinched in between the wheels
33. `[height, clear, wheel]` Tall and raised (off-roader)
34. `[height, clear]` Low and close to the ground (sports car)
35. `[wb, fo, ro]` Very small cars
36. `[wb]` Very long cars
37. `[gap]` Three wheels, or six
38. `[gap]` Open wheels standing clear of the body
39. `[gap]` Separate wings and running boards
40. `[gap]` A boat tail, or a tail that tapers to a point in plan
41. `[gap]` No roof at all, with a low screen or none
42. `[gap]` A roof bar or hoop with open panels (targa)
43. `[gap]` A tall roof or a pop-up roof
44. `[gap]` Left and right sides that differ
45. `[gap]` A front wider than the rear, or the reverse
46. `[gap]` A stepped roof or a double-bubble roof
47. `[gap]` A cab that tilts, or a body in two hinged parts

## 2. Face, at arm's length

Layout, marks, colour, depth, surface.

48. `[belt]` Height of the bottom of the side glass
49. `[brise]` A belt line that rises or falls toward the rear
50. `[kick]` A kick in the belt at the last pillar
51. `[pillars]` Two, three or four pillars a side
52. `[prake]` A rear pillar that stands upright or leans
53. `[rail]` Depth of roof above the side glass
54. `[float]` A roof that floats on dark pillars
55. `[float]` Dark front pillars that join screen and side glass
56. `[tint]` How dark the glass is
57. `[gap]` A small extra window behind the rear door, or an oval one in the pillar
58. `[gap]` Side glass split by a bar, or a low second window in the door
59. `[rim]` Rim size against the tyre
60. `[spokes]` Number of spokes, 3 to 20
61. `[spoke]` Spoke shape: straight, tapered, split, swept, solid disc
62. `[dish]` How deep the wheel face sits
63. `[wfin]` Wheel finish
64. `[gap]` Wire wheels, steel wheels with hubcaps, covered rear wheels
65. `[hlw, hlh]` Headlamp size
66. `[hlsides, hlsoft]` Headlamp outline, round to sharp-cornered
67. `[hlslant]` Headlamps that slant up or down at the outer end
68. `[hlpos]` Headlamps high on the face or low
69. `[hlsplit]` Split lamps, stacked pairs, twin lamps
70. `[bar]` A light bar across the face
71. `[socket]` Lamps set back into the body
72. `[brow]` A brow of bodywork over each lamp
73. `[aper]` How much of the lamp opening is lit
74. `[gap]` Lamps that pop up or hide behind covers
75. `[gap]` Extra lamps: fog lamps, spot lamps, roof lamps
76. `[grille]` Grille pattern: bars, mesh, dots, blank, none
77. `[grw, grh]` Grille size
78. `[grsoft, grtaper]` Grille outline, oval to trapezoid
79. `[grpos]` Grille high or low on the face
80. `[grsplit]` A grille in two or three parts
81. `[out]` A grille shape that is a maker's mark
82. `[lower]` Openings low in the bumper
83. `[bcrease]` Lines, bulges and vents on the bonnet
84. `[gap]` A scoop or an air intake standing up from the bonnet
85. `[tlw, tlh, tlsoft]` Tail lamp size and outline
86. `[tlpos]` Tail lamps high or low
87. `[tbar]` A light bar across the tail
88. `[gap]` Upright tail lamps running up the pillars
89. `[plater]` Where the rear plate sits
90. `[outlets, outshape]` Exhaust outlets, how many and what shape
91. `[gap]` Exhausts that exit at the side or through the bumper centre
92. `[spoiler]` Lip, ducktail, wing, roof spoiler
93. `[hue, tone, sat]` Paint colour
94. `[finish]` Solid, metallic, pearl, matte, satin
95. `[roofc]` A roof in a second colour
96. `[stripes]` Stripes over bonnet and roof
97. `[sidestripe]` Stripes along the side
98. `[gap]` Two-tone paint split along the side, wood panels, wraps and pictures
99. `[clad]` Dark plastic along sills and arches, or a contrast lower body
100. `[shoulder, shline]` Height and path of the main line along the side
101. `[lines]` Number of pressed lines along the doors
102. `[sill]` The line along the bottom of the doors
103. `[arch]` Wheel arches from round to square
104. `[flare]` Arches that stand out from the body
105. `[nround, tround]` How rounded the nose and the tail are
106. `[gap]` Side vents, gills and scoops behind the wheels
107. `[gap]` Bumpers as separate bars, with overriders
108. `[part: clad]` Bumpers in a different colour from the body

## 3. Detail, at two inches

Finishing, edges, alignment, print, inner workings.

109. `[hlin]` What sits inside the headlamp
110. `[tlin]` What sits inside the tail lamp
111. `[grden]` How fine the grille pattern is
112. `[grsur]` The frame round the grille
113. `[cuts]` How the door gaps run
114. `[gap]` How wide and how even the gaps between panels are
115. `[hpos]` Where the door handles sit
116. `[mirror]` Mirrors on the door, at the pillar, or cameras
117. `[trim]` Bright work round the windows
118. `[frame]` Framed or frameless door glass
119. `[filler]` Fuel or charge door
120. `[badge]` A badge, drawn blank
121. `[out]` Maker's marks and model names
122. `[platef]` Where the front plate sits
123. `[antenna]` Fin, mast or none
124. `[tyre]` White bands and coloured lines on the tyre
125. `[caliper]` Brake caliper colour
126. `[diffuser]` Fins or a skid plate under the rear bumper
127. `[gap]` Wheel nuts, centre caps and valve stems
128. `[gap]` Tyre tread and the print on the tyre wall
129. `[gap]` Wipers and washer jets
130. `[gap]` Parking sensors, cameras and radar panels in the bumpers
131. `[gap]` Door seals, drip rails and the join between roof and side
132. `[gap]` Side repeaters, reflectors and marker lamps
133. `[gap]` Mud flaps and the lining of the arches
134. `[gap]` Paint depth, orange peel and how panels line up

## 4. Light and motion

Reflections, glow, how parts move.

135. `[drl]` The shape the headlamps light by day
136. `[tsig]` The shape the tail lamps light
137. `[sculpt]` How reflections run along the side
138. `[part: finish]` How the paint changes with the angle of light
139. `[shade]` Bodywork that changes shade
140. `[dooropen]` Doors that swing, lift, hinge at the rear or slide
141. `[roofop]` Sunroof, glass roof, soft top
142. `[part: roofop]` A hard roof that folds away
143. `[aero]` A wing that rises, an air brake
144. `[glowp]` Body panels that light up
145. `[gap]` Indicators that sweep, lamps that play a welcome
146. `[gap]` Lamps that swivel with the steering
147. `[gap]` How the bonnet and the boot open
148. `[gap]` Suspension that rises and lowers
149. `[gap]` Grille shutters that open and close
150. `[gap]` How the car sits when it brakes, turns and pulls away

## 5. Use

How fast it is understood, how precise it is, how it copes, what else it carries.

151. `[doors]` One or two doors a side
152. `[seats]` One, two or three rows of seats
153. `[rails]` Roof rails and crossbars
154. `[tow]` Tow bar, recovery hooks
155. `[solar]` Solar cells in the roof
156. `[sensor]` A pod of driving sensors
157. `[spare]` A spare wheel on the tail
158. `[derived]` How much it carries
159. `[derived]` How easy it is to see out
160. `[gap]` How the load space opens: lid, hatch, split tailgate, side doors
161. `[gap]` A load space in the nose
162. `[gap]` Steps, grab handles, a winch, a snorkel, a roof tent
163. `[gap]` Charging: where the cable goes and what shows while it charges
164. `[gap]` The whole inside: seats, wheel, screens, controls

## 6. Touch

Weight, fit, how the moving parts feel.

165. `[handle]` Door handles: proud, flush, flap, none
166. `[doorth]` How thick the door is
167. `[gap]` How heavy the door feels and how it swings
168. `[gap]` How the handle moves under the hand
169. `[part: finish]` How the paint feels
170. `[gap]` How the bonnet, boot and filler door feel to open

## 7. Sound

171. `[power]` The sound of the engine, by where it sits, or the hum of none
172. `[seals]` The sound of a door shutting
173. `[gap]` The exhaust note, by count and kind of cylinders
174. `[gap]` Tyre noise and wind noise
175. `[gap]` The horn, the indicators, the locks
176. `[gap]` The sound an electric car plays at low speed

## From other fields

Parts, materials and mechanisms that could apply. Those marked `[gap]` wait for Spec 4.

177. `[shade]` Panels that change shade under voltage, from e-readers and smart glass
178. `[glowp]` Lit panels, from signage
179. `[solar]` Solar cells, from buildings
180. `[mirror]` Cameras in place of mirrors, from lorries and racing
181. `[sensor]` Sensor pods, from survey vehicles
182. `[hlin]` Grids of small light points, from stage lighting
183. `[gap]` Fabric skin stretched over a frame, from tents and aircraft
184. `[gap]` Airless tyres with open spokes, from site machinery
185. `[gap]` Woven and knitted body panels, from footwear
186. `[gap]` Panels that clip on and off without tools, from luggage and phones
187. `[gap]` A canopy that lifts in one piece, from aircraft
188. `[gap]` Skin that heals small scratches, from phone coatings
