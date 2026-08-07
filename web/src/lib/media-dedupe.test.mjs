import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mediaIdentityKeys, uniqueByMediaKey } from "./media-identity.ts";

describe("mediaIdentityKeys", () => {
  it("matches same file across query/hash variants", () => {
    const a = mediaIdentityKeys("https://cdn.example.com/promo.mp4?x=1#t", "videos/a.mp4");
    const b = mediaIdentityKeys("https://cdn.example.com/promo.mp4", "videos/a.mp4");
    assert.ok(a.some((k) => b.includes(k)));
  });

  it("uses storage path and full data URLs", () => {
    const keys = mediaIdentityKeys("data:image/png;base64,abc", null);
    assert.ok(keys.includes("url:data:image/png;base64,abc"));
    assert.deepEqual(mediaIdentityKeys(null, "images/hi.png"), ["path:images/hi.png"]);
  });
});

describe("uniqueByMediaKey", () => {
  it("keeps the first of identical URLs", () => {
    const out = uniqueByMediaKey([
      { downloadUrl: "https://cdn.example.com/a.png", title: "1" },
      { downloadUrl: "https://cdn.example.com/a.png?cache=1", title: "2" },
      { downloadUrl: "https://cdn.example.com/b.png", title: "3" },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].title, "1");
    assert.equal(out[1].title, "3");
  });
});
