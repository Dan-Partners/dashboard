// A stand-in for Stripe's API, for local end-to-end runs only. Never the real Stripe.
//
//   node e2e/stand-ins/fake-stripe.mjs [port]      (default 9130)
//
// Point the Dan cloud at it with DAN_STRIPE_API_BASE=http://127.0.0.1:9130.
// It answers the few calls the cloud makes (accounts, payment intents,
// refunds) and remembers what was asked:
//
//   GET  /__state            what was asked: intents, refunds
//   POST /__refunds/fail     refunds from now on come back "failed"
//   POST /__refunds/ok       refunds succeed again (the default)
//   POST /__payouts/hold     the shop's account has payouts on hold
//   POST /__payouts/ok       payouts are on again (the default)
//
// For the shop server (DAN-35), on Dan's own account: the two prices by lookup
// key, customers, Checkout sessions and billing-page sessions. A test that
// needs a purchase to be paid sends the cloud Stripe's own notice
// (checkout.session.completed), signed with the billing webhook secret.
//
// It takes no card and moves no money. A test that needs a payment to have
// succeeded sends the cloud Stripe's own notice (payment_intent.succeeded),
// signed with the webhook secret the test cloud was given.
import http from "node:http";

const port = Number(process.argv[2] ?? process.env.PORT ?? 9130);
const state = { intents: [], refunds: [], refundsFail: false, payoutsHeld: false, customers: [], checkouts: [], portals: [] };
const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const form = Object.fromEntries(new URLSearchParams(raw));
      const path = new URL(req.url, "http://x").pathname;
      if (path === "/__state") return send(res, 200, state);
      // Stripe holding the shop's payouts (it needs something from the owner), or paying out again.
      if (path === "/__payouts/hold" || path === "/__payouts/ok") {
        state.payoutsHeld = path.endsWith("hold");
        return send(res, 200, { payoutsHeld: state.payoutsHeld });
      }
      if (path === "/__refunds/fail" || path === "/__refunds/ok") {
        state.refundsFail = path.endsWith("fail");
        return send(res, 200, { refundsFail: state.refundsFail });
      }
      // The shop server's prices on Dan's own account, as configured in the real one.
      if (path === "/v1/prices" && req.method === "GET") {
        return send(res, 200, { data: [
          { id: "price_e2e_setup", lookup_key: "dan_duo_setup", unit_amount: 9900, currency: "gbp", recurring: null, metadata: { compare_at_amount: "22000" }, product: { metadata: {} } },
          { id: "price_e2e_monthly", lookup_key: "dan_duo_maintenance_monthly", unit_amount: 500, currency: "gbp", recurring: { interval: "month" }, metadata: {}, product: { metadata: {} } },
        ] });
      }
      if (path === "/v1/customers" && req.method === "POST") {
        const id = `cus_e2e${Date.now().toString(36)}${state.customers.length + 1}`;
        state.customers.push({ id, email: form.email ?? null, shop: form["metadata[shop]"] ?? null });
        return send(res, 200, { id });
      }
      if (path === "/v1/checkout/sessions" && req.method === "POST") {
        const id = `cs_e2e${state.checkouts.length + 1}`;
        state.checkouts.push({ id, customer: form.customer, shop: form["metadata[shop]"] ?? null, success: form.success_url, cancel: form.cancel_url, prices: [form["line_items[0][price]"], form["line_items[1][price]"]] });
        return send(res, 200, { id, url: `https://checkout.stripe.test/${id}` });
      }
      if (path === "/v1/billing_portal/sessions" && req.method === "POST") {
        state.portals.push({ customer: form.customer, back: form.return_url });
        return send(res, 200, { id: `bps_e2e${state.portals.length}`, url: `https://billing.stripe.test/bps_e2e${state.portals.length}` });
      }
      if (path === "/v1/accounts" && req.method === "POST") return send(res, 200, { id: "acct_e2e", charges_enabled: false, details_submitted: false });
      const account = path.match(/^\/v1\/accounts\/([^/]+)$/);
      if (account) return send(res, 200, { id: account[1], charges_enabled: true, details_submitted: true, payouts_enabled: !state.payoutsHeld });
      if (path === "/v1/account_links") return send(res, 200, { url: "https://connect.stripe.test/onboarding" });
      if (path === "/v1/payment_intents" && req.method === "POST") {
        // Each run gets its own ids, so a restart never reuses one an order already holds.
        const id = `pi_e2e${Date.now().toString(36)}${state.intents.length + 1}`;
        const pending = form["metadata[pending_id]"] ?? null;
        state.intents.push({ id, account: req.headers["stripe-account"] ?? null, amount: form.amount, fee: form.application_fee_amount ?? null, pending });
        return send(res, 200, { id, client_secret: `${id}_secret_x`, status: "requires_payment_method", amount: Number(form.amount), amount_received: 0, currency: "gbp", metadata: { pending_id: pending } });
      }
      const intent = path.match(/^\/v1\/payment_intents\/([^/]+)(\/cancel)?$/);
      if (intent) return send(res, 200, { id: intent[1], client_secret: "x", status: intent[2] ? "canceled" : "requires_payment_method", amount: 0, amount_received: 0, currency: "gbp", metadata: {} });
      if (path === "/v1/refunds" && req.method === "POST") {
        // As Stripe does: the same idempotency key is the same refund, never a second one.
        const key = req.headers["idempotency-key"] ?? null;
        const before = key ? state.refunds.find((refund) => refund.key === key) : null;
        if (before) return send(res, 200, { id: before.id, status: before.status, amount: before.amount });
        const paid = state.intents.find((entry) => entry.id === form.payment_intent);
        const refund = {
          id: `re_e2e${state.refunds.length + 1}`,
          key,
          paymentIntent: form.payment_intent ?? null,
          account: req.headers["stripe-account"] ?? null,
          feeRefunded: form.refund_application_fee === "true",
          amount: Number(paid?.amount ?? 0),
          status: state.refundsFail ? "failed" : "succeeded",
        };
        state.refunds.push(refund);
        return send(res, 200, { id: refund.id, status: refund.status, amount: refund.amount });
      }
      return send(res, 404, { error: { code: "resource_missing", message: path } });
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`fake Stripe on ${port}`));
