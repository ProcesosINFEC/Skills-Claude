import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 640;
const HEIGHT = 400;

// World, about 1 unit per px. x along the bench, y toward the front, z up.
const G = {
  plate: { x: -172, y: -60, w: 334, d: 120, r: 8 },
  plateH: 12,
  footH: 5,
  // Drive bellows: the ventilator's own volume, pressed by a crosshead on two lead screws.
  drive: { c: [-122, 0], plan: { x: -142, y: -20, w: 40, d: 40, r: 4 }, ped: { x: -150, y: -28, w: 56, d: 56, r: 4 }, full: 60, stroke: 30, folds: 8 },
  screws: [[-158, 0], [-86, 0]],
  yokeZ: 96,
  // Test lung: a bellows held down by two springs, its compliance.
  lung: { c: [120, 0], plan: { x: 98, y: -22, w: 44, d: 44, r: 5 }, ped: { x: 90, y: -30, w: 60, d: 60, r: 4 }, frc: 26, stroke: 30, folds: 7 },
  posts: [[120, -36], [120, 36]],
  capZ: 88,
  pedH: 8,
  // Valve blocks: inspiratory (back row) and expiratory with PEEP (front row).
  iv: { x: -70, y: -30, w: 26, d: 24, r: 2 },
  ev: { x: -70, y: 6, w: 26, d: 24, r: 2 },
  blockH: 18,
  valveC: { iv: [-57, -18], ev: [-57, 18] },
  bridgeZ: 36,
  yb: { x: 36, y: -30, w: 54, d: 60, r: 3 },
  ybH: 14,
  gauge: [62, -16],
  gaugeZ: 60,
  gaugeR: 15,
  ductH: 7,
  vt: 500,
};

const P = k.fitProjection(
  [...k.boxCorners(G.plate, -G.plateH - G.footH, 0), [-122, 0, 124], [-158, -8, 110], [-86, 8, 110], [120, -36, 94], [120, 36, 94], [G.gauge[0], G.gauge[1], G.gaugeZ + 8]],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: 58 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// ---------- shared builders (also run in the page, every frame) ----------

function coilUp(k, P, cx, cy, r, z0, z1, turns) {
  const tv = k.towardViewer(P);
  const n = Math.max(24, Math.round(turns * 28));
  const runs = { back: [], front: [] };
  let side = null;
  let run = [];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * 2 * turns * i) / n;
    const p = k.iso([cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + ((z1 - z0) * i) / n], P);
    const s = Math.cos(a) * tv[0] + Math.sin(a) * tv[1] >= 0 ? "front" : "back";
    if (s !== side) {
      if (run.length > 1) runs[side].push(run);
      run = run.length ? [run[run.length - 1]] : [];
      side = s;
    }
    run.push(p);
  }
  if (run.length > 1) runs[side].push(run);
  const d = (list) => list.map((pts) => k.pathOf(pts)).join("");
  const end = (z, a) => k.iso([cx + r * Math.cos(a), cy + r * Math.sin(a), z], P);
  return { back: d(runs.back), front: d(runs.front), ends: [end(z0, 0), end(z1, Math.PI * 2 * turns)] };
}

function bellowsSvg(k, P, plan, z0, height, folds, tone) {
  const out = [];
  const f = height / folds;
  for (let i = 0; i < folds; i++) {
    const z = z0 + i * f;
    out.push(k.solidSvg(k.slabOf(k.insetPlan(plan, 2.6), z, f * 0.5, P, 4), { tone, crease: "none" }));
    out.push(k.solidSvg(k.slabOf(plan, z + f * 0.5, f * 0.5, P, 4, 0.4), { tone, crease: "faint" }));
  }
  return out.join("");
}

function postSvg(k, P, x, y, r, z0, z1, tone) {
  return z1 - z0 > 0.2 ? k.solidSvg(k.cylinder(x, y, r, z0, z1 - z0, P, 20), { tone, crease: "none" }) : "";
}

// The drive: lower screws and the bellows behind/in front, then the top plate and crosshead, then upper screws.
function driveSvg(k, P, G, height) {
  const d = G.drive;
  const z0 = G.pedH;
  const top = z0 + height;
  const xhead = top + 3;
  const xtop = xhead + 6;
  const [back, front] = [...G.screws].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  const out = [];
  out.push(postSvg(k, P, back[0], back[1], 2.2, 4, xhead, "mid"));
  out.push(k.lineSvg([12, 30, 48, 66].filter((z) => z < xhead - 1).map((z) => k.sideArc(back[0], back[1], 2.2, z, P, 12)).join(""), { tone: "faint" }));
  out.push(bellowsSvg(k, P, d.plan, z0, height, d.folds, "mid"));
  const plate = k.insetPlan(d.plan, -3);
  out.push(k.solidSvg(k.slabOf(plate, top, 3, P, 4, 0.6), { tone: "mid" }));
  out.push(k.lineSvg(k.planOutline(k.insetPlan(plate, 4), top + 3, P, 4), { tone: "faint" }));
  out.push(postSvg(k, P, front[0], front[1], 2.2, 4, xhead, "mid"));
  out.push(k.lineSvg([12, 30, 48, 66].filter((z) => z < xhead - 1).map((z) => k.sideArc(front[0], front[1], 2.2, z, P, 12)).join(""), { tone: "faint" }));
  const bar = { x: -164, y: -12, w: 84, d: 24, r: 3 };
  out.push(k.solidSvg(k.slabOf(bar, xhead, 6, P, 3, 0.5), { tone: "mid" }));
  out.push(k.dotsSvg([-146, -98].flatMap((x) => [-8, 8].map((y) => k.iso([x, y, xtop], P))), { size: 0.45 }));
  for (const [x, y] of [back, front]) {
    out.push(k.solidSvg(k.cylinder(x, y, 3.6, xtop, 1.6, P, 20), { tone: "mid" }));
    out.push(postSvg(k, P, x, y, 2.2, xtop + 1.6, G.yokeZ, "mid"));
  }
  return out.join("");
}

// The lung: posts, bellows, top plate and spring bar, then the springs round the posts above the bar.
function lungSvg(k, P, G, height, turns) {
  const l = G.lung;
  const z0 = G.pedH;
  const top = z0 + height;
  const barZ = top + 3;
  const barTop = barZ + 4;
  const [back, front] = [...G.posts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  const out = [];
  out.push(postSvg(k, P, back[0], back[1], 2, 3, barZ, "mid"));
  out.push(bellowsSvg(k, P, l.plan, z0, height, l.folds, "hi"));
  out.push(postSvg(k, P, front[0], front[1], 2, 3, barZ, "mid"));
  const plate = k.insetPlan(l.plan, -3);
  out.push(k.solidSvg(k.slabOf(plate, top, 3, P, 5, 0.6), { tone: "hi", lit: true }));
  out.push(k.lineSvg(k.planOutline(k.insetPlan(plate, 5), top + 3, P, 5), { tone: "faint" }));
  const bar = { x: l.c[0] - 7, y: -43, w: 14, d: 86, r: 2 };
  out.push(k.solidSvg(k.slabOf(bar, barZ, 4, P, 3, 0.5), { tone: "hi", lit: true }));
  out.push(k.dotsSvg([-14, 14].map((y) => k.iso([l.c[0], y, barTop], P)), { size: 0.45, tone: "lo" }));
  for (const [x, y] of [back, front]) {
    const c = coilUp(k, P, x, y, 4.4, barTop, G.capZ, turns);
    out.push(k.lineSvg(c.back, { tone: "lo" }));
    out.push(postSvg(k, P, x, y, 2, barTop, G.capZ, "mid"));
    out.push(k.lineSvg(c.front, { tone: "hi" }));
    out.push(k.dotsSvg(c.ends, { size: 0.5, tone: "hi" }));
  }
  return out.join("");
}

// A spring-loaded poppet valve: disc lifted by `lift`, a stem up through the bridge, a coil between.
function poppetSvg(k, P, G, c, lift, lit) {
  const [x, y] = c;
  const z = G.blockH + lift;
  const out = [];
  out.push(k.solidSvg(k.cylinder(x, y, 7, z, 2.4, P, 32, 0.4), { tone: "hi", lit }));
  const coil = coilUp(k, P, x, y, 3.4, z + 2.4, G.bridgeZ, 5);
  out.push(k.lineSvg(coil.back, { tone: "lo" }));
  out.push(postSvg(k, P, x, y, 1.1, z + 2.4, G.bridgeZ, "mid"));
  out.push(k.lineSvg(coil.front, { tone: "mid" }));
  out.push(k.dotsSvg(coil.ends, { size: 0.45, tone: "mid" }));
  return out.join("");
}

function needleAt(k, P, G, cm) {
  const from = (-5 * Math.PI) / 6;
  const a = from + ((5 * Math.PI) / 3) * Math.min(1, Math.max(0, cm / 50));
  const [x, y] = G.gauge;
  const r = G.gaugeR - 3.6;
  return k.lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * r, y - Math.cos(a) * r], G.gaugeZ + 8.2, P);
}

// ---------- static art ----------

function plate() {
  const PL = G.plate;
  const out = [`<path class="iso-halo" d="${k.haloOf(PL, -G.plateH - G.footH, G.plateH, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PL, 22))) {
    out.push(S(k.cylinder(x, y, 7, -G.plateH - G.footH, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -G.plateH - G.footH + 1.6, G.footH - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PL, -G.plateH, G.plateH, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PL, -4, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PL, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PL, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // Ruler strip along the front edge, under the manifold.
  const strip = { x: -30, y: PL.y + PL.d - 14, w: 110, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // Label plate on the left front.
  const label = { x: -30, y: -56, w: 40, d: 18, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: "faint" }));
  [[22, 6], [28, 10], [16, 14]].forEach(([w, y]) => out.push(L(k.lineOnTop([label.x + 5, label.y + y], [label.x + 5 + w, label.y + y], 0.8, P), { tone: "lo", free: true })));
  out.push(D([at([label.x + label.w - 4, label.y + 4, 0.8]), at([label.x + label.w - 4, label.y + label.d - 4, 0.8])], { size: 0.45 }));
  return out.join("");
}

function intake() {
  // Room-air intake filter that refills the drive bellows during expiration.
  const out = [];
  const [x, y] = [-122, 44];
  out.push(S(k.slabOf({ x: x - 4, y: 28, w: 8, d: 10, r: 1 }, 0, 6, P, 2), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 9, 0, 2, P, 40), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, 8, 2, 14, P, 40, 0.5), { tone: "mid", inner: L([6, 10].map((z) => k.sideArc(x, y, 8, z, P, 24)).join(""), { tone: "faint" }) }));
  out.push(L(k.knurl(x, y, 8, 2, 6, 40, P, 0.3), { tone: "lo" }));
  out.push(L(k.knurl(x, y, 8, 10, 16, 40, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(x, y, 4, 16, P, 24), { tone: "lo" }));
  out.push(D(k.pointsAt([[x - 2, y - 1, 16], [x + 1, y - 2, 16], [x + 2, y + 1, 16], [x - 1, y + 2, 16], [x, y, 16]], P), { size: 0.4, tone: "lo" }));
  return out.join("");
}

function driveStatic() {
  const d = G.drive;
  const out = [`<path class="iso-halo" d="${k.haloOf(d.ped, 0, 0.1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(d.ped, 0, G.pedH, P, 4, 0.6), { tone: "lo", inner: L(k.sideSeam(d.ped, 3, P, 4), { tone: "faint" }) }));
  out.push(D(k.corners(d.ped, 4).map(([x, y]) => at([x, y, G.pedH])), { size: 0.45 }));
  for (const [x, y] of G.screws) {
    out.push(S(k.cylinder(x, y, 5, 0, 4, P, 24, 0.4), { tone: "mid" }));
    out.push(L(k.knurl(x, y, 5, 0.6, 3.4, 18, P, 0.3), { tone: "lo" }));
  }
  return out.join("");
}

function driveTop() {
  const out = [];
  const yoke = { x: -164, y: -7, w: 84, d: 14, r: 2 };
  out.push(S(k.slabOf(yoke, G.yokeZ, 7, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(yoke, G.yokeZ + 3, P, 3), { tone: "faint" }) }));
  out.push(D([-152, -92].map((x) => at([x, 0, G.yokeZ + 7])), { size: 0.45 }));
  // Belt housing and motor on top of the yoke.
  const belt = { x: -160, y: -5, w: 76, d: 10, r: 4 };
  out.push(S(k.slabOf(belt, G.yokeZ + 7, 4, P, 6, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(-122, 0, 9.5, G.yokeZ + 11, 2, P, 40), { tone: "lo" }));
  out.push(S(k.cylinder(-122, 0, 8.5, G.yokeZ + 13, 13, P, 40, 0.6), { tone: "mid", inner: L(k.sideArc(-122, 0, 8.5, G.yokeZ + 22, P, 24), { tone: "faint" }) }));
  out.push(L(k.knurl(-122, 0, 8.5, G.yokeZ + 13, G.yokeZ + 22, 30, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(-122, 0, 3, G.yokeZ + 26, P, 20), { tone: "lo" }));
  out.push(D([at([-122, 0, G.yokeZ + 26])], { size: 0.5, tone: "hi" }));
  return out.join("");
}

function duct(x0, x1, yc) {
  const plan = { x: x0 + 3, y: yc - 5, w: x1 - x0 - 6, d: 10, r: 1 };
  const flange = (x) => {
    const f = { x, y: yc - 7, w: 3, d: 14, r: 0.8 };
    return S(k.slabOf(f, 0, G.ductH + 2, P, 2, 0.3), { tone: "mid" }) + D([at([x + 1.5, yc - 4.5, G.ductH + 2]), at([x + 1.5, yc + 4.5, G.ductH + 2])], { size: 0.4 });
  };
  const out = [flange(x0), S(k.slabOf(plan, 0, G.ductH, P, 3, 0.4), { tone: "mid", inner: L(k.sideSeam(plan, 2.5, P, 3), { tone: "faint" }) })];
  const n = Math.max(1, Math.floor((x1 - x0) / 22));
  const xs = Array.from({ length: n }, (_, i) => x0 + ((i + 0.5) * (x1 - x0)) / n);
  out.push(D(xs.map((x) => at([x, yc, G.ductH])), { size: 0.42, tone: "lo" }));
  out.push(flange(x1 - 3));
  return out.join("");
}

function valveBlock(plan, c, knob) {
  const [x, y] = c;
  const out = [];
  out.push(S(k.slabOf(plan, 0, G.blockH, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(plan, 6, P, 3), { tone: "faint" }) }));
  out.push(L(k.ring(x, y, 8.4, G.blockH, P, 32), { tone: "lo" }));
  out.push(D(k.corners(plan, 3).map(([px, py]) => at([px, py, G.blockH])), { size: 0.45 }));
  return out.join("");
}

function valveCage(c, back, knob) {
  // back = true: pillars and bridge drawn behind the poppet, else in front.
  const [x, y] = c;
  const pillars = byDepth([[x - 10, y], [x + 10, y]]);
  const out = [];
  if (back) {
    out.push(S(k.cylinder(pillars[0][0], pillars[0][1], 1.6, G.blockH, G.bridgeZ - G.blockH, P, 16), { tone: "mid", crease: "none" }));
    return out.join("");
  }
  out.push(S(k.cylinder(pillars[1][0], pillars[1][1], 1.6, G.blockH, G.bridgeZ - G.blockH, P, 16), { tone: "mid", crease: "none" }));
  const bridge = { x: x - 12.5, y: y - 3, w: 25, d: 6, r: 2.5 };
  out.push(S(k.slabOf(bridge, G.bridgeZ, 4, P, 4, 0.4), { tone: "mid" }));
  out.push(D([x - 10, x + 10].map((px) => at([px, y, G.bridgeZ + 4])), { size: 0.45 }));
  if (knob) {
    out.push(S(k.cylinder(x, y, 4.2, G.bridgeZ + 4, 5, P, 28), { tone: "mid" }));
    out.push(L(k.knurl(x, y, 4.2, G.bridgeZ + 4, G.bridgeZ + 9, 24, P, 0.3), { tone: "lo" }));
    out.push(L(k.lineOnTop([x, y], [x + 3, y - 2], G.bridgeZ + 9, P), { tone: "hi" }));
    out.push(D([at([x, y, G.bridgeZ + 9])], { size: 0.45, tone: "hi" }));
  } else {
    out.push(L(k.ring(x, y, 1.6, G.bridgeZ + 4, P, 12), { tone: "lo" }));
  }
  return out.join("");
}

function exhaust() {
  const out = [];
  const stub = { x: -62, y: 30, w: 10, d: 14, r: 1 };
  out.push(S(k.slabOf(stub, 0, G.ductH, P, 2, 0.4), { tone: "mid" }));
  const grille = { x: -68, y: 44, w: 22, d: 6, r: 1.5 };
  out.push(S(k.slabOf(grille, 0, 13, P, 3, 0.5), { tone: "mid" }));
  // Vent slots on the front face (+y), closed outlines.
  const fy = grille.y + grille.d;
  const slots = [-64, -60, -56, -52].map((x) =>
    k.pathOf([at([x, fy, 3]), at([x + 2, fy, 3]), at([x + 2, fy, 10]), at([x, fy, 10])], true),
  );
  out.push(L(slots.join(""), { tone: "lo" }));
  return out.join("");
}

function manifold() {
  const out = [];
  const yb = G.yb;
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(yb, 2), 0, 0.1, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.slabOf(yb, 0, G.ybH, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(yb, 5, P, 3), { tone: "faint" }) }));
  out.push(D(k.corners(yb, 3.5).map(([x, y]) => at([x, y, G.ybH])), { size: 0.45 }));
  out.push(L(k.planOutline({ x: yb.x + 6, y: 4, w: 24, d: 20, r: 2 }, G.ybH, P, 3), { tone: "faint" }));
  out.push(D([44, 63, 82].map((x) => at([x, yb.y + yb.d, 9.5])), { size: 0.45 }));
  // Flow sensor cartridge in the patient limb.
  const [fx, fy] = [74, 14];
  out.push(S(k.slabOf({ x: fx - 8, y: fy - 8, w: 16, d: 16, r: 2 }, G.ybH, 2, P, 3, 0.3), { tone: "mid" }));
  out.push(D(k.corners({ x: fx - 8, y: fy - 8, w: 16, d: 16 }, 2).map(([x, y]) => at([x, y, G.ybH + 2])), { size: 0.4 }));
  out.push(S(k.cylinder(fx, fy, 5.5, G.ybH + 2, 7, P, 32, 0.4), { tone: "mid", inner: L(k.sideArc(fx, fy, 5.5, G.ybH + 5, P, 20), { tone: "faint" }) }));
  out.push(L(k.knurl(fx, fy, 5.5, G.ybH + 5, G.ybH + 9, 24, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(fx, fy, 2.4, G.ybH + 9, P, 16), { tone: "lo" }));
  // Gauge: post, lug and dial face up.
  const [x, y] = G.gauge;
  out.push(S(k.cylinder(x, y, 5, G.ybH, 3, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 2.4, G.ybH + 3, G.gaugeZ - G.ybH - 3, P, 20), { tone: "mid", crease: "none" }));
  out.push(L([30, 44].map((z) => k.sideArc(x, y, 2.4, z, P, 12)).join(""), { tone: "faint" }));
  const R = G.gaugeR;
  const top = G.gaugeZ + 8;
  out.push(S(k.cylinder(x, y, R, G.gaugeZ, 8, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, R, top - 3, top, 72, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, R, top - 3, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, R - 2, top, P, 64), { tone: "lo" }));
  const from = (-5 * Math.PI) / 6;
  const ticks = k.radialTicks(x, y, R - 2.6, 50, 5, top, [1.1, 2.4], P, from, (5 * Math.PI) / 3 + 0.0001);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.4, top, P, 16), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 7.5], top, P, "x"), "cmH2O", { size: 2, tone: "lo", anchor: "middle" }));
  return out.join("");
}

function lungStatic() {
  const l = G.lung;
  const out = [`<path class="iso-halo" d="${k.haloOf(l.ped, 0, 0.1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(l.ped, 0, G.pedH, P, 4, 0.6), { tone: "lo", inner: L(k.sideSeam(l.ped, 3, P, 4), { tone: "faint" }) }));
  out.push(D(k.corners(l.ped, 4).map(([x, y]) => at([x, y, G.pedH])), { size: 0.45 }));
  for (const [x, y] of G.posts) {
    out.push(S(k.cylinder(x, y, 5, 0, 3, P, 24, 0.4), { tone: "mid" }));
  }
  return out.join("");
}

function lungCaps() {
  const out = [];
  for (const [x, y] of byDepth(G.posts)) {
    out.push(S(k.cylinder(x, y, 5.6, G.capZ, 4, P, 28, 0.4), { tone: "mid" }));
    out.push(L(k.knurl(x, y, 5.6, G.capZ + 0.5, G.capZ + 3.5, 28, P, 0.3), { tone: "lo" }));
    out.push(L(k.ring(x, y, 2, G.capZ + 4, P, 16), { tone: "lo" }));
  }
  return out.join("");
}

// ---------- model ----------
// Volume-controlled breath: square flow, then an inspiratory pause, then passive expiration.
const MODEL = { T: 4, ti: 1.0, pause: 0.3, vt: 500, peep: 5, R: 10 };
function breath(t, C, M) {
  const flowLs = M.vt / 1000 / M.ti;
  const tau = (M.R * C) / 1000;
  const ph = ((t % M.T) + M.T) % M.T;
  if (ph < M.ti) {
    const v = flowLs * 1000 * ph;
    return { phase: "insp", v, paw: M.peep + v / C + M.R * flowLs, palv: M.peep + v / C, flow: flowLs * 60, inLift: 1, exLift: 0, refill: v / M.vt };
  }
  if (ph < M.ti + M.pause) {
    const v = M.vt;
    return { phase: "pause", v, paw: M.peep + v / C, palv: M.peep + v / C, flow: 0, inLift: 0, exLift: 0, refill: 1 };
  }
  const te = ph - M.ti - M.pause;
  const v = M.vt * Math.exp(-te / tau);
  const back = Math.min(1, te / 1.6);
  return { phase: "exp", v, paw: M.peep + (0.2 * v) / C, palv: M.peep + v / C, flow: -(v / tau) * 0.06, inLift: 0, exLift: Math.exp(-te / tau), refill: 1 - (0.5 - 0.5 * Math.cos(Math.PI * back)) };
}

// ---------- assemble ----------

const C0 = 50;
const s0 = breath(MODEL.ti + MODEL.pause * 0.5, C0, MODEL);
const turnsOf = (C) => 3 + C / 10;
const driveH0 = G.drive.full - G.drive.stroke * s0.refill;
const lungH0 = G.lung.frc + (G.lung.stroke * s0.v) / G.vt;

const body = [
  plate(),
  driveStatic(),
  `<g data-part="drive">${driveSvg(k, P, G, driveH0)}</g>`,
  driveTop(),
  intake(),
  duct(-94, -70, -18),
  valveBlock(G.iv, G.valveC.iv),
  valveCage(G.valveC.iv, true),
  `<g data-part="iv">${poppetSvg(k, P, G, G.valveC.iv, 0, false)}</g>`,
  valveCage(G.valveC.iv, false, false),
  duct(-44, 36, -18),
  valveBlock(G.ev, G.valveC.ev),
  valveCage(G.valveC.ev, true),
  `<g data-part="ev">${poppetSvg(k, P, G, G.valveC.ev, 0, false)}</g>`,
  valveCage(G.valveC.ev, false, true),
  exhaust(),
  duct(-44, 36, 18),
  manifold(),
  `<path data-part="peak" class="iso-line" data-tone="lo" data-free="start" d="${needleAt(k, P, G, s0.paw)}" style="stroke-width:0.8"/>`,
  `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(k, P, G, s0.paw)}" style="stroke-width:1.1"/>`,
  lungStatic(),
  `<g data-part="lung">${lungSvg(k, P, G, lungH0, turnsOf(C0))}</g>`,
  lungCaps(),
];

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Un ventilador mecánico como banco de pruebas. A la izquierda, un fuelle motor que una cruceta comprime con dos husillos; en el centro, una válvula inspiratoria y una válvula espiratoria con PEEP, ambas de disco y muelle, y un manómetro de presión en vía aérea; a la derecha, un pulmón de prueba: un fuelle sujeto por dos muelles que representan su distensibilidad. En cada ciclo el fuelle motor se vacía en el pulmón, se mantiene una pausa y el pulmón se vacía solo por la válvula espiratoria hasta la PEEP.",
  body,
});

const live = `
const G = ${JSON.stringify(G)};
const P = ${JSON.stringify(P)};
const MODEL = ${JSON.stringify(MODEL)};
const k = { towardViewer, iso, pathOf, slabOf, insetPlan, solidSvg, lineSvg, dotsSvg, cylinder, sideArc, planOutline, lineOnTop, depthOf };
${coilUp.toString()}
${bellowsSvg.toString()}
${postSvg.toString()}
${driveSvg.toString()}
${lungSvg.toString()}
${poppetSvg.toString()}
${needleAt.toString()}
${breath.toString()}
const turnsOf = ${turnsOf.toString()};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const drive = part("drive"), lung = part("lung"), iv = part("iv"), ev = part("ev"), needle = part("needle"), peakEl = part("peak");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const NAMES = { insp: "Inspiración", pause: "Pausa", exp: "Espiración" };
let C = 50, Cshown = 50, t = MODEL.ti + MODEL.pause * 0.5, last = 0, frame = 0, visible = false;
let ease = { inL: 0, exL: 0, paw: 0, drive: 0, lung: 0 }, peak = 0, peakShown = 0, cycle = -1, cyclePeak = 0;
let lastTurns = -1, paused = false;
function draw(s) {
  drive.innerHTML = driveSvg(k, P, G, G.drive.full - G.drive.stroke * ease.drive);
  lung.innerHTML = lungSvg(k, P, G, G.lung.frc + G.lung.stroke * ease.lung, turnsOf(Cshown));
  iv.innerHTML = poppetSvg(k, P, G, G.valveC.iv, 3.2 * ease.inL, ease.inL > 0.5);
  ev.innerHTML = poppetSvg(k, P, G, G.valveC.ev, 3.2 * ease.exL, ease.exL > 0.5);
  needle.setAttribute("d", needleAt(k, P, G, ease.paw));
  peakEl.setAttribute("d", needleAt(k, P, G, peakShown));
  const text = NAMES[s.phase] + " · " + s.paw.toFixed(0) + " cmH₂O · " + Math.round(s.v) + " mL · C " + Math.round(C);
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(C)));
  stage.setAttribute("aria-valuetext", text);
}
function step(dt, calm) {
  if (!calm && !paused) t += dt;
  const s = breath(t, C, MODEL);
  const n = Math.floor(t / MODEL.T);
  if (n !== cycle) { cycle = n; peak = cyclePeak || s.paw; cyclePeak = 0; }
  cyclePeak = Math.max(cyclePeak, s.paw);
  const f = (x, y, sec) => (calm ? y : x + (y - x) * (1 - Math.exp(-dt / sec)));
  ease.inL = f(ease.inL, s.inLift, 0.06);
  ease.exL = f(ease.exL, s.exLift, 0.06);
  ease.paw = f(ease.paw, s.paw, 0.05);
  ease.drive = f(ease.drive, s.refill, 0.04);
  ease.lung = f(ease.lung, s.v / MODEL.vt, 0.04);
  Cshown = f(Cshown, C, 0.25);
  peakShown = f(peakShown, Math.max(peak, cyclePeak), 0.3);
  return s;
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  draw(step(dt, still.matches));
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const setC = (next) => { C = clamp(Math.round(next), 20, 80); if (still.matches) { const s = breath(t, C, MODEL); peak = s.paw; Cshown = C; for (let i = 0; i < 3; i++) step(1, true); draw(breath(t, C, MODEL)); } run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  setC(80 - clamp((event.clientX - box.left) / box.width, 0, 1) * 60);
});
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") to = C - 10;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = C + 10;
  if (event.key === "Home") to = 80;
  if (event.key === "End") to = 20;
  if (to === null) return;
  event.preventDefault();
  setC(to);
});
window.__vent = { seek(time, c) { paused = true; t = time; if (c) C = c; last = 0; for (let i = 0; i < 40; i++) step(1 / 60, true); draw(breath(t, C, MODEL)); } };
{ const s = breath(t, C, MODEL); ease = { inL: s.inLift, exL: s.exLift, paw: s.paw, drive: s.refill, lung: s.v / MODEL.vt }; peak = peakShown = MODEL.peep + MODEL.vt / C + MODEL.R * MODEL.vt / 1000 / MODEL.ti; draw(s); }
`;

const plateBody = k.plateHtml({
  fig: "Fig 1",
  title: "Ventilador mecánico",
  hint: "Puntero: distensibilidad",
  readout: `Pausa · ${s0.paw.toFixed(0)} cmH₂O · 500 mL · C 50`,
  keys: [
    { mark: "lit", label: "Pulmón de prueba y aguja del manómetro: lo que cambia con cada respiración" },
    { mark: "raised", label: "Fuelle motor, válvula inspiratoria (atrás) y válvula espiratoria con PEEP (delante)" },
    { mark: "dim", label: "Aguja fina: presión pico del último ciclo" },
  ],
  caption:
    "Ventilación controlada por volumen. Inspiración: la cruceta baja y vacía 500 mL del fuelle motor a flujo constante (30 L/min); la válvula inspiratoria se abre y el pulmón sube contra sus muelles. La presión en vía aérea es PEEP + V/C + R·flujo: con C 50 y R 10 llega a 20 cmH₂O de pico. Pausa: sin flujo, la presión cae a la meseta (PEEP + V/C = 15). Espiración: la válvula inspiratoria se cierra, se abre la espiratoria y el pulmón se vacía solo, por su propia retracción elástica, con constante de tiempo R·C, hasta la PEEP (5 cmH₂O), que el muelle de la válvula espiratoria mantiene. Mientras, el fuelle motor se recarga por el filtro. Mueve el puntero hacia la derecha para endurecer el pulmón (C 20, como en un SDRA): el volumen no cambia, pero la presión meseta sube a 30 y el pico a 35.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Ventilador mecánico: las flechas cambian la distensibilidad del pulmón de prueba" aria-valuemin="20" aria-valuemax="80" aria-valuenow="50">${svg}</div>`,
});

const name = theme === "light" ? "ventilador-light.html" : "ventilador.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Ventilador mecánico", theme, body: plateBody, script: kitScript() + live }));
console.log("wrote", name);
