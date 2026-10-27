<p align="center"><a href="README.md">Русский</a> &nbsp;|&nbsp; <b>English</b></p>

<a href="https://gb-ansar.vercel.app"><img src="assets/en/banner.svg" alt="Ansar HomeWear — AI catalog for a warehouse. Take a photo. Find it. See the price." width="100%"></a>

<p align="center">
  <a href="#screens">In action&nbsp;›</a>&emsp;
  <a href="#features">Features&nbsp;›</a>&emsp;
  <a href="#how">How it works&nbsp;›</a>&emsp;
  <a href="#bot">Bot&nbsp;›</a>&emsp;
  <a href="#run">Run&nbsp;›</a>&emsp;
  <a href="#api">API&nbsp;›</a>
</p>

<br>

<img src="assets/en/stats.svg" alt="One photo to find an item. 13 barcode formats. iOS, Android and Web. Telegram bot for the catalog." width="100%">

<br>
<br>

<p align="center">
  <i>«It just works.»</i><br>
  <sub>— Steve Jobs</sub>
</p>

<br>

<a name="screens"></a>
<img src="assets/en/titles/screens.svg" alt="In action" width="100%">

<a href="https://gb-ansar.vercel.app"><img src="assets/screens.png" alt="App screens: home, catalog, product card, request" width="100%"></a>

<br>
<br>

<a name="features"></a>
<img src="assets/en/titles/features.svg" alt="Features" width="100%">

<a href="frontend/app/camera.tsx"><img src="assets/en/rows/photo.svg" alt="Photo search — Gemini sees the item in the photo, and the backend finds it in the catalog" width="100%"></a>
<a href="frontend/app/barcode-scanner.tsx"><img src="assets/en/rows/barcode.svg" alt="Barcode scanner — EAN-13/8, UPC, Code128, QR, DataMatrix" width="100%"></a>
<a href="frontend/app/catalog.tsx"><img src="assets/en/rows/catalog.svg" alt="Catalog — up to 5 photos per product, price, barcode, item code, search by name" width="100%"></a>
<a href="frontend/app/submit-pending.tsx"><img src="assets/en/rows/pending.svg" alt="Requests — cannot find a product? Send a photo, and the admin gets a message in Telegram" width="100%"></a>
<a href="frontend/app/search-stats.tsx"><img src="assets/en/rows/stats.svg" alt="Search stats — what people search for and what the catalog is missing" width="100%"></a>
<a href="backend/bot.py"><img src="assets/en/rows/bot.svg" alt="Telegram bot — add, find, edit or delete a product from the chat" width="100%"></a>
<a href="frontend/public/manifest.json"><img src="assets/en/rows/pwa.svg" alt="PWA — installs on a phone from the browser, no App Store needed" width="100%"></a>

<br>
<br>

<a name="how"></a>
<img src="assets/en/titles/how.svg" alt="How it works" width="100%">

<a href="backend/server.py"><img src="assets/en/flow.svg" alt="Photo search: the cashier takes a photo of the item, Gemini names the item, the backend searches by name and synonyms, the app shows the item with its price" width="100%"></a>

<br>
<br>

<img src="assets/en/titles/arch.svg" alt="Architecture" width="100%">

<img src="assets/en/arch.svg" alt="The PWA on Vercel and Telegram talk to FastAPI on Render. The API and the bot run in one process and use MongoDB, DigitalOcean Spaces and Gemini through OpenRouter" width="100%">

<br>
<br>

<a name="bot"></a>
<img src="assets/en/titles/bot.svg" alt="Telegram bot" width="100%">

<a href="backend/bot.py"><img src="assets/en/bot.svg" alt="Telegram bot: product card before saving; /start menu, adding, managing, clean chat and request notifications" width="100%"></a>

<br>
<br>

<img src="assets/en/titles/structure.svg" alt="Structure" width="100%">

<img src="assets/en/structure.svg" alt="Repository structure" width="100%">

<br>
<br>

<a name="run"></a>
<img src="assets/en/titles/run.svg" alt="Run" width="100%">

<img src="assets/en/run.svg" alt="Running the backend and the app in the terminal" width="100%">

<details>
<summary>Copy the commands</summary>
<br>

```bash
# Backend
cd backend && pip install -r requirements.txt
cp .env.example .env        # add your keys
uvicorn server:app --reload # http://127.0.0.1:8000/docs

# App — in a second terminal
cd frontend && npm install
cp .env.example .env
npx expo start              # w — open in the browser
```

</details>

<br>

<img src="assets/en/titles/env.svg" alt="Settings" width="100%">

<a href="backend/.env.example"><img src="assets/en/env.svg" alt="Environment variables: OPENROUTER_API_KEY, S3_*, MONGO_URL, DB_NAME, TELEGRAM_BOT_TOKEN, ADMIN_CHAT_IDS, PUBLIC_SITE_URL, EXPO_PUBLIC_BACKEND_URL" width="100%"></a>

<br>
<br>

<a name="api"></a>
<img src="assets/en/titles/api.svg" alt="API" width="100%">

<a href="backend/server.py"><img src="assets/en/api.svg" alt="API: products, search by photo, text and barcode, requests, search stats, categories" width="100%"></a>

<br>
<br>

<img src="assets/en/titles/deploy.svg" alt="Deploy" width="100%">

<img src="assets/en/deploy.svg" alt="Frontend on Vercel, backend on Render — only one instance" width="100%">

<br>
<br>

<img src="assets/en/titles/roadmap.svg" alt="Roadmap" width="100%">

<img src="assets/en/roadmap.svg" alt="Roadmap: 4 of 9 done" width="100%">

<br>
<br>

<img src="assets/footer.svg" alt="Stay hungry. Stay foolish. — Steve Jobs, 1955–2011" width="100%">

<p align="center">
  <sub>Made with ☕ for the Ansar HomeWear warehouse &nbsp;·&nbsp; <a href="https://instagram.com/ab.dussi">ab.dussi</a>, <a href="https://instagram.com/du.z.r">du.z.r</a> &nbsp;·&nbsp; <a href="LICENSE">MIT</a></sub>
</p>
