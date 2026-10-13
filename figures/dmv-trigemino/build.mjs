import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";
import * as A from "../../.claude/skills/anatomy/kit/audit.mjs";
import { tubePieces, tubeSvg } from "../../.claude/skills/anatomy/kit/tube.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const W = 640;
const H = 460;

// World in millimetres, right side of the head.
// x: anterior (−) to posterior (+); y: medial/deep (−) to lateral/outside (+); z: inferior to superior.
// The outer table of the skull is the plane y = 0; the bone is 8 mm thick.
const PLATE = { x: -72, y: -98, w: 160, d: 140, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const BONE_T = 8;
const WALL = { x0: -18, x1: 52, z1: 72 };
const WIN = { x0: 4, x1: 34, z0: 28, z1: 58 }; // 30 × 30 mm retrosigmoid window
const SINUS_Z = 63;
const SINUS_Y = -14.2;
const SINUS_R = 4.5;
const CORNER = [-6, SINUS_Y, SINUS_Z]; // transverse–sigmoid junction
const PONS = { c: [8, -76] };
const CBL = { c: [40, -46], a: 26, b: 34, mid: 32 };
const BASILAR = [-14.5, -77];
const TIP = [-14.5, -77, 66];
// Posterior face of the petrous bone, with its three openings.
// A wedge along y: vertical posterior face at x = −32, then the ridge, then the anterior slope.
const PET_X = -32;
const PET_POLY = [[-62, 0], [PET_X, 0], [PET_X, 52], [-36, 62], [-62, 30]];
const PET_F = G.frameOf([0, 0, 0], [0, -1, 0], [1, 0, 0], [0, 0, 1]);
const PET_S = [14, 84];
const PET_N = [1, 0, 0];
const PORUS = [PET_X, -46, 47];
const IAM = [PET_X, -34, 33];
const JUG = [PET_X, -24, 12];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [WALL.x0, 0, WALL.z1], [WALL.x1, 0, WALL.z1], [WALL.x0, -8, WALL.z1], [-56, -84, 64], [8, -90, 74], [40, -46, 68]],
  W,
  H,
  { pad: 18, azimuth: 60, elevation: 44 },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);

const R = A.recorder(P);
const record = R.solid;
const put = (name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) => R.put({ name, at: ref, bias, svg, shapes, piece: "model", ...rest });
const ZF = (o) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const XF = (o) => G.frameOf(o, [1, 0, 0], [0, 1, 0], [0, 0, 1]);

// Live groups: opacity for alternate poses, data-focus for the part of the step.
const wrap = (svg, { part, focus, hidden } = {}) => (part || focus ? `<g${part ? ` data-part="${part}"` : ""}${focus ? ` data-focus="${focus}"` : ""}${hidden ? ' style="opacity:0"' : ""}>${svg}</g>` : svg);

function box(name, plan, z0, h, style = {}, { steps = 3, bevel = 0.5, extra = "", inner = "", bias = 0, owner, live } = {}) {
  const shape = record(A.slab(plan, z0, h, { name, owner }, steps));
  put(name, [plan.x + plan.w / 2, plan.y + plan.d / 2, z0 + h / 2], wrap(S(k.slabOf(plan, z0, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, live), [shape], { bias });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, owner, smooth, live, ref } = {}) {
  const paths = G.solidOf(profile, F, P, smooth ? { smooth } : {});
  const shape = record(A.solid(F, profile, { name, owner, radius: smooth && smooth.radius ? smooth.radius : null }));
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  put(name, ref ?? G.add3(F.o, G.mul3(F.a, mid)), wrap(S(paths, { tone: "mid", ...style, inner }) + extra, live), [shape], { bias });
  return shape;
}
function ball(name, c, r, style = {}, { bias = 0, owner, live, extra = "" } = {}) {
  const shape = record(A.ball(c, r, { name, owner }));
  put(name, c, wrap(S(G.sphereOf(c, r, P, { steps: 40 }), { tone: "mid", ...style }) + extra, live), [shape], { bias });
  return shape;
}
// Nerves and vessels: soft tubes, cut into depth-sorted chunks.
function strand(name, points, r, { tone = "hi", bend = 6, rings, touch, live, maxLength = 10 } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  R.route(name, route, r, { touch, piece: "model", limp: false });
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.6, Math.min(1.4, r * 0.7)), ...(rings ? { rings } : {}) }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, wrap(tubeSvg(piece, { tone }), { ...live, focus: live?.focus }), [A.tube(piece.points, piece.radii)], { bias: 0.02, route: name, chunk: index }),
  );
  return route;
}

// ---------- the stand ----------
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
  back.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
back.push(Ln(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
const plateScrews = k.corners(PLATE, 10);
back.push(Ln(plateScrews.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(plateScrews.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
const STRIP = { x: -20, y: PLATE.y + PLATE.d - 10, w: 100, d: 6, r: 1 };
back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
const ticks = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 2, 5, STRIP.y, 0.6, [1.6, 3], P);
back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
const LABEL = { x: -64, y: 12, w: 34, d: 18, r: 1.5 };
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 4), { tone: "faint" }));
[[20, 5], [24, 9], [14, 13]].forEach(([w, y]) => back.push(Ln(k.lineOnTop([LABEL.x + 5, LABEL.y + y], [LABEL.x + 5 + w, LABEL.y + y], 0.8, P), { tone: "lo", free: true })));
back.push(Dots([at([LABEL.x + LABEL.w - 4, LABEL.y + 4, 0.8]), at([LABEL.x + LABEL.w - 4, LABEL.y + LABEL.d - 4, 0.8])], { size: 0.45 }));

// ---------- skull wall with the retrosigmoid window ----------
const wallPiece = (name, x0, x1, z0, z1) =>
  box(name, { x: x0, y: -BONE_T, w: x1 - x0, d: BONE_T, r: 0.6 }, z0, z1 - z0, { tone: "lo" }, { owner: "bone", steps: 2, bevel: 0.4, inner: Ln(k.sideSeam({ x: x0, y: -BONE_T, w: x1 - x0, d: BONE_T, r: 0.6 }, z0 + 2.5, P, 2), { tone: "faint" }) });
wallPiece("bone.ant", WALL.x0, WIN.x0, 0, WALL.z1);
wallPiece("bone.post", WIN.x1, WALL.x1, 0, WALL.z1);
wallPiece("bone.low", WIN.x0, WIN.x1, 0, WIN.z0);
wallPiece("bone.high", WIN.x0, WIN.x1, WIN.z1, WALL.z1);
// The asterion and the suture lines on the outer table, faint.
const outer = (pts) => k.pathOf(pts.map(([x, z]) => at([x, 0, z])));
const sutures = Ln(outer([[WALL.x0, 65], [-6, 66], [WIN.x0, 66.5]]) + outer([[WIN.x1, 66.5], [WALL.x1, 68]]), { tone: "faint" });
const asterion = Dots([at([-6, 0, 66])], { size: 0.8, tone: "mid" });

// Venous sinuses on the inner table: the transverse along the top edge, the sigmoid down the anterior edge.
ball("sinus.corner", CORNER, 6.2, { tone: "mid" }, { owner: "sinus" });
turned("sinus.transverse", XF([0, SINUS_Y, SINUS_Z]), [[CORNER[0] + Math.sqrt(6.2 ** 2 - SINUS_R ** 2), SINUS_R], [WALL.x1, SINUS_R]], { tone: "mid" }, { owner: "sinus" });
const BULB = [-15, -16, 5.4];
ball("sinus.bulb", BULB, 5.4, { tone: "mid" }, { owner: "sinus" });
strand("sinus.sigmoid", [G.add3(CORNER, [0, 0, -Math.sqrt(6.2 ** 2 - 4.2 ** 2)]), [-6, SINUS_Y, 46], [-12, -14, 30], [-15, -16, 20], [-15, -16, BULB[2] + Math.sqrt(5.4 ** 2 - 4.2 ** 2)]], 4.2, { tone: "mid", bend: 14, touch: ["sinus.*", "bone.*"] });

// ---------- dura, bone flap, graft and plates ----------
const DURA = { x: WIN.x0 - 3, y: -BONE_T - 1, w: WIN.x1 - WIN.x0 + 6, d: 1, r: 0.4 };
box("dura.closed", DURA, WIN.z0 - 3, WIN.z1 - WIN.z0 + 3, { tone: "mid" }, { owner: "dura", steps: 2, bevel: 0, live: { part: "dura", focus: "dura" }, extra: Ln(k.segment([WIN.x0 + 6, -BONE_T, WIN.z0 + 4], [WIN.x0 + 6, -BONE_T, WIN.z1 - 1], P), { tone: "faint" }) });
box("dura.open", { x: WIN.x0, y: -BONE_T - 1, w: 1, d: 30, r: 0.4 }, WIN.z0, WIN.z1 - WIN.z0, { tone: "mid" }, { owner: "dura", steps: 2, bevel: 0, live: { part: "duraopen", focus: "dura", hidden: true } });
{
  const GR = { x: WIN.x0 - 2, y: -BONE_T - 1.6, w: WIN.x1 - WIN.x0 + 4, d: 0.6, r: 0.3 };
  const stitches = [];
  for (let i = 0; i <= 10; i++) {
    const x = WIN.x0 + (i / 10) * (WIN.x1 - WIN.x0);
    stitches.push([x, WIN.z0 + 0.5], [x, WIN.z1 - 0.5]);
  }
  for (let i = 1; i < 10; i++) {
    const z = WIN.z0 + (i / 10) * (WIN.z1 - WIN.z0);
    stitches.push([WIN.x0 + 0.5, z], [WIN.x1 - 0.5, z]);
  }
  box("dura.graft", GR, WIN.z0 - 1, WIN.z1 - WIN.z0 + 2, { tone: "hi" }, { owner: "dura", steps: 2, bevel: 0, live: { part: "graft", focus: "graft", hidden: true }, extra: Dots(stitches.map(([x, z]) => at([x, -BONE_T - 1.6, z])), { size: 0.45, tone: "mid" }), bias: 0.1 });
}
const FLAP = { x: WIN.x0 + 0.6, y: -BONE_T, w: WIN.x1 - WIN.x0 - 1.2, d: BONE_T, r: 0.6 };
box("flap.in", FLAP, WIN.z0 + 0.6, WIN.z1 - WIN.z0 - 1.2, { tone: "lo" }, { owner: "flap", steps: 2, bevel: 0.4, live: { part: "flap", focus: "flap" }, inner: Ln(k.sideSeam(FLAP, WIN.z0 + 3, P, 2), { tone: "faint" }) });
box("flap.aside", { x: 50, y: 6, w: 28.8, d: 28.8, r: 0.6 }, 0, BONE_T, { tone: "lo" }, { owner: "flap.a", steps: 2, bevel: 0.4, live: { part: "flapaside", focus: "flap", hidden: true }, extra: Ln(k.planOutline({ x: 53, y: 9, w: 22.8, d: 22.8, r: 0.6 }, BONE_T, P, 2), { tone: "faint" }) });
function plate(name, xc, zc) {
  const PL = { x: xc - 3, y: 0, w: 6, d: 0.7, r: 0.4 };
  const holes = [-6, -2.5, 2.5, 6].map((dz) => [xc, zc + dz]);
  const extra = Ln(holes.map(([x, z]) => k.sideRing([x, 0.7, z], 1.2, "y", P, 14)).join(""), { tone: "lo" }) + Dots(holes.map(([x, z]) => at([x, 0.7, z])), { size: 0.55, tone: "hi" });
  box(name, PL, zc - 8, 16, { tone: "hi" }, { owner: "plate", steps: 2, bevel: 0, extra, live: { part: name.replace(".", ""), focus: "plate", hidden: true }, bias: 0.2 });
}
plate("plate.high", 19, WIN.z1);
plate("plate.low", 19, WIN.z0);

// ---------- posterior fossa ----------
// Petrous bone: its posterior face carries Meckel's porus, the internal acoustic meatus and the jugular foramen.
{
  const shape = record(A.prism(PET_F, PET_POLY, PET_S[0], PET_S[1], { name: "petrous" }));
  const face = (p, r) => k.pathOf(Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return at([p[0], p[1] + Math.cos(a) * r, p[2] + Math.sin(a) * r * 0.85]);
  }), true);
  const holes = Ln(face(PORUS, 5) + face(IAM, 3.4) + face(JUG, 3.8), { tone: "lo" });
  const seam = Ln(k.segment([PET_X, -PET_S[0], 50], [PET_X, -PET_S[1], 50], P), { tone: "faint" });
  put("petrous", [-44, -49, 30], S(G.prismOf(PET_F, PET_POLY, PET_S[0], PET_S[1], P), { tone: "lo", inner: seam }) + holes, [shape]);
}
// Brainstem: medulla, pons and the cut midbrain, an analytic bulge.
const ponsR = (s) => 10 + 7 * Math.exp(-(((s - 50) / 16) ** 2));
const ponsSlope = (s) => 7 * Math.exp(-(((s - 50) / 16) ** 2)) * (-2 * (s - 50) / 256);
const PF = ZF([PONS.c[0], PONS.c[1], 0]);
const PONS_SHAPE = turned("brainstem", PF, [[0, ponsR(0)], [74, ponsR(74)]], { tone: "hi" }, {
  smooth: { slope: ponsSlope, radius: ponsR },
  inner: Ln(G.arcOf(PF, 34, ponsR(34), P, { slope: ponsSlope(34) }) + G.arcOf(PF, 66, ponsR(66), P, { slope: ponsSlope(66) }), { tone: "faint" }),
  extra: Ln(G.circleOf(PF, 74, 4, P), { tone: "faint" }),
});
// Cerebellar hemisphere: a truncated ellipsoid.
const cblR = (s) => CBL.a * Math.sqrt(Math.max(0, 1 - ((s - CBL.mid) / CBL.b) ** 2));
const cblSlope = (s) => (-CBL.a * ((s - CBL.mid) / CBL.b ** 2)) / Math.sqrt(Math.max(1e-6, 1 - ((s - CBL.mid) / CBL.b) ** 2));
const CF = ZF([CBL.c[0], CBL.c[1], 0]);
const CBL_TOP = CBL.mid + CBL.b - 0.6;
const folia = [14, 24, 34, 44, 54].map((s) => G.arcOf(CF, s, cblR(s), P, { slope: cblSlope(s) })).join("");
const CBL_SHAPE = turned("cerebellum", CF, [[0, cblR(0)], [CBL_TOP, cblR(CBL_TOP)]], { tone: "mid" }, { smooth: { slope: cblSlope, radius: cblR }, inner: Ln(folia, { tone: "faint" }) });
const onCerebellum = (from) => {
  const centre = [CBL.c[0], CBL.c[1], CBL.mid];
  let lo = 0;
  let hi = 1;
  const p = (t) => G.lerp3(from, centre, t);
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (A.sdf(CBL_SHAPE, p(m)) > 0) lo = m;
    else hi = m;
  }
  return p(lo);
};

// A short pad seated on a curved host, its base cut to the host: where a nerve leaves the brainstem
// (the root entry zone) or an artery dives into a cerebellar sulcus. Returns the centre of its flat face.
function padOn(name, host, point, axis, a, h, style = {}, live) {
  const F = G.frameAlong(point, G.unit3(axis));
  const inside = (p) => A.sdf(host, p) < 0;
  const start = (angle) => {
    let lo = -3 * a;
    let hi = h;
    if (!inside(G.pointOf(F, lo, a, angle))) return 0;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (inside(G.pointOf(F, m, a, angle))) lo = m;
      else hi = m;
    }
    return hi;
  };
  const low = Math.min(...Array.from({ length: 48 }, (_, i) => start((i / 48) * Math.PI * 2)));
  const shape = record(A.disc(F, low - 0.05, h, a, { name, seated: true, cut: host }));
  put(name, G.add3(point, G.mul3(F.a, h / 2)), wrap(S(G.saddleOf(F, a, start, h, P), { tone: "mid", ...style }), live), [shape], { bias: 0.05 });
  return { face: G.add3(point, G.mul3(F.a, h)), axis: F.a };
}
// Basilar artery up the clivus, its tip, and the superior cerebellar artery.
const TIP_R = 3.2;
ball("vertebral", [BASILAR[0], BASILAR[1], 4], 4, { tone: "mid" }, { owner: "vertebral" });
strand("basilar", [[BASILAR[0], BASILAR[1], 4 + Math.sqrt(16 - 2.2 ** 2)], [BASILAR[0], BASILAR[1], TIP[2] - Math.sqrt(TIP_R ** 2 - 2.2 ** 2)]], 2.2, { tone: "mid", touch: ["basilar.tip", "vertebral"] });
ball("basilar.tip", TIP, TIP_R, { tone: "mid" }, { owner: "basilar.tip" });
const SCA_R = 1.2;
const SCA_U = G.unit3([0.25, 0.97, 0]);
const scaStart = G.add3(TIP, G.mul3(SCA_U, Math.sqrt(TIP_R ** 2 - SCA_R ** 2)));

// Cranial nerves: each leaves the brainstem along its surface normal and enters its foramen square to the petrous face.
const fromPons = (name, z, ang, r, live) => {
  const d = [Math.cos(ang), Math.sin(ang), 0];
  const surface = [PONS.c[0] + d[0] * ponsR(z), PONS.c[1] + d[1] * ponsR(z), z];
  const pad = padOn(name, PONS_SHAPE, surface, d, r * 1.3, 1.6, { tone: "hi" }, live);
  return { p: pad.face, out: G.add3(pad.face, G.mul3(d, 5)) };
};
const intoFace = (q, depth = 8) => G.add3(q, G.mul3(PET_N, depth));
const V5 = fromPons("cn5.rez", 52, 2.2, 2.6, { focus: "cn5" });
const REZ = G.lerp3(V5.p, V5.out, 0.55);
strand("cn5", [V5.p, V5.out, [-16, -50, 50], intoFace(PORUS), PORUS], 2.6, { tone: "hi", bend: 7, rings: { pitch: 1.6, twist: 1.2, fade: [0.15, 0.6], tone: "faint" }, touch: ["sca.*", "teflon", "brainstem", "petrous", "cn5.rez"], live: { focus: "cn5" } });
const V7 = fromPons("cn7.root", 37, 2.12, 1.9);
strand("cn7", [V7.p, V7.out, [-16, -40, 34], intoFace(IAM), IAM], 1.9, { tone: "mid", touch: ["brainstem", "petrous"] });
const V9 = fromPons("cn9.root", 21, 2.05, 1.1);
strand("cn9", [V9.p, V9.out, [-16, -30, 13], intoFace(JUG), JUG], 1.1, { tone: "mid", touch: ["brainstem", "petrous"] });

// The SCA loop: before, pressed on the superomedial root entry zone; after, lifted off it.
const nearREZ = G.add3(REZ, [0, 0, 2.6 + SCA_R + 0.1]);
const scaEnd = (name, q, live) => {
  const p = onCerebellum(q);
  const n = G.unit3(G.sub3(p, [CBL.c[0], CBL.c[1], CBL.mid]));
  const pad = padOn(name, CBL_SHAPE, p, n, SCA_R * 1.5, 1, { tone: "mid" }, live);
  return [G.add3(pad.face, G.mul3(n, 4)), pad.face];
};
const preEnd = scaEnd("sca.pre.end", [28, -28, 64], { part: "scapre" });
const postEnd = scaEnd("sca.post.end", [26, -30, 71], { part: "scapost", hidden: true });
strand("sca.pre", [scaStart, G.add3(scaStart, G.mul3(SCA_U, 5)), [-9, -64, 61], nearREZ, [5, -55, 56], [16, -42, 58], ...preEnd], SCA_R, { tone: "mid", bend: 4, touch: ["cn5", "cn5.rez", "sca.post", "sca.*.end", "teflon", "basilar*", "cerebellum"], live: { part: "scapre", focus: "sca" } });
const lifted = G.add3(REZ, [0, 0, 2.6 + 2 * 2.9 + SCA_R - 0.15]);
strand("sca.post", [scaStart, G.add3(scaStart, G.mul3(SCA_U, 5)), [-9, -65, 64], lifted, [5, -55, 62], [17, -41, 64], ...postEnd], SCA_R, { tone: "mid", bend: 4, touch: ["cn5", "cn5.rez", "sca.pre", "sca.*.end", "teflon", "basilar*", "cerebellum"], live: { part: "scapost", focus: "sca", hidden: true } });
// Teflon felt between the nerve and the artery.
const TEF = G.add3(REZ, [0, 0, 2.6 + 2.85]);
ball("teflon", TEF, 2.9, { tone: "hi" }, { owner: "teflon", live: { part: "teflon", focus: "teflon", hidden: true }, extra: Dots([[-1, 0.6], [0.8, 1.1], [0.2, -0.9], [-0.6, -0.4], [1.2, -0.2]].map(([u, v]) => at(G.add3(TEF, [u, 2.2, v]))), { size: 0.35, tone: "lo" }) });

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);

const svg = k.figureSvg({
  width: W,
  height: H,
  label:
    "Modelo de docencia de la fosa posterior derecha vista desde detrás de la oreja. Delante, la pared de hueso con la ventana retrosigmoidea bajo el seno transverso y por detrás del sigmoide. Dentro, el cerebelo, la protuberancia, la arteria basilar y la arteria cerebelosa superior, que en reposo aprieta la zona de entrada del nervio trigémino. El trigémino, el paquete acústico-facial y los pares bajos van de la protuberancia a sus agujeros en el peñasco. Los pasos muestran la craneotomía, la apertura dural, la movilización de la arteria, el Teflon, la plástica dural y el colgajo fijado con miniplacas.",
  body: [...back, sutures, asterion, `<g class="dv-items">${R.items.map((item) => `<g class="it" data-name="${item.name}">${item.svg}</g>`).join("")}</g>`],
});

const STEPS = [
  { name: "0 · Conflicto: la ACS comprime la raíz del V", flap: 1, dura: 1, open: 0, graft: 0, sca: 0, tef: 0, plate: 0, focus: ["cn5", "sca"] },
  { name: "1 · Craneotomía retrosigmoidea", flap: 0, dura: 1, open: 0, graft: 0, sca: 0, tef: 0, plate: 0, focus: ["flap"] },
  { name: "2 · Apertura dural, base en el sigmoide", flap: 0, dura: 0, open: 1, graft: 0, sca: 0, tef: 0, plate: 0, focus: ["dura"] },
  { name: "3 · Ángulo pontocerebeloso: V par", flap: 0, dura: 0, open: 1, graft: 0, sca: 0, tef: 0, plate: 0, focus: ["cn5"] },
  { name: "4 · Se moviliza la arteria cerebelosa superior", flap: 0, dura: 0, open: 1, graft: 0, sca: 1, tef: 0, plate: 0, focus: ["sca"] },
  { name: "5 · Interposición de Teflon", flap: 0, dura: 0, open: 1, graft: 0, sca: 1, tef: 1, plate: 0, focus: ["teflon"] },
  { name: "6 · Plástica dural estanca", flap: 0, dura: 0, open: 0, graft: 1, sca: 1, tef: 1, plate: 0, focus: ["graft"] },
  { name: "7 · Colgajo óseo fijado con miniplacas", flap: 1, dura: 0, open: 0, graft: 1, sca: 1, tef: 1, plate: 1, focus: ["plate"] },
];

const live = `
const STEPS = ${JSON.stringify(STEPS)};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const parts = (n) => [...svg.querySelectorAll('[data-part="' + n + '"]')];
const groups = {
  flap: [parts("flap"), (s) => s.flap], flapaside: [parts("flapaside"), (s) => 1 - s.flap],
  dura: [parts("dura"), (s) => s.dura], duraopen: [parts("duraopen"), (s) => s.open], graft: [parts("graft"), (s) => s.graft],
  scapre: [parts("scapre"), (s) => 1 - s.sca], scapost: [parts("scapost"), (s) => s.sca], teflon: [parts("teflon"), (s) => s.tef],
  plates: [[...parts("platehigh"), ...parts("platelow")], (s) => s.plate],
};
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const keys = ["flap", "dura", "open", "graft", "sca", "tef", "plate"];
let index = 0, s = Object.fromEntries(keys.map((key) => [key, STEPS[0][key]]));
let last = 0, frame = 0, visible = false, touring = true, idle = 0, held = 0, lastFocus = "";
function draw() {
  for (const [els, f] of Object.values(groups)) { const o = Math.max(0, Math.min(1, f(s))).toFixed(3); for (const el of els) if (el.style.opacity !== o) el.style.opacity = o; }
  const focus = STEPS[index].focus.join(",");
  if (focus !== lastFocus) {
    lastFocus = focus;
    svg.querySelectorAll("[data-focus]").forEach((g) => {
      const on = STEPS[index].focus.includes(g.dataset.focus);
      g.querySelectorAll(".iso-solid").forEach((solid) => solid.toggleAttribute("data-lit", on));
      g.querySelectorAll(".tb-edge").forEach((edge) => edge.setAttribute("data-tone", on ? "lit" : edge.dataset.base || (edge.dataset.base = edge.getAttribute("data-tone"))));
    });
  }
  const text = STEPS[index].name;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(index));
  stage.setAttribute("aria-valuetext", text);
}
svg.querySelectorAll(".tb-edge").forEach((edge) => (edge.dataset.base = edge.getAttribute("data-tone")));
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring && !calm) { held += dt; if (held > 3.4) { held = 0; index = (index + 1) % STEPS.length; } }
  let moving = false;
  for (const key of keys) {
    const target = STEPS[index][key];
    s[key] = calm ? target : s[key] + (target - s[key]) * (1 - Math.exp(-dt / 0.35));
    if (Math.abs(s[key] - target) < 0.002) s[key] = target; else moving = true;
  }
  draw();
  frame = visible && !calm && (touring || moving) ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const go = (i) => { index = Math.max(0, Math.min(STEPS.length - 1, i)); touring = false; held = 0; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; run(); }, 7000); run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
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
window.__dmv = { seek(i) { index = i; touring = false; clearTimeout(idle); for (const key of keys) s[key] = STEPS[i][key]; lastFocus = ""; draw(); } };
draw();
`;

const body = k.plateHtml({
  fig: "Fig 3",
  title: "Descompresión microvascular del V derecho",
  hint: "Puntero o ← →: pasos",
  readout: STEPS[0].name,
  keys: [
    { mark: "lit", label: "Lo que se toca en cada paso" },
    { mark: "raised", label: "Trigémino (V), del puente a la cavidad de Meckel; VII-VIII al conducto auditivo interno; IX-X al agujero yugular" },
    { mark: "edge", label: "Arteria basilar y cerebelosa superior; senos transverso y sigmoide en la cara interna del hueso" },
  ],
  caption:
    "Lado derecho visto desde detrás de la oreja, a escala aproximada en milímetros (regla: 2 mm). En la neuralgia del trigémino clásica, un asa de la arteria cerebelosa superior apoya sobre la cara superomedial de la zona de entrada de la raíz del V, en los primeros milímetros desde la protuberancia, donde la mielina es central y más vulnerable. Abordaje retrosigmoideo: craneotomía de unos 3 cm por debajo del seno transverso y por detrás del sigmoide, con la esquina transverso-sigmoidea (cerca del asterion) como referencia; apertura de la duramadre con base en el sigmoide; drenaje de LCR de la cisterna para que el cerebelo descienda y acceso por el ángulo pontocerebeloso superolateral hasta el V, respetando la vena petrosa. Se separa la arteria de la raíz y se interpone fieltro de Teflon para que no vuelva a apoyar. Cierre: plástica dural estanca con injerto (autólogo o sintético) suturado a los bordes, para evitar fístula de LCR, y reposición del colgajo óseo fijado con miniplacas de titanio y tornillos. Es un modelo esquemático para docencia, no una reconstrucción anatómica exacta.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Descompresión microvascular del trigémino derecho: las flechas recorren los pasos" aria-valuemin="0" aria-valuemax="${STEPS.length - 1}" aria-valuenow="0">${svg}</div>`,
});

const name = THEME === "light" ? "dmv-trigemino-light.html" : "dmv-trigemino.html";
const page = k.pageHtml({ title: "Descompresión microvascular del trigémino", theme: THEME, body, script: kitScript() + live });
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`);

A.auditOrExit(R, P, {
  allow: [["sca.pre*", "sca.post*"], ["dura.*", "dura.*"], ["dura.*", "flap.*"], ["teflon", "sca.pre*"]],
  crowd: [["sca.pre", "sca.post"], ["sca.pre", "cn5"], ["sca.post", "cn5"]],
});
