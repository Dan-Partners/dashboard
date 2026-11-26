import { redirect } from "next/navigation";

/** The pass is a view now. Old links and bookmarks still arrive. */
export default function PassPage() {
  redirect("/shop/view/pass");
}
