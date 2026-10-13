import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";
import * as A from "../../.claude/skills/anatomy/kit/audit.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const W = 640;
const H = 420;

// World: x along the pump shaft (suction on the left, fan on the right), y toward the front, z up.
const PLATE = { x: -178, y: -72, w: 310, d: 122, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;
const AX = 30; // shaft height
const CASE_R = 21;
const TOP = AX + CASE_R; // top of the pump casing
const PRIME = [-54, 0]; // priming plug port
const OUT = [-38, 0]; // discharge port
const RUN_Z = 88; // discharge run height
const BACK_Y = -44; // discharge run along the back
const FIVE = [0, BACK_Y, RUN_Z]; // five-way fitting
const VALVE_X = 46;
const TAP = [96, BACK_Y];
const BOWL = { c: [-111, 0], r: 11, z0: 4, z1: 16 };
const WELL = [-152, 0];
const GAUGE = { c: [0, BACK_Y], r: 13, z: 107, h: 6 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, BACK_Y - 13, GAUGE.z + GAUGE.h + 2], [-38, 0, RUN_Z + 8], [96, -44, RUN_Z + 8], [49, 0, AX + 18]],
  W,
  H,
  { pad: 22, azimuth: 52 },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);

const R = A.recorder(P);
const record = R.solid;
const put = (name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) => R.put({ name, at: ref, bias, svg, shapes, piece: "bench", ...rest });

const XF = (o) => G.frameOf(o, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const YF = (o) => G.frameOf(o, [0, 1, 0], [0, 0, 1], [1, 0, 0]);
const ZF = (o) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);

function box(name, plan, z0, h, style = {}, { steps = 3, bevel = 0.5, extra = "", inner = "", bias = 0, owner, wrap } = {}) {
  const shape = record(A.slab(plan, z0, h, { name, owner }, steps));
  const svg = S(k.slabOf(plan, z0, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra;
  put(name, [plan.x + plan.w / 2, plan.y + plan.d / 2, z0 + h / 2], wrap ? wrap(svg) : svg, [shape], { bias });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, owner, steps, bevel = 0, wrap, ref } = {}) {
  const paths = G.solidOf(profile, F, P, { bevel, ...(steps ? { steps } : {}) });
  const shape = record(A.solid(F, profile, { name, owner }));
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const svg = S(paths, { tone: "mid", ...style, inner }) + extra;
  put(name, ref ?? G.add3(F.o, G.mul3(F.a, mid)), wrap ? wrap(svg) : svg, [shape], { bias });
  return shape;
}
const disc = (name, F, s0, s1, r, style, options) => turned(name, F, [[s0, r], [s1, r]], style, options);
function ball(name, c, r, style = {}, { bias = 0, owner = name.startsWith("suction") ? "line.in" : "line.out" } = {}) {
  const shape = record(A.ball(c, r, { name, owner }));
  put(name, c, S(G.sphereOf(c, r, P, { steps: 40 }), { tone: "mid", ...style }), [shape], { bias });
  return shape;
}
// A straight pipe between two points on one axis, with faint band lines near both ends.
function pipe(name, a, b, r, { tone = "mid", owner = name.startsWith("suction") ? "line.in" : "line.out" } = {}) {
  const d = G.sub3(b, a);
  const len = G.len3(d);
  const F = G.frameAlong(a, G.unit3(d));
  return disc(name, F, 0, len, r, { tone }, { owner, inner: Ln(G.arcOf(F, Math.min(3, len / 3), r, P) + G.arcOf(F, len - Math.min(3, len / 3), r, P), { tone: "faint" }) });
}
const rim = (R0, r) => Math.sqrt(R0 * R0 - r * r);
// A boss seated on a round host: its base follows the host's curve (the host's axis runs along F.v).
function saddle(name, F, a, R0, s1, host, style = {}, { owner, extra = "" } = {}) {
  const low = Math.sqrt(R0 * R0 - a * a);
  const shape = record(A.disc(F, low - 0.05, s1, a, { name, owner, seated: true, cut: host }));
  put(name, G.pointOf(F, (low + s1) / 2, 0, 0), S(G.saddleOf(F, a, R0, s1, P), { tone: "mid", ...style }) + extra, [shape]);
  return shape;
}

// ---------- bench ----------
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
  back.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
back.push(Ln(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
const plateScrews = k.corners(PLATE, 10);
back.push(Ln(plateScrews.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(plateScrews.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
const STRIP = { x: -40, y: PLATE.y + PLATE.d - 13, w: 150, d: 6, r: 1 };
back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
const ticks = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 4, 5, STRIP.y, 0.6, [1.8, 3.4], P);
back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
const LABEL = { x: 70, y: 4, w: 40, d: 18, r: 1.5 };
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 4), { tone: "faint" }));
[[24, 5], [30, 9], [18, 13]].forEach(([w, y]) => back.push(Ln(k.lineOnTop([LABEL.x + 5, LABEL.y + y], [LABEL.x + 5 + w, LABEL.y + y], 0.8, P), { tone: "lo", free: true })));
back.push(Dots([at([LABEL.x + LABEL.w - 4, LABEL.y + 4, 0.8]), at([LABEL.x + LABEL.w - 4, LABEL.y + LABEL.d - 4, 0.8])], { size: 0.45 }));

// ---------- well head and suction ----------
const WZ = ZF([WELL[0], WELL[1], 0]);
turned("well.ring", WZ, [[0, 18], [10, 18]], { tone: "lo" }, { inner: Ln(G.arcOf(WZ, 4, 18, P), { tone: "faint" }), extra: Dots(G.dotsOf(WZ, 10, 16.5, 10, P, { all: true }), { size: 0.45 }) });
turned("well.lid", WZ, [[10, 15.5], [12.5, 15.5]], { tone: "mid" }, { bevel: 0.4, extra: Ln(G.circleOf(WZ, 12.5, 12, P), { tone: "faint" }) });
turned("well.gland", WZ, [[12.5, 9], [15.5, 9]], { tone: "mid" }, { steps: 6 });
const ELBOW_W = [WELL[0], 0, AX];
pipe("suction.drop", [WELL[0], 0, 15.5], [WELL[0], 0, AX - rim(9, 6)], 6);
ball("suction.elbow", ELBOW_W, 9);
pipe("suction.in", [WELL[0] + rim(9, 6), 0, AX], [-123, 0, AX], 6);

// Pre-filter: head block, fill cap, lock ring and the clear bowl hanging below.
const HEAD = { x: -123, y: -11, w: 24, d: 22, r: 2 };
box("filter.head", HEAD, 20, 20, {}, { inner: Ln(k.sideSeam(HEAD, 26, P, 3), { tone: "faint" }), extra: Dots(k.corners(HEAD, 3).map(([x, y]) => at([x, y, 40])), { size: 0.45 }) });
const CAPF = ZF([BOWL.c[0], BOWL.c[1], 0]);
turned("filter.cap", CAPF, [[40, 8.5], [42.5, 8.5], [42.5, 7], [47, 7]], {}, { bevel: 0.3, extra: Ln(k.knurl(BOWL.c[0], BOWL.c[1], 7, 42.5, 47, 28, P, 0.3), { tone: "lo" }) + Ln(k.ring(BOWL.c[0], BOWL.c[1], 3, 47, P, 16), { tone: "lo" }) });
turned("filter.lockring", CAPF, [[16, 12.4], [20, 12.4]], {}, { extra: Ln(k.knurl(BOWL.c[0], BOWL.c[1], 12.4, 16, 20, 40, P, 0.3), { tone: "lo" }) });
{
  const [x, y] = BOWL.c;
  const glass = k.cylinder(x, y, BOWL.r, BOWL.z0, BOWL.z1 - BOWL.z0, P, 48);
  const shape = record(A.cylinder(x, y, BOWL.r, BOWL.z0, BOWL.z1 - BOWL.z0, { name: "filter.bowl" }));
  const svg =
    `<path class="bp-glass" d="${glass.fill}"/>` +
    `<g data-part="bowl"></g>` +
    Ln(k.sideArc(x, y, BOWL.r, BOWL.z0 + 2, P, 32), { tone: "faint" }) +
    Ln(k.segment([x - BOWL.r * 0.55, y + BOWL.r * 0.83, BOWL.z0 + 1.5], [x - BOWL.r * 0.55, y + BOWL.r * 0.83, BOWL.z1 - 0.5], P), { tone: "faint" }) +
    `<path class="iso-line iso-edge" data-tone="mid" d="${glass.outline}"/>`;
  put("filter.bowl", [x, y, (BOWL.z0 + BOWL.z1) / 2], svg, [shape]);
}
pipe("suction.out", [-99, 0, AX], [-76, 0, AX], 6);
disc("suction.union", XF([0, 0, AX]), -76, -72, 9.5, {}, { steps: 6, owner: "pump" });

// ---------- pump and motor ----------
const SH = XF([0, 0, AX]);
box("pump.foot", { x: -60, y: -18, w: 20, d: 36, r: 2 }, 0, AX - CASE_R, { tone: "lo" }, { owner: "pump", extra: Dots([[-55, -13], [-45, -13], [-55, 13], [-45, 13]].map(([x, y]) => at([x, y, 9])), { size: 0.45 }) });
box("motor.foot", { x: 0, y: -20, w: 30, d: 40, r: 2 }, 0, AX - 17.5, { tone: "lo" }, { owner: "pump", extra: Dots([[5, -15], [25, -15], [5, 15], [25, 15]].map(([x, y]) => at([x, y, AX - 17.5])), { size: 0.45 }) });
const CASE_PROFILE = [[-72, 12], [-66, 12], [-66, 17], [-63, CASE_R], [-30, CASE_R], [-28, 18], [-26, 18]];
const CASING = turned("pump.casing", SH, CASE_PROFILE, { tone: "hi" }, {
  owner: "pump",
  inner: Ln(G.arcOf(SH, -46, CASE_R, P), { tone: "faint" }),
  extra: Dots(G.dotsOf(SH, -66, 14.5, 8, P, { fade: [0.04, 0.42] }), { size: 0.45 }) + Dots(G.dotsOf(SH, -28, 16, 10, P, { fade: [0.04, 0.42] }), { size: 0.45 }),
});
disc("pump.lantern", SH, -26, -18, 15, {}, { owner: "pump", inner: Ln(G.arcOf(SH, -22, 15, P), { tone: "faint" }) });
let MOTOR;
{
  const ribs = G.ribsOf(SH, -16, 32, 17.5, 40, P, { fade: [0.1, 0.55], seams: true });
  MOTOR = turned("motor.body", SH, [[-18, 17.5], [34, 17.5]], {}, { owner: "pump", extra: k.fadedSvg(ribs, { tone: "lo" }) });
}
turned("motor.fan", SH, [[34, 18], [44, 18], [46.5, 16, 1], [48.5, 13, 1], [49.5, 10]], {}, {
  owner: "pump",
  extra: Ln([3.4, 6.2, 8.4].map((r) => G.circleOf(SH, 49.5, r, P)).join(""), { tone: "faint" }) + Dots([at([49.5, 0, AX])], { size: 0.6, tone: "mid" }),
});
// Drain plug on the front, low on the casing.
const DRAIN = G.frameOf([-50, 0, AX], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
saddle("pump.drainboss", DRAIN, 5, CASE_R, CASE_R + 4, CASING, {}, { owner: "pump" });
disc("pump.drainplug", DRAIN, CASE_R + 4, CASE_R + 7, 4.4, {}, { owner: "pump", steps: 6 });
// Terminal box with the on/off switch and pilot lamp.
const TB = { x: -6, y: -10, w: 24, d: 20, r: 2 };
saddle("motor.tbboss", G.frameOf([6, 0, AX], [0, 0, 1], [0, 1, 0], [1, 0, 0]), 8, 17.5, 19, MOTOR, {}, { owner: "pump" });
box("motor.tbox", TB, AX + 19, 12, {}, {
  owner: "pump",
  inner: Ln(k.sideSeam(TB, AX + 27, P, 3), { tone: "faint" }),
  extra: Ln(k.planOutline({ x: -2, y: -2.5, w: 14, d: 5, r: 2.5 }, AX + 31, P, 4), { tone: "lo" }) + Dots(k.corners(TB, 2.5).map(([x, y]) => at([x, y, AX + 31])), { size: 0.45 }),
  wrap: (svg) => `${svg}<g data-part="switch"></g><g data-part="lamp"></g>`,
});

// Priming port and its plug; discharge port with a union.
const PZ = ZF([PRIME[0], PRIME[1], 0]);
saddle("pump.primeboss", G.frameOf([PRIME[0], PRIME[1], AX], [0, 0, 1], [0, 1, 0], [1, 0, 0]), 6.5, CASE_R, CASE_R + 4, CASING, {}, { owner: "pump", extra: "" });
{
  const plug = (z) => S(k.cylinder(PRIME[0], PRIME[1], 6, z, 3, P, 6), { tone: "hi" }) + S(k.cylinder(PRIME[0], PRIME[1], 3.2, z + 3, 2, P, 24), { tone: "hi" }) + Ln(k.lineOnTop([PRIME[0] - 2.4, PRIME[1]], [PRIME[0] + 2.4, PRIME[1]], z + 5, P), { tone: "lo" });
  const shape = record(A.disc(PZ, TOP + 4, TOP + 9, 6, { name: "prime.plug", owner: "prime" }));
  put("prime.plug", [PRIME[0], PRIME[1], TOP + 6], `<g data-focus="plug" data-part="plug">${plug(TOP + 4)}</g>`, [shape], { bias: 0.1 });
  const ASIDE = [-62, 32];
  const shapeA = record(A.cylinder(ASIDE[0], ASIDE[1], 6, 0, 5, { name: "prime.aside" }));
  const aside = S(k.cylinder(ASIDE[0], ASIDE[1], 6, 0, 3, P, 6), { tone: "hi" }) + S(k.cylinder(ASIDE[0], ASIDE[1], 3.2, 3, 2, P, 24), { tone: "hi" }) + Ln(k.lineOnTop([ASIDE[0] - 2.4, ASIDE[1]], [ASIDE[0] + 2.4, ASIDE[1]], 5, P), { tone: "lo" });
  put("prime.aside", [ASIDE[0], ASIDE[1], 2], `<g data-focus="plug" data-part="aside" style="opacity:0">${aside}</g>`, [shapeA]);
  // Funnel set in the open port while filling.
  const FUN = [[TOP + 4, 2.4], [TOP + 10, 2.4], [TOP + 12, 4, 1], [TOP + 19, 10.5, 1], [TOP + 20, 11]];
  const shapeF = record(A.solid(PZ, FUN, { name: "prime.funnel", owner: "prime" }));
  const funnel = S(G.solidOf(FUN, PZ, P), { tone: "hi" }) + Ln(k.ring(PRIME[0], PRIME[1], 9.4, TOP + 20, P, 40), { tone: "faint" });
  put("prime.funnel", [PRIME[0], PRIME[1], TOP + 14], `<g data-focus="funnel" data-part="funnel" style="opacity:0">${funnel}</g>`, [shapeF], { bias: 0.2 });
}
const OZ = ZF([OUT[0], OUT[1], 0]);
saddle("pump.outboss", G.frameOf([OUT[0], OUT[1], AX], [0, 0, 1], [0, 1, 0], [1, 0, 0]), 8, CASE_R, CASE_R + 5, CASING, {}, { owner: "pump" });
disc("riser.union", OZ, TOP + 5, TOP + 10, 9.5, {}, { steps: 6 });

// ---------- discharge ----------
pipe("riser", [OUT[0], 0, TOP + 10], [OUT[0], 0, RUN_Z - rim(7.5, 5)], 5);
ball("elbow.1", [OUT[0], 0, RUN_Z], 7.5);
pipe("run.back", [OUT[0], -rim(7.5, 5), RUN_Z], [OUT[0], BACK_Y + rim(7.5, 5), RUN_Z], 5);
ball("elbow.2", [OUT[0], BACK_Y, RUN_Z], 7.5);
pipe("run.a", [OUT[0] + rim(7.5, 5), BACK_Y, RUN_Z], [FIVE[0] - rim(9, 5), BACK_Y, RUN_Z], 5);
ball("five", FIVE, 9);
// Gauge on top of the five-way fitting.
const GZ = ZF([GAUGE.c[0], GAUGE.c[1], 0]);
turned("gauge.stem", GZ, [[RUN_Z + rim(9, 2.2), 2.2], [GAUGE.z - 3, 2.2]], {}, {});
turned("gauge.nut", GZ, [[GAUGE.z - 3, 4], [GAUGE.z, 4]], {}, { steps: 6 });
{
  const [x, y] = GAUGE.c;
  const top = GAUGE.z + GAUGE.h;
  const from = (-5 * Math.PI) / 6;
  const t = k.radialTicks(x, y, GAUGE.r - 2.4, 30, 5, top, [1, 2.2], P, from, (5 * Math.PI) / 3 + 1e-4);
  const extra =
    Ln(k.knurl(x, y, GAUGE.r, top - 2.6, top, 64, P, 0.3), { tone: "lo" }) +
    Ln(k.sideArc(x, y, GAUGE.r, top - 2.6, P, 40), { tone: "faint" }) +
    Ln(k.ring(x, y, GAUGE.r - 1.8, top, P, 56), { tone: "lo" }) +
    Ln(t.minor, { tone: "lo" }) +
    Ln(t.major, { tone: "mid" }) +
    k.faceTextSvg(k.topMatrix([x, y + 6.5], top, P, "x"), "bar", { size: 2, tone: "lo", anchor: "middle" }) +
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="" style="stroke-width:1.1"/>` +
    Ln(k.ring(x, y, 1.3, top + 0.2, P, 16), { tone: "mid" });
  turned("gauge.dial", GZ, [[GAUGE.z, GAUGE.r], [top, GAUGE.r]], { tone: "hi", crease: "lo" }, { extra, bias: 0.05 });
}
// Pressure switch on the front of the five-way fitting, wired to the terminal box.
turned("switch.stem", YF(FIVE), [[rim(9, 2.5), 2.5], [13, 2.5]], {}, {});
const PS = { x: -10, y: BACK_Y + 13, w: 20, d: 10, r: 2 };
box("switch.box", PS, RUN_Z - 10, 18, {}, {
  inner: Ln(k.sideSeam(PS, RUN_Z + 4, P, 3), { tone: "faint" }),
  extra: Dots([[-6, RUN_Z - 6], [6, RUN_Z - 6]].map(([x, z]) => at([x, PS.y + PS.d, z])), { size: 0.45 }) + Ln(k.ring(0, PS.y + 5, 2.4, RUN_Z + 8, P, 16), { tone: "lo" }),
});
pipe("run.b", [FIVE[0] + rim(9, 5), BACK_Y, RUN_Z], [VALVE_X - 12, BACK_Y, RUN_Z], 5);
// Ball valve with a lever handle; lever along the pipe = open.
{
  const F = XF([VALVE_X, BACK_Y, RUN_Z]);
  const prof = [[-12, 7.5], [-8, 7.5], [-8, 8.5], [-6, 9.6, 1], [0, 11, 1], [6, 9.6, 1], [8, 8.5], [8, 7.5], [12, 7.5]];
  turned("valve.body", F, prof, { tone: "hi" }, { extra: Dots(G.dotsOf(F, -8, 6.2, 6, P, { all: true }), { size: 0.42 }) });
  turned("valve.stem", ZF([VALVE_X, BACK_Y, 0]), [[RUN_Z + 10.5, 2.6], [RUN_Z + 15, 2.6]], {}, {});
  const shape = record(A.cylinder(VALVE_X, BACK_Y, 3.6, RUN_Z + 15, 2, { name: "valve.lever" }));
  put("valve.lever", [VALVE_X, BACK_Y, RUN_Z + 16], `<g data-focus="valve" data-part="lever"></g>`, [shape], { bias: 0.05 });
}
pipe("run.c", [VALVE_X + 12, BACK_Y, RUN_Z], [TAP[0] - rim(7.5, 5), BACK_Y, RUN_Z], 5);
ball("elbow.3", [TAP[0], BACK_Y, RUN_Z], 7.5);
pipe("drop", [TAP[0], BACK_Y, RUN_Z - rim(7.5, 5)], [TAP[0], BACK_Y, 68], 5);
// Outlet tap: body, knob on the front, spout down to a bucket.
const TZ = ZF([TAP[0], TAP[1], 0]);
turned("tap.body", TZ, [[54, 6.5], [64, 6.5], [66, 5.5], [68, 5.5]], { tone: "hi" }, { inner: Ln(G.arcOf(TZ, 60, 6.5, P), { tone: "faint" }) });
turned("tap.spout", TZ, [[47, 2.8], [54, 2.8]], {}, {});
{
  const F = YF([TAP[0], TAP[1], 59]);
  turned("tap.neck", F, [[rim(6.5, 2), 2], [9, 2]], {}, {});
  const shape = record(A.disc(F, 9, 12, 5.2, { name: "tap.knob" }));
  const knob = S(G.disc(9, 12, 5.2, F, P, { steps: 40 }), { tone: "mid" });
  put("tap.knob", [TAP[0], TAP[1] + 10.5, 59], `<g data-focus="tap">${knob}<path data-part="tapmark" class="iso-line" data-tone="hi" data-free="end" d=""/>${Dots([at([TAP[0], TAP[1] + 12, 59])], { size: 0.6, tone: "hi" })}</g>`, [shape]);
}
const BUCKET = { r: 15, h: 24 };
turned("bucket", ZF([TAP[0], TAP[1], 0]), [[0, BUCKET.r - 1.5], [1.5, BUCKET.r], [BUCKET.h, BUCKET.r]], { tone: "lo" }, {
  inner: Ln(G.arcOf(TZ, 8, BUCKET.r, P) + G.arcOf(TZ, 16, BUCKET.r, P), { tone: "faint" }),
  extra: Ln(k.ring(TAP[0], TAP[1], BUCKET.r - 1.4, BUCKET.h, P, 48), { tone: "lo" }) + `<path data-part="stream" class="iso-line bp-stream" data-tone="lo" d="${k.pathOf([at([TAP[0], TAP[1], 47]), at([TAP[0], TAP[1], BUCKET.h])])}" style="opacity:0"/>`,
});

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);

// The wire from the pressure switch to the terminal box, drawn over everything it passes.
const wire = k.wireSvg(at([0, PS.y + PS.d, RUN_Z - 7]), at([10, TB.y + TB.d, AX + 25]), { via: [at([0, PS.y + PS.d + 6, RUN_Z - 7]), at([0, PS.y + PS.d + 6, AX + 40]), at([10, TB.y + TB.d + 0, AX + 40])], tone: "lo", size: 0.9 });

const svg = k.figureSvg({
  width: W,
  height: H,
  label:
    "Una bomba de agua autoaspirante de una vivienda sobre un banco. Por la izquierda aspira de un pozo a través de un prefiltro con vaso transparente; arriba del cuerpo de la bomba está el tapón de cebado y abajo el de vaciado; detrás, el motor con su caja de bornes e interruptor. La impulsión sube, pasa por un racor de cinco vías con manómetro y presostato, una llave de bola y termina en un grifo sobre un cubo. La figura recorre los pasos para purgar el aire.",
  body: [...back, `<g class="bp-items">${R.items.map((item) => `<g class="it" data-name="${item.name}">${item.svg}</g>`).join("")}</g>`, wire],
});

// ---------- the procedure ----------
// Each step is a target state; the page eases between them.
const STEPS = [
  { name: "Síntoma: motor en marcha, sin presión", power: 1, valve: 1, plug: 1, funnel: 0, level: 0.3, tap: 1, flow: 0, bar: 0.1, air: 1, focus: "bowl" },
  { name: "1 · Desconecta la bomba", power: 0, valve: 1, plug: 1, funnel: 0, level: 0.3, tap: 1, flow: 0, bar: 0, air: 0, focus: "switch" },
  { name: "2 · Cierra la llave de impulsión", power: 0, valve: 0, plug: 1, funnel: 0, level: 0.3, tap: 1, flow: 0, bar: 0, air: 0, focus: "valve" },
  { name: "3 · Quita el tapón de cebado", power: 0, valve: 0, plug: 0, funnel: 0, level: 0.3, tap: 1, flow: 0, bar: 0, air: 0, focus: "plug" },
  { name: "4 · Llena hasta que rebose sin burbujas", power: 0, valve: 0, plug: 0, funnel: 1, level: 1, tap: 1, flow: 0, bar: 0, air: 0, focus: "funnel" },
  { name: "5 · Pon el tapón y apriétalo", power: 0, valve: 0, plug: 1, funnel: 0, level: 1, tap: 1, flow: 0, bar: 0, air: 0, focus: "plug" },
  { name: "6 · Enciende y abre la llave poco a poco", power: 1, valve: 1, plug: 1, funnel: 0, level: 1, tap: 1, flow: 1, bar: 1.6, air: 0.5, focus: "valve" },
  { name: "7 · Cierra el grifo: sube la presión", power: 1, valve: 1, plug: 1, funnel: 0, level: 1, tap: 0, flow: 0, bar: 3.0, air: 0, focus: "gauge" },
  { name: "Presostato: para a 3 bar", power: 0, valve: 1, plug: 1, funnel: 0, level: 1, tap: 0, flow: 0, bar: 3.0, air: 0, focus: "gauge" },
];

const live = `
const P = ${JSON.stringify(P)};
const STEPS = ${JSON.stringify(STEPS)};
const BOWL = ${JSON.stringify(BOWL)}, GAUGE = ${JSON.stringify(GAUGE)}, TAP = ${JSON.stringify(TAP)};
const VALVE = [${VALVE_X}, ${BACK_Y}, ${RUN_Z + 15}], SW = { x: -2, y: -2.5, z: ${AX + 31} }, LAMP = [14, -6, ${AX + 31}];
const BUCKET_TOP = ${BUCKET.h};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (n) => svg.querySelector('[data-part="' + n + '"]');
const el = { bowl: part("bowl"), needle: part("needle"), lever: part("lever"), sw: part("switch"), lamp: part("lamp"), plug: part("plug"), aside: part("aside"), funnel: part("funnel"), stream: part("stream"), tapmark: part("tapmark") };
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const at = (p) => iso(p, P);
const keys = ["power", "valve", "plug", "funnel", "level", "tap", "flow", "bar", "air"];
let index = 0, s = Object.fromEntries(keys.map((key) => [key, STEPS[0][key]]));
let clock = 0, last = 0, frame = 0, visible = false, touring = true, idle = 0, held = 0;
const bubbles = Array.from({ length: 9 }, (_, i) => ({ a: i * 2.4, r: 2 + ((i * 37) % 6), z: (i * 0.13) % 1, v: 0.35 + ((i * 53) % 10) / 25 }));
function lever(open) {
  const a = (1 - open) * Math.PI / 2;
  const [x, y, z] = VALVE;
  const c = Math.cos(a), sn = Math.sin(a);
  const pts = [[-3, -2], [24, -2], [24, 2], [-3, 2]].map(([u, v]) => [x + u * c - v * sn, y + u * sn + v * c]);
  return solidSvg(extrude(pts, z, 1.8, P), { tone: "mid" }) + solidSvg(cylinder(x, y, 3.6, z - 0.2, 2.4, P, 6), { tone: "mid" });
}
function draw(t) {
  const step = STEPS[index];
  const focus = step.focus;
  svg.querySelectorAll("[data-focus]").forEach((g) => g.querySelectorAll(".iso-solid").forEach((solid) => solid.toggleAttribute("data-lit", g.dataset.focus === focus)));
  el.lever.innerHTML = lever(s.valve);
  // Switch knob slides in its slot: right is on.
  const kx = SW.x + 1 + s.power * 7;
  el.sw.innerHTML = solidSvg(slabOf({ x: kx, y: SW.y + 0.5, w: 5, d: 4, r: 1.5 }, SW.z, 2, P, 3, 0.3), { tone: "mid", lit: focus === "switch" });
  el.lamp.innerHTML = solidSvg(cylinder(LAMP[0], LAMP[1], 1.8, LAMP[2], 1, P, 16), { tone: s.power > 0.5 ? "hi" : "lo", lit: s.power > 0.5 });
  // Plug in the port, or set aside on the bench; funnel while filling.
  el.plug.style.opacity = s.plug.toFixed(3);
  el.aside.style.opacity = (1 - s.plug).toFixed(3);
  el.funnel.style.opacity = s.funnel.toFixed(3);
  // Water in the clear bowl, with bubbles while air is drawn through.
  const [bx, by] = BOWL.c;
  const h = (BOWL.z1 - BOWL.z0 - 0.6) * s.level;
  let w = h > 0.3 ? '<g class="bp-water">' + solidSvg(cylinder(bx, by, BOWL.r - 0.7, BOWL.z0 + 0.3, h, P, 40), { tone: "lo", crease: "none" }) + "</g>" : "";
  if (s.air > 0.02 && s.power > 0.3) {
    const pts = bubbles.map((b) => {
      const z = BOWL.z0 + 1 + ((b.z + t * b.v) % 1) * Math.max(0.5, h - 1.2);
      const a = b.a + t * 0.6;
      return [...at([bx + Math.cos(a) * b.r, by + Math.sin(a) * b.r, z]), s.air * Math.min(1, s.power)];
    });
    w += dotsSvg(pts, { size: 0.55, tone: "hi" });
  }
  el.bowl.innerHTML = w;
  // Needle, 0..6 bar over 300 degrees; it trembles while air is in the line.
  const bar = s.bar + (s.air * s.power > 0.05 ? Math.sin(t * 23) * 0.12 * s.air : 0);
  const from = -5 * Math.PI / 6, a = from + (5 * Math.PI / 3) * Math.min(1, Math.max(0, bar / 6));
  const [gx, gy] = GAUGE.c, gr = GAUGE.r - 3.2, gz = GAUGE.z + GAUGE.h + 0.2;
  el.needle.setAttribute("d", lineOnTop([gx - Math.sin(a) * 2.6, gy + Math.cos(a) * 2.6], [gx + Math.sin(a) * gr, gy - Math.cos(a) * gr], gz, P));
  // Tap knob mark: vertical = shut, horizontal = open.
  const ta = s.tap * Math.PI / 2, ty = TAP[1] + 12, tc = [TAP[0], ty, 59];
  el.tapmark.setAttribute("d", pathOf([at([tc[0], ty, 59]), at([tc[0] + Math.sin(ta) * 4, ty, 59 + Math.cos(ta) * 4])]));
  // Stream from the spout: broken while it spits air, solid once it runs clean.
  el.stream.style.opacity = (s.flow * s.tap).toFixed(3);
  const sputter = s.air > 0.08;
  el.stream.style.strokeWidth = (0.8 + 1.4 * s.flow * (1 - s.air)).toFixed(2);
  el.stream.style.strokeDasharray = sputter ? "2.4 1.6" : "none";
  el.stream.style.strokeDashoffset = sputter ? String(-(t * 30) % 40) : "0";
  const text = step.name + " · " + Math.max(0, bar).toFixed(1).replace(".", ",") + " bar";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(index));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  clock += dt;
  if (touring && !calm) { held += dt; if (held > 3.2) { held = 0; index = (index + 1) % STEPS.length; } }
  const target = STEPS[index];
  for (const key of keys) {
    const sec = key === "level" ? 1.2 : key === "bar" ? 0.9 : key === "air" ? 1.6 : 0.3;
    s[key] = calm ? target[key] : s[key] + (target[key] - s[key]) * (1 - Math.exp(-dt / sec));
  }
  draw(clock);
  frame = visible && !calm ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } else if (still.matches) tick(performance.now()); };
const go = (i) => { index = Math.max(0, Math.min(STEPS.length - 1, i)); touring = false; held = 0; clearTimeout(idle); idle = setTimeout(() => { touring = true; run(); }, 6000); run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const i = Math.floor(Math.min(0.999, Math.max(0, (event.clientX - box.left) / box.width)) * STEPS.length);
  if (i !== index || touring) go(i);
});
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") to = index + 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = index - 1;
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = STEPS.length - 1;
  if (to === null) return;
  event.preventDefault();
  go(to);
});
window.__bomba = { seek(i, t = 3) { index = i; touring = false; clearTimeout(idle); for (const key of keys) s[key] = STEPS[i][key]; clock = t; draw(t); } };
draw(0);
`;

const CSS = `
.bp-glass { fill: var(--anatomy-face); fill-opacity: 0.35; }
.bp-water { opacity: 0.75; }
.bp-water .iso-fill, .bp-water .iso-shade { fill: var(--anatomy-faint); }
.bp-water .iso-top { fill: var(--anatomy-lo); fill-opacity: 0.55; }
.bp-stream { stroke-linecap: round; }
`;

const body =
  `<style>${CSS}</style>` +
  k.plateHtml({
    fig: "Fig 2",
    title: "Purgar una bomba de agua",
    hint: "Puntero o ← →: pasos",
    readout: STEPS[0].name + " · 0,1 bar",
    keys: [
      { mark: "lit", label: "La pieza que tocas en cada paso, y la aguja del manómetro" },
      { mark: "raised", label: "Vaso transparente del prefiltro: aire arriba, agua abajo" },
      { mark: "edge", label: "Cable del presostato a la caja de bornes del motor" },
    ],
    caption:
      "Una bomba de superficie no empuja aire: si entra aire en la aspiración, el rodete gira en vacío, el manómetro se queda en cero y por el grifo no sale nada. Para purgarla: 1, desconéctala; 2, cierra la llave de impulsión para que el agua que eches no se vaya por la tubería; 3, quita el tapón de cebado de arriba del cuerpo; 4, llena el cuerpo y la tubería de aspiración con agua, despacio, hasta que rebose sin burbujas (el vaso del prefiltro se ve lleno); 5, pon el tapón y apriétalo; 6, enciende y abre la llave poco a poco con un grifo abierto: primero sale aire a borbotones y luego un chorro continuo; 7, cierra el grifo y la presión sube hasta que el presostato para el motor (aquí, arranque a 1,5 bar y parada a 3 bar). Si a los dos o tres minutos no da presión, apaga y repite desde el paso 3. Si el aire vuelve una y otra vez, busca una entrada de aire en la aspiración (juntas, racores) o una válvula de pie que no cierra. No dejes la bomba funcionando en seco: se dañan el cierre mecánico y el rodete.",
    body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Purga de una bomba de agua: las flechas avanzan y retroceden por los pasos" aria-valuemin="0" aria-valuemax="${STEPS.length - 1}" aria-valuenow="0">${svg}</div>`,
  });

const name = THEME === "light" ? "bomba-purga-light.html" : "bomba-purga.html";
const page = k.pageHtml({ title: "Purgar una bomba de agua", theme: THEME, body, script: kitScript() + live });
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`);

A.auditOrExit(R, P, { allow: [["prime.*", "prime.*"]] });
