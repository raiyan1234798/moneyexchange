import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractYouTubeId,
  isYouTubeUrl,
  normalizeImageLink,
  normalizeVideoLink,
} from "./media-links.ts";
import {
  extractGoogleDriveFileId,
  isGoogleDriveUrl,
  convertGoogleDriveToDirectUrl,
  inferVideoMimeType,
  validateVideoFile,
  deriveTitleFromUrl,
  validateExternalVideoUrl,
} from "./video-utils.ts";

describe("media-links: YouTube", () => {
  it("extracts id from youtu.be, watch?v=, shorts, embed", () => {
    assert.equal(extractYouTubeId("https://youtu.be/vqAqUs8tVqk"), "vqAqUs8tVqk");
    assert.equal(extractYouTubeId("https://www.youtube.com/watch?v=vqAqUs8tVqk&t=3"), "vqAqUs8tVqk");
    assert.equal(extractYouTubeId("https://youtube.com/shorts/abcdef12345"), "abcdef12345");
    assert.equal(extractYouTubeId("https://youtube.com/embed/abcdef12345"), "abcdef12345");
  });
  it("returns null for non-youtube", () => {
    assert.equal(extractYouTubeId("https://example.com/video.mp4"), null);
    assert.equal(extractYouTubeId(""), null);
    assert.equal(isYouTubeUrl("https://vimeo.com/123"), false);
    assert.equal(isYouTubeUrl("https://youtu.be/vqAqUs8tVqk"), true);
  });
});

describe("media-links: normalizeImageLink", () => {
  it("youtube -> thumbnail", () => {
    assert.equal(
      normalizeImageLink("https://youtu.be/vqAqUs8tVqk"),
      "https://img.youtube.com/vi/vqAqUs8tVqk/hqdefault.jpg",
    );
  });
  it("drive -> uc export view", () => {
    assert.equal(
      normalizeImageLink("https://drive.google.com/file/d/1AbC_dEfG/view?usp=sharing"),
      "https://drive.google.com/uc?export=view&id=1AbC_dEfG",
    );
  });
  it("direct image url unchanged; empty -> empty", () => {
    assert.equal(normalizeImageLink("https://cdn.site/x.png"), "https://cdn.site/x.png");
    assert.equal(normalizeImageLink("   "), "");
  });
});

describe("media-links: normalizeVideoLink", () => {
  it("youtube -> empty (not streamable in <video>)", () => {
    assert.equal(normalizeVideoLink("https://youtu.be/vqAqUs8tVqk"), "");
  });
  it("drive -> direct download stream", () => {
    assert.equal(
      normalizeVideoLink("https://drive.google.com/file/d/1AbC_dEfG/view"),
      "https://drive.usercontent.google.com/download?id=1AbC_dEfG&export=download",
    );
  });
  it("direct mp4 unchanged; empty -> empty", () => {
    assert.equal(normalizeVideoLink("https://cdn.site/x.mp4"), "https://cdn.site/x.mp4");
    assert.equal(normalizeVideoLink(""), "");
  });
});

describe("video-utils: Google Drive detection + id extraction", () => {
  it("detects drive hosts, rejects others", () => {
    assert.equal(isGoogleDriveUrl("https://drive.google.com/file/d/X/view"), true);
    assert.equal(isGoogleDriveUrl("https://drive.usercontent.google.com/download?id=X"), true);
    assert.equal(isGoogleDriveUrl("https://example.com/d/X"), false);
    assert.equal(isGoogleDriveUrl("not a url"), false);
  });
  it("extracts file id from /d/ and ?id= forms", () => {
    assert.equal(extractGoogleDriveFileId("https://drive.google.com/file/d/1AbC_dEf-G/view"), "1AbC_dEf-G");
    assert.equal(extractGoogleDriveFileId("https://drive.google.com/open?id=1AbC_dEf-G"), "1AbC_dEf-G");
    assert.equal(extractGoogleDriveFileId("https://drive.google.com/"), null);
  });
  it("convert throws on unreadable id", () => {
    assert.throws(() => convertGoogleDriveToDirectUrl("https://drive.google.com/"), /file ID/);
  });
});

describe("video-utils: file validation (security/format)", () => {
  const mkFile = (name, type, size) => ({ name, type, size });
  it("infers mime from type then extension", () => {
    assert.equal(inferVideoMimeType(mkFile("a.mp4", "video/mp4", 10)), "video/mp4");
    assert.equal(inferVideoMimeType(mkFile("a.MOV", "", 10)), "video/quicktime");
    // Unknown extension + no MIME type resolves to "" (falsy) — which
    // validateVideoFile then rejects as an unsupported format (the safe outcome).
    assert.equal(inferVideoMimeType(mkFile("a.unknown", "", 10)), "");
  });
  it("rejects disallowed format, empty and oversized files", () => {
    assert.throws(() => validateVideoFile(mkFile("a.exe", "application/x-msdownload", 10)), /Unsupported/);
    assert.throws(() => validateVideoFile(mkFile("a.mp4", "video/mp4", 0)), /empty/);
    assert.throws(() => validateVideoFile(mkFile("a.mp4", "video/mp4", 5 * 1024 * 1024 * 1024)), /exceeds/);
    assert.doesNotThrow(() => validateVideoFile(mkFile("a.mp4", "video/mp4", 1024)));
  });
});

describe("video-utils: external url validation + titles", () => {
  it("rejects non-http(s) and Google Vids editor links", () => {
    assert.throws(() => validateExternalVideoUrl("ftp://x/y.mp4"), /http/);
    assert.throws(() => validateExternalVideoUrl("javascript:alert(1)"), /valid URL|http/);
    assert.throws(() => validateExternalVideoUrl("https://docs.google.com/videos/d/X"), /Google Vids|not supported/i);
  });
  it("derives a readable title from a url path", () => {
    assert.equal(deriveTitleFromUrl("https://cdn.site/path/My%20Ad.mp4"), "My Ad");
    assert.equal(deriveTitleFromUrl("not a url"), "External video");
  });
});
