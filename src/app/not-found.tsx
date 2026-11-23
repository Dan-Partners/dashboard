import Link from "next/link";
import { DanMark } from "@/components/mark";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-5">
      <DanMark size={56} title="Dan" />
      <h1 className="mt-4 font-display text-5xl">Not on this slip</h1>
      <p className="mt-3 text-ink-soft">That page is not part of the counter.</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center font-display text-accent-ink">
        Back to Dan
      </Link>
    </main>
  );
}
