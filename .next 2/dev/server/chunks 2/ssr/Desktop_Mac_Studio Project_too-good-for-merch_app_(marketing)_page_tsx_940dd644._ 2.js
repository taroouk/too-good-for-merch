module.exports = [
"[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HomePage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Mac/Studio Project/too-good-for-merch/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Mac/Studio Project/too-good-for-merch/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/Mac/Studio Project/too-good-for-merch/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
;
function HeroTypewriterRestart() {
    const elRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const lines = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>[
            "FOR ARTISTS. EVENTS. BRANDS.",
            "THAT TAKE MERCH SERIOUSLY."
        ], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
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
        const render = ()=>{
            const done = lines.slice(0, lineIndex).join("\n");
            const current = lines[lineIndex]?.slice(0, charIndex) ?? "";
            const text = done ? `${done}\n${current}` : current;
            el.textContent = text;
        };
        const doRestart = ()=>{
            el.classList.add("flashOut");
            setTimeout(()=>{
                lineIndex = 0;
                charIndex = 0;
                el.textContent = "";
                el.classList.remove("flashOut");
            }, 160);
        };
        const tick = (now)=>{
            const delta = now - last;
            if (holdUntil && now < holdUntil) {
                raf = requestAnimationFrame(tick);
                return;
            }
            if (delta >= TYPE_SPEED) {
                last = now;
                if (lineIndex >= lines.length) {
                    holdUntil = now + HOLD_MS;
                    setTimeout(()=>{
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
        return ()=>cancelAnimationFrame(raf);
    }, [
        lines
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
        className: "heroTagline",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                ref: elRef,
                className: "typewriter"
            }, void 0, false, {
                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                lineNumber: 90,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "caret",
                "aria-hidden": "true"
            }, void 0, false, {
                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                lineNumber: 91,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
        lineNumber: 89,
        columnNumber: 5
    }, this);
}
function HomePage() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "lp",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "hero",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "heroMedia"
                    }, void 0, false, {
                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                        lineNumber: 100,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "heroInner",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(HeroTypewriterRestart, {}, void 0, false, {
                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                            lineNumber: 102,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                        lineNumber: 101,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                lineNumber: 99,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "enter",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "enterInner",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "enterWord",
                            children: "ENTER"
                        }, void 0, false, {
                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                            lineNumber: 108,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: "/studio",
                            className: "enterPanel",
                            "aria-label": "Enter Studio"
                        }, void 0, false, {
                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                            lineNumber: 109,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "enterWord",
                            children: "STUDIO"
                        }, void 0, false, {
                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                            lineNumber: 110,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                    lineNumber: 107,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                lineNumber: 106,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "section our-work",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "lpContainer narrow",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                className: "sectionTitle",
                                children: "we’ve done this at scale"
                            }, void 0, false, {
                                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                lineNumber: 116,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "sectionText",
                                children: [
                                    "We produce tour-level garments for artists, events, and licensed brands — where quality and timelines aren’t optional.",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                        lineNumber: 119,
                                        columnNumber: 13
                                    }, this),
                                    "From stadium tours to licensed global merch, we’ve delivered high-volume production under pressure",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                        lineNumber: 121,
                                        columnNumber: 13
                                    }, this),
                                    "without compromising finish, fit, or deadlines."
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                lineNumber: 117,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                        lineNumber: 115,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "lpContainer",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                    className: "card featured",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "cardMedia"
                                        }, void 0, false, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 129,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    children: "TAYLOR SWIFT | ERAS TOUR MERCH"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 131,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: "2023 – 2024"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 132,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "+1M printed T-shirts & Hoodies"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                        lineNumber: 134,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 133,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 130,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                    lineNumber: 128,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "stack",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                            className: "card",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "cardMedia"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 141,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "meta",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                            children: "ARTISTS | LICENSED MERCH"
                                                        }, void 0, false, {
                                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                            lineNumber: 143,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            children: "2023 – present"
                                                        }, void 0, false, {
                                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                            lineNumber: 144,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "+100K printed T-shirts & Hoodies"
                                                            }, void 0, false, {
                                                                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                                lineNumber: 146,
                                                                columnNumber: 21
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                            lineNumber: 145,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 142,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 140,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                            className: "card",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "cardMedia"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 152,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "meta",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                            children: "TV & MOVIES | LICENSED MERCH"
                                                        }, void 0, false, {
                                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                            lineNumber: 154,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            children: "2023 – present"
                                                        }, void 0, false, {
                                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                            lineNumber: 155,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "+100K printed T-shirts & Hoodies"
                                                            }, void 0, false, {
                                                                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                                lineNumber: 157,
                                                                columnNumber: 21
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                            lineNumber: 156,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 153,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 151,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                    lineNumber: 139,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                            lineNumber: 127,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                        lineNumber: 126,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                lineNumber: 114,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "section borderTop",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "lpContainer narrow",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                className: "sectionTitle",
                                children: "we’ve done boutique runs, too"
                            }, void 0, false, {
                                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                lineNumber: 168,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "sectionText",
                                children: [
                                    "Not every project needs a million units.",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                        lineNumber: 171,
                                        columnNumber: 13
                                    }, this),
                                    "Some need 30.",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                        lineNumber: 173,
                                        columnNumber: 13
                                    }, this),
                                    "We apply the same production standards, just at a different scale."
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                lineNumber: 169,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                        lineNumber: 167,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "lpContainer",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                    className: "card featured",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "cardMedia"
                                        }, void 0, false, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 181,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    children: "MK wedding | PARIS"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 183,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: "2024"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 184,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "30 printed T-shirts"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                        lineNumber: 186,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 185,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 182,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                    lineNumber: 180,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                    className: "card",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "cardMedia"
                                        }, void 0, false, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 192,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    children: "KN WEDDING | GOUNA"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 194,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: "2024"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 195,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "50 printed T-shirts"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                        lineNumber: 197,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 196,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 193,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                    lineNumber: 191,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                    className: "card",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "cardMedia"
                                        }, void 0, false, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 203,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    children: "FA WEDDING | CAIRO"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 205,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: "2026"
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 206,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "100 printed T-shirts"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                        lineNumber: 208,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                                    lineNumber: 207,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                            lineNumber: 204,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                    lineNumber: 202,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                            lineNumber: 179,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                        lineNumber: 178,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                lineNumber: 166,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                className: "contact",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "lpContainer contactGrid",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                children: [
                                    "YOUR BEST DROP ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                        lineNumber: 219,
                                        columnNumber: 28
                                    }, this),
                                    "STARTS HERE"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                lineNumber: 218,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "contactLinks",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                        href: "#",
                                        children: "Instagram"
                                    }, void 0, false, {
                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                        lineNumber: 224,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                        href: "#",
                                        children: "TikTok"
                                    }, void 0, false, {
                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                        lineNumber: 225,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                        href: "#",
                                        children: "WhatsApp"
                                    }, void 0, false, {
                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                        lineNumber: 226,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                        href: "#",
                                        children: "Email"
                                    }, void 0, false, {
                                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                        lineNumber: 227,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                                lineNumber: 223,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                        lineNumber: 217,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "contactFooterLogo",
                        "aria-hidden": "true",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$Mac$2f$Studio__Project$2f$too$2d$good$2d$for$2d$merch$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                            src: "/white.svg",
                            alt: ""
                        }, void 0, false, {
                            fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                            lineNumber: 232,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                        lineNumber: 231,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
                lineNumber: 216,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Desktop/Mac/Studio Project/too-good-for-merch/app/(marketing)/page.tsx",
        lineNumber: 98,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=Desktop_Mac_Studio%20Project_too-good-for-merch_app_%28marketing%29_page_tsx_940dd644._.js.map