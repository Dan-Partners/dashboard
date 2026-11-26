"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CREATE_ORDER_ROUTE } from "@/lib/focus";
import { writePersisted } from "@/lib/storage";

/**
 * The old Till address: someone who opens it wants the keypad, so this
 * device is set to till mode and sent to create order.
 */
export function TillRedirect() {
  const router = useRouter();
  useEffect(() => {
    writePersisted({ createMode: "till" });
    router.replace(CREATE_ORDER_ROUTE);
  }, [router]);
  return null;
}
