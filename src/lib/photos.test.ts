import { describe, expect, it } from "vitest";
import { photoSrc } from "./photos";

const photo = `images/${"a".repeat(64)}`;

describe("dish photo addresses", () => {
  it("are on the cloud's one address, under the shop", () => {
    expect(photoSrc({ cloudUrl: "https://cloud.dan.partners/", addressName: "goldendragon", shopAddress: "https://goldendragon.dan.partners" }, photo, "large")).toBe(
      `https://cloud.dan.partners/shops/goldendragon/${photo}/large.jpg`,
    );
    expect(photoSrc({ cloudUrl: "https://cloud.dan.partners", addressName: null }, photo, "large")).toBeNull();
  });

  it("are at the shop's own address for a session from before the one address", () => {
    expect(photoSrc({ cloudUrl: "https://goldendragon.dan.partners/staff" }, photo, "thumb")).toBe(
      `https://goldendragon.dan.partners/${photo}/thumb.jpg`,
    );
  });

  it("are none without a cloud, without a photo, or for anything but a photo path", () => {
    expect(photoSrc({ cloudUrl: null }, photo, "thumb")).toBeNull();
    expect(photoSrc({ cloudUrl: "https://x.dan.partners/staff" }, null, "large")).toBeNull();
    expect(photoSrc({ cloudUrl: "https://x.dan.partners/staff" }, "https://evil.example/x.jpg", "large")).toBeNull();
    expect(photoSrc({ cloudUrl: "https://x.dan.partners/staff" }, `images/${"a".repeat(64)}/../x`, "large")).toBeNull();
  });
});
