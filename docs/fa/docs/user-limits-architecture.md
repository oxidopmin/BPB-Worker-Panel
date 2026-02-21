# معماری سیستم کاربران، سهمیه حجم و زمان

## هدف
این طراحی برای چندکاربره‌کردن پنل انجام شده تا برای هر کاربر:
- UUID اختصاصی
- Subscription ID اختصاصی
- Trojan Password اختصاصی
- محدودیت حجم (GB)
- محدودیت زمانی (Expire)

تعریف و مدیریت شود.

## مدل داده
در KV یک کلید جدید به نام `panelUsers` نگهداری می‌شود و هر رکورد شامل این فیلدها است:
- `id`
- `name`
- `uuid`
- `subId`
- `trPassword`
- `dataLimitGB`
- `dataUsedBytes`
- `expireAt`
- `enabled`
- `createdAt`, `updatedAt`

## قوانین فعال/غیرفعال بودن کاربر
کاربر زمانی فعال است که:
1. `enabled=true`
2. اگر `expireAt>0` باشد زمان فعلی از آن عبور نکرده باشد.
3. اگر `dataLimitGB>0` باشد مصرف (`dataUsedBytes`) از سقف بیشتر/برابر نشده باشد.

## لایه API مدیریت کاربران
در پنل endpointهای جدید اضافه شده:
- `GET /panel/users`
- `POST /panel/users`
- `PUT /panel/users`
- `DELETE /panel/users`
- `POST /panel/users/reset-usage`

همه endpointها نیازمند احراز هویت پنل هستند.

## لایه Subscription
الگوی مسیر سابسکریپشن به صورت زیر است:
- `/sub/{normal|fragment|warp|warp-pro}/{subId}`

در هر درخواست:
1. کاربر با `subId` پیدا می‌شود.
2. وضعیت فعال بودن بررسی می‌شود.
3. در صورت اعتبار، `activeUserUUID` و `activeTrPass` روی context قرار می‌گیرد.
4. کانفیگ با همان شناسه‌های اختصاصی کاربر تولید می‌شود.

## لایه WebSocket Authentication
- VLESS: UUID داخل هدر با کاربران KV تطبیق داده می‌شود.
- Trojan: SHA224 پسورد هدر با `trPassword` کاربران تطبیق داده می‌شود.
- در هر دو پروتکل، وضعیت کاربر (enabled/expire/volume) بررسی می‌شود.

## ثبت مصرف حجم
مصرف در مسیر WebSocket بر اساس بایت‌های خروجی ثبت و به `dataUsedBytes` کاربر اضافه می‌شود.
(این پیاده‌سازی lightweight است و مبنای اولیه quota tracking را فراهم می‌کند.)

## DoH اختصاصی کاربر
مسیر DoH به `subId` وابسته شده:
- `/dns-query/{subId}`

و فقط برای کاربران معتبر و فعال پاسخ داده می‌شود.

## سازگاری با نصب‌های قدیمی
اگر `panelUsers` خالی باشد و env شامل `UUID`/`TR_PASS` معتبر باشد:
- یک کاربر پیش‌فرض bootstrap ساخته می‌شود.

## UI پنل
یک بخش جدید «Users & Limits» اضافه شده که شامل:
- انتخاب کاربر فعال برای لینک‌ها
- جدول کاربران
- ایجاد/ویرایش/حذف کاربر
- ریست مصرف کاربر

تمام لینک‌های Subscription/QR/Download اکنون بر اساس کاربر انتخاب‌شده ساخته می‌شوند.
