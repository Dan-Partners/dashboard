import { redirect } from "next/navigation";

/** The kitchen is a view now. Old links and bookmarks still arrive. */
export default function KitchenPage() {
  redirect("/shop/view/kitchen");
}
