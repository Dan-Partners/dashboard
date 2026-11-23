import { Suspense } from "react";
import { ShopFrame } from "@/components/shop-frame";
import { Splash } from "@/components/ui";

export const instant = false;

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Splash />}>
      <ShopFrame>{children}</ShopFrame>
    </Suspense>
  );
}
