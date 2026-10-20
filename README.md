# gb-ansar

AI product catalog for Ansar Home Warehouse — find any product by photo, barcode or name, from a mobile app or a Telegram bot.

![demo](docs/demo.gif)
<!-- TODO: add a screen recording of the app as docs/demo.gif -->

## Features

- **Photo search:** the AI first extracts the product's own features (brand, text on the packaging, shape, colours) and ignores the background, then matches them against the catalog
- Barcode scanner and text search
- Product catalog with categories: add, edit and delete products
- Moderation queue: new products are submitted as pending and approved by an admin
- Telegram bot to add and find products, with notifications to admins
- Product photos in S3-compatible storage, plus search statistics

## Tech stack

- **Backend:** Python · FastAPI · MongoDB (Motor) · aiogram · httpx · aioboto3
- **AI:** Google Gemini via the OpenRouter API
- **App:** Expo (React Native, expo-router, expo-camera) · TypeScript

## Quick start

```bash
git clone https://github.com/a1tvv/gb-ansar.git && cd gb-ansar
pip install -r backend/requirements.txt && cp backend/.env.example backend/.env   # fill in the values
cd backend && uvicorn server:app --reload                                         # API on http://127.0.0.1:8000
cd frontend && npm install && cp .env.example .env && npx expo start              # in a second terminal
```

## Configuration

Backend settings live in `backend/.env` (see [`backend/.env.example`](backend/.env.example)):

| Variable | Purpose |
|---|---|
| `MONGO_URL`, `DB_NAME` | MongoDB connection and database name |
| `OPENROUTER_API_KEY` | Key for AI photo recognition |
| `S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | S3-compatible storage for product photos |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token; the bot is skipped if it is not set |
| `ADMIN_CHAT_IDS` | Comma-separated Telegram chat IDs that receive moderation notifications |
| `PUBLIC_SITE_URL` | Public URL of the app, used in bot messages |

The app reads `EXPO_PUBLIC_BACKEND_URL` from `frontend/.env` (see [`frontend/.env.example`](frontend/.env.example)).

## License

[MIT](LICENSE)
