import { describe, expect, it } from "vitest";
import { webhookAddress } from "./uber";

describe("Uber's notice address", () => {
  it("is on the cloud's one address, by the shop's address name (DAN-45)", () => {
    expect(webhookAddress("https://cloud.dan.partners", "goldendragon")).toBe("https://cloud.dan.partners/webhooks/uber/goldendragon");
    expect(webhookAddress("http://localhost:2290/", "lotus-house")).toBe("http://localhost:2290/webhooks/uber/lotus-house");
  });

  it("is none without a cloud or a plain address name", () => {
    expect(webhookAddress(null, "goldendragon")).toBeNull();
    expect(webhookAddress("https://cloud.dan.partners", null)).toBeNull();
    expect(webhookAddress("https://cloud.dan.partners", "../admin")).toBeNull();
    expect(webhookAddress("not a url", "goldendragon")).toBeNull();
  });
});
