<p align="center"><b>Русский</b> &nbsp;|&nbsp; <a href="README.en.md">English</a></p>

<a href="https://gb-ansar.vercel.app"><img src="assets/banner.svg" alt="Ansar HomeWear — AI-каталог склада. Сфоткал. Нашёл. Узнал цену." width="100%"></a>

<p align="center">
  <a href="#screens">В деле&nbsp;›</a>&emsp;
  <a href="#features">Возможности&nbsp;›</a>&emsp;
  <a href="#how">Как работает&nbsp;›</a>&emsp;
  <a href="#bot">Бот&nbsp;›</a>&emsp;
  <a href="#run">Запуск&nbsp;›</a>&emsp;
  <a href="#api">API&nbsp;›</a>
</p>

<br>

<img src="assets/stats.svg" alt="Один снимок, чтобы найти товар. 13 форматов штрихкодов. iOS, Android и Web. Telegram-бот для каталога." width="100%">

<br>
<br>

<p align="center">
  <i>«It just works.»</i><br>
  <sub>— Steve Jobs</sub>
</p>

<br>

<a name="screens"></a>
<img src="assets/titles/screens.svg" alt="В деле" width="100%">

<a href="https://gb-ansar.vercel.app"><img src="assets/screens.png" alt="Экраны приложения: главная, каталог, карточка товара, заявка" width="100%"></a>

<br>
<br>

<a name="features"></a>
<img src="assets/titles/features.svg" alt="Возможности" width="100%">

<a href="frontend/app/camera.tsx"><img src="assets/rows/photo.svg" alt="Поиск по фото — Gemini узнаёт предмет на снимке, а бэкенд находит его в каталоге" width="100%"></a>
<a href="frontend/app/barcode-scanner.tsx"><img src="assets/rows/barcode.svg" alt="Сканер штрихкодов — EAN-13/8, UPC, Code128, QR, DataMatrix" width="100%"></a>
<a href="frontend/app/catalog.tsx"><img src="assets/rows/catalog.svg" alt="Каталог — до 5 фото на товар, цена, штрихкод, артикул, поиск по названию" width="100%"></a>
<a href="frontend/app/submit-pending.tsx"><img src="assets/rows/pending.svg" alt="Заявки — не нашёл товар, отправь фото, админ получит уведомление в Telegram" width="100%"></a>
<a href="frontend/app/search-stats.tsx"><img src="assets/rows/stats.svg" alt="Статистика поиска — что ищут и чего не хватает в каталоге" width="100%"></a>
<a href="backend/bot.py"><img src="assets/rows/bot.svg" alt="Telegram-бот — добавить, найти, изменить или удалить товар из чата" width="100%"></a>
<a href="frontend/public/manifest.json"><img src="assets/rows/pwa.svg" alt="PWA — ставится на телефон из браузера, без App Store" width="100%"></a>

<br>
<br>

<a name="how"></a>
<img src="assets/titles/how.svg" alt="Как это работает" width="100%">

<a href="backend/server.py"><img src="assets/flow.svg" alt="Поиск по фото: кассир снимает товар, Gemini называет предмет, бэкенд ищет по названию и синонимам, приложение показывает товар с ценой" width="100%"></a>

<br>
<br>

<img src="assets/titles/arch.svg" alt="Архитектура" width="100%">

<img src="assets/arch.svg" alt="PWA на Vercel и Telegram ходят в FastAPI на Render; API и бот работают в одном процессе и используют MongoDB, DigitalOcean Spaces и Gemini через OpenRouter" width="100%">

<br>
<br>

<a name="bot"></a>
<img src="assets/titles/bot.svg" alt="Telegram-бот" width="100%">

<a href="backend/bot.py"><img src="assets/bot.svg" alt="Telegram-бот: карточка товара перед сохранением; меню /start, добавление, управление, чистый чат и уведомления о заявках" width="100%"></a>

<br>
<br>

<img src="assets/titles/structure.svg" alt="Структура" width="100%">

<img src="assets/structure.svg" alt="Структура репозитория" width="100%">

<br>
<br>

<a name="run"></a>
<img src="assets/titles/run.svg" alt="Запуск" width="100%">

<img src="assets/run.svg" alt="Запуск бэкенда и приложения в терминале" width="100%">

<details>
<summary>Скопировать команды</summary>
<br>

```bash
# Бэкенд
cd backend && pip install -r requirements.txt
cp .env.example .env        # впиши свои ключи
uvicorn server:app --reload # http://127.0.0.1:8000/docs

# Приложение — во втором терминале
cd frontend && npm install
cp .env.example .env
npx expo start              # w — открыть в браузере
```

</details>

<br>

<img src="assets/titles/env.svg" alt="Настройки" width="100%">

<a href="backend/.env.example"><img src="assets/env.svg" alt="Переменные окружения: OPENROUTER_API_KEY, S3_*, MONGO_URL, DB_NAME, TELEGRAM_BOT_TOKEN, ADMIN_CHAT_IDS, PUBLIC_SITE_URL, EXPO_PUBLIC_BACKEND_URL" width="100%"></a>

<br>
<br>

<a name="api"></a>
<img src="assets/titles/api.svg" alt="API" width="100%">

<a href="backend/server.py"><img src="assets/api.svg" alt="API: товары, поиск по фото, тексту и штрихкоду, заявки, статистика поиска, категории" width="100%"></a>

<br>
<br>

<img src="assets/titles/deploy.svg" alt="Деплой" width="100%">

<img src="assets/deploy.svg" alt="Фронт на Vercel, бэкенд на Render — строго в одном экземпляре" width="100%">

<br>
<br>

<img src="assets/titles/roadmap.svg" alt="Roadmap" width="100%">

<img src="assets/roadmap.svg" alt="Roadmap: готово 4 из 9" width="100%">

<br>
<br>

<img src="assets/footer.svg" alt="Stay hungry. Stay foolish. — Steve Jobs, 1955–2011" width="100%">

<p align="center">
  <sub>Сделано с ☕ для склада Ansar HomeWear &nbsp;·&nbsp; <a href="https://instagram.com/ab.dussi">ab.dussi</a>, <a href="https://instagram.com/du.z.r">du.z.r</a> &nbsp;·&nbsp; <a href="LICENSE">MIT</a></sub>
</p>
