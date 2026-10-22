import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* SVG QR Code بدون هیچ وابستگی خارجی.
   رمزگذاری BYTE ساده QR نسخه ۱-۲ با الگوریتم mask ثابت؛ برای راستی‌آزمایی
   اسکنرهای مدرن کافی است. اگر محتوای کوتاه باشد (لینک پورتال) در نسخه ۲ جا می‌شود. */

const GF_EXP: number[] = (() => {
  const exp = new Array<number>(512).fill(0);
  const log = new Array<number>(256).fill(0);
  let x = 1;
  for (let i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  return exp.concat(log); // [0..511]=exp, [512..767]=log
})();

function gmul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_EXP[512 + a] + GF_EXP[512 + b]];
}

function rsGenPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmul(poly[j], 1);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenPoly(ecLen);
  const res = new Array<number>(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift(); res.push(0);
    if (factor !== 0) for (let i = 0; i < ecLen; i++) res[i] ^= gmul(gen[i + 1], factor);
  }
  return res;
}

function bitBuffer(bits: number[], val: number, len: number): void {
  for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
}

// QR version 2-M (25x25), EC codewords per block: 16, data codewords: 28
const SIZE = 25;
const DATA_CW = 28;
const EC_CW = 16;

function encodeBytes(text: string): Uint8Array {
  const enc = new TextEncoder().encode(text);
  const bits: number[] = [];
  bitBuffer(bits, 4, 4);                 // mode: byte
  if (enc.length < 256) { bitBuffer(bits, 2, 2); bitBuffer(bits, enc.length, 8); }
  else { bitBuffer(bits, 3, 2); bitBuffer(bits, enc.length, 16); }
  for (const b of enc) bitBuffer(bits, b, 8);
  const cap = DATA_CW * 8;
  bitBuffer(bits, 0, Math.min(4, cap - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  const pads = [0xec, 0x11];
  let pi = 0;
  while (data.length < DATA_CW) data.push(pads[pi++ % 2]);
  const ec = rsEncode(data, EC_CW);
  return new Uint8Array([...data, ...ec]);
}

function placeModules(codewords: Uint8Array): boolean[][] {
  const m: boolean[][] = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
  const reserved: boolean[][] = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));

  const finder = (r0: number, c0: number) => {
    for (let r = -1; r < 8; r++) for (let c = -1; c < 8; c++) {
      const r1 = r0 + r, c1 = c0 + c;
      if (r1 < 0 || c1 < 0 || r1 >= SIZE || c1 >= SIZE) continue;
      reserved[r1][c1] = true;
      const inRing = r >= 0 && r < 7 && c >= 0 && c < 7;
      const dark = inRing && ((r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      m[r1][c1] = dark;
    }
  };
  finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0);

  // alignment pattern at (18,18) center
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
    const r1 = 18 + r, c1 = 18 + c;
    reserved[r1][c1] = true;
    m[r1][c1] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
  }

  for (let i = 8; i < SIZE - 8; i++) {
    const dark = i % 2 === 0;
    if (!reserved[6][i]) { m[6][i] = dark; reserved[6][i] = true; }
    if (!reserved[i][6]) { m[i][6] = dark; reserved[i][6] = true; }
  }

  // format info (M mask 00: EC=01, mask=00 => 0b111011111000100)
  const fmt = 0b111011111000100;
  const fmtBits: number[] = [];
  for (let i = 14; i >= 0; i--) fmtBits.push((fmt >> i) & 1);
  const place = (r: number, c: number, bit: number) => { m[r][c] = bit === 1; reserved[r][c] = true; };
  for (let i = 0; i < 15; i++) {
    place(8, i < 6 ? i : i === 6 ? 7 : 8, fmtBits[i]);
    place(i < 8 ? i : i === 8 ? 7 : 14 - i, 8, fmtBits[i]);
  }
  place(SIZE - 8, 8, true); // dark module

  // data placement (zigzag, mask 0: (r+c)%2==0)
  let idx = 0; const totalBits = codewords.length * 8;
  let col = SIZE - 1; let upward = true;
  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < SIZE; i++) {
      const r = upward ? SIZE - 1 - i : i;
      for (let cc = 0; cc < 2; cc++) {
        const c = col - cc;
        if (reserved[r][c]) continue;
        const bit = idx < totalBits ? (codewords[idx >> 3] >> (7 - (idx & 7))) & 1 : 0;
        idx++;
        const mask = (r + c) % 2 === 0;
        m[r][c] = (bit === 1) !== mask;
      }
    }
    upward = !upward; col -= 2;
  }
  return m;
}

export async function GET(
  req: Request,
  { params }: { params: { accessCode: string } }
): Promise<NextResponse> {
  const url = new URL(req.url);
  const origin = url.searchParams.get("origin") ?? url.origin;
  const accessCode = decodeURIComponent(params.accessCode).trim();
  const payload = `${origin}/portal/${encodeURIComponent(accessCode)}`;
  const codewords = encodeBytes(payload);
  const m = placeModules(codewords);

  const scale = 8, quiet = 4;
  const dim = (SIZE + quiet * 2) * scale;
  let rects = "";
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (m[r][c]) rects += `<rect x="${(c + quiet) * scale}" y="${(r + quiet) * scale}" width="${scale}" height="${scale}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#ffffff"/><g fill="#0b0f0d">${rects}</g></svg>`;
  return new NextResponse(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  });
}
