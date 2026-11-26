"use client";

import QRCode from "qrcode";

/** The dark squares of a QR code, as rows of booleans. Medium error correction survives a crease or a splash. */
export function qrModules(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const rows: boolean[][] = [];
  for (let y = 0; y < modules.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < modules.size; x++) row.push(Boolean(modules.get(x, y)));
    rows.push(row);
  }
  return rows;
}

/** A QR code drawn as SVG squares (no HTML from the library), with the quiet zone scanners need. */
export function QrCode({ text, className = "", label }: { text: string; className?: string; label: string }) {
  const rows = qrModules(text);
  const quiet = 4;
  const size = rows.length + quiet * 2;
  const path = rows
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x + quiet} ${y + quiet}h1v1h-1z` : "")))
    .join("");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={label} shapeRendering="crispEdges" data-qr={text}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
