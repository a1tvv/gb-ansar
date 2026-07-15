import os
import base64
import logging
from io import BytesIO

from PIL import Image
from aiogram import Bot, Dispatcher, F
from aiogram.types import (
    Message,
    BotCommand,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from aiogram.filters import Command

logger = logging.getLogger(__name__)

# Состояние диалога для каждого чата (в памяти процесса)
user_states: dict[int, dict] = {}


def reset_product(state: dict):
    """Сбрасывает данные текущего товара, но НЕ выключает сессию."""
    state["step"] = "photos"
    state["images"] = []
    state["name"] = None
    state["price"] = None
    state["barcode"] = None
    state["article_number"] = None


def new_state() -> dict:
    return {
        "active": False,       # сессия включена (/start) или нет (/stop)
        "step": "idle",
        "images": [],
        "name": None,
        "price": None,
        "barcode": None,
        "article_number": None,
        "bot_msgs": [],        # id сообщений бота, которые надо удалить при следующем шаге
    }


def kb_done() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Готово", callback_data="done")]
    ])


def kb_send() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📤 Отправить без артикула", callback_data="send")]
    ])


def kb_send_final() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📤 Отправить", callback_data="send")]
    ])


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

    # ---------- служебные ----------

    def get_state(chat_id: int) -> dict:
        if chat_id not in user_states:
            user_states[chat_id] = new_state()
        return user_states[chat_id]

    async def clear_bot_msgs(chat_id: int):
        """Удаляет прошлые сообщения бота (чтобы чат не засорялся)."""
        state = get_state(chat_id)
        for msg_id in state["bot_msgs"]:
            try:
                await bot.delete_message(chat_id, msg_id)
            except Exception:
                pass  # сообщение уже удалено или слишком старое
        state["bot_msgs"] = []

    async def send_step(chat_id: int, text: str, keyboard: InlineKeyboardMarkup | None = None):
        """Удаляет старые сообщения бота и присылает новое."""
        await clear_bot_msgs(chat_id)
        msg = await bot.send_message(chat_id, text, reply_markup=keyboard)
        get_state(chat_id)["bot_msgs"].append(msg.message_id)

    def compress_image_bytes(raw_bytes: bytes, max_width: int = 800, quality: int = 65) -> bytes:
        try:
            img = Image.open(BytesIO(raw_bytes))
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            if img.width > max_width:
                ratio = max_width / img.width
                img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
            buffer = BytesIO()
            img.save(buffer, format="JPEG", quality=quality, optimize=True)
            return buffer.getvalue()
        except Exception as e:
            logger.error(f"Image compression failed: {e}")
            return raw_bytes

    async def on_startup(bot: Bot):
        await bot.set_my_commands([
            BotCommand(command="start", description="Начать рабочую сессию"),
            BotCommand(command="stop", description="Закончить рабочую сессию"),
        ])

    dp.startup.register(on_startup)

    # ---------- команды ----------

    @dp.message(Command("start"))
    async def cmd_start(message: Message):
        state = get_state(message.chat.id)
        state.update(new_state())
        state["active"] = True
        reset_product(state)
        await send_step(
            message.chat.id,
            "🟢 Рабочая сессия начата!\n\n"
            "📸 Отправьте фото товара (можно несколько).\n"
            "Когда фото закончатся — нажмите «Готово».\n\n"
            "Добавляйте товары один за другим весь день.\n"
            "В конце нажмите /stop.",
            kb_done(),
        )

    @dp.message(Command("stop"))
    async def cmd_stop(message: Message):
        state = get_state(message.chat.id)
        await clear_bot_msgs(message.chat.id)
        state.update(new_state())  # active=False, step=idle
        await bot.send_message(
            message.chat.id,
            "🔴 Рабочая сессия завершена. Хорошая работа!\n"
            "Чтобы начать снова — нажмите /start."
        )

    # ---------- инлайн-кнопки ----------

    @dp.callback_query(F.data == "done")
    async def cb_done(callback: CallbackQuery):
        chat_id = callback.message.chat.id
        state = get_state(chat_id)
        await callback.answer()

        if not state["active"] or state["step"] != "photos":
            return
        if not state["images"]:
            await callback.answer("⚠️ Сначала отправьте хотя бы одно фото!", show_alert=True)
            return

        state["step"] = "name"
        await send_step(chat_id, "✏️ Название товара?")

    @dp.callback_query(F.data == "send")
    async def cb_send(callback: CallbackQuery):
        chat_id = callback.message.chat.id
        state = get_state(chat_id)
        await callback.answer()

        if not state["active"] or state["step"] != "article":
            return

        await send_step(chat_id, "⏳ Сохраняю товар...")
        await save_product(chat_id)

    # ---------- фото ----------

    @dp.message(F.photo)
    async def handle_photo(message: Message):
        state = get_state(message.chat.id)
        if not state["active"]:
            await send_step(message.chat.id, "Нажмите /start чтобы начать рабочую сессию.")
            return
        if state["step"] != "photos":
            return  # фото не по сценарию — игнорируем

        photo = message.photo[-1]
        file = await bot.get_file(photo.file_id)
        file_bytes = await bot.download_file(file.file_path)
        compressed = compress_image_bytes(file_bytes.read())
        b64 = base64.b64encode(compressed).decode("utf-8")
        state["images"].append(b64)

        await send_step(
            message.chat.id,
            f"✅ Фото: {len(state['images'])} шт. Ещё фото или нажмите «Готово».",
            kb_done(),
        )

    # ---------- текстовые шаги ----------

    @dp.message(F.text)
    async def handle_text(message: Message):
        state = get_state(message.chat.id)
        if not state["active"]:
            await send_step(message.chat.id, "Нажмите /start чтобы начать рабочую сессию.")
            return

        text = message.text.strip()

        if state["step"] == "photos":
            await send_step(
                message.chat.id,
                "📸 Сейчас нужно отправить фото товара. Когда закончите — нажмите «Готово».",
                kb_done(),
            )
            return

        if state["step"] == "name":
            state["name"] = text
            state["step"] = "price"
            await send_step(message.chat.id, "💰 Цена товара? (только число, например 350)")
            return

        if state["step"] == "price":
            try:
                state["price"] = float(text.replace(",", "."))
            except ValueError:
                await send_step(message.chat.id, "⚠️ Введите цену числом, например 350")
                return
            state["step"] = "barcode"
            await send_step(message.chat.id, "📦 Штрихкод? (числа с упаковки товара)")
            return

        if state["step"] == "barcode":
            state["barcode"] = text
            state["step"] = "article"
            await send_step(
                message.chat.id,
                "🔖 Если есть артикул — отправьте его.\nЕсли нет — нажмите кнопку ниже.",
                kb_send(),
            )
            return

        if state["step"] == "article":
            state["article_number"] = text
            await send_step(
                message.chat.id,
                "✅ Артикул сохранён. Нажмите «Отправить» чтобы загрузить товар.",
                kb_send_final(),
            )
            return

    # ---------- сохранение ----------

    async def save_product(chat_id: int):
        state = get_state(chat_id)
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

            # Итог по товару оставляем в чате НАВСЕГДА (не удаляем) — как журнал
            await clear_bot_msgs(chat_id)
            await bot.send_message(
                chat_id,
                f"✅ Товар добавлен!\n"
                f"📦 {product.name} — {product.price} ₸\n"
                f"🖼 Фото: {len(uploaded_urls)} | Штрихкод: {product.barcode or '—'} | Артикул: {product.article_number or '—'}"
            )

            # Сразу готовы к следующему товару — /start не нужен
            reset_product(state)
            msg = await bot.send_message(
                chat_id,
                "📸 Следующий товар! Отправьте фото.",
                reply_markup=kb_done(),
            )
            state["bot_msgs"].append(msg.message_id)

        except Exception as e:
            logger.error(f"Bot save_product error: {e}")
            reset_product(state)
            await send_step(chat_id, "❌ Ошибка при сохранении. Отправьте фото товара заново.", kb_done())

    return bot, dp