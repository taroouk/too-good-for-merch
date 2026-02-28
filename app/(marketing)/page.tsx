"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

function HeroTypewriterRestart() {
  const elRef = useRef<HTMLSpanElement | null>(null);

  const lines = useMemo(
    () => ["FOR ARTISTS. EVENTS. BRANDS.", "THAT TAKE MERCH SERIOUSLY."],
    []
  );

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let lineIndex = 0;
    let charIndex = 0;
    let raf = 0;
    let last = performance.now();

    const TYPE_SPEED = 45;
    const HOLD_MS = 1200;
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

export default function HomePage() {
  return (
    <main className="lp" id="hero">
      <section className="hero">
        <div className="heroMedia" />
        <div className="heroInner">
          <HeroTypewriterRestart />
        </div>
      </section>

      <section className="enter">
        <div className="enterInner">
          <span className="enterWord">ENTER</span>
          <Link href="/studio" className="enterPanel" aria-label="Enter Studio" />
          <span className="enterWord">STUDIO</span>
        </div>
      </section>

      <section className="section our-work" id="our-work">
        <div className="lpContainer narrow">
          <h2 className="sectionTitle">we’ve done this at scale</h2>
          <p className="sectionText">
            We produce tour-level garments for artists, events, and licensed brands — where quality and timelines aren’t optional.
            <br />
            From stadium tours to licensed global merch, we’ve delivered high-volume production under pressure
            <br />
            without compromising finish, fit, or deadlines.
          </p>
        </div>

        <div className="lpContainer">
          <div className="grid">
            <article className="card featured">
              <div className="cardMedia" />
              <div>
                <h3>TAYLOR SWIFT | ERAS TOUR MERCH</h3>
                <p>2023 – 2024</p>
                <p>
                  <strong>+1M printed T-shirts & Hoodies</strong>
                </p>
              </div>
            </article>

            <div className="stack">
              <article className="card">
                <div className="cardMedia" />
                <div className="meta">
                  <h3>ARTISTS | LICENSED MERCH</h3>
                  <p>2023 – present</p>
                  <p>
                    <strong>+100K printed T-shirts & Hoodies</strong>
                  </p>
                </div>
              </article>

              <article className="card">
                <div className="cardMedia" />
                <div className="meta">
                  <h3>TV & MOVIES | LICENSED MERCH</h3>
                  <p>2023 – present</p>
                  <p>
                    <strong>+100K printed T-shirts & Hoodies</strong>
                  </p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="section borderTop">
        <div className="lpContainer narrow">
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
          <div className="grid">
            <article className="card featured">
              <div className="cardMedia" />
              <div>
                <h3>MK wedding | PARIS</h3>
                <p>2024</p>
                <p>
                  <strong>30 printed T-shirts</strong>
                </p>
              </div>
            </article>

            <article className="card">
              <div className="cardMedia" />
              <div>
                <h3>KN WEDDING | GOUNA</h3>
                <p>2024</p>
                <p>
                  <strong>50 printed T-shirts</strong>
                </p>
              </div>
            </article>

            <article className="card">
              <div className="cardMedia" />
              <div>
                <h3>FA WEDDING | CAIRO</h3>
                <p>2026</p>
                <p>
                  <strong>100 printed T-shirts</strong>
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="contact">
        <div className="lpContainer contactGrid">
          <h2>
            YOUR BEST DROP <br />
            STARTS HERE
          </h2>

          <div className="contactLinks">
            <a href="#">Instagram</a>
            <a href="#">TikTok</a>
            <a href="#">WhatsApp</a>
            <a href="#">Email</a>
          </div>
        </div>

        <div className="contactFooterLogo" aria-hidden="true">
          <img src="/logo2.svg" alt="" />
        </div>
      </section>
    </main>
  );
}