TEAM A-FA PM100DX Quick Guide
Competition / Report Alignment Update

How to run
----------
Keep these three files in one folder:
- AFA_PM100DX_QuickGuide.html
- AFA_PM100DX_QuickGuide.js
- A_FA_logo.png

Then open AFA_PM100DX_QuickGuide.html in a browser.

What was intentionally preserved
--------------------------------
- Motor selection UI and EMRAX 208 MV / 228 MV choices
- Two tabs: "추천 파라미터 설정" and "모터 맵 설정"
- Existing input fields and their meanings
- Existing canvas graph layout, curve types, tooltips, CSV download, and copy-to-map flow
- Existing recommendation formula and manual-map formula

What was added
--------------
1. Recommendation tab: optional validation inputs
   - 권장 DCL 사용률 [%], default 90
   - 목표 최고 차속 [km/h]
   - 타이어 유효 반경 [mm]
   - 총 감속비 [Motor/Wheel]

2. Recommendation tab: added results
   - 권장 운용 DC Bus Current = DCL x 권장 DCL 사용률
   - 안전 운용 Break_Speed, calculated independently at the selected DCL use rate
   - Target-speed-based motor RPM
   - Theoretical vehicle speed based on entered motor RPM

3. Manual motor-map tab: added inputs/results
   - 그래프 최대 RPM
   - DCL 검증 기준 [A] (comparison only; it does not clip / limit the calculation)
   - Break mechanical power
   - DCL validation margin against the calculated peak DC Bus Current

Formula locations
-----------------
- Editable constants: SETTINGS
- Existing recommendation formula: calculateRecommendation()
- Existing manual-map formula: calculateManualMap()
- New DCL-use and vehicle compatibility formulas are commented directly below the existing recommendation formula.

Important note
--------------
The "안전 운용 Break_Speed" is a supplementary recommendation based on the entered DCL utilization percentage. The original "Break_Speed 추천값" and existing graph logic remain unchanged. Use actual drive logs, protection logic, thermal conditions, and PM100DX validation before applying any value to the vehicle.
