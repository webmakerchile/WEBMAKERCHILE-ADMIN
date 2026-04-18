import sharp from "sharp";
import { readFile, writeFile } from "fs/promises";

// Replico los helpers del backend para test aislado
function escapeXml(s) { return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])); }
function stripEmojis(s) {
  return s
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\u200D\uFE0F\u20E3]/g, "")
    .replace(/\s+/g, " ").trim();
}
function wrapTextByChars(text, max) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = []; let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (t.length <= max) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function fitTextBlock(text, opts) {
  const charW = opts.charWidthRatio ?? 0.56;
  const lhRatio = opts.lineHeightRatio ?? 1.18;
  for (let fs = opts.maxFontSize; fs >= opts.minFontSize; fs -= 2) {
    const maxChars = Math.max(4, Math.floor(opts.maxWidth / (fs * charW)));
    const lines = wrapTextByChars(text, maxChars);
    const lh = fs * lhRatio;
    const bh = lines.length * lh;
    const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
    const bw = longest * fs * charW;
    if (bh <= opts.maxHeight && bw <= opts.maxWidth) return { lines, fontSize: fs, lineHeight: lh, blockWidth: bw, blockHeight: bh };
  }
  const fs = opts.minFontSize;
  const maxChars = Math.max(4, Math.floor(opts.maxWidth / (fs * charW)));
  const lines = wrapTextByChars(text, maxChars);
  return { lines, fontSize: fs, lineHeight: fs * lhRatio, blockWidth: 0, blockHeight: lines.length * fs * lhRatio };
}

// Test 1: strip emojis
const cases = [
  "🦊 Tu web vende 24/7 💪",
  "💡 ¿Sabías que el 70% abandona si tarda más de 3s? 🚀",
  "Cómo una panadería 🥖 triplicó pedidos con WhatsApp 📱✨",
];
console.log("=== TEST 1: strip emojis ===");
for (const c of cases) console.log(JSON.stringify(c), "→", JSON.stringify(stripEmojis(c)));

// Test 2: auto-fit
console.log("\n=== TEST 2: auto-fit ===");
const long = "Por qué tu pyme necesita un chatbot con IA hoy mismo y no el próximo trimestre";
const fit = fitTextBlock(long, { maxWidth: 920, maxHeight: 280, maxFontSize: 84, minFontSize: 48 });
console.log(`Texto largo (${long.length} chars) → fontSize ${fit.fontSize}px, ${fit.lines.length} líneas:`);
fit.lines.forEach((l, i) => console.log(`  [${i+1}] "${l}" (${l.length} chars)`));

const short = "Tu web vende sola";
const fit2 = fitTextBlock(short, { maxWidth: 920, maxHeight: 280, maxFontSize: 84, minFontSize: 48 });
console.log(`Texto corto (${short.length} chars) → fontSize ${fit2.fontSize}px, ${fit2.lines.length} líneas`);

// Test 3: render real sobre la imagen de referencia (1080x1920 simulada)
console.log("\n=== TEST 3: render real sobre imagen 1080x1920 ===");
const refPath = "/home/runner/workspace/artifacts/api-server/public/fox-reference.png";
let baseImg;
try {
  const buf = await readFile(refPath);
  baseImg = await sharp(buf).resize(1080, 1920, { fit: "cover" }).png().toBuffer();
} catch {
  // fondo slate sintético
  baseImg = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: { r: 30, g: 41, b: 59 } } }).png().toBuffer();
}

const texto = {
  copy_principal: "🦊 Tu web vende aunque tú duermas 💪",
  sub_copy: "Diseñamos sitios que convierten visitas en clientes 24/7",
  cta: "Agenda tu reunión",
  hashtags: "#WebMakerLatam #Emprendedores #PymesLatam #PaginasWeb",
};

const principalClean = stripEmojis(texto.copy_principal);
const subClean = stripEmojis(texto.sub_copy);
const ctaClean = stripEmojis(texto.cta);
const hashClean = stripEmojis(texto.hashtags);

const sidePadding = 80, w = 1080, h = 1920;
const innerW = w - sidePadding * 2;

const principalFit = fitTextBlock(principalClean, { maxWidth: innerW - 48, maxHeight: 280 - 48, maxFontSize: 84, minFontSize: 48 });
const subFit = fitTextBlock(subClean, { maxWidth: innerW - 48, maxHeight: 200 - 36, maxFontSize: 44, minFontSize: 32, charWidthRatio: 0.5 });
const ctaFit = fitTextBlock(ctaClean, { maxWidth: 540, maxHeight: 64, maxFontSize: 44, minFontSize: 30, charWidthRatio: 0.55 });
const hashFit = fitTextBlock(hashClean, { maxWidth: innerW - 24, maxHeight: 64, maxFontSize: 30, minFontSize: 22, charWidthRatio: 0.5 });

console.log("Principal fit:", principalFit.lines.length, "líneas a", principalFit.fontSize, "px");
console.log("Sub fit:", subFit.lines.length, "líneas a", subFit.fontSize, "px");
console.log("CTA fit:", ctaFit.lines.length, "líneas a", ctaFit.fontSize, "px");
console.log("Hash fit:", hashFit.lines.length, "líneas a", hashFit.fontSize, "px");

function renderBlockSvg(fit, opts) {
  if (!fit.lines.length) return "";
  const padding = opts.padding ?? 24, radius = opts.radius ?? 18;
  const bw = Math.min(opts.canvasWidth - 40, fit.blockWidth + padding * 2);
  const bh = fit.blockHeight + padding * 2;
  const bx = (opts.canvasWidth - bw) / 2;
  const by = opts.centerY - bh / 2;
  const baselineY = by + padding + fit.fontSize * 0.85;
  return `
    ${opts.bgOpacity ? `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${radius}" fill="black" fill-opacity="${opts.bgOpacity}"/>` : ""}
    ${fit.lines.map((l, i) => `<text x="${opts.canvasWidth/2}" y="${baselineY + i*fit.lineHeight}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="${opts.weight}" font-size="${fit.fontSize}" fill="${opts.color}">${escapeXml(l)}</text>`).join("")}
  `;
}

const ctaButtonSvg = (() => {
  const padX = 40, padY = 18;
  const bw = Math.min(innerW, ctaFit.blockWidth + padX * 2);
  const bh = ctaFit.blockHeight + padY * 2;
  const bx = (w - bw) / 2;
  const by = 1762 - bh / 2;
  const baselineY = by + padY + ctaFit.fontSize * 0.85;
  return `
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${bh/2}" fill="#E86A30"/>
    ${ctaFit.lines.map((l, i) => `<text x="${w/2}" y="${baselineY + i*ctaFit.lineHeight}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="${ctaFit.fontSize}" fill="white">${escapeXml(l)}</text>`).join("")}
  `;
})();

const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  ${renderBlockSvg(principalFit, { canvasWidth: w, centerY: 192, weight: 900, color: "white", bgOpacity: 0.55 })}
  ${renderBlockSvg(subFit, { canvasWidth: w, centerY: 1570, weight: 700, color: "#f1f5f9", bgOpacity: 0.5 })}
  ${ctaButtonSvg}
  ${renderBlockSvg(hashFit, { canvasWidth: w, centerY: 1860, weight: 600, color: "#fb923c", bgOpacity: 0 })}
</svg>`;

const out = await sharp(baseImg).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
await writeFile("/tmp/render-test-output.png", out);
const meta = await sharp(out).metadata();
console.log(`\nRender OK: /tmp/render-test-output.png — ${meta.width}x${meta.height} ${(out.length/1024).toFixed(1)}KB`);

// Test 4: edge case — texto MUY largo
console.log("\n=== TEST 4: texto extremo ===");
const xtreme = "Este es un texto absolutamente exagerado y largo que probablemente nunca debería entregar Claude pero queremos verificar que el auto-fit lo maneje sin desbordar el área disponible aunque sea con la fuente mínima";
const fitX = fitTextBlock(xtreme, { maxWidth: 920, maxHeight: 280, maxFontSize: 84, minFontSize: 48 });
console.log(`Extremo (${xtreme.length} chars) → fontSize ${fitX.fontSize}px, ${fitX.lines.length} líneas`);
fitX.lines.forEach((l, i) => console.log(`  [${i+1}] "${l}" (${l.length} chars)`));
