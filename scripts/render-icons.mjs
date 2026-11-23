// Renders the PNG and ICO icons from the SVG mark with the Chromium that
// Playwright already installs for the e2e tests. No extra dependency.
//
//   node scripts/render-icons.mjs
//
// Sources: src/app/icon.svg (the seal) and the glyph path inside it.
// Outputs: src/app/favicon.ico, src/app/apple-icon.png, public/icons/*.png
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const VERMILION = "#B83A2E";
const seal = await readFile(new URL("../src/app/icon.svg", import.meta.url), "utf8");
const glyph = seal.match(/ d="([^"]+)"/)?.[1];
if (!glyph) throw new Error("No glyph path found in src/app/icon.svg");

// Full-bleed vermilion with the glyph at the proportions of the Instagram
// master (glyph 250 by 304 on a 1080/2.3625 unit square). The glyph stays
// inside the central 80% circle, which is the Android maskable safe zone.
const UNIT = 1080 / 2.3625;
const bleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${UNIT} ${UNIT}"><rect width="100%" height="100%" fill="${VERMILION}"/><path fill="#FFFFFF" fill-rule="evenodd" transform="translate(${(UNIT - 250) / 2} ${(UNIT - 304) / 2})" d="${glyph}"/></svg>`;
// iOS rounds the corners itself, so the home screen icon is the seal squared off.
const square = seal.replace(/ rx="\d+"/, "");

// Set DAN_CHROMIUM to use a Chromium other than the one Playwright downloaded.
const browser = await chromium.launch(process.env.DAN_CHROMIUM ? { executablePath: process.env.DAN_CHROMIUM } : {});

async function render(svg, size, { transparent = false } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  const png = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return png;
}

// An .ico file is a small directory followed by ordinary PNG images.
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

const out = (path) => new URL(`../${path}`, import.meta.url);

const favicon = [];
for (const size of [16, 32, 48]) favicon.push({ size, png: await render(seal, size, { transparent: true }) });
await writeFile(out("src/app/favicon.ico"), ico(favicon));
await writeFile(out("src/app/apple-icon.png"), await render(square, 180));
await writeFile(out("public/icons/icon-192.png"), await render(seal, 192, { transparent: true }));
await writeFile(out("public/icons/icon-512.png"), await render(seal, 512, { transparent: true }));
await writeFile(out("public/icons/icon-maskable-512.png"), await render(bleed, 512));

await browser.close();
console.log("Rendered favicon.ico, apple-icon.png and public/icons/*.png");
