# تقرير التعديلات — TGFM Studio Feedback (قبل / بعد)

"قبل" = آخر commit (`babb975`). "بعد" = الشغل الحالي (لم يتم commit).
الإجمالي: 29 ملف معدّل (+706 / −365) و4 إضافات جديدة. نتائج الفحص: typecheck نظيف، lint 0 errors، اختبارات payments 288 ناجحة، render 323 ناجحة.

## 1. صفحة Studio

| # | قبل | بعد | الملفات |
|---|-----|-----|---------|
| 1.1 | تغيير المقاس يومّض "Calculating..." | كاش للسعر بمفتاح (منتج، قماش، كمية، placements)؛ المقاس خارج المفتاح؛ آخر سعر يفضل ظاهر أثناء التحميل | `BuilderClient.tsx` |
| 1.2 | USD حسب إعداد الأدمن | EGP تلقائيًا لو سعر الصرف متسجل (الإعداد المخزّن لم يعد يرجّع USD) | `pricing/display.ts` |
| 1.3 | `EGP 521.33` (تحويل بالقروش) | أرقام صحيحة `EGP 525`، والتحصيل في Paymob بنفس التقريب (مضاعفات 100 قرش) | `pricing/currency.ts`, `display.ts`, checkout, orders |
| 1.4 | "Enter Studio" يفتح آخر مشروع بكميته القديمة (500) | `/studio` يرجّع الكمية 1 عند الدخول | `app/studio/page.tsx` |
| 1.5 | خط عناصر القائمة 10px | اسم 16px ووصف 14px (مطابق للصندوق المختار) | `globals.css` |
| 1.6 | صورة الضهر شكلها مولَّد | **لم يتغير** — يحتاج صورة حقيقية | — |
| 1.7 | "Constructed from 100% organic cotton, the Archive" | `100% cotton, {GSM}, printed to order just for you.` والـGSM يتغير بالقماش | `BuilderClient.tsx` |

## 2. نافذة Bespoke
- 2.1: "TGFM Bespoke" → "Made for you"؛ النص الجديد؛ الزرار → "Continue on WhatsApp" (`ArtworkModal.tsx`).
- 2.2: الزرار كان يفتح Build Your T-shirt؛ الآن يفتح واتساب في تبويب جديد برسالة فيها اللون والقماش والمقاس والكمية. "Request a Quote" نفس السلوك (`BuilderClient.tsx`).
- 4.3: Bespoke لم يعد يغيّر المنتج المختار؛ مسودات CUSTOM القديمة بدون عرض سعر تفتح كـ Fitted؛ سطر "Incl. VAT…" اتشال من عرض Bespoke.

## 3. نافذة Build Your T-shirt
- 3.1: أزرار الـPlacement من PNG صغير (~74×84) → SVG في `public/images/placements/` (6 ملفات).
- 3.2: شريط أسود بسطرين → كارت أبيض سطر واحد: "Drag your image into the frame" + Place it + ×.
- 3.3: لا يتم إلغاء رابط الـblob قبل ما النسخة المحفوظة تجهز؛ أي صورة تفشل في التحميل تُشال من الشيرت ومن Uploads وتظهر "This image couldn't be uploaded. Please try a PNG or JPG."
- 3.4: السبب المرجّح كان placement قديم محفوظ؛ يُعالج مع 3.6.
- 3.5: الصورة مقصوصة عند حدود الإطار (clip-path) + خط متقطع أثناء التعديل.
- 3.6: أول فتح بتصميم قديم يسأل "Continue your last design?" (Continue / Start fresh)؛ تغيير اللون/المقاس/القماش في نفس الزيارة لا يسأل.
- 8.2: اسمَا Left/Right Chest اتبدّلوا لجهة اللابس (`placementLabel` + كروت الـBuilder).
- 8.5: إزالة زرار "+Add" المكرر؛ بقي YOUR UPLOADS.

## 4. توليد الـMockup
- 4.2: `top_k` اتشال من `generation_config`. كل أخطاء Gemini للعميل = "We couldn't create your preview. Please try again." والتفاصيل في الـlog.
- 4.1: Save كان يظل "Generating..." داخل النافذة؛ الآن يحفظ التصميم ويقفل النافذة، والتوليد يحصل في صفحة Studio مع "Creating your preview…" وعند الفشل زرار Try again.

## 5. Bag / Wishlist / Orders
- مكوّن جديد `ProductCard.tsx` (نفس العرض والصورة والخطوط والأزرار السودا المتباعدة) في شبكة 3 أعمدة للثلاث صفحات.
- 5.3: صياغة الحالات (Payment pending، Confirmed، In production، Shipped، Delivered، Cancelled) + عنوان فرعي "N order · Track your orders and deliveries."
- Orders: من صفوف طويلة إلى كروت.

## 6. Checkout
- 6.1: سهم Country بمسافة يمين (`.tgfm-select`).
- 6.2: سطر `≈ $… charged in EGP` اتشال (وكذلك سطر "Priced at $…" من صفحة الأوردر).
- 6.3: **لم يتغير في الكود** — يتطلب إنشاء iframe مضغوط في لوحة Paymob وتغيير `PAYMOB_IFRAME_ID`.

## 7. ميزات جديدة
- 7.1: زرار BUY NOW بنفس حجم Build؛ يذهب للـcheckout مباشرة (ويمر على تسجيل الدخول لو لازم).
- 7.2: Wishlist يحفظ كل التصميم (layers، zoom/rotation، mockups، المقاس) في عمود `design` الجديد؛ "Open in Studio" يعيد تحميله. تتطلب migration `20261105120000_wishlist_full_design`.

## 8. أخرى
- 8.1: صور Bag/Wishlist/Orders/Checkout (`lib/mockup-preview.ts`): الـmockup يُستخدم فقط لو بصمته تطابق التصميم الحالي، وإلا يظهر التيشيرت العادي بالقصة واللون الصح.
- 8.3: **لم يتغير** — بانتظار تأكيد Malak.
- 8.4: القائمة واحدة (Home/Portfolio/Contact + Studio داخل الاستوديو)، والزرار "Open Studio" في كل مكان.
- 8.6: خط وتباعد BUILD YOUR T-SHIRT مطابق لباقي الأزرار.

## ملفات جديدة
`src/components/site/ProductCard.tsx`, `src/lib/mockup-preview.ts`, `public/images/placements/*.svg`, `prisma/migrations/20261105120000_wishlist_full_design/`.

## اختبارات اتعدّلت لتطابق السلوك الجديد
`currency`, `display`, `totals`, `placements`, `admin-logic` (nav).

## مخاطر ونقاط مراجعة
1. شغّل `prisma migrate deploy` قبل النشر وإلا صفحة Wishlist تفشل.
2. التقريب لجنيه صحيح يغيّر مبالغ التحصيل مقارنة بالقديم (مضاعفات 100 قرش).
3. تبديل أسماء الـChest يغيّر النص في الأدمن وملفات التصدير للأوردرات القديمة (المفاتيح الداخلية لم تتغير، والموضع الفعلي كما هو).
4. أسباب 1.1 و3.3 و3.4 لم أستطع إعادة إنتاجها محليًا؛ المعالجة دفاعية وتحتاج تجربة على الموقع.
5. لم يتم تشغيل الموقع في المتصفح ولم أعمل commit.
