import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalPage } from "src/lib/legal";
import { isLegalSlug, parseLegalBody, type Inline } from "src/lib/legal-format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return {};
  const page = await getLegalPage(slug);
  return { title: `${page.title} · Too Good For Merch` };
}

function renderInline(parts: Inline[]) {
  return parts.map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>));
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const page = await getLegalPage(slug);
  const blocks = parseLegalBody(page.body);

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "120px 24px 80px", color: "#0b0b0b", lineHeight: 1.65 }}>
      <p style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", opacity: 0.5, margin: 0 }}>Too Good For Merch</p>
      <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", lineHeight: 1.1, margin: "12px 0 8px", fontWeight: 700 }}>{page.title}</h1>
      {page.updatedAt ? (
        <p style={{ fontSize: 13, opacity: 0.55, margin: "0 0 32px" }}>
          Last updated {page.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      ) : (
        <div style={{ height: 24 }} />
      )}

      {blocks.map((block, index) => {
        if (block.type === "h2") return <h2 key={index} style={{ fontSize: 20, fontWeight: 700, margin: "32px 0 8px" }}>{block.text}</h2>;
        if (block.type === "h3") return <h3 key={index} style={{ fontSize: 16, fontWeight: 700, margin: "20px 0 6px" }}>{block.text}</h3>;
        if (block.type === "ul") {
          return (
            <ul key={index} style={{ margin: "8px 0 8px 20px", padding: 0, listStyle: "disc" }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ margin: "4px 0" }}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "p") return <p key={index} style={{ margin: "8px 0" }}>{renderInline(block.inline)}</p>;
        return null;
      })}
    </main>
  );
}
