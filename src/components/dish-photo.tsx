"use client";

import { useState } from "react";
import { photoSrc, type PhotoSize } from "@/lib/photos";
import { useShop } from "@/lib/shop-context";

/**
 * A dish's photo from the Dan cloud. Nothing at all when there is none, or
 * when it cannot load (no internet at the counter): never a broken image.
 */
export function DishPhoto({ photo, size, className = "", alt = "" }: { photo: string | null | undefined; size: PhotoSize; className?: string; alt?: string }) {
  const { persisted } = useShop();
  const src = photoSrc(persisted.session, photo, size);
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return null;
  return (
    // A plain img: the photo is on the shop's cloud address, already sized there.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" decoding="async" className={`object-cover ${className}`} onError={() => setFailed(src)} data-testid="dish-photo" />
  );
}
