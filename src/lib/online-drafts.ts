import type { DemoState } from "./seed";
import type { CreateOrderInput } from "./types";

export const onlineDrafts: CreateOrderInput[] = [
  {
    source: "online",
    fulfilment: "collection",
    customerName: "Priya Shah",
    phone: "07700 900551",
    lines: [
      { number: 71, qty: 1 },
      { number: 80, qty: 1 },
    ],
  },
  {
    source: "online",
    fulfilment: "delivery",
    customerName: "Chris Hale",
    phone: "07700 900662",
    address: "22 Cassiobury Drive, Watford WD17 3AD",
    notes: "Leave it in the porch. No onion.",
    lines: [
      { number: 42, qty: 1 },
      { number: 81, qty: 1 },
      { number: 2, qty: 1 },
    ],
  },
  {
    source: "online",
    fulfilment: "collection",
    customerName: "Helen Brooks",
    phone: "07700 900884",
    lines: [
      { number: 23, qty: 1 },
      { number: 81, qty: 1 },
    ],
  },
  {
    source: "online",
    fulfilment: "delivery",
    customerName: "Sam Iqbal",
    phone: "07700 900190",
    address: "6 The Parade, Watford WD17 1LU",
    lines: [
      { number: 201, qty: 2 },
      { number: 100, qty: 2 },
    ],
  },
  {
    source: "online",
    fulfilment: "collection",
    customerName: "Grace Adeyemi",
    phone: "07700 900318",
    notes: "Sauce on the side.",
    lines: [
      { number: 52, qty: 1 },
      { number: 83, qty: 1 },
      { number: 90, qty: 1 },
    ],
  },
];

export function nextOnlineDraft(state: DemoState, random: () => number = Math.random): CreateOrderInput | null {
  const available = onlineDrafts.filter((draft) =>
    draft.lines.every((line) => {
      const item = state.items.find((entry) => entry.number === line.number);
      return item && !item.soldOut;
    }),
  );
  if (!available.length) return null;
  const index = Math.min(available.length - 1, Math.floor(random() * available.length));
  return available[index];
}
