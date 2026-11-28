import crypto from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The owner cancels an order paid by card, and the card is refunded: end to
 * end through a real shop server and a real Dan cloud, with the stand-in
 * Stripe in e2e/stand-ins/fake-stripe.mjs. Never the real Stripe.
 *
 * The cloud must be run with its Stripe keys pointed at the stand-in
 * (DAN_STRIPE_API_BASE), the shop's Stripe account connected and Dan's terms
 * accepted (as e2e/deal.spec.ts leaves it). The stand-in takes no card: the
 * test sends the cloud Stripe's own "payment succeeded" notice, signed with
 * the webhook secret the cloud was given.
 *
 * Run it by itself (DAN_E2E_REFUND=1): the cloud limits how many orders one
 * address may place in a few minutes, and a full run from one machine is
 * already close to that.
 *
 *   DAN_E2E_REFUND=1 DAN_E2E_SERVER_URL=… DAN_E2E_PUBLIC_URL=… DAN_E2E_CUSTOMER_ORIGIN=… \
 *   DAN_E2E_OWNER_EMAIL=… DAN_E2E_OWNER_PASSWORD=… \
 *   DAN_E2E_FAKE_STRIPE=http://127.0.0.1:9130 DAN_E2E_STRIPE_WEBHOOK_SECRET=… npx playwright test refund
 */
const server = process.env.DAN_E2E_SERVER_URL;
const publicApi = process.env.DAN_E2E_PUBLIC_URL;
/** The shop the customer's calls name on the cloud's one address (DAN-45). */
const shopName = process.env.DAN_E2E_SHOP ?? "goldendragon";
const customerSite = process.env.DAN_E2E_CUSTOMER_ORIGIN;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const fakeStripe = process.env.DAN_E2E_FAKE_STRIPE;
const webhookSecret = process.env.DAN_E2E_STRIPE_WEBHOOK_SECRET ?? "";

type Asked = {
  intents: { id: string; account: string | null; amount: string; pending: string | null }[];
  refunds: { paymentIntent: string | null; account: string | null; feeRefunded: boolean; amount: number; status: string }[];
};
const asked = async () => (await (await fetch(`${fakeStripe}/__state`)).json()) as Asked;
const refundsFail = (fail: boolean) => fetch(`${fakeStripe}/__refunds/${fail ? "fail" : "ok"}`, { method: "POST" });

/** A customer's card order, paid: placed through the cloud, then Stripe's notice that the payment succeeded (to the cloud's Connect webhook, DAN-48). */
async function paidCardOrder(request: APIRequestContext, name: string) {
  const placed = await request.post(`${publicApi}/graphql?shop=${shopName}`, {
    headers: { origin: customerSite! },
    data: {
      query: "mutation($i: PlaceOrderInput!) { placeOrder(input: $i) { order { totalPence clientSecret } } }",
      variables: { i: { customerName: name, phone: "07700 900555", lines: [{ number: 81, qty: 2 }], payWith: "card", allergensConfirmed: true } },
    },
  });
  const answer = (await placed.json()) as { data?: { placeOrder: { order: { totalPence: number; clientSecret: string } } }; errors?: { message: string }[] };
  expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
  const { totalPence, clientSecret } = answer.data!.placeOrder.order;
  const id = clientSecret.split("_secret")[0];
  const intent = (await asked()).intents.find((entry) => entry.id === id)!;
  const body = JSON.stringify({
    type: "payment_intent.succeeded",
    account: intent.account,
    data: { object: { id, client_secret: "x", status: "succeeded", amount: totalPence, amount_received: totalPence, currency: "gbp", metadata: { pending_id: intent.pending } } },
  });
  const at = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", webhookSecret).update(`${at}.${body}`).digest("hex");
  const noticed = await request.post(`${publicApi}/webhooks/stripe`, { headers: { "stripe-signature": `t=${at},v1=${signature}`, "content-type": "application/json" }, data: body });
  expect(noticed.status()).toBe(200);
  return { intent: id, totalPence };
}

async function signIn(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
}

test.afterAll(async () => {
  if (fakeStripe) await refundsFail(false);
});

test("the owner cancels a card order: the cloud refunds the card through Stripe, once; a refund Stripe cannot make is shown", async ({ page, request }) => {
  test.skip(
    !process.env.DAN_E2E_REFUND || !server || !publicApi || !customerSite || !ownerEmail || !fakeStripe || !webhookSecret,
    "Run by itself with DAN_E2E_REFUND=1, the shop server, the shop's public address, the owner's sign-in and the stand-in Stripe.",
  );
  test.setTimeout(180_000);
  await refundsFail(false);
  const stamp = Date.now().toString(36);
  const name = `Refund ${stamp}`;
  const paid = await paidCardOrder(request, name);
  expect(paid.totalPence).toBe(780);

  // The paid order reaches the shop's board through the cloud.
  await signIn(page);
  const onBoard = (who: string) => page.locator("section[data-column] article").filter({ visible: true }).filter({ hasText: who });
  await expect(onBoard(name)).toBeVisible({ timeout: 20_000 });
  await expect(onBoard(name).getByTestId("docket-payment")).toHaveText("Paid by card");
  await onBoard(name).getByTestId("docket-edit").click();

  // What will be refunded is said first; the second tap names it.
  const screen = page.getByTestId("order-screen").filter({ visible: true });
  const cancel = screen.getByTestId("order-cancel");
  await expect(cancel.getByTestId("cancel-plan")).toContainText("£7.80 will be refunded to the customer's card, in full.");
  await cancel.getByTestId("cancel-start").click();
  await expect(cancel.getByTestId("cancel-confirm")).toHaveText(/and refund £7\.80$/);
  expect((await asked()).refunds.filter((refund) => refund.paymentIntent === paid.intent)).toHaveLength(0);
  await cancel.getByTestId("cancel-confirm").click();
  await expect(screen.getByTestId("order-cancelled-note")).toBeVisible();

  // The cloud sees the cancel, refunds the payment through Stripe, and this tablet is told with no reload.
  const note = screen.getByTestId("refund-note");
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute("data-refund", "refunded", { timeout: 60_000 });
  await expect(note).toHaveText("£7.80 refunded to the card.");
  await expect(screen.getByTestId("order-record").getByTestId("record-entry").first()).toContainText("Card refund asked for: £7.80");
  // Once, in full, on the shop's own Stripe account, with Dan's fee on that payment returned.
  await page.waitForTimeout(12_000);
  const refunds = (await asked()).refunds.filter((refund) => refund.paymentIntent === paid.intent);
  expect(refunds).toHaveLength(1);
  expect(refunds[0]).toMatchObject({ status: "succeeded", amount: 780, feeRefunded: true, account: "acct_e2e" });

  // A refund Stripe cannot make: the order says so, and so does the Orders page.
  await refundsFail(true);
  const second = `Refund fails ${stamp}`;
  await paidCardOrder(request, second);
  await screen.getByRole("link", { name: "← Back to orders" }).click();
  await expect(onBoard(second)).toBeVisible({ timeout: 20_000 });
  const number = (await onBoard(second).getByTestId("docket-number").textContent())!.trim();
  await onBoard(second).getByTestId("docket-edit").click();
  await expect(screen.getByRole("heading", { name: `Order ${number}` })).toBeVisible();
  await cancel.getByTestId("cancel-start").click();
  await cancel.getByTestId("cancel-confirm").click();
  await expect(note).toHaveAttribute("data-refund", "failed", { timeout: 60_000 });
  await expect(note).toHaveText("The card refund failed. Refund this in Stripe: £7.80.");
  await screen.getByRole("link", { name: "← Back to orders" }).click();
  await expect(page.getByTestId("refund-failed").filter({ visible: true })).toContainText(number);
});
