// file: src/lib/__tests__/svg-safety.test.ts
import assert from "node:assert/strict";
import { isSvgContentSafe } from "../svg-safety";
import { runSuite } from "../../testing/test-harness";

function buf(text: string) {
  return Buffer.from(text, "utf8");
}

export async function runAll() {
  return runSuite("lib/svg-safety", {
    "a plain, harmless SVG is considered safe"() {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), true);
    },

    "an SVG with a data: URI image reference is safe"() {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), true);
    },

    "an SVG containing a <script> tag is rejected"() {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), false);
    },

    "an SVG with an onload event handler attribute is rejected"() {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), false);
    },

    "an SVG with an internal DTD subset declaring an entity (XXE) is rejected"() {
      const svg = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), false);
    },

    "an SVG referencing a remote xlink:href is rejected"() {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="https://evil.example/track.png"/></svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), false);
    },

    "an SVG referencing a file: href is rejected"() {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><a href="file:///etc/passwd">x</a></svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), false);
    },

    "an SVG with a javascript: href is rejected"() {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), false);
    },

    "an SVG containing a foreignObject element is rejected"() {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>hi</div></foreignObject></svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), false);
    },

    "an SVG containing an iframe element is rejected"() {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.example"></iframe></svg>`;
      assert.equal(isSvgContentSafe(buf(svg)), false);
    },
  });
}
