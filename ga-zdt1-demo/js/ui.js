"use strict";

(function () {
  var FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Noto Sans CJK JP", "Noto Sans JP", "WenQuanYi Micro Hei", "Droid Sans Fallback", "Liberation Sans", sans-serif';
  var F2_KNEE = 1.15;
  var F2_TOP = 7;
  var LOWER_FRAC = 0.62;
  var TREND_Y_MAX = 0.6;
  var N = 30;

  var css = getComputedStyle(document.documentElement);
  function colorVar(name, fallback) {
    var v = css.getPropertyValue(name).trim();
    return v || fallback;
  }
  var INK = colorVar("--ink", "#211c16");
  var MUTED = colorVar("--muted", "#6a6156");
  var PANEL = colorVar("--panel", "#fbf6ec");
  var SHEET = colorVar("--sheet", "#fffdf8");
  var LINE = colorVar("--line", "#e4d8c4");
  var VERMILION = colorVar("--vermilion", "#c43122");
  var NAVY = colorVar("--navy", "#1d3c5e");
  var SLATE = colorVar("--slate", "#5c6560");

  var genEl = document.getElementById("gen");
  var capLabel = document.getElementById("capLabel");
  var popSizeLabel = document.getElementById("popSizeLabel");
  var meanTailEl = document.getElementById("meanTail");
  var meanTailPanel = document.getElementById("meanTailPanel");
  var frontGapEl = document.getElementById("frontGap");
  var x1RangeEl = document.getElementById("x1Range");
  var selectedSummary = document.getElementById("selectedSummary");
  var statusLine = document.getElementById("statusLine");
  var playBtn = document.getElementById("play");
  var stepBtn = document.getElementById("step");
  var restartBtn = document.getElementById("restart");
  var reseedBtn = document.getElementById("reseed");
  var speedInput = document.getElementById("speed");
  var speedValue = document.getElementById("speedValue");
  var seedInput = document.getElementById("seed");
  var popInput = document.getElementById("popSize");
  var mutInput = document.getElementById("mutation");
  var crossInput = document.getElementById("crossover");
  var capInput = document.getElementById("cap");
  var trailInput = document.getElementById("trail");
  var plotCanvas = document.getElementById("plot");
  var selectedCanvas = document.getElementById("selectedGenes");
  var heatCanvas = document.getElementById("heatmap");
  var trendCanvas = document.getElementById("trend");

  var run = null;
  var follow = null;
  var playing = false;
  var acc = 0;
  var lastTick = 0;
  var plotGeom = null;
  var heatGeom = null;

  function readNumber(input, fallback, min, max) {
    if (String(input.value).trim() === "") return fallback;
    var v = Number(input.value);
    if (!Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  }

  function readCap() {
    return Math.round(readNumber(capInput, 200, 1, 2000));
  }

  function normalizeSeed(value) {
    if (String(value).trim() === "") return 42;
    var n = Number(value);
    if (!Number.isFinite(n)) return 42;
    return Math.floor(n) >>> 0;
  }

  function settings() {
    return {
      popSize: Math.round(readNumber(popInput, 80, 10, 300)),
      mutationRate: readNumber(mutInput, 0.0333, 0, 1),
      crossoverRate: readNumber(crossInput, 0.9, 0, 1),
      seed: normalizeSeed(seedInput.value)
    };
  }

  function format3(v) {
    return Number.isFinite(v) ? v.toFixed(3) : "—";
  }

  function individualTail(ind) {
    var s = 0;
    for (var i = 1; i < ind.x.length; i++) s += ind.x[i];
    return s / (ind.x.length - 1);
  }

  function nearestIndex(pop, target) {
    var best = 0;
    var bestD = Infinity;
    for (var i = 0; i < pop.length; i++) {
      var df1 = pop[i].f[0] - target[0];
      var df2 = pop[i].f[1] - target[1];
      var d = df1 * df1 + df2 * df2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function medianX1Index(pop) {
    var idx = pop.map(function (_, i) { return i; });
    idx.sort(function (a, b) { return pop[a].x[0] - pop[b].x[0]; });
    return idx[Math.floor((idx.length - 1) / 2)];
  }

  function selectedIndex() {
    if (follow) return nearestIndex(run.pop, follow);
    return medianX1Index(run.pop);
  }

  function statusMessage() {
    if (run && run.generation >= readCap()) {
      return "世代の上限に達しました。上限を上げるか、「最初から」で戻せます。";
    }
    var typedPop = Math.round(readNumber(popInput, run ? run.popSize : 80, 10, 300));
    if (run && typedPop !== run.popSize) {
      return "個体群サイズは「最初から」を押すと反映されます。";
    }
    return "Space で再生と一時停止、→ で 1 世代進みます。個体群サイズとシードは「最初から」で反映されます。";
  }

  function syncPlayButton() {
    playBtn.textContent = playing ? "一時停止" : "再生";
    playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
  }

  function startRun() {
    var s = settings();
    seedInput.value = String(s.seed);
    popInput.value = String(s.popSize);
    run = ZDT1.createRun(s);
    follow = null;
    acc = 0;
  }

  function applyRates() {
    run.mutationRate = readNumber(mutInput, run.mutationRate, 0, 1);
    run.crossoverRate = readNumber(crossInput, run.crossoverRate, 0, 1);
  }

  function advance() {
    if (run.generation >= readCap()) {
      playing = false;
      syncPlayButton();
      return false;
    }
    var followBefore = follow ? follow.slice() : null;
    applyRates();
    ZDT1.stepRun(run);
    if (followBefore) {
      var i = nearestIndex(run.pop, followBefore);
      follow = [run.pop[i].f[0], run.pop[i].f[1]];
    }
    if (run.generation >= readCap()) {
      playing = false;
      syncPlayButton();
    }
    return true;
  }

  function togglePlay() {
    if (!playing && run.generation >= readCap()) {
      render();
      return;
    }
    playing = !playing;
    acc = 0;
    syncPlayButton();
    render();
  }

  function stepOnce() {
    if (!advance()) {
      render();
      return;
    }
    render();
  }

  function restart() {
    var keep = playing;
    startRun();
    playing = keep;
    syncPlayButton();
    render();
  }

  function reseed() {
    var seed = (Math.floor(Math.random() * 0xffffffff) ^ (Date.now() >>> 0)) >>> 0;
    seedInput.value = String(seed);
    restart();
  }

  function mix(a, b, t) {
    var u = Math.max(0, Math.min(1, t));
    var out = [0, 0, 0];
    for (var i = 0; i < 3; i++) out[i] = Math.round(a[i] + (b[i] - a[i]) * u);
    return "rgb(" + out[0] + "," + out[1] + "," + out[2] + ")";
  }

  function parseRgb(hex) {
    var h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  var VERM = parseRgb(VERMILION);
  var SL = parseRgb(SLATE);
  var SHEET_RGB = parseRgb(SHEET);
  var NAVY_RGB = parseRgb(NAVY);

  function pointColor(tail) {
    return mix(VERM, SL, tail / 0.5);
  }

  function geneColor(value, warm) {
    var ink = warm ? VERM : NAVY_RGB;
    return mix(SHEET_RGB, ink, Math.max(0, Math.min(1, value)));
  }

  function resizeCanvas(canvas) {
    var parent = canvas.parentElement;
    var w = parent.clientWidth;
    var h = parent.clientHeight;
    if (w < 2 || h < 2) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.round(w * dpr);
    var bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function plotGeometry(w, h) {
    var L = 54;
    var R = 14;
    var T = 12;
    var B = 32;
    var W = Math.max(10, w - L - R);
    var H = Math.max(10, h - T - B);
    var lowerH = H * LOWER_FRAC;
    var upperH = H - lowerH;
    return {
      L: L,
      T: T,
      W: W,
      H: H,
      R: L + W,
      B: T + H,
      lowerH: lowerH,
      upperH: upperH,
      kneeY: T + upperH
    };
  }

  function xOf(f1, g) {
    return g.L + Math.max(0, Math.min(1, f1)) * g.W;
  }

  function yOf(f2, g) {
    var v = Math.max(0, Math.min(F2_TOP, f2));
    if (v <= F2_KNEE) {
      return g.kneeY + (1 - v / F2_KNEE) * g.lowerH;
    }
    var t = (v - F2_KNEE) / (F2_TOP - F2_KNEE);
    return g.kneeY - t * g.upperH;
  }

  function drawSub(ctx, letter, sub, x, y, align) {
    ctx.font = "13px " + FONT;
    var w = ctx.measureText(letter).width;
    ctx.font = "10px " + FONT;
    var sw = ctx.measureText(sub).width;
    var start = x;
    if (align === "center") start = x - (w + sw) / 2;
    if (align === "right") start = x - (w + sw);
    ctx.font = "13px " + FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, start, y);
    ctx.font = "10px " + FONT;
    ctx.fillText(sub, start + w - 1, y + 4);
  }

  function strokePlot(ctx, g) {
    ctx.beginPath();
    ctx.rect(g.L, g.T, g.W, g.H);
    ctx.fillStyle = SHEET;
    ctx.fill();
    ctx.fillStyle = "rgba(33, 28, 22, 0.04)";
    ctx.fillRect(g.L, g.T, g.W, g.upperH);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawGrid(ctx, g) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.L, g.T, g.W, g.H);
    ctx.clip();
    ctx.strokeStyle = "rgba(33, 28, 22, 0.08)";
    ctx.lineWidth = 1;
    ctx.font = "11px " + FONT;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    var yTicks = [0, 0.25, 0.5, 0.75, 1, 3, 5, 7];
    for (var i = 0; i < yTicks.length; i++) {
      var yv = yTicks[i];
      var y = yOf(yv, g);
      ctx.beginPath();
      ctx.moveTo(g.L, y);
      ctx.lineTo(g.R, y);
      ctx.stroke();
    }
    var xTicks = [0.25, 0.5, 0.75];
    for (var j = 0; j < xTicks.length; j++) {
      var x = xOf(xTicks[j], g);
      ctx.beginPath();
      ctx.moveTo(x, g.T);
      ctx.lineTo(x, g.B);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(33, 28, 22, 0.35)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(g.L, g.kneeY);
    ctx.lineTo(g.R, g.kneeY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = MUTED;
    ctx.font = "11px " + FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (var k = 0; k < yTicks.length; k++) {
      ctx.fillText(yTicks[k] === 1 ? "1.0" : String(yTicks[k]), g.L - 6, yOf(yTicks[k], g));
    }
    ctx.fillText("1.15", g.L - 6, g.kneeY);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var xLabels = [0, 0.25, 0.5, 0.75, 1];
    for (var t = 0; t < xLabels.length; t++) {
      ctx.fillText(xLabels[t] === 0 || xLabels[t] === 1 ? String(xLabels[t]) : xLabels[t].toFixed(2), xOf(xLabels[t], g), g.B + 6);
    }

    drawSub(ctx, "f", "1", g.L + g.W / 2, g.B + 22, "center");
    ctx.save();
    ctx.translate(16, g.T + g.H / 2);
    ctx.rotate(-Math.PI / 2);
    drawSub(ctx, "f", "2", 0, 0, "center");
    ctx.restore();
  }

  function drawFront(ctx, g) {
    ctx.beginPath();
    for (var i = 0; i <= 200; i++) {
      var f1 = i / 200;
      var f2 = 1 - Math.sqrt(f1);
      var x = xOf(f1, g);
      var y = yOf(f2, g);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = VERMILION;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawPoints(ctx, g, pop, prev, selected, showTrail) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.L, g.T, g.W, g.H);
    ctx.clip();
    if (showTrail && prev) {
      ctx.fillStyle = "rgba(92, 101, 96, 0.28)";
      for (var p = 0; p < prev.length; p++) {
        ctx.beginPath();
        ctx.arc(xOf(prev[p][0], g), yOf(prev[p][1], g), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    var order = pop.map(function (_, i) { return i; });
    order.sort(function (a, b) { return individualTail(pop[b]) - individualTail(pop[a]); });
    for (var i = 0; i < order.length; i++) {
      var ind = pop[order[i]];
      var x = xOf(ind.f[0], g);
      var y = yOf(ind.f[1], g);
      ctx.beginPath();
      ctx.arc(x, y, 4.4, 0, Math.PI * 2);
      ctx.fillStyle = pointColor(individualTail(ind));
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 253, 248, 0.9)";
      ctx.stroke();
    }
    if (selected >= 0) {
      var s = pop[selected];
      ctx.beginPath();
      ctx.arc(xOf(s.f[0], g), yOf(s.f[1], g), 8, 0, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlot(selected) {
    var box = resizeCanvas(plotCanvas);
    if (!box) return;
    var ctx = box.ctx;
    ctx.fillStyle = PANEL;
    ctx.fillRect(0, 0, box.w, box.h);
    var g = plotGeometry(box.w, box.h);
    plotGeom = g;
    strokePlot(ctx, g);
    drawGrid(ctx, g);
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.L, g.T, g.W, g.H);
    ctx.clip();
    drawFront(ctx, g);
    ctx.restore();
    drawPoints(ctx, g, run.pop, run.prevF, selected, trailInput.checked);
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.L, g.T, g.W, g.H);
    ctx.clip();
    drawFront(ctx, g);
    ctx.restore();
  }

  function geneSlots(w, padL, padR) {
    var inner = Math.max(10, w - padL - padR);
    return { inner: inner, colW: inner / N, padL: padL, padR: padR };
  }

  function drawGeneBars(ctx, w, h, values, emphasizeFirst) {
    var padL = 28;
    var padR = 8;
    var padT = 8;
    var padB = 16;
    var slots = geneSlots(w, padL, padR);
    var base = h - padB;
    var barH = Math.max(8, base - padT);
    ctx.fillStyle = SHEET;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = LINE;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.strokeStyle = "rgba(33, 28, 22, 0.25)";
    ctx.beginPath();
    ctx.moveTo(padL, base + 0.5);
    ctx.lineTo(w - padR, base + 0.5);
    ctx.stroke();
    for (var i = 0; i < N; i++) {
      var x = padL + i * slots.colW;
      var val = Math.max(0, Math.min(1, values[i]));
      var bh = val * barH;
      ctx.fillStyle = i === 0 ? "rgba(196, 49, 34, 0.16)" : "rgba(29, 60, 94, 0.05)";
      ctx.fillRect(x + 1, padT, Math.max(1, slots.colW - 2), barH);
      ctx.fillStyle = i === 0 ? VERMILION : NAVY;
      ctx.fillRect(x + 1, base - bh, Math.max(1, slots.colW - 2), bh);
    }
    ctx.fillStyle = MUTED;
    ctx.font = "10px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("1", padL + slots.colW / 2, base + 3);
    ctx.fillText("30", padL + 29.5 * slots.colW, base + 3);
    if (emphasizeFirst) {
      ctx.fillStyle = VERMILION;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = "11px " + FONT;
      ctx.fillText("x1", 4, 6);
    }
  }

  function heatLayout(w, h) {
    var padL = 28;
    var padR = 8;
    var topLabel = 14;
    var meanH = 34;
    var bottomLabel = 14;
    var bodyTop = topLabel + meanH + 4;
    var bodyH = Math.max(8, h - bodyTop - bottomLabel);
    var slots = geneSlots(w, padL, padR);
    return {
      padL: padL,
      padR: padR,
      topLabel: topLabel,
      meanH: meanH,
      bodyTop: bodyTop,
      bodyH: bodyH,
      bottom: h - bottomLabel,
      colW: slots.colW
    };
  }

  function drawHeatmap(selected) {
    var box = resizeCanvas(heatCanvas);
    if (!box) return;
    var ctx = box.ctx;
    var w = box.w;
    var h = box.h;
    var lay = heatLayout(w, h);
    heatGeom = lay;
    ctx.fillStyle = PANEL;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = SHEET;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = LINE;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    var pop = run.pop;
    var means = new Array(N).fill(0);
    for (var p = 0; p < pop.length; p++) {
      for (var g = 0; g < N; g++) means[g] += pop[p].x[g];
    }
    for (var m = 0; m < N; m++) means[m] /= pop.length;

    ctx.font = "11px " + FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = VERMILION;
    ctx.textAlign = "left";
    ctx.fillText("x1 は広がる", lay.padL, 1);
    ctx.fillStyle = NAVY;
    ctx.textAlign = "right";
    ctx.fillText("x2…x30 は 0 へ", w - lay.padR, 1);

    var meanBase = lay.bodyTop - 4;
    for (var c = 0; c < N; c++) {
      var x = lay.padL + c * lay.colW;
      var bh = means[c] * (lay.meanH - 2);
      ctx.fillStyle = c === 0 ? VERMILION : NAVY;
      ctx.globalAlpha = c === 0 ? 0.95 : 0.8;
      ctx.fillRect(x + 1, meanBase - bh, Math.max(1, lay.colW - 2), bh);
      ctx.globalAlpha = 1;
    }

    var order = pop.map(function (_, i) { return i; });
    order.sort(function (a, b) { return pop[a].x[0] - pop[b].x[0]; });
    var rowH = lay.bodyH / pop.length;
    for (var r = 0; r < order.length; r++) {
      var ind = pop[order[r]];
      var y = lay.bodyTop + r * rowH;
      for (var col = 0; col < N; col++) {
        ctx.fillStyle = geneColor(ind.x[col], col === 0);
        ctx.fillRect(lay.padL + col * lay.colW, y, lay.colW + 0.2, rowH + 0.2);
      }
      if (order[r] === selected) {
        ctx.fillStyle = VERMILION;
        ctx.fillRect(6, y, 4, Math.max(rowH, 1.5));
      }
    }

    ctx.strokeStyle = VERMILION;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lay.padL + lay.colW, lay.bodyTop);
    ctx.lineTo(lay.padL + lay.colW, lay.bodyTop + lay.bodyH);
    ctx.stroke();

    ctx.fillStyle = MUTED;
    ctx.font = "10px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var marks = [1, 10, 20, 30];
    for (var i = 0; i < marks.length; i++) {
      var index = marks[i] - 1;
      ctx.fillText(String(marks[i]), lay.padL + (index + 0.5) * lay.colW, lay.bodyTop + lay.bodyH + 2);
    }
  }

  function drawTrend() {
    var box = resizeCanvas(trendCanvas);
    if (!box) return;
    var ctx = box.ctx;
    var w = box.w;
    var h = box.h;
    ctx.fillStyle = SHEET;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = LINE;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    var L = 36;
    var R = 10;
    var T = 8;
    var B = 18;
    var W = Math.max(10, w - L - R);
    var H = Math.max(10, h - T - B);
    var cap = Math.max(readCap(), run.generation, 1);
    var hist = run.history;
    function xAt(gen) { return L + (gen / cap) * W; }
    function yAt(v) { return T + (1 - Math.max(0, Math.min(TREND_Y_MAX, v)) / TREND_Y_MAX) * H; }

    ctx.strokeStyle = "rgba(33, 28, 22, 0.08)";
    ctx.lineWidth = 1;
    ctx.fillStyle = MUTED;
    ctx.font = "10px " + FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    var yTicks = [0, 0.3, 0.6];
    for (var i = 0; i < yTicks.length; i++) {
      var y = yAt(yTicks[i]);
      ctx.beginPath();
      ctx.moveTo(L, y);
      ctx.lineTo(L + W, y);
      ctx.stroke();
      ctx.fillText(yTicks[i].toFixed(1), L - 4, y);
    }

    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(0));
    for (var g = 0; g < hist.length; g++) ctx.lineTo(xAt(g), yAt(hist[g]));
    ctx.lineTo(xAt(hist.length - 1), yAt(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(196, 49, 34, 0.12)";
    ctx.fill();

    ctx.beginPath();
    for (var k = 0; k < hist.length; k++) {
      var x = xAt(k);
      var yv = yAt(hist[k]);
      if (k === 0) ctx.moveTo(x, yv);
      else ctx.lineTo(x, yv);
    }
    ctx.strokeStyle = VERMILION;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    var lastX = xAt(hist.length - 1);
    var lastY = yAt(hist[hist.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = VERMILION;
    ctx.fill();

    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var step = cap <= 50 ? 10 : cap <= 120 ? 20 : cap <= 300 ? 50 : 100;
    for (var tick = 0; tick <= cap; tick += step) {
      ctx.fillText(String(tick), xAt(tick), T + H + 3);
    }
  }

  function render() {
    if (!run) return;
    var pop = run.pop;
    var mean = ZDT1.meanTail(pop);
    var gap = ZDT1.meanFrontGap(pop);
    var extent = ZDT1.x1Extent(pop);
    var sel = selectedIndex();
    var ind = pop[sel];
    genEl.textContent = String(run.generation);
    capLabel.textContent = String(readCap());
    popSizeLabel.textContent = String(pop.length);
    meanTailEl.textContent = format3(mean);
    meanTailPanel.textContent = format3(mean);
    frontGapEl.textContent = format3(gap);
    x1RangeEl.textContent = format3(extent.min) + " 〜 " + format3(extent.max);
    selectedSummary.textContent = "x₁ = " + format3(ind.x[0]) + " · x₂…x₃₀ の平均 = " + format3(individualTail(ind));
    statusLine.textContent = statusMessage();
    stepBtn.disabled = run.generation >= readCap();
    meanTailEl.classList.toggle("is-low", mean < 0.05);
    frontGapEl.classList.toggle("is-low", gap < 0.05);
    genEl.parentElement.classList.toggle("is-cap", run.generation >= readCap());
    drawPlot(sel);
    var selectedBox = resizeCanvas(selectedCanvas);
    if (selectedBox) {
      selectedBox.ctx.fillStyle = PANEL;
      selectedBox.ctx.fillRect(0, 0, selectedBox.w, selectedBox.h);
      drawGeneBars(selectedBox.ctx, selectedBox.w, selectedBox.h, ind.x, true);
    }
    drawHeatmap(sel);
    drawTrend();
  }

  function hitPlot(ev) {
    if (!plotGeom) return;
    var rect = plotCanvas.getBoundingClientRect();
    var x = ev.clientX - rect.left;
    var y = ev.clientY - rect.top;
    var pop = run.pop;
    var best = -1;
    var bestD = 13 * 13;
    for (var i = 0; i < pop.length; i++) {
      var dx = xOf(pop[i].f[0], plotGeom) - x;
      var dy = yOf(pop[i].f[1], plotGeom) - y;
      var d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      follow = [pop[best].f[0], pop[best].f[1]];
      render();
    }
  }

  function hitHeat(ev) {
    if (!heatGeom) return;
    var rect = heatCanvas.getBoundingClientRect();
    var y = ev.clientY - rect.top;
    var lay = heatGeom;
    if (y < lay.bodyTop || y > lay.bodyTop + lay.bodyH) return;
    var pop = run.pop;
    var order = pop.map(function (_, i) { return i; });
    order.sort(function (a, b) { return pop[a].x[0] - pop[b].x[0]; });
    var row = Math.floor(((y - lay.bodyTop) / lay.bodyH) * pop.length);
    row = Math.max(0, Math.min(pop.length - 1, row));
    var index = order[row];
    follow = [pop[index].f[0], pop[index].f[1]];
    render();
  }

  function loop(now) {
    if (!lastTick) lastTick = now;
    var dt = Math.min(250, now - lastTick);
    lastTick = now;
    var stepped = false;
    if (playing) {
      acc += dt;
      var speed = readNumber(speedInput, 8, 1, 40);
      var stepMs = 1000 / speed;
      var guard = 0;
      while (playing && acc >= stepMs && guard < 12) {
        acc -= stepMs;
        guard++;
        if (!advance()) break;
        stepped = true;
      }
    }
    if (stepped) render();
    requestAnimationFrame(loop);
  }

  playBtn.addEventListener("click", togglePlay);
  stepBtn.addEventListener("click", stepOnce);
  restartBtn.addEventListener("click", function () { restart(); });
  reseedBtn.addEventListener("click", reseed);
  speedInput.addEventListener("input", function () {
    speedValue.textContent = String(Math.round(readNumber(speedInput, 8, 1, 40)));
  });
  capInput.addEventListener("input", render);
  popInput.addEventListener("input", render);
  trailInput.addEventListener("change", render);
  plotCanvas.addEventListener("click", hitPlot);
  heatCanvas.addEventListener("click", hitHeat);
  document.addEventListener("keydown", function (ev) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (ev.code === "Space") {
      ev.preventDefault();
      togglePlay();
    } else if (ev.code === "ArrowRight") {
      ev.preventDefault();
      stepOnce();
    }
  });

  [popInput, mutInput, crossInput, capInput, seedInput].forEach(function (input) {
    input.addEventListener("blur", function () {
      if (input === seedInput) input.value = String(normalizeSeed(input.value));
      if (input === popInput) input.value = String(Math.round(readNumber(input, 80, 10, 300)));
      if (input === mutInput) input.value = String(readNumber(input, 0.0333, 0, 1));
      if (input === crossInput) input.value = String(readNumber(input, 0.9, 0, 1));
      if (input === capInput) input.value = String(readCap());
      render();
    });
  });

  var resizeTargets = [
    document.getElementById("plotWrap"),
    document.getElementById("selectedWrap"),
    document.getElementById("heatmapWrap"),
    document.getElementById("trendWrap")
  ];
  if (typeof ResizeObserver === "function") {
    var observer = new ResizeObserver(function () { render(); });
    resizeTargets.forEach(function (el) { observer.observe(el); });
  } else {
    window.addEventListener("resize", render);
  }

  startRun();
  syncPlayButton();
  render();
  requestAnimationFrame(loop);
})();
