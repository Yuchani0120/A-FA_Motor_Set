/* TEAM A-FA PM100DX Quick Guide
   Edit values in SETTINGS first. Formula blocks are in calculateRecommendation()
   and calculateManualMap().
*/

(() => {
  "use strict";

 // editable constants
  const SETTINGS = {
    motors: {
      emrax208: {
        label: "EMRAX 208 MV",
        ke: 0.0300,
        ktTheory: 0.3507,
        ktRoad: 0.3903366247013316,
        peakTorque: 150,
        maxRPM: 7000,
        defaultVdc: 280,
        defaultSag: 0,
        defaultTorque: 140,
        defaultDcl: 80
      },
      emrax228: {
        label: "EMRAX 228 MV",
        ke: 0.0478,
        ktTheory: 0.5325,
        peakTorque: 240,
        maxRPM: 5500,
        defaultVdc: 300,
        defaultSag: 20,
        defaultTorque: 50,
        defaultDcl: 80
      }
    },

    // 2023 EMRAX 208 filtered-drive-log fit:
    // DC Bus Current = b + a × RPM × Iq / Vdc_eff
    roadFit208: {
      currentSlope: 0.03414106768311502,
      currentIntercept: 2.178222174984981,
      currentTransferRatioFor228: 0.9292021677495167
    },
    recommendationValidation: {
      defaultDclUsePct: 90
    },

    // 모터 맵 기본설정
    manualMap: {
      vdc: 294,
      sag: 20,
      breakRPM: 1800,
      iqLimit: 425,
      idLimit: 0,
      torqueLimit: 231,
      maxRPM: 5500
    }
  };

  const $ = (id) => document.getElementById(id);
  const number = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const positive = (value, fallback) => {
    const parsed = number(value, fallback);
    return parsed > 0 ? parsed : fallback;
  };
  const optionalPositive = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const omega = (rpm) => 2 * Math.PI * rpm / 60;
  const fmt = (value, digits = 0) => Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const unit = (value, label, digits = 0) =>
    `${fmt(value, digits)}<span class="unit"> ${label}</span>`;

  // -------------------- DOM controls --------------------
  const rec = {
    motor: $("recMotor"),
    vdc: $("recVdc"),
    sag: $("recSag"),
    torque: $("recTorque"),
    dcl: $("recDcl"),
    maxRPM: $("recMaxRpm"),
    dclUse: $("recDclUse"),
    targetSpeed: $("recTargetSpeed"),
    tireRadius: $("recTireRadius"),
    gearRatio: $("recGearRatio"),
    roadFit: $("recRoadFit")
  };

  const map = {
    vdc: $("mapVdc"),
    sag: $("mapSag"),
    breakRPM: $("mapBreak"),
    iqLimit: $("mapIq"),
    idLimit: $("mapId"),
    torqueLimit: $("mapTorque"),
    maxRPM: $("mapMaxRpm"),
    dclReference: $("mapDclRef")
  };

  let recommendationState = null;
  let recommendationSeries = [];
  let manualMapState = null;
  let manualMapSeries = [];

  
  function Recommend() {
    const motorKey = rec.motor.value;
    const motor = SETTINGS.motors[motorKey];

    const vdc = positive(rec.vdc.value, motor.defaultVdc);
    const sag = clamp(number(rec.sag.value, motor.defaultSag), 0, 40);
    const torque = Math.min(motor.peakTorque, positive(rec.torque.value, motor.defaultTorque));
    const currentLimit = positive(rec.dcl.value, motor.defaultDcl);
    const maxRPM = clamp(positive(rec.maxRPM.value, motor.maxRPM), 100, motor.maxRPM);
    const dclUsePct = clamp(number(rec.dclUse.value, SETTINGS.recommendationValidation.defaultDclUsePct), 50, 100);
    const targetVehicleSpeedKph = optionalPositive(rec.targetSpeed.value);
    const tireRadiusMm = optionalPositive(rec.tireRadius.value);
    const gearRatio = optionalPositive(rec.gearRatio.value);
    const vEff = vdc * (1 - sag / 100);
    const useRoadFit = rec.roadFit.checked;

    let kt = motor.ktTheory;
    let currentIntercept = 0;
    let currentSlope = Math.sqrt(3 / 2) * motor.ke;

    if (motorKey === "emrax208" && useRoadFit) {
      kt = motor.ktRoad;
      currentIntercept = SETTINGS.roadFit208.currentIntercept;
      currentSlope = SETTINGS.roadFit208.currentSlope;
    }

    if (motorKey === "emrax228" && useRoadFit) {
      currentSlope *= SETTINGS.roadFit208.currentTransferRatioFor228;
    }

    const iqPlateau = torque / kt;
    const electricalPowerLimit = vEff * currentLimit;

    // This follows the uploaded original:
    // Break Speed is limited by both electrical power and DC Bus Current.
    const breakByPower = 60 * electricalPowerLimit / (2 * Math.PI * torque);
    const breakByCurrent = (currentLimit - currentIntercept) * vEff / (currentSlope * iqPlateau);
    const breakRPM = Math.min(maxRPM, Math.max(0, breakByPower), Math.max(0, breakByCurrent));
    const mapPower = torque * omega(breakRPM);

    // Supplementary recommendation: calculate a conservative operating point at a user-selected
    // percentage of DCL. The original Break_Speed calculation above remains unchanged.
    const targetCurrent = currentLimit * dclUsePct / 100;
    const targetElectricalPower = vEff * targetCurrent;
    const safeBreakByPower = 60 * targetElectricalPower / (2 * Math.PI * torque);
    const safeBreakByCurrent = (targetCurrent - currentIntercept) * vEff / (currentSlope * iqPlateau);
    const safeBreakRPM = Math.min(maxRPM, Math.max(0, safeBreakByPower), Math.max(0, safeBreakByCurrent));

    // Vehicle kinematics validation. Empty optional inputs simply return null and do not affect
    // any existing parameter recommendation or graph result.
    const tireRadiusM = tireRadiusMm ? tireRadiusMm / 1000 : null;
    const vehicleMotorRPM = (targetVehicleSpeedKph && tireRadiusM && gearRatio)
      ? (targetVehicleSpeedKph / 3.6) * 60 * gearRatio / (2 * Math.PI * tireRadiusM)
      : null;
    const vehicleSpeedAtMaxRPM = (tireRadiusM && gearRatio)
      ? (maxRPM / gearRatio) * (2 * Math.PI * tireRadiusM) * 3.6 / 60
      : null;

    const currentAt = (rpm, iq) => Math.max(
      0,
      currentIntercept + currentSlope * rpm * iq / vEff
    );

    return {
      motorKey, motor, vdc, sag, torque, currentLimit, maxRPM, vEff, useRoadFit,
      dclUsePct, targetCurrent, targetElectricalPower, safeBreakByPower, safeBreakByCurrent,
      safeBreakRPM, targetVehicleSpeedKph, tireRadiusMm, gearRatio, vehicleMotorRPM,
      vehicleSpeedAtMaxRPM, kt, iqPlateau, electricalPowerLimit, breakByPower,
      breakByCurrent, breakRPM, mapPower, currentAt
    };
  }

  function recommendationPoints(state) {
    const points = [];
    const count = 121;

    for (let i = 0; i < count; i += 1) {
      const rpm = state.maxRPM * i / (count - 1);
      const torque = (rpm <= state.breakRPM || rpm === 0)
        ? state.torque
        : Math.min(state.torque, state.mapPower / omega(rpm));
      const iq = torque / state.kt;
      const power = torque * omega(rpm) / 1000;

      // Keep original graph behavior: the displayed current is limited by DCL.
      const dcBusCurrent = Math.min(state.currentLimit, state.currentAt(rpm, iq));
      points.push({ rpm, torque, iq, power, dcBusCurrent });
    }

    return points;
  }

  // -------------------- manual map logic --------------------
  function calculateManualMap() {
    const motor = SETTINGS.motors.emrax228;
    const defaults = SETTINGS.manualMap;

    const vdc = positive(map.vdc.value, defaults.vdc);
    const sag = clamp(number(map.sag.value, defaults.sag), 0, 40);
    const vEff = vdc * (1 - sag / 100);
    const maxRPM = clamp(positive(map.maxRPM.value, defaults.maxRPM), 100, motor.maxRPM);
    const breakRPM = clamp(positive(map.breakRPM.value, defaults.breakRPM), 100, maxRPM);
    const iqLimit = positive(map.iqLimit.value, defaults.iqLimit);
    const idLimit = Math.max(0, number(map.idLimit.value, defaults.idLimit));
    const torqueLimit = Math.min(motor.peakTorque, positive(map.torqueLimit.value, defaults.torqueLimit));
    const dclReference = optionalPositive(map.dclReference.value);

    const kt = motor.ktTheory;
    const iqPlateau = Math.min(iqLimit, torqueLimit / kt);
    const torquePlateau = iqPlateau * kt;
    const mapPower = torquePlateau * omega(breakRPM);

    return {
      motor, vdc, sag, vEff, breakRPM, iqLimit, idLimit, torqueLimit, dclReference,
      kt, iqPlateau, torquePlateau, mapPower, maxRPM
    };
  }

  function manualPoint(state, rpm) {
    const torque = (rpm <= state.breakRPM || rpm === 0)
      ? state.torquePlateau
      : Math.min(state.torquePlateau, state.mapPower / omega(rpm));
    const iq = torque / state.kt;

    // Same as the original: Id is shown as a display profile, not used in I_DC.
    const ratio = clamp((rpm - state.breakRPM) / Math.max(1, state.maxRPM - state.breakRPM), 0, 1);
    const id = -state.idLimit * Math.pow(ratio, 0.8);

    const power = torque * omega(rpm) / 1000;
    const dcBusCurrent = Math.max(0, Math.sqrt(3 / 2) * state.motor.ke * rpm * iq / state.vEff);
    return { rpm, torque, iq, id, power, dcBusCurrent };
  }

  function manualPoints(state) {
    const points = [];
    const count = 241;

    for (let i = 0; i < count; i += 1) {
      points.push(manualPoint(state, state.maxRPM * i / (count - 1)));
    }
    return points;
  }

  // -------------------- canvas helpers --------------------
  function prepareCanvas(canvas, minHeight = 260) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(280, Math.floor(rect.width));
    const height = Math.max(minHeight, Math.floor(rect.height));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
  }

  function drawAxes(ctx, width, height, maxX, maxLeft, maxRight, leftTitle, rightTitle) {
    const area = { left: 48, right: 50, top: 24, bottom: height - 36 };
    area.width = width - area.left - area.right;
    area.height = area.bottom - area.top;

    const sx = (x) => area.left + area.width * x / maxX;
    const syLeft = (y) => area.top + area.height * (1 - y / maxLeft);
    const syRight = (y) => area.top + area.height * (1 - y / maxRight);

    ctx.font = "11px system-ui";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e5e9ee";
    ctx.fillStyle = "#65717c";

    for (let i = 0; i <= 5; i += 1) {
      const y = area.top + area.height * i / 5;
      ctx.beginPath();
      ctx.moveTo(area.left, y);
      ctx.lineTo(area.left + area.width, y);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillText(fmt(maxLeft * (1 - i / 5)), 4, y + 4);

      ctx.textAlign = "right";
      ctx.fillText(fmt(maxRight * (1 - i / 5)), width - 3, y + 4);
    }

    for (let i = 0; i <= 5; i += 1) {
      const x = area.left + area.width * i / 5;
      ctx.textAlign = "center";
      ctx.fillText(fmt(maxX * i / 5), x, area.bottom + 18);
    }

    ctx.strokeStyle = "#bfc8d2";
    ctx.beginPath();
    ctx.moveTo(area.left, area.top);
    ctx.lineTo(area.left, area.bottom);
    ctx.lineTo(area.left + area.width, area.bottom);
    ctx.stroke();

    ctx.fillStyle = "#65717c";
    ctx.textAlign = "left";
    ctx.fillText(leftTitle, area.left, area.top - 8);
    ctx.textAlign = "right";
    ctx.fillText(rightTitle, width - 3, area.top - 8);
    ctx.textAlign = "left";

    return { area, sx, syLeft, syRight };
  }

  function drawCurve(ctx, points, xFn, yFn, color, dash = []) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.3;
    ctx.setLineDash(dash);
    ctx.beginPath();

    points.forEach((point, index) => {
      const x = xFn(point);
      const y = yFn(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
    ctx.restore();
  }

  function drawBreakLine(ctx, x, top, bottom) {
    ctx.save();
    ctx.strokeStyle = "#7a8794";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#65717c";
    ctx.font = "10px system-ui";
    ctx.fillText("Break", x + 4, top + 12);
    ctx.restore();
  }

  function interpolate(points, rpm) {
    if (rpm <= points[0].rpm) return points[0];
    if (rpm >= points[points.length - 1].rpm) return points[points.length - 1];

    const step = points[1].rpm - points[0].rpm;
    const index = Math.max(0, Math.min(points.length - 2, Math.floor(rpm / step)));
    const a = points[index];
    const b = points[index + 1];
    const ratio = (rpm - a.rpm) / (b.rpm - a.rpm);

    const output = {};
    for (const key of Object.keys(a)) {
      output[key] = typeof a[key] === "number"
        ? a[key] + (b[key] - a[key]) * ratio
        : a[key];
    }
    return output;
  }

  function showTip(tip, html, localX, localY, width, height) {
    tip.innerHTML = html;
    tip.style.left = `${clamp(localX + 12, 8, width - 205)}px`;
    tip.style.top = `${clamp(localY + 12, 8, height - 145)}px`;
    tip.style.display = "block";
  }

  // -------------------- chart drawing --------------------
  function drawRecommendationTorque(hoverRPM = null) {
    if (!recommendationState) return;
    const canvas = $("recTorqueChart");
    const { ctx, width, height } = prepareCanvas(canvas);
    const state = recommendationState;
    const points = recommendationSeries;

    const torqueMax = Math.max(20, ...points.map(p => p.torque)) * 1.15;
    const powerMax = Math.max(10, ...points.map(p => p.power)) * 1.15;
    const ax = drawAxes(ctx, width, height, state.maxRPM, torqueMax, powerMax, "Torque [Nm]", "Power [kW]");

    drawBreakLine(ctx, ax.sx(state.breakRPM), ax.area.top, ax.area.bottom);
    drawCurve(ctx, points, p => ax.sx(p.rpm), p => ax.syLeft(p.torque), "#1759c7");
    drawCurve(ctx, points, p => ax.sx(p.rpm), p => ax.syRight(p.power), "#d93636");

    if (hoverRPM !== null) {
      const point = interpolate(points, hoverRPM);
      const x = ax.sx(point.rpm);
      ctx.save();
      ctx.strokeStyle = "#9ba6b2";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, ax.area.top);
      ctx.lineTo(x, ax.area.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      [["#1759c7", ax.syLeft(point.torque)], ["#d93636", ax.syRight(point.power)]].forEach(([color, y]) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    return { area: ax.area, width, height };
  }

  function drawRecommendationCurrent(hoverRPM = null) {
    if (!recommendationState) return;
    const canvas = $("recCurrentChart");
    const { ctx, width, height } = prepareCanvas(canvas);
    const state = recommendationState;
    const points = recommendationSeries;

    const iqMax = Math.max(20, ...points.map(p => p.iq)) * 1.15;
    const currentMax = Math.max(state.currentLimit, ...points.map(p => p.dcBusCurrent), 10) * 1.15;
    const ax = drawAxes(ctx, width, height, state.maxRPM, iqMax, currentMax, "Iq [A]", "DC Bus [A]");

    drawBreakLine(ctx, ax.sx(state.breakRPM), ax.area.top, ax.area.bottom);
    drawCurve(ctx, points, p => ax.sx(p.rpm), p => ax.syLeft(p.iq), "#1759c7");
    drawCurve(ctx, points, p => ax.sx(p.rpm), p => ax.syRight(p.dcBusCurrent), "#d93636");

    const limitY = ax.syRight(state.currentLimit);
    ctx.save();
    ctx.strokeStyle = "#7a8794";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ax.area.left, limitY);
    ctx.lineTo(ax.area.left + ax.area.width, limitY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#65717c";
    ctx.font = "10px system-ui";
    ctx.fillText("Limit", ax.area.left + 5, limitY - 5);
    ctx.restore();

    if (hoverRPM !== null) {
      const point = interpolate(points, hoverRPM);
      const x = ax.sx(point.rpm);
      ctx.save();
      ctx.strokeStyle = "#9ba6b2";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, ax.area.top);
      ctx.lineTo(x, ax.area.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      [["#1759c7", ax.syLeft(point.iq)], ["#d93636", ax.syRight(point.dcBusCurrent)]].forEach(([color, y]) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    return { area: ax.area, width, height };
  }

  function drawManualMap(hoverRPM = null) {
    if (!manualMapState) return;
    const canvas = $("mapChart");
    const { ctx, width, height } = prepareCanvas(canvas);
    const state = manualMapState;
    const points = manualMapSeries;

    const torqueMax = Math.max(20, ...points.map(p => p.torque)) * 1.15;
    const currentMax = Math.max(10, ...points.map(p => p.dcBusCurrent)) * 1.15;
    const ax = drawAxes(ctx, width, height, state.maxRPM, torqueMax, currentMax, "Torque [Nm]", "DC Bus [A]");

    drawBreakLine(ctx, ax.sx(state.breakRPM), ax.area.top, ax.area.bottom);
    drawCurve(ctx, points, p => ax.sx(p.rpm), p => ax.syLeft(p.torque), "#1759c7");
    drawCurve(ctx, points, p => ax.sx(p.rpm), p => ax.syRight(p.dcBusCurrent), "#d93636");

    if (hoverRPM !== null) {
      const point = interpolate(points, hoverRPM);
      const x = ax.sx(point.rpm);
      ctx.save();
      ctx.strokeStyle = "#9ba6b2";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, ax.area.top);
      ctx.lineTo(x, ax.area.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      [["#1759c7", ax.syLeft(point.torque)], ["#d93636", ax.syRight(point.dcBusCurrent)]].forEach(([color, y]) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    return { area: ax.area, width, height };
  }

  // -------------------- rendering --------------------
  function renderRecommendation() {
    const state = calculateRecommendation();
    const points = recommendationPoints(state);
    recommendationState = state;
    recommendationSeries = points;

    const currentAtBreak = Math.min(state.currentLimit, state.currentAt(state.breakRPM, state.iqPlateau));
    const powerAtBreak = state.torque * omega(state.breakRPM) / 1000;
    const limitedByCurrent = state.breakByCurrent <= state.breakByPower && state.breakByCurrent <= state.maxRPM;

    $("recBreakOut").innerHTML = unit(state.breakRPM, "RPM");
    $("recBreakNote").textContent = limitedByCurrent
      ? `DC Bus Current Limit ${fmt(state.currentLimit)} A 기준`
      : "전력 제한 기준";

    $("recIqOut").innerHTML = unit(state.iqPlateau, "A", 1);
    $("recIqNote").textContent = state.motorKey === "emrax208" && state.useRoadFit
      ? "2023 주행 로그 kT"
      : "토크 / kT";

    $("recIdOut").innerHTML = unit(0, "A", 1);
    $("recCurrentOut").innerHTML = unit(currentAtBreak, "A", 1);
    $("recCurrentNote").textContent = `Break에서 Limit ${fmt(state.currentLimit)} A`;

    $("recPowerOut").innerHTML = unit(powerAtBreak, "kW", 1);
    $("recVeffOut").innerHTML = unit(state.vEff, "V", 0);
    $("recVeffNote").textContent = `${fmt(state.vdc)} V - ${fmt(state.sag)}%`;

    $("recTargetCurrentOut").innerHTML = unit(state.targetCurrent, "A", 1);
    $("recTargetCurrentNote").textContent = `DCL ${fmt(state.currentLimit)} A × ${fmt(state.dclUsePct)}%`;
    $("recSafeBreakOut").innerHTML = unit(state.safeBreakRPM, "RPM");
    $("recSafeBreakNote").textContent = `DCL ${fmt(state.dclUsePct)}% 운용 기준`;

    $("recVehicleRpmOut").innerHTML = state.vehicleMotorRPM === null
      ? "-"
      : unit(state.vehicleMotorRPM, "RPM");
    $("recVehicleRpmNote").textContent = state.vehicleMotorRPM === null
      ? "차속·반경·감속비 입력 시 계산"
      : `${fmt(state.targetVehicleSpeedKph, 0)} km/h 기준`;

    $("recVehicleSpeedOut").innerHTML = state.vehicleSpeedAtMaxRPM === null
      ? "-"
      : unit(state.vehicleSpeedAtMaxRPM, "km/h", 1);
    $("recVehicleSpeedNote").textContent = state.vehicleSpeedAtMaxRPM === null
      ? "반경·감속비 입력 시 계산"
      : `${fmt(state.maxRPM)} RPM 기준`;

    drawRecommendationTorque();
    drawRecommendationCurrent();
  }

  function renderManualMap() {
    const state = calculateManualMap();
    const points = manualPoints(state);
    manualMapState = state;
    manualMapSeries = points;

    const peakCurrent = Math.max(...points.map(p => p.dcBusCurrent));
    const currentAtBreak = manualPoint(state, state.breakRPM).dcBusCurrent;

    $("mapBreakOut").innerHTML = unit(state.breakRPM, "RPM");
    $("mapTorqueOut").innerHTML = unit(state.torquePlateau, "Nm", 1);
    $("mapTorqueNote").textContent = state.torquePlateau < state.torqueLimit
      ? "Iq Limit에 의해 제한"
      : "Torque Limit 적용";
    $("mapIqOut").innerHTML = unit(state.iqPlateau, "A", 1);
    $("mapCurrentOut").innerHTML = unit(peakCurrent, "A", 1);
    $("mapCurrentNote").textContent = `Break: ${fmt(currentAtBreak, 1)} A`;
    $("mapPowerOut").innerHTML = unit(state.mapPower / 1000, "kW", 1);

    const dclMargin = state.dclReference === null ? null : state.dclReference - peakCurrent;
    $("mapDclMarginOut").innerHTML = dclMargin === null
      ? "-"
      : unit(dclMargin, "A", 1);
    $("mapDclMarginNote").textContent = dclMargin === null
      ? "검증 기준은 계산식에 사용하지 않음"
      : dclMargin >= 0
        ? `Peak 대비 ${fmt(dclMargin, 1)} A 여유`
        : `Peak 대비 ${fmt(Math.abs(dclMargin), 1)} A 초과`;

    drawManualMap();
  }

  // -------------------- hover handlers --------------------
  function hoverRPMFromCanvas(event, canvas, maxRPM, meta) {
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const inside = localX >= meta.area.left && localX <= meta.area.left + meta.area.width;

    if (!inside) return null;
    return clamp(
      (localX - meta.area.left) / meta.area.width * maxRPM,
      0,
      maxRPM
    );
  }

  function bindRecommendationHover(canvasId, tipId, drawer) {
    const canvas = $(canvasId);
    const tip = $(tipId);

    canvas.addEventListener("pointermove", (event) => {
      if (!recommendationState) return;
      const meta = drawer();
      const rpm = hoverRPMFromCanvas(event, canvas, recommendationState.maxRPM, meta);

      if (rpm === null) {
        tip.style.display = "none";
        return;
      }

      drawer(rpm);
      const point = interpolate(recommendationSeries, rpm);
      const rect = canvas.getBoundingClientRect();

      showTip(
        tip,
        `<b>${fmt(point.rpm)} RPM</b><br>
         Torque: ${fmt(point.torque, 1)} Nm<br>
         Power: ${fmt(point.power, 1)} kW<br>
         I<sub>q</sub>: ${fmt(point.iq, 1)} A<br>
         DC Bus Current: ${fmt(point.dcBusCurrent, 1)} A`,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height
      );
    });

    canvas.addEventListener("pointerleave", () => {
      tip.style.display = "none";
      drawer();
    });
  }

  function bindManualHover() {
    const canvas = $("mapChart");
    const tip = $("mapTip");

    canvas.addEventListener("pointermove", (event) => {
      if (!manualMapState) return;
      const meta = drawManualMap();
      const rpm = hoverRPMFromCanvas(event, canvas, manualMapState.maxRPM, meta);

      if (rpm === null) {
        tip.style.display = "none";
        return;
      }

      drawManualMap(rpm);
      const point = interpolate(manualMapSeries, rpm);
      const rect = canvas.getBoundingClientRect();

      showTip(
        tip,
        `<b>${fmt(point.rpm)} RPM</b><br>
         Torque: ${fmt(point.torque, 1)} Nm<br>
         I<sub>q</sub>: ${fmt(point.iq, 1)} A<br>
         I<sub>d</sub>: ${fmt(point.id, 1)} A<br>
         Power: ${fmt(point.power, 1)} kW<br>
         DC Bus Current: ${fmt(point.dcBusCurrent, 1)} A`,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height
      );
    });

    canvas.addEventListener("pointerleave", () => {
      tip.style.display = "none";
      drawManualMap();
    });
  }

  // -------------------- defaults, tabs and export --------------------
  function setRecommendationDefaults() {
    const motor = SETTINGS.motors[rec.motor.value];
    rec.vdc.value = motor.defaultVdc;
    rec.sag.value = motor.defaultSag;
    rec.torque.value = motor.defaultTorque;
    rec.dcl.value = motor.defaultDcl;
    rec.maxRPM.value = rec.motor.value === "emrax228" ? 4000 : motor.maxRPM;
    rec.dclUse.value = SETTINGS.recommendationValidation.defaultDclUsePct;
    rec.targetSpeed.value = "";
    rec.tireRadius.value = "";
    rec.gearRatio.value = "";
    rec.roadFit.checked = false;
    renderRecommendation();
  }

  function setManualMapDefaults() {
    const defaults = SETTINGS.manualMap;
    map.vdc.value = defaults.vdc;
    map.sag.value = defaults.sag;
    map.breakRPM.value = defaults.breakRPM;
    map.iqLimit.value = defaults.iqLimit;
    map.idLimit.value = defaults.idLimit;
    map.torqueLimit.value = defaults.torqueLimit;
    map.maxRPM.value = defaults.maxRPM;
    map.dclReference.value = "";
    renderManualMap();
  }

  function copyRecommendationToManualMap() {
    if (!recommendationState) return;
    map.vdc.value = recommendationState.vdc;
    map.sag.value = recommendationState.sag;
    map.breakRPM.value = Math.round(recommendationState.breakRPM);
    map.iqLimit.value = recommendationState.iqPlateau.toFixed(1);
    map.idLimit.value = 0;
    map.torqueLimit.value = recommendationState.torque.toFixed(1);
    map.maxRPM.value = recommendationState.maxRPM.toFixed(0);
    renderManualMap();
    activateView("mapView");
  }

  function downloadCsv() {
    if (!manualMapSeries.length) return;

    const header = [
      "RPM",
      "Torque_Nm",
      "Iq_A",
      "Id_display_A",
      "Mechanical_Power_kW",
      "DC_Bus_Current_A"
    ];

    const rows = manualMapSeries.map(p => [
      p.rpm.toFixed(2),
      p.torque.toFixed(4),
      p.iq.toFixed(4),
      p.id.toFixed(4),
      p.power.toFixed(4),
      p.dcBusCurrent.toFixed(4)
    ].join(","));

    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "AFA_PM100DX_manual_motor_map.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function activateView(viewId) {
    document.querySelectorAll(".tab").forEach(button => {
      button.classList.toggle("active", button.dataset.view === viewId);
    });

    document.querySelectorAll(".view").forEach(view => {
      view.classList.toggle("active", view.id === viewId);
    });

    requestAnimationFrame(() => {
      if (viewId === "recommendView") renderRecommendation();
      else renderManualMap();
    });
  }

  // -------------------- event binding --------------------
  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => activateView(button.dataset.view));
  });

  Object.values(rec).forEach(element => {
    element.addEventListener("input", renderRecommendation);
    element.addEventListener("change", () => {
      if (element === rec.motor) setRecommendationDefaults();
      else renderRecommendation();
    });
  });

  Object.values(map).forEach(element => {
    element.addEventListener("input", renderManualMap);
    element.addEventListener("change", renderManualMap);
  });

  $("recReset").addEventListener("click", setRecommendationDefaults);
  $("mapReset").addEventListener("click", setManualMapDefaults);
  $("copyToMap").addEventListener("click", copyRecommendationToManualMap);
  $("mapCsv").addEventListener("click", downloadCsv);

  bindRecommendationHover("recTorqueChart", "recTorqueTip", drawRecommendationTorque);
  bindRecommendationHover("recCurrentChart", "recCurrentTip", drawRecommendationCurrent);
  bindManualHover();

  window.addEventListener("resize", () => {
    if ($("recommendView").classList.contains("active")) renderRecommendation();
    if ($("mapView").classList.contains("active")) renderManualMap();
  });

  setRecommendationDefaults();
  setManualMapDefaults();
})();
