import * as THREE from "three";
import { HERO_INK, SCREEN_BG, type PhoneApp } from "./apps";

const W = 440;
const H = 1040;
const PAD = 32;
const FONT = "Helvetica, Arial, sans-serif";

function font(size: number, weight = 600) {
  return `${weight} ${size}px ${FONT}`;
}

function alpha(hex: string, a: number) {
  const n = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${n}`;
}

function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function pill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bg: string,
  label: string,
  fg: string,
  size = 24,
) {
  rounded(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = font(size, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

function chrome(ctx: CanvasRenderingContext2D, app: PhoneApp) {
  ctx.fillStyle = SCREEN_BG;
  ctx.fillRect(0, 0, W, H);

  // status bar
  ctx.fillStyle = HERO_INK;
  ctx.font = font(26, 700);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("9:41", PAD, 44);
  // battery
  rounded(ctx, W - PAD - 50, 32, 44, 24, 7);
  ctx.strokeStyle = HERO_INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  rounded(ctx, W - PAD - 46, 36, 28, 16, 4);
  ctx.fillStyle = app.accent;
  ctx.fill();

  // app header
  rounded(ctx, PAD, 88, 56, 56, 18);
  ctx.fillStyle = app.accent;
  ctx.fill();
  ctx.fillStyle = "#fffdf7";
  ctx.font = font(34, 800);
  ctx.textAlign = "center";
  ctx.fillText(app.name[0], PAD + 28, 118);

  ctx.fillStyle = HERO_INK;
  ctx.font = font(34, 800);
  ctx.textAlign = "left";
  ctx.fillText(app.name, PAD + 72, 106);
  ctx.fillStyle = alpha(HERO_INK, 0.45);
  ctx.font = font(22, 600);
  ctx.fillText("built by Radiant", PAD + 72, 136);

  // home indicator
  rounded(ctx, W / 2 - 60, H - 26, 120, 10, 5);
  ctx.fillStyle = alpha(HERO_INK, 0.25);
  ctx.fill();
}

function drawSavings(ctx: CanvasRenderingContext2D, app: PhoneApp) {
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(26);
  ctx.textAlign = "left";
  ctx.fillText("Total stashed", PAD, 220);

  ctx.fillStyle = HERO_INK;
  ctx.font = font(76, 800);
  ctx.fillText("1,284 SUI", PAD, 290);

  pill(ctx, PAD, 330, 170, 44, alpha(app.accent, 0.14), "+ 25 this week", app.accent, 22);

  // goal card
  rounded(ctx, PAD, 420, W - PAD * 2, 200, 28);
  ctx.fillStyle = alpha(app.accent, 0.1);
  ctx.fill();
  ctx.fillStyle = HERO_INK;
  ctx.font = font(30, 700);
  ctx.fillText("Vacation fund", PAD + 28, 478);
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(24);
  ctx.fillText("820 / 1,280 SUI", PAD + 28, 514);

  rounded(ctx, PAD + 28, 552, W - PAD * 2 - 56, 22, 11);
  ctx.fillStyle = alpha(app.accent, 0.2);
  ctx.fill();
  rounded(ctx, PAD + 28, 552, (W - PAD * 2 - 56) * 0.64, 22, 11);
  ctx.fillStyle = app.accent;
  ctx.fill();

  ctx.fillStyle = app.accent;
  ctx.font = font(28, 800);
  ctx.textAlign = "right";
  ctx.fillText("64%", W - PAD - 28, 488);

  // second goal
  rounded(ctx, PAD, 648, W - PAD * 2, 120, 28);
  ctx.fillStyle = alpha(HERO_INK, 0.05);
  ctx.fill();
  ctx.fillStyle = HERO_INK;
  ctx.font = font(28, 700);
  ctx.textAlign = "left";
  ctx.fillText("Rainy day", PAD + 28, 700);
  ctx.fillStyle = alpha(HERO_INK, 0.45);
  ctx.font = font(22);
  ctx.fillText("auto-stash every Friday", PAD + 28, 734);

  pill(ctx, PAD, 830, W - PAD * 2, 88, app.accent, "Stash 25 SUI weekly", "#fffdf7", 30);
}

function drawOfframp(ctx: CanvasRenderingContext2D, app: PhoneApp) {
  // converter card — send
  rounded(ctx, PAD, 200, W - PAD * 2, 170, 28);
  ctx.fillStyle = alpha(HERO_INK, 0.05);
  ctx.fill();
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(24);
  ctx.textAlign = "left";
  ctx.fillText("You send", PAD + 28, 250);
  ctx.fillStyle = HERO_INK;
  ctx.font = font(56, 800);
  ctx.fillText("500 SUI", PAD + 28, 322);

  // arrow chip
  rounded(ctx, W / 2 - 32, 350, 64, 64, 22);
  ctx.fillStyle = app.accent;
  ctx.fill();
  ctx.strokeStyle = "#fffdf7";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(W / 2, 366);
  ctx.lineTo(W / 2, 396);
  ctx.moveTo(W / 2 - 12, 384);
  ctx.lineTo(W / 2, 398);
  ctx.lineTo(W / 2 + 12, 384);
  ctx.stroke();

  // receive
  rounded(ctx, PAD, 444, W - PAD * 2, 170, 28);
  ctx.fillStyle = alpha(app.accent, 0.1);
  ctx.fill();
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(24);
  ctx.fillText("You get", PAD + 28, 494);
  ctx.fillStyle = app.accent;
  ctx.font = font(56, 800);
  ctx.fillText("$1,712.40", PAD + 28, 566);

  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(24);
  ctx.fillText("1 SUI = $3.42 · best rate via DeepBook", PAD, 672);

  ctx.fillStyle = HERO_INK;
  ctx.font = font(24, 700);
  ctx.fillText("→  Chase ··· 4821", PAD, 728);

  pill(ctx, PAD, 830, W - PAD * 2, 88, app.accent, "Cash out to bank", "#fffdf7", 30);
}

function drawStaking(ctx: CanvasRenderingContext2D, app: PhoneApp) {
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(26);
  ctx.textAlign = "left";
  ctx.fillText("Current APY", PAD, 220);
  ctx.fillStyle = app.accent;
  ctx.font = font(86, 800);
  ctx.fillText("4.6%", PAD, 300);

  // toggle
  rounded(ctx, W - PAD - 104, 250, 104, 56, 28);
  ctx.fillStyle = app.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W - PAD - 30, 278, 22, 0, Math.PI * 2);
  ctx.fillStyle = "#fffdf7";
  ctx.fill();
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(22);
  ctx.textAlign = "right";
  ctx.fillText("auto", W - PAD - 116, 278);

  // next run card
  rounded(ctx, PAD, 360, W - PAD * 2, 130, 28);
  ctx.fillStyle = alpha(app.accent, 0.1);
  ctx.fill();
  ctx.fillStyle = HERO_INK;
  ctx.font = font(30, 700);
  ctx.textAlign = "left";
  ctx.fillText("Next stake — Mon 9:00", PAD + 28, 416);
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(24);
  ctx.fillText("50 SUI → validator pool", PAD + 28, 454);

  // weekly bars
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(24);
  ctx.fillText("Staked, last 6 weeks", PAD, 560);
  const heights = [90, 120, 80, 150, 130, 180];
  const bw = 44;
  const gap = (W - PAD * 2 - bw * 6) / 5;
  heights.forEach((h, i) => {
    const x = PAD + i * (bw + gap);
    rounded(ctx, x, 770 - h, bw, h, 12);
    ctx.fillStyle = i === 5 ? app.accent : alpha(app.accent, 0.3);
    ctx.fill();
  });

  pill(ctx, PAD, 830, W - PAD * 2, 88, app.accent, "Stake 50 SUI now", "#fffdf7", 30);
}

function drawSplitter(ctx: CanvasRenderingContext2D, app: PhoneApp) {
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(26);
  ctx.textAlign = "left";
  ctx.fillText("Splitting with", PAD, 214);

  // avatars + shares
  const people = [
    { initial: "A", share: "50%", color: app.accent },
    { initial: "J", share: "30%", color: "#ff5d46" },
    { initial: "M", share: "20%", color: "#8e5bff" },
  ];
  people.forEach((p, i) => {
    const cx = PAD + 56 + i * 124;
    ctx.beginPath();
    ctx.arc(cx, 300, 52, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.fillStyle = "#fffdf7";
    ctx.font = font(40, 800);
    ctx.textAlign = "center";
    ctx.fillText(p.initial, cx, 302);
    ctx.fillStyle = HERO_INK;
    ctx.font = font(26, 700);
    ctx.fillText(p.share, cx, 386);
  });

  // recent splits
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(24);
  ctx.textAlign = "left";
  ctx.fillText("Recent", PAD, 470);
  const rows = [
    ["Dinner @ Suiteki", "36 SUI"],
    ["Studio rent", "240 SUI"],
    ["Group subscription", "18 SUI"],
  ];
  rows.forEach(([label, amt], i) => {
    const y = 504 + i * 96;
    rounded(ctx, PAD, y, W - PAD * 2, 80, 24);
    ctx.fillStyle = alpha(HERO_INK, 0.05);
    ctx.fill();
    ctx.fillStyle = HERO_INK;
    ctx.font = font(26, 700);
    ctx.fillText(label, PAD + 24, y + 42);
    ctx.fillStyle = app.accent === "#ffb01f" ? "#b97700" : app.accent;
    ctx.font = font(26, 800);
    ctx.textAlign = "right";
    ctx.fillText(amt, W - PAD - 24, y + 42);
    ctx.textAlign = "left";
  });

  pill(ctx, PAD, 830, W - PAD * 2, 88, app.accent, "New split", HERO_INK, 30);
}

function drawPortfolio(ctx: CanvasRenderingContext2D, app: PhoneApp) {
  ctx.fillStyle = alpha(HERO_INK, 0.5);
  ctx.font = font(26);
  ctx.textAlign = "left";
  ctx.fillText("Portfolio value", PAD, 214);
  ctx.fillStyle = HERO_INK;
  ctx.font = font(76, 800);
  ctx.fillText("$12,408", PAD, 284);
  pill(ctx, W - PAD - 130, 240, 130, 48, alpha(app.accent, 0.14), "+8.2%", app.accent, 26);

  // line chart
  const pts = [0.55, 0.48, 0.62, 0.4, 0.5, 0.3, 0.34, 0.18];
  const cx0 = PAD;
  const cw = W - PAD * 2;
  const cy0 = 340;
  const ch = 220;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = cx0 + (cw * i) / (pts.length - 1);
    const y = cy0 + ch * p;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = app.accent;
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  // end dot
  ctx.beginPath();
  ctx.arc(cx0 + cw, cy0 + ch * pts[pts.length - 1], 12, 0, Math.PI * 2);
  ctx.fillStyle = app.accent;
  ctx.fill();

  // assets
  const assets: [string, string, string][] = [
    ["SUI", "2,410 · $8,242", "#3865ff"],
    ["USDC", "3,000 · $3,001", "#00c478"],
    ["WAL", "920 · $1,165", "#ff5d46"],
  ];
  assets.forEach(([sym, val, dot], i) => {
    const y = 624 + i * 96;
    rounded(ctx, PAD, y, W - PAD * 2, 80, 24);
    ctx.fillStyle = alpha(HERO_INK, 0.05);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(PAD + 44, y + 40, 16, 0, Math.PI * 2);
    ctx.fillStyle = dot;
    ctx.fill();
    ctx.fillStyle = HERO_INK;
    ctx.font = font(28, 800);
    ctx.fillText(sym, PAD + 76, y + 42);
    ctx.fillStyle = alpha(HERO_INK, 0.55);
    ctx.font = font(24, 600);
    ctx.textAlign = "right";
    ctx.fillText(val, W - PAD - 24, y + 42);
    ctx.textAlign = "left";
  });
}

const DRAWERS: Record<PhoneApp["id"], (ctx: CanvasRenderingContext2D, app: PhoneApp) => void> = {
  savings: drawSavings,
  offramp: drawOfframp,
  staking: drawStaking,
  splitter: drawSplitter,
  portfolio: drawPortfolio,
};

export function makeScreenTexture(app: PhoneApp): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  chrome(ctx, app);
  DRAWERS[app.id](ctx, app);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
