"use strict";

// NSGA-II on ZDT1, n = 30, both objectives minimized.
// f1 = x1
// g  = 1 + 9 * sum(x2..xn) / (n - 1)
// f2 = g * (1 - sqrt(f1 / g))
// Pareto set: x1 in [0, 1], xi = 0 for i >= 2.
// Pareto front: f2 = 1 - sqrt(f1), f1 in [0, 1].

(function (root) {
  var N = 30;
  var ETA_C = 20;
  var ETA_M = 20;
  var EPS = 1e-14;

  function clip(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function rng() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function zdt1(x) {
    var n = x.length;
    var sum = 0;
    for (var i = 1; i < n; i++) sum += x[i];
    var g = 1 + (9 * sum) / (n - 1);
    var f1 = x[0];
    var ratio = g <= 0 ? 0 : clip(f1 / g, 0, 1);
    var f2 = g * (1 - Math.sqrt(ratio));
    return { f1: f1, f2: f2, g: g };
  }

  function makeIndividual(x) {
    var obj = zdt1(x);
    return {
      x: x,
      f: [obj.f1, obj.f2],
      g: obj.g,
      rank: 0,
      crowd: 0
    };
  }

  function compareDominance(a, b) {
    var aBetter = false;
    var bBetter = false;
    for (var i = 0; i < 2; i++) {
      if (a.f[i] < b.f[i]) aBetter = true;
      else if (a.f[i] > b.f[i]) bBetter = true;
    }
    if (aBetter && !bBetter) return 1;
    if (bBetter && !aBetter) return -1;
    return 0;
  }

  function fastNonDominatedSort(pop) {
    var n = pop.length;
    var dominatesList = new Array(n);
    var dominatedCount = new Array(n);
    for (var i = 0; i < n; i++) {
      dominatesList[i] = [];
      dominatedCount[i] = 0;
    }
    var fronts = [[]];
    for (var p = 0; p < n; p++) {
      for (var q = p + 1; q < n; q++) {
        var d = compareDominance(pop[p], pop[q]);
        if (d === 1) {
          dominatesList[p].push(q);
          dominatedCount[q]++;
        } else if (d === -1) {
          dominatesList[q].push(p);
          dominatedCount[p]++;
        }
      }
      if (dominatedCount[p] === 0) {
        pop[p].rank = 0;
        fronts[0].push(p);
      }
    }
    var fi = 0;
    while (fronts[fi].length > 0) {
      var next = [];
      var front = fronts[fi];
      for (var a = 0; a < front.length; a++) {
        var pIndex = front[a];
        var dominated = dominatesList[pIndex];
        for (var b = 0; b < dominated.length; b++) {
          var qIndex = dominated[b];
          dominatedCount[qIndex]--;
          if (dominatedCount[qIndex] === 0) {
            pop[qIndex].rank = fi + 1;
            next.push(qIndex);
          }
        }
      }
      fi++;
      if (next.length === 0) break;
      fronts.push(next);
    }
    return fronts;
  }

  function assignCrowding(pop, front) {
    var i;
    for (i = 0; i < front.length; i++) pop[front[i]].crowd = 0;
    if (front.length <= 2) {
      for (i = 0; i < front.length; i++) pop[front[i]].crowd = Infinity;
      return;
    }
    for (var obj = 0; obj < 2; obj++) {
      var sorted = front.slice().sort(function (a, b) {
        return pop[a].f[obj] - pop[b].f[obj];
      });
      pop[sorted[0]].crowd = Infinity;
      pop[sorted[sorted.length - 1]].crowd = Infinity;
      var lo = pop[sorted[0]].f[obj];
      var hi = pop[sorted[sorted.length - 1]].f[obj];
      var span = hi - lo;
      if (span === 0) continue;
      for (var k = 1; k < sorted.length - 1; k++) {
        var prev = pop[sorted[k - 1]].f[obj];
        var next = pop[sorted[k + 1]].f[obj];
        pop[sorted[k]].crowd += (next - prev) / span;
      }
    }
  }

  function assignRankAndCrowding(pop) {
    var fronts = fastNonDominatedSort(pop);
    for (var i = 0; i < fronts.length; i++) assignCrowding(pop, fronts[i]);
    return fronts;
  }

  function environmentalSelection(pop, popSize) {
    var fronts = assignRankAndCrowding(pop);
    var next = [];
    for (var f = 0; f < fronts.length; f++) {
      var front = fronts[f];
      if (next.length + front.length <= popSize) {
        for (var i = 0; i < front.length; i++) next.push(pop[front[i]]);
      } else {
        var ranked = front.slice().sort(function (a, b) {
          var d = pop[b].crowd - pop[a].crowd;
          if (d !== 0) return d;
          return a - b;
        });
        for (var j = 0; j < ranked.length && next.length < popSize; j++) {
          next.push(pop[ranked[j]]);
        }
        break;
      }
    }
    if (next.length !== popSize) {
      throw new Error("NSGA-II selection filled " + next.length + " of " + popSize);
    }
    return next;
  }

  function tournament(pop, rng) {
    if (pop.length === 1) return pop[0];
    var i = Math.floor(rng() * pop.length);
    var j = Math.floor(rng() * pop.length);
    if (j === i) j = (j + 1) % pop.length;
    var a = pop[i];
    var b = pop[j];
    if (a.rank !== b.rank) return a.rank < b.rank ? a : b;
    if (a.crowd !== b.crowd) return a.crowd > b.crowd ? a : b;
    return rng() < 0.5 ? a : b;
  }

  function sbx(parentA, parentB, pc, eta, rng) {
    var n = parentA.length;
    var c1 = parentA.slice();
    var c2 = parentB.slice();
    if (rng() > pc) return [c1, c2];
    var yl = 0;
    var yu = 1;
    var exp = 1 / (eta + 1);
    for (var i = 0; i < n; i++) {
      var x1 = parentA[i];
      var x2 = parentB[i];
      if (rng() > 0.5 || Math.abs(x1 - x2) < EPS) {
        c1[i] = x1;
        c2[i] = x2;
        continue;
      }
      var y1 = x1;
      var y2 = x2;
      if (y1 > y2) {
        var swap = y1;
        y1 = y2;
        y2 = swap;
      }
      var rand = rng();
      var beta1 = 1 + (2 * (y1 - yl)) / (y2 - y1);
      var alpha1 = 2 - Math.pow(beta1, -(eta + 1));
      var betaq1 = rand <= 1 / alpha1
        ? Math.pow(Math.max(rand * alpha1, 0), exp)
        : Math.pow(1 / Math.max(2 - rand * alpha1, EPS), exp);
      var beta2 = 1 + (2 * (yu - y2)) / (y2 - y1);
      var alpha2 = 2 - Math.pow(beta2, -(eta + 1));
      var betaq2 = rand <= 1 / alpha2
        ? Math.pow(Math.max(rand * alpha2, 0), exp)
        : Math.pow(1 / Math.max(2 - rand * alpha2, EPS), exp);
      var child1 = 0.5 * ((y1 + y2) - betaq1 * (y2 - y1));
      var child2 = 0.5 * ((y1 + y2) + betaq2 * (y2 - y1));
      child1 = clip(child1, yl, yu);
      child2 = clip(child2, yl, yu);
      if (rng() <= 0.5) {
        c1[i] = child2;
        c2[i] = child1;
      } else {
        c1[i] = child1;
        c2[i] = child2;
      }
    }
    return [c1, c2];
  }

  function polynomialMutate(x, pm, eta, rng) {
    var y = x.slice();
    var yl = 0;
    var yu = 1;
    for (var i = 0; i < y.length; i++) {
      if (rng() > pm) continue;
      var delta1 = (y[i] - yl) / (yu - yl);
      var delta2 = (yu - y[i]) / (yu - yl);
      var rnd = rng();
      var mutPow = 1 / (eta + 1);
      var deltaq;
      if (rnd <= 0.5) {
        var xy = 1 - delta1;
        var val = 2 * rnd + (1 - 2 * rnd) * Math.pow(Math.max(xy, 0), eta + 1);
        deltaq = Math.pow(Math.max(val, 0), mutPow) - 1;
      } else {
        var xy2 = 1 - delta2;
        var val2 = 2 * (1 - rnd) + 2 * (rnd - 0.5) * Math.pow(Math.max(xy2, 0), eta + 1);
        deltaq = 1 - Math.pow(Math.max(val2, 0), mutPow);
      }
      y[i] = clip(y[i] + deltaq * (yu - yl), yl, yu);
    }
    return y;
  }

  function meanTail(pop) {
    var n = pop[0].x.length;
    var s = 0;
    for (var p = 0; p < pop.length; p++) {
      var x = pop[p].x;
      for (var i = 1; i < n; i++) s += x[i];
    }
    return s / (pop.length * (n - 1));
  }

  function meanFrontGap(pop) {
    var s = 0;
    for (var i = 0; i < pop.length; i++) {
      var f1 = pop[i].f[0];
      var ideal = 1 - Math.sqrt(Math.max(0, f1));
      s += pop[i].f[1] - ideal;
    }
    return s / pop.length;
  }

  function x1Extent(pop) {
    var lo = Infinity;
    var hi = -Infinity;
    for (var i = 0; i < pop.length; i++) {
      var v = pop[i].x[0];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return { min: lo, max: hi };
  }

  function createRun(options) {
    var popSize = options.popSize | 0;
    if (popSize < 2) throw new Error("popSize must be at least 2");
    var n = N;
    var rng = mulberry32(options.seed >>> 0);
    var pop = new Array(popSize);
    for (var i = 0; i < popSize; i++) {
      var x = new Array(n);
      for (var g = 0; g < n; g++) x[g] = rng();
      pop[i] = makeIndividual(x);
    }
    assignRankAndCrowding(pop);
    return {
      n: n,
      popSize: popSize,
      seed: options.seed >>> 0,
      mutationRate: options.mutationRate,
      crossoverRate: options.crossoverRate,
      etaC: ETA_C,
      etaM: ETA_M,
      rng: rng,
      pop: pop,
      prevF: null,
      generation: 0,
      history: [meanTail(pop)]
    };
  }

  function stepRun(run) {
    var pop = run.pop;
    var popSize = run.popSize;
    var rng = run.rng;
    var prev = new Array(pop.length);
    for (var i = 0; i < pop.length; i++) prev[i] = [pop[i].f[0], pop[i].f[1]];
    run.prevF = prev;

    var offspring = [];
    while (offspring.length < popSize) {
      var p1 = tournament(pop, rng);
      var p2 = tournament(pop, rng);
      var crossed = sbx(p1.x, p2.x, run.crossoverRate, run.etaC, rng);
      var x1 = polynomialMutate(crossed[0], run.mutationRate, run.etaM, rng);
      var x2 = polynomialMutate(crossed[1], run.mutationRate, run.etaM, rng);
      offspring.push(makeIndividual(x1));
      if (offspring.length < popSize) offspring.push(makeIndividual(x2));
    }

    run.pop = environmentalSelection(pop.concat(offspring), popSize);
    run.generation += 1;
    run.history.push(meanTail(run.pop));
    return run;
  }

  function ranksForObjectives(points) {
    var pop = points.map(function (f) {
      return { f: f.slice(), rank: -1, crowd: 0, x: [0] };
    });
    assignRankAndCrowding(pop);
    return pop.map(function (ind) {
      return { rank: ind.rank, crowd: ind.crowd };
    });
  }

  root.ZDT1 = {
    N: N,
    ETA_C: ETA_C,
    ETA_M: ETA_M,
    zdt1: zdt1,
    createRun: createRun,
    stepRun: stepRun,
    meanTail: meanTail,
    meanFrontGap: meanFrontGap,
    x1Extent: x1Extent,
    ranksForObjectives: ranksForObjectives
  };
})(typeof window !== "undefined" ? window : globalThis);
