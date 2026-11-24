import { inLondonRange } from "./format";
import type { Order, SalesRange, SalesSummary, SalesTopItem } from "./types";

export function summarizeSales(orders: Order[], range: SalesRange, now: Date): SalesSummary {
  const picked = orders.filter((order) => inLondonRange(order.createdAt, range, now));
  const totalPence = picked.reduce((sum, order) => sum + order.totalPence, 0);
  const top = new Map<number, SalesTopItem>();

  for (const order of picked) {
    for (const line of order.lines) {
      const current = top.get(line.number) ?? {
        number: line.number,
        nameEn: line.nameEn,
        nameZh: line.nameZh,
        qty: 0,
        totalPence: 0,
      };
      current.qty += line.qty;
      current.totalPence += line.qty * line.unitPricePence;
      top.set(line.number, current);
    }
  }

  const topItems = [...top.values()].sort((a, b) => b.qty - a.qty || b.totalPence - a.totalPence).slice(0, 5);

  return {
    range,
    orderCount: picked.length,
    totalPence,
    averagePence: picked.length ? Math.round(totalPence / picked.length) : 0,
    collectionCount: picked.filter((order) => order.fulfilment === "collection").length,
    deliveryCount: picked.filter((order) => order.fulfilment === "delivery").length,
    eatInCount: picked.filter((order) => order.fulfilment === "eat_in").length,
    openCount: picked.filter((order) => order.status !== "completed").length,
    topItems,
  };
}
