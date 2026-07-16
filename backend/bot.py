import os
import base64
import logging
from io import BytesIO

from PIL import Image
from aiogram import Bot, Dispatcher, F
from aiogram.types import (
    Message,
    BotCommand,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    CallbackQuery,
)
from aiogram.filters import Command
from aiogram.exceptions import TelegramBadRequest

logger = logging.getLogger(__name__)

# Состояние диалога для каждого чата (в памяти процесса)
user_states: dict[int, dict] = {}


def blank_state():
    return {
        "session_active": False,      # запущена ли рабочая сессия (/start)
        "step": "idle",               # idle | photos | name | price | barcode | article
        "images": [],
        "name": None,
        "price": None,
        "barcode": None,
        "article_number": None,
        "last_bot_message_id": None,  # ID последнего сообщения бота — его удаляем при переходе
    }


def reset_product(chat_id: int):
    """Сбрасывает данные текущего товара, но сессию оставляет активной."""
    state = user_states.get(chat_id) or blank_state()
    session_active = state.get("session_active", False)
    new_state = blank_state()
    new_state["session_active"] = session_active
    if session_active:
        new_state["step"] = "photos"
    user_states[chat_id] = new_state


def compress_image_bytes(raw_bytes: bytes, max_width: int = 800, quality: int = 65) -> bytes:
    try:
        img = Image.open(BytesIO(raw_bytes))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()
    except Exception as e:
        logger.error(f"Image compression failed: {e}")
        return raw_bytes


def build_bot(db, upload_base64_to_s3, generate_keywords, Product):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан — бот отключён")
        return None, None

    bot = Bot(token=token)
    dp = Dispatcher()

    # ============= Хелперы для управления сообщениями =============

    async def delete_last(chat_id: int):
        """Удаляет предыдущее сообщение бота, если оно есть."""
        state = user_states.get(chat_id)
        if not state or not state.get("last_bot_message_id"):
            return
        try:
            await bot.delete_message(chat_id, state["last_bot_message_id"])
        except TelegramBadRequest:
            pass  # сообщение уже удалено или устарело
        state["last_bot_message_id"] = None

    async def send_screen(chat_id: int, text: str, keyboard: InlineKeyboardMarkup | None = None):
        """Удаляет прошлый экран бота и отправляет новый."""
        await delete_last(chat_id)
        msg = await bot.send_message(chat_id, text, reply_markup=keyboard)
        state = user_states.setdefault(chat_id, blank_state())
        state["last_bot_message_id"] = msg.message_id

    # ============= Клавиатуры =============

    def kb_photos(has_photos: bool) -> InlineKeyboardMarkup:
        rows = []
        if has_photos:
            rows.append([InlineKeyboardButton(text="✅ Готово", callback_data="done_photos")])
        rows.append([InlineKeyboardButton(text="⏹ Завершить сессию", callback_data="stop_session")])
        return InlineKeyboardMarkup(inline_keyboard=rows)

    def kb_article() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🚀 Сохранить товар", callback_data="save_product")],
        ])

    def kb_after_save() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="➕ Добавить ещё товар", callback_data="add_more")],
            [InlineKeyboardButton(text="⏹ Завершить сессию", callback_data="stop_session")],
        ])

    # ============= Команды =============

    async def on_startup(bot: Bot):
        await bot.set_my_commands([
            BotCommand(command="start", description="Начать рабочую сессию"),
            BotCommand(command="stop", description="Завершить сессию"),
        ])

    dp.startup.register(on_startup)

    @dp.message(Command("start"))
    async def cmd_start(message: Message):
        # Стираем предыдущее сообщение бота, если было
        await delete_last(message.chat.id)
        user_states[message.chat.id] = blank_state()
        user_states[message.chat.id]["session_active"] = True
        user_states[message.chat.id]["step"] = "photos"
        await send_screen(
            message.chat.id,
            "👋 Сессия запущена. Добавляй товары сколько нужно.\n\n"
            "📸 Отправьте фото товара (можно несколько, по одному).",
            kb_photos(has_photos=False),
        )

    @dp.message(Command("stop"))
    async def cmd_stop(message: Message):
        await delete_last(message.chat.id)
        user_states[message.chat.id] = blank_state()
        await bot.send_message(message.chat.id, "⏹ Сессия завершена. Напишите /start чтобы начать снова.")

    # ============= Фото =============

    @dp.message(F.photo)
    async def handle_photo(message: Message):
        state = user_states.get(message.chat.id)
        if not state or not state["session_active"]:
            await bot.send_message(message.chat.id, "Напишите /start чтобы начать сессию.")
            return
        if state["step"] != "photos":
            # пришло фото в момент когда бот ждёт текст — игнорим мягко
            await bot.send_message(message.chat.id, "⚠️ Сейчас жду текст, а не фото.")
            return

        photo = message.photo[-1]
        file = await bot.get_file(photo.file_id)
        file_bytes = await bot.download_file(file.file_path)
        raw = file_bytes.read()
        compressed = compress_image_bytes(raw)
        b64 = base64.b64encode(compressed).decode("utf-8")
        state["images"].append(b64)

        # Удаляем сообщение с фото от пользователя, чтобы чат не засорялся
        try:
            await message.delete()
        except TelegramBadRequest:
            pass

        await send_screen(
            message.chat.id,
            f"📸 Фото добавлено: {len(state['images'])} шт.\n\n"
            f"Пришлите ещё или нажмите «Готово».",
            kb_photos(has_photos=True),
        )

    # ============= Callback-кнопки =============

    @dp.callback_query(F.data == "done_photos")
    async def cb_done_photos(query: CallbackQuery):
        state = user_states.get(query.message.chat.id)
        if not state or state["step"] != "photos":
            await query.answer("Не сейчас", show_alert=False)
            return
        if not state["images"]:
            await query.answer("Сначала отправьте хотя бы одно фото", show_alert=True)
            return
        state["step"] = "name"
        await query.answer()
        await send_screen(
            query.message.chat.id,
            f"✅ Фото сохранены ({len(state['images'])} шт.)\n\n"
            f"✏️ Пришлите название товара сообщением.",
        )

    @dp.callback_query(F.data == "save_product")
    async def cb_save_product(query: CallbackQuery):
        state = user_states.get(query.message.chat.id)
        if not state or state["step"] != "article":
            await query.answer("Не сейчас", show_alert=False)
            return
        await query.answer()
        await send_screen(query.message.chat.id, "⏳ Сохраняю товар...")
        await save_product(query.message.chat.id)

    @dp.callback_query(F.data == "add_more")
    async def cb_add_more(query: CallbackQuery):
        await query.answer()
        reset_product(query.message.chat.id)
        await send_screen(
            query.message.chat.id,
            "📸 Отправьте фото следующего товара.",
            kb_photos(has_photos=False),
        )

    @dp.callback_query(F.data == "stop_session")
    async def cb_stop_session(query: CallbackQuery):
        await query.answer()
        await delete_last(query.message.chat.id)
        user_states[query.message.chat.id] = blank_state()
        await bot.send_message(query.message.chat.id, "⏹ Сессия завершена. Напишите /start чтобы начать снова.")

    # ============= Текст (название → цена → штрихкод → артикул) =============

    @dp.message(F.text & ~F.text.startswith("/"))
    async def handle_text(message: Message):
        state = user_states.get(message.chat.id)
        if not state or not state["session_active"]:
            await bot.send_message(message.chat.id, "Напишите /start чтобы начать сессию.")
            return

        text = message.text.strip()
        chat_id = message.chat.id

        # Убираем сообщение пользователя, чтобы чат оставался чистым
        try:
            await message.delete()
        except TelegramBadRequest:
            pass

        if state["step"] == "photos":
            await send_screen(
                chat_id,
                "⚠️ Сейчас жду фото. Пришлите фото или нажмите «Готово», если уже отправили.",
                kb_photos(has_photos=bool(state["images"])),
            )
            return

        if state["step"] == "name":
            state["name"] = text
            state["step"] = "price"
            await send_screen(chat_id, f"✏️ Название: {text}\n\n💰 Пришлите цену (число, например 350).")
            return

        if state["step"] == "price":
            try:
                state["price"] = float(text.replace(",", "."))
            except ValueError:
                await send_screen(chat_id, "⚠️ Цена должна быть числом. Пришлите ещё раз, например: 350")
                return
            state["step"] = "barcode"
            await send_screen(chat_id, f"💰 Цена: {state['price']} ₸\n\n📦 Пришлите штрихкод (числа с упаковки).")
            return

        if state["step"] == "barcode":
            state["barcode"] = text
            state["step"] = "article"
            await send_screen(
                chat_id,
                f"📦 Штрихкод: {text}\n\n"
                f"🔖 Если есть артикул — пришлите его сообщением.\n"
                f"Если нет — сразу жмите «Сохранить товар».",
                kb_article(),
            )
            return

        if state["step"] == "article":
            state["article_number"] = text
            await send_screen(
                chat_id,
                f"🔖 Артикул: {text}\n\nЖмите «Сохранить товар».",
                kb_article(),
            )
            return

    # ============= Сохранение =============

    async def save_product(chat_id: int):
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

            await send_screen(
                chat_id,
                f"✅ Товар добавлен на сайт!\n\n"
                f"📦 {product.name}\n"
                f"💰 {product.price} ₸\n"
                f"🖼 Фото: {len(uploaded_urls)}\n"
                f"Штрихкод: {product.barcode or '—'}\n"
                f"Артикул: {product.article_number or '—'}",
                kb_after_save(),
            )
            # Сбрасываем данные товара, оставляем сессию активной
            reset_product(chat_id)
            # step у нас после reset_product = photos, но экран уже показан выше с кнопками
            # так что оставляем как есть — юзер сам выберет "Добавить ещё" или "Завершить"
        except Exception as e:
            logger.error(f"Bot save_product error: {e}")
            await send_screen(
                chat_id,
                "❌ Ошибка при сохранении. Начните заново через «Добавить ещё товар».",
                kb_after_save(),
            )
            reset_product(chat_id)

    return bot, dp
