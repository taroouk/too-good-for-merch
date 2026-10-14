// Pure helpers for the legal pages: a tiny markdown-lite parser (no
// dependency, no raw HTML -- output is data that React renders as text, so
// admin-entered content can never inject markup) plus validation.

export const LEGAL_SLUGS = ["terms", "privacy", "refunds"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export type Inline = { text: string; bold: boolean };
export type LegalBlock =
  | { type: "h2" | "h3"; text: string }
  | { type: "p"; inline: Inline[] }
  | { type: "ul"; items: Inline[][] };

export function parseInline(text: string): Inline[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((part) => part !== "");
  return parts.map((part) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));
}

// Supported: "## Heading", "### Subheading", "- list item", blank-line
// separated paragraphs, **bold**. Everything else is plain text.
export function parseLegalBody(body: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: Inline[][] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "p", inline: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "ul", items: list });
    list = [];
  };

  for (const rawLine of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
    } else if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h3", text: line.slice(4).trim() });
    } else if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("- ")) {
      flushParagraph();
      list.push(parseInline(line.slice(2).trim()));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

// "[LIKE THIS]" marks a business decision that still has to be filled in.
export function findPlaceholders(body: string): string[] {
  return body.match(/\[[A-Z0-9][^\]\n]{2,80}\]/g) ?? [];
}

export const MAX_LEGAL_BODY = 40_000;

export function legalPageProblem(input: { title: string; body: string }): string | null {
  if (input.title.trim().length < 3 || input.title.length > 120) return "Title must be 3–120 characters.";
  if (input.body.trim().length < 50) return "The page body is too short.";
  if (input.body.length > MAX_LEGAL_BODY) return `The page body is too long (max ${MAX_LEGAL_BODY.toLocaleString()} characters).`;
  return null;
}
