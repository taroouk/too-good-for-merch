# تقرير الاختبار الكامل — Too Good For Merch
تاريخ الفحص: 2026-10-10 · الفرع: Production · Next 16.2.6 / Prisma 5.22

## الخلاصة
- **لا توجد أعطال في الكود الحالي:** typecheck, lint (0 errors), 529 اختبار وحدة (322 render + 207 payments), build, migrations كلها ناجحة.
- **مشاكل تحتاج قرار:** (1) ثغرات في الاعتماديات (Next/next-auth/sharp) (2) `check:prod` يفشل بسبب `NEXTAUTH_URL` المحلي (3) لا توجد اختبارات end-to-end (4) 15 warning.
- **لا يمكن القول 100%** لأن رحلات المستخدم الكاملة (دخول، Studio، Checkout/Paymob، الأدمن، Gemini، الإيميل/واتساب) لم تُختبر عملياً: لا توجد قاعدة بيانات تجريبية و`.env` يشير إلى Neon الحقيقية.

## 0) تحديث بعد الإصلاح (2026-10-10)
- تمت الترقية: next 16.2.6→16.4.0، next-auth 4.24.14→4.24.15، sharp 0.34.5→0.35.5. `npm audit --omit=dev` الآن: **0 ثغرات**.
- sharp 0.35 غيّر الـ types (لا يوجد namespace `sharp.X`)، فتم تعديل 3 ملفات لاستخدام `type Metadata/OutputInfo/Sharp`.
- حذف `import Image` غير المستخدم → 14 warning (كلها `<img>` + متغير مقصود في preview-blend).
- أعيدت كل الفحوصات بعد التغيير: typecheck ✅ lint ✅ render 322/322 ✅ payments 207/207 ✅ build ✅ smoke ✅ وsharp يعمل فعلياً.
- التغييرات غير مرفوعة (uncommitted). البند 1 في جدول المشاكل أدناه أصبح محلولاً.

## 1) الفحوصات الآلية
| الفحص | النتيجة |
|---|---|
| `npm run typecheck` | ✅ 0 أخطاء |
| `npm run lint` | ✅ 0 errors / ⚠️ 15 warnings |
| `npm run test:render` | ✅ 322/322 |
| `npm run test:payments` | ✅ 207/207 |
| `prisma validate` | ✅ |
| `prisma migrate status` | ✅ 21 migration مطبقة، القاعدة محدثة |
| `next build` | ✅ كل الـ routes |
| `npm run check:prod` | ❌ `NEXTAUTH_URL` لازم https وليس localhost (طبيعي محلياً) |

## 2) اختبار التشغيل (build على localhost)
- صفحات عامة (`/`, `/contact`, `/coming-soon`, `/login`, `/register`, `/checkout`, `/bespoke/new`, `/wishlist`, `/studio/projects/new`): 200 ✅
- `/orders`, `/admin`: تحويل لـ `/login` ✅ — `/studio` → `/studio/start` ✅ — `/portfolio` → `/#our-work` ✅
- `/api/health` و`/api/health/ready`: 200، database ok ✅
- API بدون صلاحيات: `pricing/quote` و`auth/register` و`mockups/print` ترجع 400 على بيانات فارغة ✅؛ `orders/create`, `build/create`, `paymob/create` ترجع 410 (متوقفة عمداً) ✅؛ `admin/orders/export` يحول للدخول ✅؛ webhook بتوقيع غير صحيح 401 ✅؛ صفحة غير موجودة 404 ✅

## 3) مراجعة الصلاحيات (قراءة الكود)
- كل ملفات `src/actions/*` عليها `"use server"` وفحص صلاحية (`assertBuildAccess` / `requireAdmin` / `getUserId`) ✅
- `app/admin/layout.tsx` يستدعي `requireAdmin()` + `proxy.ts` كطبقة أولى؛ `api/admin/*` تعيد فحص الدور من القاعدة ✅
- `api/build/[id]` يستخدم `canAccessBuild` ✅
- Webhook: يتحقق HMAC ويمنع التكرار بـ `eventKey` ويحدد الحجم ✅
- Rate limiting على الـ webhook والتسجيل ✅
- ملفات `.env` و`.env.local` غير مرفوعة على git ✅
- لا توجد `console.log` أو TODO في كود التطبيق ✅

## 4) مشاكل ومخاطر
| # | الخطورة | المشكلة | الحل المقترح |
|---|---|---|---|
| 1 | عالية | `npm audit --omit=dev`: 8 ثغرات (2 critical، 4 high). **next 16.2.6**: تجاوز Proxy/Middleware (Turbopack)، DoS وSSRF في Server Actions. **next-auth 4.24.14**: تجاوز تطبيع الإيميل (critical)، `getToken()` يرمي استثناء على Bearer غير صالح. **sharp 0.34.5**: ثغرات libvips/libheif/librsvg | ترقية next وnext-auth وsharp بعد اختبار (`npm audit fix`). يخفف الأثر أن الأدمن يعيد التحقق من الدور في الـ layout وفي الـ actions/API وليس في `proxy.ts` وحده |
| 2 | متوسطة | `check:prod` يفشل بقيمة `NEXTAUTH_URL` الحالية | تأكد أن بيئة الإنتاج (Vercel) فيها https والدومين الحقيقي |
| 3 | متوسطة | لا توجد اختبارات E2E ولا تغطية للـ Server Actions وروتس الدفع | إضافة Playwright على قاعدة تجريبية |
| 4 | متوسطة | `.env` المحلي يشير لـ Neon الحقيقية؛ أي تطوير/اختبار يكتب عليها | قاعدة/Branch منفصلة للتطوير |
| 5 | منخفضة | `/api/payments/webhook` مجرد re-export لـ `paymob/webhook` | تأكد أي رابط يُسجل في لوحة Paymob |
| 6 | منخفضة | 15 warning: `<img>` بدل `next/image` (أغلبها)، import غير مستخدم في `app/(marketing)/page.tsx:3`، متغير `_garmentColor` غير مستخدم في `preview-blend.ts:21` | تنظيف |
| 7 | منخفضة | Prisma 5.22 (يوجد إصدار رئيسي أحدث) | ترقية مخططة لاحقاً |

## 5) ما لم يُختبر (يحتاج بيئة تجريبية)
التسجيل وتسجيل الدخول الفعلي · رحلة Studio/Builder كاملة وحفظ mockup · Checkout ودفع Paymob (test mode) · صفحات الأدمن بأفعالها · Bespoke وWishlist · توليد Gemini · الإيميلات وواتساب · عرض الموبايل والمتصفحات.

أثر جانبي: طلب webhook تجريبي بدون توقيع سجل صفاً واحداً في جدول `WebhookEvent` على القاعدة.

## 6) اختبار الرحلات على قاعدة محلية معزولة (2026-10-11)
استخدمت Postgres مؤقتاً (embedded-postgres في فولدر مؤقت، تم إيقافه) مع كل الـ migrations، دون أي لمس لقاعدة Neon.
- **سكريبت HTTP كامل: 55 ✅ / 2 «فشل» (مقصودان):** التسجيل (نجاح/تكرار/كلمة سر قصيرة/إيميل خاطئ)، الدخول والخروج، أدوار USER/ADMIN، حجب /admin عن غير الأدمن، كل صفحات الأدمن الثمانية وتصدير الطلبات، صفحات المستخدم، التسعير (حالات صحيحة وخاطئة)، إنشاء المشاريع (مستخدم وضيف)، عزل المشاريع بين المستخدمين، صفحات Studio، حماية ملفات mockups/assets/artworks، create-intent بدون بيانات. الـ«فشلان» هما `/assets` و`/designs` يحوّلان إلى `/builder` بالتصميم.
- **واجهة المتصفح:** تسجيل الدخول → Studio يعمل بدون أخطاء console؛ زر Add to Bag ينقل لصفحة Checkout.

### مشاكل ظهرت
1. **(متوسطة/عالية — تحتاج تأكيد) القيم الافتراضية في الـ Builder لا تُحفظ:** مشروع جديد يعرض FITTED / WHITE / 170GSM (`BuilderClient.tsx:292-294`) لكن الـ draft في القاعدة يبقى `product/color/fabric = NULL` حتى يعدّل المستخدم شيئاً. عند الضغط على Add to Bag مباشرة، صفحة Checkout عرضت «Plain T-shirt … Select product and fabric» بدون سعر. بعد اختيار OVERSIZED حُفظ `product` فقط وبقي `color` و`fabric` NULL.
2. **(غير محسومة) شاشة السعر:** بعد اختيار OVERSIZED ظهر «Pricing unavailable» رغم أن `/api/pricing/quote` أعاد 200 وسعر 8.40 لنفس المدخلات. السبب لم يُحدد (يشتبه في تضارب الـ state بين الافتراضي والمحفوظ).
3. **قاعدة جديدة بلا PricingRule:** الاعتماد على FALLBACK_PRICES فقط، وFITTED/HEAVYWEIGHT_300 بلا سعر → «No pricing found» (الواجهة تخفيه لـ FITTED). تأكد أن بيئة الإنتاج فيها قواعد أسعار.
### لم يُختبر بعد
دفع Paymob الفعلي (لا توجد مفاتيح اختبار)، توليد Gemini، الإيميلات/واتساب، رفع الصور والرسم على الكانفاس، Bespoke/Wishlist عبر الواجهة، الموبايل.
