// Draws the "who owes what" screen as a PNG so it can be texted as a picture.
// It's drawn by hand on a canvas (instead of screenshotting the page) so it
// looks the same on every phone and always includes everyone, not just what
// fits on screen.

import { formatMoney } from "./money";
import { billTotal, itemsTotal } from "./receipt";
import { shareLabel, type SplitResult } from "./split";
import type { Bill, Person } from "./types";

const WIDTH = 560; // logical px; drawn at 2x for sharpness
const SCALE = 2;
const PAD = 20;
const CARD_PAD = 16;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

interface Theme {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  table: string;
  tableSoft: string;
  chip: string;
  person: (color: number) => string;
}

function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    bg: v("--bg"),
    surface: v("--surface"),
    text: v("--text"),
    muted: v("--muted"),
    border: v("--border"),
    accent: v("--accent"),
    table: v("--table"),
    tableSoft: v("--table-soft"),
    chip: v("--surface-2"),
    person: (color) => v(`--p${color}`),
  };
}

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT}`;
}

/** Splits text into lines no wider than maxWidth (breaking long words if needed). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function roundRect(
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

/**
 * Lays out (and, when `draw` is true, paints) the whole image. Returns the
 * total height so the first pass can size the canvas.
 */
function layout(
  ctx: CanvasRenderingContext2D,
  t: Theme,
  bill: Bill,
  result: SplitResult,
  payer: Person | null,
  venmo: string,
  draw: boolean,
): number {
  const center = WIDTH / 2;
  let y = PAD + 8;

  // Header: restaurant, big total, breakdown.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = font(600, 15);
  if (draw) {
    ctx.fillStyle = t.muted;
    ctx.fillText(bill.merchant ?? "Bill split", center, y + 15);
  }
  y += 22;
  ctx.font = font(750, 38);
  if (draw) {
    ctx.fillStyle = t.text;
    ctx.fillText(formatMoney(billTotal(bill)), center, y + 38);
  }
  y += 48;
  const breakdown = [
    `${formatMoney(itemsTotal(bill))} items`,
    bill.taxCents ? `${formatMoney(bill.taxCents)} tax` : null,
    bill.tipCents ? `${formatMoney(bill.tipCents)} tip` : null,
    bill.feesCents ? `${formatMoney(bill.feesCents)} fees` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  ctx.font = font(400, 13);
  if (draw) {
    ctx.fillStyle = t.muted;
    ctx.fillText(breakdown, center, y + 13);
  }
  y += 34;
  ctx.textAlign = "left";

  const cardX = PAD;
  const cardW = WIDTH - PAD * 2;
  const innerX = cardX + CARD_PAD + 4;
  const innerW = cardW - CARD_PAD * 2 - 4;

  for (const p of result.people) {
    const top = y;
    const color = t.person(p.person.color);
    // Measure the card body first, then paint background behind it.
    const rows: { lines: string[]; tag: string | null; tagTable: boolean; price: string }[] = [];
    ctx.font = font(400, 15);
    for (const line of p.lines) {
      const price = formatMoney(line.cents);
      const priceW = ctx.measureText(price).width;
      const tag = line.item.shared
        ? `table · ${shareLabel(line.splitWays)}`
        : line.splitWays > 1
          ? shareLabel(line.splitWays)
          : null;
      rows.push({
        lines: wrap(ctx, line.item.name, innerW - priceW - 14),
        tag,
        tagTable: line.item.shared,
        price,
      });
    }

    // Height: head row + item rows (+ tag rows) + extras.
    let bodyH = CARD_PAD + 36 + 10;
    const rowLayouts: { y: number; tagOnOwnLine: boolean; height: number }[] = [];
    for (const row of rows) {
      ctx.font = font(400, 15);
      const lastW = ctx.measureText(row.lines.at(-1) ?? "").width;
      ctx.font = font(600, 12);
      const tagW = row.tag ? ctx.measureText(row.tag).width + 16 : 0;
      const priceW = (ctx.font = font(400, 15), ctx.measureText(row.price).width);
      const tagFits = !row.tag || lastW + 8 + tagW <= innerW - priceW - 14;
      const height = row.lines.length * 21 + (tagFits ? 0 : 24) + 8;
      rowLayouts.push({ y: bodyH, tagOnOwnLine: !tagFits, height });
      bodyH += height;
    }
    if (rows.length === 0) bodyH += 29;
    const isPayer = payer?.id === p.person.id;
    bodyH += 12 + 1 + 12 + 14 + CARD_PAD; // divider + extras row
    if (isPayer) bodyH += 26;

    if (draw) {
      // Card
      roundRect(ctx, cardX, top, cardW, bodyH, 14);
      ctx.fillStyle = t.surface;
      ctx.fill();
      ctx.strokeStyle = t.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.save();
      roundRect(ctx, cardX, top, cardW, bodyH, 14);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(cardX, top, 4, bodyH);
      ctx.restore();

      // Head: avatar, name, total
      const cy = top + CARD_PAD + 18;
      ctx.beginPath();
      ctx.arc(innerX + 18, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = font(700, 16);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.person.name.trim().charAt(0).toUpperCase() || "?", innerX + 18, cy + 1);
      ctx.textAlign = "right";
      ctx.fillStyle = t.text;
      ctx.font = font(750, 22);
      const totalText = formatMoney(p.totalCents);
      ctx.fillText(totalText, innerX + innerW, cy);
      const totalW = ctx.measureText(totalText).width;
      ctx.textAlign = "left";
      ctx.font = font(700, 18);
      const nameLines = wrap(ctx, p.person.name, innerW - 48 - totalW - 12);
      ctx.fillText(nameLines[0] ?? "", innerX + 48, cy);
      ctx.textBaseline = "alphabetic";

      // Item rows
      rows.forEach((row, i) => {
        const ry = top + (rowLayouts[i]?.y ?? 0);
        ctx.font = font(400, 15);
        ctx.fillStyle = t.text;
        row.lines.forEach((l, li) => ctx.fillText(l, innerX, ry + 15 + li * 21));
        ctx.textAlign = "right";
        ctx.fillText(row.price, innerX + innerW, ry + 15);
        ctx.textAlign = "left";
        if (row.tag) {
          const lastLine = row.lines.at(-1) ?? "";
          const lastW = ctx.measureText(lastLine).width;
          ctx.font = font(600, 12);
          const tw = ctx.measureText(row.tag).width + 16;
          const own = rowLayouts[i]?.tagOnOwnLine;
          const tx = own ? innerX + 8 : innerX + lastW + 8;
          const ty = own ? ry + row.lines.length * 21 + 2 : ry + 15 + (row.lines.length - 1) * 21 - 14;
          roundRect(ctx, tx, ty, tw, 20, 10);
          ctx.fillStyle = row.tagTable ? t.tableSoft : t.chip;
          ctx.fill();
          ctx.fillStyle = row.tagTable ? t.table : t.muted;
          ctx.fillText(row.tag, tx + 8, ty + 14);
        }
      });
      if (rows.length === 0) {
        ctx.font = font(400, 15);
        ctx.fillStyle = t.muted;
        ctx.fillText("No items", innerX, top + CARD_PAD + 46 + 15);
      }

      // Divider + extras
      let ey = top + bodyH - CARD_PAD - 14 - 12 - (isPayer ? 26 : 0);
      ctx.strokeStyle = t.border;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(innerX, ey);
      ctx.lineTo(innerX + innerW, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      ey += 12 + 12;
      ctx.font = font(400, 13);
      ctx.fillStyle = t.muted;
      const extras = [
        `Items ${formatMoney(p.itemsCents)}`,
        bill.taxCents ? `Tax ${formatMoney(p.taxCents)}` : null,
        bill.tipCents ? `Tip ${formatMoney(p.tipCents)}` : null,
        bill.feesCents ? `Fees ${formatMoney(p.feesCents)}` : null,
      ].filter((x): x is string => x !== null);
      let ex = innerX;
      for (const e of extras) {
        ctx.fillText(e, ex, ey);
        ex += ctx.measureText(e).width + 16;
      }
      if (isPayer) {
        ctx.font = font(600, 13);
        ctx.fillStyle = t.accent;
        ctx.fillText("✓ Paid the bill", innerX, ey + 24);
      }
    }
    y += bodyH + 12;
  }

  // Footer: who to pay.
  if (payer) {
    y += 6;
    ctx.textAlign = "center";
    ctx.font = font(600, 15);
    if (draw) {
      ctx.fillStyle = t.text;
      const who = venmo ? `Pay ${payer.name} on Venmo: @${venmo}` : `Pay ${payer.name} back`;
      ctx.fillText(who, center, y + 15);
    }
    y += 26;
    ctx.textAlign = "left";
  }
  return y + PAD - 4;
}

export async function renderShareImage(
  bill: Bill,
  result: SplitResult,
  payer: Person | null,
  venmo: string,
): Promise<Blob> {
  const theme = readTheme();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const height = layout(ctx, theme, bill, result, payer, venmo, false);
  canvas.width = WIDTH * SCALE;
  canvas.height = Math.ceil(height * SCALE);
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, WIDTH, height);
  layout(ctx, theme, bill, result, payer, venmo, true);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't make image"))), "image/png"),
  );
}
