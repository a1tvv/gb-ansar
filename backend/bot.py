import os
import base64
import logging

from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, BotCommand
from aiogram.filters import Command

logger = logging.getLogger(__name__)

# Состояние диалога для каждого чата (в памяти процесса)
user_states: dict[int, dict] = {}


def reset_state(chat_id: int):
    user_states[chat_id] = {
        "step": "idle",
        "images": [],
        "name": None,
        "price": None,
        "barcode": None,
        "article_number": None,
    }


def build_bot(db, upload_base64_to_s3, generate_keywords, Product):
    """
    Собирает Telegram-бота, переиспользуя логику из основного сервера
    (S3-загрузка, генерация keywords, модель Product).
    Возвращает (bot, dispatcher) или (None, None) если токен не задан.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан — бот отключён")
        return None, None

    bot = Bot(token=token)
    dp = Dispatcher()

    async def on_startup(bot: Bot):
        # Регистрируем команды — Telegram покажет их в подсказке при вводе "/"
        await bot.set_my_commands([
            BotCommand(command="start", description="Добавить новый товар"),
            BotCommand(command="done", description="Закончить отправку фото"),
            BotCommand(command="send", description="Сохранить товар на сайт"),
        ])

    dp.startup.register(on_startup)

    @dp.message(Command("start"))
    async def cmd_start(message: Message):
        reset_state(message.chat.id)
        user_states[message.chat.id]["step"] = "photos"
        await message.answer(
            "👋 Привет! Добавим новый товар в каталог Ansar HW.\n\n"
            "📸 Отправьте фото товара (можно несколько, по одному).\n"
            "Когда закончите — нажмите /done."
        )

    @dp.message(F.photo)
    async def handle_photo(message: Message):
        state = user_states.get(message.chat.id)
        if not state or state["step"] != "photos":
            await message.answer("Напишите /start чтобы начать добавление товара.")
            return

        photo = message.photo[-1]  # самое большое разрешение
        file = await bot.get_file(photo.file_id)
        file_bytes = await bot.download_file(file.file_path)
        b64 = base64.b64encode(file_bytes.read()).decode("utf-8")
        state["images"].append(b64)
        await message.answer(f"✅ Фото {len(state['images'])} добавлено. Ещё фото или нажмите /done.")

    @dp.message(Command("done"))
    async def handle_done_photos(message: Message):
        state = user_states.get(message.chat.id)
        if not state or state["step"] != "photos":
            await message.answer("Сначала начните с /start.")
            return
        if not state["images"]:
            await message.answer("⚠️ Вы не отправили ни одного фото. Отправьте хотя бы одно.")
            return
        state["step"] = "name"
        await message.answer("✏️ Название товара?")

    @dp.message(Command("send"))
    async def handle_finish(message: Message):
        state = user_states.get(message.chat.id)
        if not state or state["step"] != "article":
            await message.answer("Ещё рано — сначала пройдите все шаги через /start.")
            return
        await message.answer("⏳ Сохраняю товар...")
        await save_product(message.chat.id, message)

    @dp.message(F.text)
    async def handle_text(message: Message):
        state = user_states.get(message.chat.id)
        if not state or state["step"] in ("idle", "photos"):
            await message.answer("Напишите /start чтобы начать добавление товара.")
            return

        text = message.text.strip()

        if state["step"] == "name":
            state["name"] = text
            state["step"] = "price"
            await message.answer("💰 Цена товара? (только число, например 350)")
            return

        if state["step"] == "price":
            try:
                state["price"] = float(text.replace(",", "."))
            except ValueError:
                await message.answer("⚠️ Введите цену числом, например 350")
                return
            state["step"] = "barcode"
            await message.answer("📦 Штрихкод? (числа с упаковки товара)")
            return

        if state["step"] == "barcode":
            state["barcode"] = text
            state["step"] = "article"
            await message.answer(
                "🔖 Если есть артикул — отправьте его.\n"
                "Если нет — просто нажмите /send, и я загружу товар на сайт."
            )
            return

        if state["step"] == "article":
            state["article_number"] = text
            await message.answer("✅ Артикул сохранён. Нажмите /send чтобы завершить.")
            return

    async def save_product(chat_id: int, message: Message):
        state = user_states[chat_id]
        try:
            uploaded_urls = []
            for img in state["images"]:
                url = await upload_base64_to_s3(img)
                if url:
                    uploaded_urls.append(url)

            keywords = await generate_keywords(state["name"], state["images"][0])

            product = Product(
                name=state["name"],
                price=state["price"],
                images=uploaded_urls,
                barcode=state["barcode"],
                article_number=state["article_number"],
                keywords=keywords,
            )
            await db.products.insert_one(product.dict())

            await message.answer(
                f"✅ Товар добавлен на сайт!\n\n"
                f"📦 {product.name}\n"
                f"💰 {product.price} ₸\n"
                f"🖼 Фото: {len(uploaded_urls)}\n"
                f"Штрихкод: {product.barcode or '—'}\n"
                f"Артикул: {product.article_number or '—'}\n\n"
                f"Напишите /start чтобы добавить следующий товар."
            )
        except Exception as e:
            logger.error(f"Bot save_product error: {e}")
            await message.answer("❌ Ошибка при сохранении товара. Попробуйте /start заново.")
        finally:
            reset_state(chat_id)

    return bot, dp
