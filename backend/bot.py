import os
import base64
import asyncio
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
# Замок на чат, чтобы фото/тексты обрабатывались последовательно
chat_locks: dict[int, asyncio.Lock] = {}


def get_lock(chat_id: int) -> asyncio.Lock:
    if chat_id not in chat_locks:
        chat_locks[chat_id] = asyncio.Lock()
    return chat_locks[chat_id]


def blank_state():
    return {
        "session_active": False,
        "step": "idle",  # idle | photos | name | price | barcode | article
        "images": [],
        "name": None,
        "price": None,
        "barcode": None,
        "article_number": None,
        "screen_message_id": None,  # ID единственного "экрана" бота, который редактируем
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

    # ============= Управление единственным "экраном" =============

    async def show_screen(chat_id: int, text: str, keyboard: InlineKeyboardMarkup | None = None):
        """
        Обновляет ЕДИНСТВЕННОЕ сообщение бота в чате.
        Если сообщения ещё нет — создаёт. Если есть — редактирует.
        """
        state = user_states.setdefault(chat_id, blank_state())
        screen_id = state.get("screen_message_id")

        if screen_id:
            try:
                await bot.edit_message_text(
                    chat_id=chat_id,
                    message_id=screen_id,
                    text=text,
                    reply_markup=keyboard,
                )
                return
            except TelegramBadRequest as e:
                # Если сообщение не изменилось — Telegram кидает ошибку, это ок
                if "message is not modified" in str(e).lower():
                    return
                # Сообщение удалили или недоступно — создадим новое
                logger.warning(f"edit_message_text failed, will send new: {e}")

        msg = await bot.send_message(chat_id, text, reply_markup=keyboard)
        state["screen_message_id"] = msg.message_id

    async def clear_screen(chat_id: int):
        """Удаляет текущий экран (используется при завершении сессии)."""
        state = user_states.get(chat_id)
        if not state or not state.get("screen_message_id"):
            return
        try:
            await bot.delete_message(chat_id, state["screen_message_id"])
        except TelegramBadRequest:
            pass
        state["screen_message_id"] = None

    async def delete_user_message(message: Message):
        """Убирает сообщение пользователя, чтобы чат был чистым."""
        try:
            await message.delete()
        except TelegramBadRequest:
            pass

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
        chat_id = message.chat.id
        await delete_user_message(message)
        async with get_lock(chat_id):
            # если уже была сессия — очистим прошлый экран
            await clear_screen(chat_id)
            user_states[chat_id] = blank_state()
            user_states[chat_id]["session_active"] = True
            user_states[chat_id]["step"] = "photos"
            await show_screen(
                chat_id,
                "👋 Сессия запущена. Добавляй товары один за другим — /start больше не нужен.\n\n"
                "📸 Отправьте фото первого товара.",
                kb_photos(has_photos=False),
            )

    @dp.message(Command("stop"))
    async def cmd_stop(message: Message):
        chat_id = message.chat.id
        await delete_user_message(message)
        async with get_lock(chat_id):
            await clear_screen(chat_id)
            user_states[chat_id] = blank_state()
            await bot.send_message(chat_id, "⏹ Сессия завершена. /start чтобы начать снова.")

    # ============= Фото =============

    @dp.message(F.photo)
    async def handle_photo(message: Message):
        chat_id = message.chat.id
        # быстро скачиваем фото ДО захвата лока (сеть может быть медленной)
        state = user_states.get(chat_id)
        if not state or not state.get("session_active"):
            await delete_user_message(message)
            return
        if state["step"] != "photos":
            await delete_user_message(message)
            return

        photo = message.photo[-1]
        try:
            file = await bot.get_file(photo.file_id)
            file_bytes = await bot.download_file(file.file_path)
            raw = file_bytes.read()
            compressed = compress_image_bytes(raw)
            b64 = base64.b64encode(compressed).decode("utf-8")
        except Exception as e:
            logger.error(f"Photo download failed: {e}")
            await delete_user_message(message)
            return

        # теперь под локом: добавляем в state и обновляем один экран
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("session_active") or state["step"] != "photos":
                await delete_user_message(message)
                return

            state["images"].append(b64)
            await delete_user_message(message)
            await show_screen(
                chat_id,
                f"📸 Фото добавлено: {len(state['images'])} шт.\n\n"
                f"Пришлите ещё или нажмите «Готово».",
                kb_photos(has_photos=True),
            )

    # ============= Callback-кнопки =============

    @dp.callback_query(F.data == "done_photos")
    async def cb_done_photos(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or state["step"] != "photos":
                await query.answer()
                return
            if not state["images"]:
                await query.answer("Сначала отправьте хотя бы одно фото", show_alert=True)
                return
            state["step"] = "name"
            await query.answer()
            await show_screen(
                chat_id,
                f"✅ Фото сохранены ({len(state['images'])} шт.)\n\n"
                f"✏️ Пришлите название товара сообщением.",
            )

    @dp.callback_query(F.data == "save_product")
    async def cb_save_product(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or state["step"] != "article":
                await query.answer()
                return
            await query.answer()
            await show_screen(chat_id, "⏳ Сохраняю товар...")
            await save_product(chat_id)

    @dp.callback_query(F.data == "stop_session")
    async def cb_stop_session(query: CallbackQuery):
        chat_id = query.message.chat.id
        await query.answer()
        async with get_lock(chat_id):
            await clear_screen(chat_id)
            user_states[chat_id] = blank_state()
            await bot.send_message(chat_id, "⏹ Сессия завершена. /start чтобы начать снова.")

    # ============= Текст =============

    @dp.message(F.text & ~F.text.startswith("/"))
    async def handle_text(message: Message):
        chat_id = message.chat.id
        text = message.text.strip()
        await delete_user_message(message)

        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("session_active"):
                return  # тихо игнорим, никаких "Напишите /start"

            if state["step"] == "photos":
                await show_screen(
                    chat_id,
                    "⚠️ Сейчас жду фото. Пришлите фото или нажмите «Готово», если уже отправили.",
                    kb_photos(has_photos=bool(state["images"])),
                )
                return

            if state["step"] == "name":
                state["name"] = text
                state["step"] = "price"
                await show_screen(chat_id, f"✏️ Название: {text}\n\n💰 Пришлите цену (число, например 350).")
                return

            if state["step"] == "price":
                try:
                    state["price"] = float(text.replace(",", "."))
                except ValueError:
                    await show_screen(chat_id, "⚠️ Цена должна быть числом. Пришлите ещё раз, например: 350")
                    return
                state["step"] = "barcode"
                await show_screen(chat_id, f"💰 Цена: {state['price']} ₸\n\n📦 Пришлите штрихкод.")
                return

            if state["step"] == "barcode":
                state["barcode"] = text
                state["step"] = "article"
                await show_screen(
                    chat_id,
                    f"📦 Штрихкод: {text}\n\n"
                    f"🔖 Если есть артикул — пришлите его сообщением.\n"
                    f"Если нет — сразу жмите «Сохранить товар».",
                    kb_article(),
                )
                return

            if state["step"] == "article":
                state["article_number"] = text
                await show_screen(
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

            # Показываем итог и сразу переводим в режим ожидания фото следующего товара
            # Единственная кнопка — Завершить сессию (по умолчанию просто кидай фото дальше)
            reset_product(chat_id)  # session_active остаётся, step -> photos
            await show_screen(
                chat_id,
                f"✅ Товар добавлен: {product.name} — {product.price} ₸\n\n"
                f"📸 Отправьте фото следующего товара.",
                kb_photos(has_photos=False),
            )
        except Exception as e:
            logger.error(f"Bot save_product error: {e}")
            reset_product(chat_id)
            await show_screen(
                chat_id,
                "❌ Ошибка при сохранении. Отправьте фото следующего товара, чтобы продолжить.",
                kb_photos(has_photos=False),
            )

    return bot, dp
