import type { Session } from "./types";

export type PhotoSize = "thumb" | "large";

/**
 * Where a dish photo is: on the Dan cloud's one address, under the shop
 * (`/shops/<address name>/images/...`, DAN-45). None without a cloud, or
 * without a photo.
 */
export function photoSrc(
  session: Pick<Session, "cloudUrl" | "addressName"> | null | undefined,
  photo: string | null | undefined,
  size: PhotoSize,
): string | null {
  if (!photo || !/^images\/[0-9a-f]{64}$/.test(photo)) return null;
  const cloud = session?.cloudUrl?.replace(/\/+$/, "") ?? "";
  if (!cloud || !session?.addressName) return null;
  return `${cloud}/shops/${encodeURIComponent(session.addressName)}/${photo}/${size}.jpg`;
}

/** Longest side sent to the cloud, which shrinks it again to 1600. */
export const SEND_SIDE = 2000;

/**
 * Shrinks a photo on the tablet before it is sent: quicker on a shop's
 * connection, turned upright, and anything the browser can show (an
 * iPhone's HEIC included, on Safari) becomes a JPEG.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo cannot be read here. Choose a JPEG or PNG photo.");
  }
  const scale = Math.min(1, SEND_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare photos.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be prepared."))), "image/jpeg", 0.88),
  );
}
