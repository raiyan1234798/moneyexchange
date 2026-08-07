import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateMediaItemBytes } from "./media-item-bytes.ts";

describe("estimateMediaItemBytes", () => {
  it("prefers fileSizeBytes when set", () => {
    assert.equal(
      estimateMediaItemBytes({ fileSizeBytes: 2048, downloadUrl: "data:image/png;base64,xxxx" }),
      2048,
    );
  });

  it("estimates data URL payload size", () => {
    const payload = "a".repeat(1000);
    const bytes = estimateMediaItemBytes({ downloadUrl: `data:image/png;base64,${payload}` });
    assert.equal(bytes, Math.ceil(1000 * 0.75));
  });

  it("returns 0 for remote URLs without size", () => {
    assert.equal(estimateMediaItemBytes({ downloadUrl: "https://cdn.example.com/a.mp4" }), 0);
  });
});
