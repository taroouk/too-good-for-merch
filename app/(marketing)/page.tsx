// app/page.tsx (or wherever this component lives)
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const WHATSAPP_PHONE = "201118399923";
const WHATSAPP_MESSAGE =
  "Hi TGFM, I’d love a quote!\nWhat info do you need from me?";

const WHATSAPP_URL =
  `https://wa.me/${WHATSAPP_PHONE}?text=` + encodeURIComponent(WHATSAPP_MESSAGE);

function HeroTypewriterRestart() {
  const elRef = useRef<HTMLSpanElement | null>(null);

  const lines = useMemo(
    () => ["FOR ARTISTS.", "EVENTS.", "BRANDS.", "THAT TAKE", "MERCH SERIOUSLY."],
    []
  );

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let lineIndex = 0;
    let charIndex = 0;
    let raf = 0;
    let last = performance.now();

    const TYPE_SPEED = 60;
    const HOLD_MS = 1000;
    const GAP_MS = 120;

    let holdUntil = 0;

    const render = () => {
      const done = lines.slice(0, lineIndex).join("\n");
      const current = lines[lineIndex]?.slice(0, charIndex) ?? "";
      const text = done ? `${done}\n${current}` : current;
      el.textContent = text;
    };

    const doRestart = () => {
      el.classList.add("flashOut");
      setTimeout(() => {
        lineIndex = 0;
        charIndex = 0;
        el.textContent = "";
        el.classList.remove("flashOut");
      }, 160);
    };

    const tick = (now: number) => {
      const delta = now - last;

      if (holdUntil && now < holdUntil) {
        raf = requestAnimationFrame(tick);
        return;
      }

      if (delta >= TYPE_SPEED) {
        last = now;

        if (lineIndex >= lines.length) {
          holdUntil = now + HOLD_MS;
          setTimeout(() => {
            doRestart();
            holdUntil = performance.now() + 100;
          }, HOLD_MS);
          raf = requestAnimationFrame(tick);
          return;
        }

        const currentLine = lines[lineIndex];

        if (charIndex <= currentLine.length) {
          render();
          charIndex++;
        } else {
          lineIndex++;
          charIndex = 0;
          holdUntil = now + GAP_MS;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    el.textContent = "";
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [lines]);

  return (
    <p className="heroTagline">
      <span ref={elRef} className="typewriter" />
      <span className="caret" aria-hidden="true" />
    </p>
  );
}

type BoutiqueItem = {
  title: string;
  year: string;
  bullets: string[];
  imageSrc: string;
  imageAlt: string;
};

const BOUTIQUE_ITEMS: BoutiqueItem[] = [
  {
    title: "MK wedding | PARIS",
    year: "2024",
    bullets: ["Boutique run", "+30 printed T-shirts"],
    imageSrc: "/images/wedding1.jpg",
    imageAlt: "Paris Wedding",
  },
  {
    title: "KN WEDDING | GOUNA",
    year: "2024",
    bullets: ["Boutique run", "+50 printed T-shirts"],
    imageSrc: "/images/wedding2.jpg",
    imageAlt: "Gouna Wedding",
  },
  {
    title: "FA WEDDING | CAIRO",
    year: "2026",
    bullets: ["Boutique run", "+100 printed T-shirts"],
    imageSrc: "/images/wedding3.jpg",
    imageAlt: "Cairo Wedding",
  },
];

function BoutiqueSection() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const sectionRef = useRef<HTMLElement | null>(null);
  const narrowRef = useRef<HTMLDivElement | null>(null);

  const previewRef = useRef<HTMLDivElement | null>(null);

  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const setTargetFromPointer = (clientX: number, clientY: number) => {
    targetRef.current.x = clientX + 36;
    targetRef.current.y = clientY - 18;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 980px)");
    const onChange = () => setIsMobile(mq.matches);

    onChange();

    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateLeft = () => {
      if (!sectionRef.current || !narrowRef.current) return;
      const left = narrowRef.current.getBoundingClientRect().left;
      sectionRef.current.style.setProperty(
        "--boutique-left",
        `${Math.max(0, left)}px`
      );
    };

    updateLeft();
    window.addEventListener("resize", updateLeft);
    return () => window.removeEventListener("resize", updateLeft);
  }, []);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const ease = prefersReduced ? 1 : 0.14;

    const tick = () => {
      const el = previewRef.current;

      const tx = targetRef.current.x;
      const ty = targetRef.current.y;

      currentRef.current.x = lerp(currentRef.current.x, tx, ease);
      currentRef.current.y = lerp(currentRef.current.y, ty, ease);

      if (el && typeof window !== "undefined") {
        const PREVIEW_W = 220;
        const PREVIEW_H = 220;
        const M = 18;

        const halfW = PREVIEW_W / 2;
        const halfH = PREVIEW_H / 2;

        const w = window.innerWidth;
        const h = window.innerHeight;

        const clampedX = Math.min(
          Math.max(currentRef.current.x, M + halfW),
          w - M - halfW
        );
        const clampedY = Math.min(
          Math.max(currentRef.current.y, M + halfH),
          h - M - halfH
        );

        el.style.setProperty("--x", `${clampedX}px`);
        el.style.setProperty("--y", `${clampedY}px`);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const activeItem = BOUTIQUE_ITEMS[activeIdx];

  return (
    <section ref={sectionRef} className="section borderTop boutiqueSection">
      <div ref={narrowRef} className="lpContainer narrow">
        <h2 className="sectionTitle">we’ve done boutique runs, too</h2>
        <p className="sectionText">
          Not every project needs a million units.
          <br />
          Some need 30.
          <br />
          We apply the same production standards, just at a different scale.
        </p>
      </div>

      <div className="lpContainer">
        <div
          ref={previewRef}
          className="boutiquePreview"
          data-visible={!isMobile && visible}
          aria-hidden="true"
        >
          <div className="boutiquePreviewInner">
            <img
              className="boutiquePreviewImg"
              src={activeItem.imageSrc}
              alt={activeItem.imageAlt}
            />
          </div>
        </div>

        <div className="boutiqueBleed">
          <div className="boutiqueRows" role="list" aria-label="Boutique projects">
            {BOUTIQUE_ITEMS.map((item, i) => (
              <button
                key={`${item.title}-${i}`}
                type="button"
                className="boutiqueRow"
                role="listitem"
                data-active={activeIdx === i}
                onClick={() => setActiveIdx(i)}
                onPointerEnter={(e) => {
                  if (isMobile) return;
                  setActiveIdx(i);
                  setVisible(true);
                  setTargetFromPointer(e.clientX, e.clientY);
                  currentRef.current.x = e.clientX;
                  currentRef.current.y = e.clientY;
                }}
                onPointerMove={(e) => {
                  if (isMobile) return;
                  if (!visible) return;
                  setTargetFromPointer(e.clientX, e.clientY);
                }}
                onPointerLeave={() => {
                  if (isMobile) return;
                  setVisible(false);
                }}
                onFocus={(e) => {
                  setActiveIdx(i);

                  if (!isMobile) {
                    setVisible(true);
                    const rect = (
                      e.currentTarget as HTMLButtonElement
                    ).getBoundingClientRect();
                    const cx = rect.left + rect.width * 0.62;
                    const cy = rect.top + rect.height * 0.5;
                    setTargetFromPointer(cx, cy);
                    currentRef.current.x = cx;
                    currentRef.current.y = cy;
                  }
                }}
                onBlur={() => {
                  if (isMobile) return;
                  setVisible(false);
                }}
              >
                <div className="boutiqueLeft">
                  <h2 className="boutiqueTitle">{item.title}</h2>
                </div>

                <div className="boutiqueMeta">
                  <p>{item.year}</p>
                  
                  <p>• {item.bullets[1]}</p>
                </div>

                <div className="boutiqueThumb" aria-hidden="true">
                  <img src={item.imageSrc} alt="" />
                </div>
              </button>
            ))}
          </div>
        </div>

        <style>{`
          :root {
            --boutique-meta-w: 420px;
            --boutique-gap: 22px;
          }

          .boutiqueSection .boutiqueBleed {
            width: 100vw;
            margin-left: calc(50% - 50vw);
            padding-left: var(--boutique-left, clamp(28px, 4.5vw, 52px));
            padding-right: clamp(12px, 2vw, 24px);
          }

          .boutiqueSection .boutiqueRows {
            border-top: 0;
          }

          .boutiqueSection .boutiqueRow {
            width: 100%;
            text-align: left;
            background: transparent;
            border: 0;
            padding: 24px 0;
            cursor: pointer;

            position: relative;

            display: grid;
            grid-template-columns: minmax(0, 1fr) var(--boutique-meta-w);
            grid-template-areas: "left meta";
            gap: var(--boutique-gap);
            align-items: center;
          }

          .boutiqueSection .boutiqueRow:not(:last-child)::after {
            content: "";
            position: absolute;
            left: 0;
            right: calc(var(--boutique-meta-w) + var(--boutique-gap));
            bottom: 0;
            height: 1px;
            background: rgba(0,0,0,0.12);
          }

          .boutiqueSection .boutiqueRow:focus-visible {
            outline: 2px solid rgba(0,0,0,0.55);
            outline-offset: 10px;
            border-radius: 12px;
          }

          .boutiqueSection .boutiqueLeft {
            grid-area: left;
            min-width: 0;
          }

          .boutiqueSection .boutiqueTitle {
            margin: 0;
            font-size: 16px;
            line-height: 1.25;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .boutiqueSection .boutiqueMeta {
            grid-area: meta;
            justify-self: start;
            text-align: left;
            display: grid;
            gap: 6px;
          }

          .boutiqueSection .boutiqueMeta p {
            margin: 0;
          }

          .boutiqueSection .boutiqueThumb {
            display: none;
          }

          .boutiqueSection .boutiquePreview {
            position: fixed;
            left: 0;
            top: 0;
            z-index: 9999;
            transform: translate3d(var(--x, 0px), var(--y, 0px), 0);
            pointer-events: none;
            opacity: 0;
            transition: opacity 140ms ease;
          }

          .boutiqueSection .boutiquePreview[data-visible="true"] {
            opacity: 1;
          }

          .boutiqueSection .boutiquePreviewInner {
            width: 220px;
            height: 220px;
            border-radius: 14px;
            overflow: hidden;
            background: rgba(0,0,0,0.05);
            transform: translate(-50%, -50%) scale(0.98);
            transition: transform 180ms ease;
            box-shadow: 0 24px 60px rgba(0,0,0,0.18),
              0 2px 10px rgba(0,0,0,0.08);
          }

          .boutiqueSection
            .boutiquePreview[data-visible="true"]
            .boutiquePreviewInner {
            transform: translate(-50%, -50%) scale(1);
          }

          .boutiqueSection .boutiquePreviewImg {
            width: 100%;
            height: 100%;
            display: block;
            object-fit: cover;
            transform: scale(1.02);
          }

          @media (max-width: 980px) {
            /* ✅ أهم تعديل: نخلي المحتوى جوه الصفحة (Padding ثابت للموبايل) */
            .boutiqueSection .boutiqueBleed {
              width: 100%;
              margin-left: 0;
              padding-left: clamp(28px, 4.5vw, 52px);
              padding-right: clamp(28px, 4.5vw, 52px);
            }

            .boutiqueSection .boutiqueRow {
              grid-template-columns: minmax(0, 1fr) 118px;
              grid-template-areas:
                "left thumb"
                "meta thumb";
              gap: 14px;
              align-items: start;
              padding: 18px 0;
            }

            .boutiqueSection .boutiqueRow:not(:last-child)::after {
              right: 0;
            }

            .boutiqueSection .boutiqueMeta {
              justify-self: start;
              text-align: left;
              margin-top: 10px;
            }

            .boutiqueSection .boutiqueThumb {
              grid-area: thumb;
              display: block;
              border-radius: 12px;
              overflow: hidden;
              background: rgba(0,0,0,0.05);
              width: 118px;
              aspect-ratio: 1 / 1;
            }

            .boutiqueSection .boutiqueThumb img {
              width: 100%;
              height: 100%;
              display: block;
              object-fit: cover;
            }

            .boutiqueSection .boutiquePreview {
              display: none;
            }
          }
        `}</style>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className="lp" id="hero">
      <section className="hero">
        <div className="heroMedia">
          <img src="/images/hero.jpg" alt="Hero" />
        </div>
        <div className="heroInner">
          <HeroTypewriterRestart />
        </div>
      </section>

      <section className="enter">
        <div className="enterInner">
          <span className="enterWord">ENTER</span>
          <Link href="/studio" className="enterPanel">
            <img src="/images/enter.jpg" alt="Enter Studio" />
          </Link>
          <span className="enterWord">STUDIO</span>
        </div>
      </section>

      <section className="section our-work" id="our-work">
        <div className="lpContainer narrow">
          <h2 className="sectionTitle">we’ve done this at scale</h2>
          <p className="sectionText">
            We produce tour-level garments for artists, events, and licensed brands
            — where quality and timelines aren’t optional.
            <br />
            From stadium tours to licensed global merch, we’ve delivered high-volume
            production under pressure
            <br />
            without compromising finish, fit, or deadlines.
          </p>
        </div>

        <div className="lpContainer">
          <div className="grid">
            <article className="card">
              <div className="cardMedia">
                <img src="/images/taylor.jpg" alt="Taylor Swift Merch" />
              </div>
              <div>
                <h2>TAYLOR SWIFT | ERAS TOUR MERCH</h2>
                <p>2023 – 2024</p>
                <p>
                  <strong>+1M printed T-shirts & Hoodies</strong>
                </p>
              </div>
            </article>

            <article className="card">
              <div className="cardMedia">
                <img src="/images/artists.jpg" alt="Artists Merch" />
              </div>
              <div>
                <h2>ARTISTS | LICENSED MERCH</h2>
                <p>2023 – present</p>
                <p>
                  <strong>+100K printed T-shirts & Hoodies</strong>
                </p>
              </div>
            </article>

            <article className="card">
              <div className="cardMedia">
                <img src="/images/tv.jpg" alt="TV Merch" />
              </div>
              <div>
                <h2>TV & MOVIES | LICENSED MERCH</h2>
                <p>2023 – present</p>
                <p>
                  <strong>+100K printed T-shirts & Hoodies</strong>
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <BoutiqueSection />

      <section className="contact">
        <div className="lpContainer contactGrid">
          <h2>
            YOUR BEST DROP <br />
            STARTS HERE
          </h2>

          <div className="contactLinks">
            <a href="https://www.instagram.com/toogoodformerch">Instagram</a>
            <a href="https://www.tiktok.com/@toogoodformerch">TikTok</a>
            <a href={WHATSAPP_URL}>WhatsApp</a>
            <a
              href="mailto:hello@toogoodformerch.com"
              target="_blank"
              rel="noopener"
            >
              Email
            </a>
          </div>
        </div>

        <div className="contactFooterLogo" aria-hidden="true">
          <img src="/logo2.svg" alt="" />
        </div>
      </section>
    </main>
  );
}