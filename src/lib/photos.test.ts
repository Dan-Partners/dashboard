import { describe, expect, it } from "vitest";
import { photoSrc } from "./photos";

const photo = `images/${"a".repeat(64)}`;

describe("dish photo addresses", () => {
  it("are on the cloud's one address, under the shop", () => {
    expect(photoSrc({ cloudUrl: "https://cloud.dan.partners/", addressName: "goldendragon" }, photo, "large")).toBe(
      `https://cloud.dan.partners/shops/goldendragon/${photo}/large.jpg`,
    );
    expect(photoSrc({ cloudUrl: "https://cloud.dan.partners", addressName: null }, photo, "large")).toBeNull();
  });

  it("are none without a cloud, without a photo, or for anything but a photo path", () => {
    expect(photoSrc({ cloudUrl: null, addressName: "x" }, photo, "thumb")).toBeNull();
    expect(photoSrc({ cloudUrl: "https://cloud.dan.partners", addressName: "x" }, null, "large")).toBeNull();
    expect(photoSrc({ cloudUrl: "https://cloud.dan.partners", addressName: "x" }, "https://evil.example/x.jpg", "large")).toBeNull();
    expect(photoSrc({ cloudUrl: "https://cloud.dan.partners", addressName: "x" }, `images/${"a".repeat(64)}/../x`, "large")).toBeNull();
  });
});
