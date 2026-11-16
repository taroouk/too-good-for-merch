// P2-9: pure, dependency-free SVG safety check, split out from storage.ts so
// it can be unit tested without importing the Prisma client. See the usage
// site in storage.ts's uploadArtwork() for the full rationale: raw
// user-uploaded SVGs are rasterized server-side by sharp()/librsvg
// (src/studio/render/engines/sharp-renderer.ts, composite.ts), which has no
// sandbox equivalent to the CSP applied when serving SVGs back to a
// browser. This is a blocklist for the concrete, known-dangerous
// constructs (embedded scripts, event handler attributes, XXE via internal
// DTD subsets/external entities, and remote/file: resource references that
// librsvg would otherwise fetch during rasterization -- a known SSRF
// vector), not a guarantee of full SVG-spec safety.
const DANGEROUS_SVG_PATTERNS = [
  /<\s*script\b/i,
  /\bon[a-z]+\s*=/i, // onload=, onclick=, etc. event handler attributes
  /<!entity\b/i,
  /<!doctype\b[^>]*\[/i, // internal DTD subset, needed for entity expansion attacks
  /\bxlink:href\s*=\s*["']?\s*(https?:|ftp:|file:|javascript:)/i,
  /\bhref\s*=\s*["']?\s*(https?:|ftp:|file:|javascript:)/i,
  /<\s*(iframe|foreignobject|embed|object)\b/i,
  // Found by the site-wide test pass: constructs the list above let through.
  /<\s*[\w.-]+\s*:\s*(script|iframe|foreignobject|embed|object)\b/i, // namespace-prefixed elements, e.g. <svg:script>
  /\b(to|from|by|values)\s*=\s*["']?\s*javascript:/i, // <set>/<animate> that animate an href to a javascript: URL
  /\bhref\s*=\s*["']?\s*\/\//i, // protocol-relative remote reference
  /\bhref\s*=\s*["'][^"']*&#/i, // entity-encoded href (hides the scheme from the checks above)
  /@import\b/i, // CSS @import
  /\burl\(\s*["']?\s*(https?:|ftp:|file:|javascript:|\/\/)/i, // CSS url() to a remote or script target
];

export function isSvgContentSafe(buffer: Buffer) {
  const text = buffer.toString("utf8");
  return !DANGEROUS_SVG_PATTERNS.some((pattern) => pattern.test(text));
}
