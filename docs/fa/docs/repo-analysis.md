# تحلیل ساختار ریپو BPB-Worker-Panel

این سند برای «یادگیری کامل ساختار پروژه» تهیه شده تا در فاز بعدی توسعه، افزودن فیچرها سریع‌تر و کم‌ریسک‌تر انجام شود.

## 1) تصویر کلان پروژه

- پروژه یک **Cloudflare Worker / Pages backend** برای ارائه پنل مدیریت و ساخت Subscription کانفیگ‌های:
  - VLESS
  - Trojan
  - Warp / Warp Pro
- معماری پروژه «تک‌ورکر + ماژول‌های تولید کانفیگ برای چند Core» است:
  - Xray
  - Sing-box
  - Clash (Mihomo)
- UI پنل به صورت Static Asset در `src/assets/*` نگهداری می‌شود و در زمان Build داخل Worker باندل می‌گردد.

## 2) مسیر ورود درخواست‌ها (Request Lifecycle)

1. ورودی اصلی از `src/worker.ts` است.
2. ابتدا `init()` کانفیگ عمومی (path، UUID، TR_PASS، fallback، DoH) را روی `globalThis` می‌گذارد.
3. اگر هدر Upgrade=websocket باشد:
   - `initWs()` اجرا می‌شود.
   - هندلر WebSocket اجرا می‌شود (`handleWebsocket`).
4. در غیر این صورت:
   - `initHttp()` اجرا می‌شود.
   - بر اساس segment اول مسیر، routing به یکی از handlerها انجام می‌شود:
     - `/panel`
     - `/sub`
     - `/login`
     - `/logout`
     - `/secrets`
     - `/dns-query`
     - `fallback`

## 3) ماژول‌های اصلی و مسئولیت‌ها

### 3.1 لایه HTTP/WebSocket

- `src/worker.ts`
  - نقطه ورودی و Router اصلی.
- `src/common/handlers.ts`
  - تمام endpointهای پنل، login/logout، subscription، DoH proxy، fallback proxying.
  - رندر HTML های پنل/لاگین/خطا/secrets.
  - تولید ZIP کانفیگ Warp برای دانلود.

### 3.2 مقداردهی اولیه و تنظیمات سراسری

- `src/common/init.ts`
  - تنظیم پیش‌فرض بسیار کامل برای `globalThis.settings`.
  - setup اولیه‌ی ws/http.
  - کنترل اولیه‌ی اعتبار env vars و KV binding.

### 3.3 KV و persistence

- `src/kv.ts`
  - `getDataset`: خواندن/ساخت اولیه‌ی `proxySettings` و `warpAccounts`.
  - `updateDataset`: merge امن تنظیمات و normalize برخی فیلدها (مثل DNS host params، ECH، chain proxy params).
  - migration ساده نسخه پنل از طریق `panelVersion`.

### 3.4 احراز هویت

- `src/auth.ts`
  - ورود با پسورد ذخیره‌شده در KV.
  - صدور JWT با `jose` و ذخیره cookie.
  - بررسی session در APIهای حساس پنل.
  - reset password.

### 3.5 WebSocket proxy protocol handlers

- `src/protocols/websocket/vless.ts`
  - Parse هدر VLESS، تشخیص UDP/TCP و عبور DNS UDP روی پورت 53.
- `src/protocols/websocket/trojan.ts`
  - Trojan over WS handling.
- `src/protocols/websocket/common.ts`
  - ابزارهای مشترک socket/websocket برای stream و outbound handling.

### 3.6 Warp

- `src/protocols/warp.ts`
  - ساخت keypair X25519.
  - رجیستر اکانت Warp با API رسمی Cloudflare client.
  - ذخیره خروجی در KV.

### 3.7 تولید کانفیگ برای Coreها

- `src/cores/xray/*`
- `src/cores/sing-box/*`
- `src/cores/clash/*`

الگوی هر Core مشابه است و معمولاً این لایه‌ها را دارد:
- inbounds
- outbounds
- dns
- routing
- configs
- geo-assets

این یعنی اضافه‌کردن فیچرهای routing/dns/proxy عمدتاً باید در هر سه Core هم‌راستا پیاده شود.

## 4) Frontend پنل

- `src/assets/panel/*`
  - فرم بزرگ تنظیمات و مدیریت state سمت کلاینت.
  - دریافت تنظیمات از `/panel/settings`.
  - ارسال تغییرات به `/panel/update-settings`.
  - عملیات کاربردی: reset password، update warp، دانلود config و ...
- `src/assets/login/*`
  - فرم login.
- `src/assets/secrets/*`
  - UI برای تولید/نمایش secretها.
- `src/assets/error/index.html`
  - قالب صفحه خطا.

نکته مهم: assetها در runtime از فایل سیستم خوانده نمی‌شوند، در Build داخل Worker embed می‌شوند.

## 5) Build و Release

- `scripts/build.js`
  - html/css/js پنل‌ها را minify + gzip + base64 می‌کند و به صورت constant به worker inject می‌کند.
  - worker را bundle می‌کند.
  - در حالت پیش‌فرض، mangle/minify انجام می‌دهد (و مود obfuscation هم پشتیبانی شده).
  - خروجی:
    - `dist/worker.js`
    - `dist/worker.zip`

## 6) قراردادهای داده و state

### 6.1 state سراسری runtime

پروژه heavily بر `globalThis` متکی است:
- `globalConfig`
- `httpConfig`
- `wsConfig`
- `settings`
- `dict`

این الگو برای Worker رایج است، ولی در توسعه فیچر جدید باید دقت شود race یا overwrite ناخواسته در requestهای همزمان رخ ندهد.

### 6.2 Env vars مهم

- اجباری:
  - `UUID`
  - `TR_PASS`
- اختیاری:
  - `PROXY_IP`
  - `PREFIX`
  - `SUB_PATH`
  - `FALLBACK`
  - `DOH_URL`
- KV binding:
  - `kv`

## 7) نقشه endpointها

- پنل:
  - `GET /panel`
  - `GET /panel/settings`
  - `PUT /panel/update-settings`
  - `POST /panel/reset-settings`
  - `POST /panel/reset-password`
  - `POST /panel/my-ip`
  - `POST /panel/update-warp`
  - `GET /panel/get-warp-configs`
- auth:
  - `GET /login`
  - `POST /login/authenticate`
  - `GET /logout`
- subscription:
  - `/sub/normal/:subPath`
  - `/sub/fragment/:subPath`
  - `/sub/warp/:subPath`
  - `/sub/warp-pro/:subPath`
  - query `app=` تعیین می‌کند خروجی برای xray/sing-box/clash باشد.
- dns:
  - `/dns-query/:subPath` (proxy به DoH upstream)

## 8) نقاط حساس برای توسعه فیچر بعدی

1. **هماهنگی بین 3 Core**
   - هر قابلیت شبکه‌ای جدید (dns/routing/outbound) باید حداقل برای Xray و Sing-box بررسی و در صورت نیاز Clash هم همسو شود.
2. **سازگاری پنل + backend**
   - هر فیلد جدید در UI باید در `Settings` type، `updateDataset` و config builders هم افزوده شود.
3. **Version migration**
   - با تغییرات اسکیما، reliance روی `panelVersion` و fallback defaults مهم است.
4. **Auth boundary**
   - endpointهای حساس باید Authenticate شوند (الگوی فعلی حفظ شود).
5. **Build-time embedding**
   - هر تغییر UI به خاطر embed شدن assets باید با `npm run build` بررسی شود.

## 9) پیشنهاد برنامه فاز بعد (برای افزودن فیچرها)

- قدم 1: تعریف دقیق فیچر در سطح data-model (`Settings` + defaults + validation).
- قدم 2: افزودن فیلد به UI پنل (`assets/panel`) و API update/get settings.
- قدم 3: پیاده‌سازی اثر فیچر در builder هر Core.
- قدم 4: تست مسیرهای subscription و regression روی login/panel.
- قدم 5: build نهایی و بررسی dist.

## 10) جمع‌بندی

ریپو ساختار تمیز ماژولار دارد: routing مرکزی، state در KV، تولید config برای چند core، و UI داخلی embeddable. برای توسعه امن، مهم‌ترین اصل «همگام نگه داشتن Settings + Panel UI + Config Builders در هر سه Core» است.
