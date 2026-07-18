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

user_states: dict[int, dict] = {}
chat_locks: dict[int, asyncio.Lock] = {}


def get_lock(chat_id: int) -> asyncio.Lock:
    if chat_id not in chat_locks:
        chat_locks[chat_id] = asyncio.Lock()
    return chat_locks[chat_id]


def blank_state():
    return {
        "session_active": False,
        # step: idle | photos | name | price | barcode | article | summary | edit_menu
        #       | edit_photos | edit_name | edit_price | edit_barcode | edit_article
        "step": "idle",
        "images": [],
        "name": None,
        "price": None,
        "barcode": None,
        "article_number": None,
        "screen_message_id": None,
    }


def reset_product(chat_id: int):
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


def format_summary(state: dict) -> str:
    """Готовит текст-сводку по товару для экрана подтверждения."""
    return (
        "📋 Проверьте данные товара:\n\n"
        f"📸 Фото: {len(state['images'])} шт.\n"
        f"✏️ Название: {state['name']}\n"
        f"💰 Цена: {state['price']} ₸\n"
        f"📦 Штрихкод: {state['barcode'] or '—'}\n"
        f"🔖 Артикул: {state['article_number'] or '—'}\n\n"
        "Всё верно?"
    )


def build_bot(db, upload_base64_to_s3, generate_keywords, Product):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан — бот отключён")
        return None, None

    bot = Bot(token=token)
    dp = Dispatcher()

    # ============= Управление экраном =============

    async def show_screen(chat_id: int, text: str, keyboard: InlineKeyboardMarkup | None = None):
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
                if "message is not modified" in str(e).lower():
                    return
                logger.warning(f"edit_message_text failed, will send new: {e}")

        msg = await bot.send_message(chat_id, text, reply_markup=keyboard)
        state["screen_message_id"] = msg.message_id

    async def clear_screen(chat_id: int):
        state = user_states.get(chat_id)
        if not state or not state.get("screen_message_id"):
            return
        try:
            await bot.delete_message(chat_id, state["screen_message_id"])
        except TelegramBadRequest:
            pass
        state["screen_message_id"] = None

    async def delete_user_message(message: Message):
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

    def kb_edit_photos(has_photos: bool) -> InlineKeyboardMarkup:
        """Такой же как kb_photos, но 'Готово' ведёт обратно к summary."""
        rows = []
        if has_photos:
            rows.append([InlineKeyboardButton(text="✅ Готово", callback_data="edit_photos_done")])
        rows.append([InlineKeyboardButton(text="⬅️ Отмена", callback_data="back_to_summary")])
        return InlineKeyboardMarkup(inline_keyboard=rows)

    def kb_summary() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Сохранить", callback_data="save_product")],
            [InlineKeyboardButton(text="✏️ Изменить", callback_data="edit_menu")],
            [InlineKeyboardButton(text="⏹ Завершить сессию", callback_data="stop_session")],
        ])

    def kb_edit_menu() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="📸 Фото", callback_data="edit_photos"),
                InlineKeyboardButton(text="✏️ Название", callback_data="edit_name"),
            ],
            [
                InlineKeyboardButton(text="💰 Цена", callback_data="edit_price"),
                InlineKeyboardButton(text="📦 Штрихкод", callback_data="edit_barcode"),
            ],
            [InlineKeyboardButton(text="🔖 Артикул", callback_data="edit_article")],
            [InlineKeyboardButton(text="⬅️ Назад", callback_data="back_to_summary")],
        ])

    def kb_cancel_edit() -> InlineKeyboardMarkup:
        """Кнопка отмены при редактировании одного поля."""
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="⬅️ Отмена", callback_data="back_to_summary")],
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
        state = user_states.get(chat_id)
        if not state or not state.get("session_active"):
            await delete_user_message(message)
            return
        # принимаем фото только на шагах где это уместно
        if state["step"] not in ("photos", "edit_photos"):
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

        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("session_active"):
                await delete_user_message(message)
                return
            if state["step"] not in ("photos", "edit_photos"):
                await delete_user_message(message)
                return

            state["images"].append(b64)
            await delete_user_message(message)

            if state["step"] == "photos":
                await show_screen(
                    chat_id,
                    f"📸 Фото добавлено: {len(state['images'])} шт.\n\n"
                    f"Пришлите ещё или нажмите «Готово».",
                    kb_photos(has_photos=True),
                )
            else:  # edit_photos
                await show_screen(
                    chat_id,
                    f"📸 Всего фото: {len(state['images'])} шт.\n\n"
                    f"Пришлите ещё или нажмите «Готово» чтобы вернуться к сводке.",
                    kb_edit_photos(has_photos=True),
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

    @dp.callback_query(F.data == "edit_menu")
    async def cb_edit_menu(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or state["step"] != "summary":
                await query.answer()
                return
            state["step"] = "edit_menu"
            await query.answer()
            await show_screen(
                chat_id,
                "✏️ Что хотите изменить?",
                kb_edit_menu(),
            )

    @dp.callback_query(F.data == "back_to_summary")
    async def cb_back_to_summary(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state:
                await query.answer()
                return
            state["step"] = "summary"
            await query.answer()
            await show_screen(chat_id, format_summary(state), kb_summary())

    @dp.callback_query(F.data == "edit_photos")
    async def cb_edit_photos(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state:
                await query.answer()
                return
            # обнуляем старые фото, пусть загрузит заново
            state["images"] = []
            state["step"] = "edit_photos"
            await query.answer()
            await show_screen(
                chat_id,
                "📸 Пришлите новые фото товара (можно несколько).\n"
                "Старые фото удалены. Когда закончите — нажмите «Готово».",
                kb_edit_photos(has_photos=False),
            )

    @dp.callback_query(F.data == "edit_photos_done")
    async def cb_edit_photos_done(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or state["step"] != "edit_photos":
                await query.answer()
                return
            if not state["images"]:
                await query.answer("Отправьте хотя бы одно фото", show_alert=True)
                return
            state["step"] = "summary"
            await query.answer()
            await show_screen(chat_id, format_summary(state), kb_summary())

    @dp.callback_query(F.data == "edit_name")
    async def cb_edit_name(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state:
                await query.answer()
                return
            state["step"] = "edit_name"
            await query.answer()
            await show_screen(
                chat_id,
                f"✏️ Текущее название: {state['name']}\n\n"
                "Пришлите новое название сообщением.",
                kb_cancel_edit(),
            )

    @dp.callback_query(F.data == "edit_price")
    async def cb_edit_price(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state:
                await query.answer()
                return
            state["step"] = "edit_price"
            await query.answer()
            await show_screen(
                chat_id,
                f"💰 Текущая цена: {state['price']} ₸\n\n"
                "Пришлите новую цену числом.",
                kb_cancel_edit(),
            )

    @dp.callback_query(F.data == "edit_barcode")
    async def cb_edit_barcode(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state:
                await query.answer()
                return
            state["step"] = "edit_barcode"
            await query.answer()
            await show_screen(
                chat_id,
                f"📦 Текущий штрихкод: {state['barcode'] or '—'}\n\n"
                "Пришлите новый штрихкод сообщением.",
                kb_cancel_edit(),
            )

    @dp.callback_query(F.data == "edit_article")
    async def cb_edit_article(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state:
                await query.answer()
                return
            state["step"] = "edit_article"
            await query.answer()
            await show_screen(
                chat_id,
                f"🔖 Текущий артикул: {state['article_number'] or '—'}\n\n"
                "Пришлите новый артикул сообщением.",
                kb_cancel_edit(),
            )

    @dp.callback_query(F.data == "save_product")
    async def cb_save_product(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or state["step"] != "summary":
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
                return

            step = state["step"]

            # Обычный поток заполнения
            if step == "photos":
                await show_screen(
                    chat_id,
                    "⚠️ Сейчас жду фото. Пришлите фото или нажмите «Готово», если уже отправили.",
                    kb_photos(has_photos=bool(state["images"])),
                )
                return

            if step == "name":
                state["name"] = text
                state["step"] = "price"
                await show_screen(chat_id, f"✏️ Название: {text}\n\n💰 Пришлите цену (число, например 350).")
                return

            if step == "price":
                try:
                    state["price"] = float(text.replace(",", "."))
                except ValueError:
                    await show_screen(chat_id, "⚠️ Цена должна быть числом. Пришлите ещё раз, например: 350")
                    return
                state["step"] = "barcode"
                await show_screen(chat_id, f"💰 Цена: {state['price']} ₸\n\n📦 Пришлите штрихкод.")
                return

            if step == "barcode":
                state["barcode"] = text
                state["step"] = "article"
                await show_screen(
                    chat_id,
                    f"📦 Штрихкод: {text}\n\n"
                    f"🔖 Пришлите артикул сообщением.\n"
                    f"Если артикула нет — напишите «нет» или «-».",
                    kb_cancel_edit() if False else None,  # без кнопки отмены на обычном флоу
                )
                return

            if step == "article":
                state["article_number"] = None if text.lower() in ("нет", "-", "no", "none") else text
                state["step"] = "summary"
                await show_screen(chat_id, format_summary(state), kb_summary())
                return

            # Редактирование отдельных полей
            if step == "edit_name":
                state["name"] = text
                state["step"] = "summary"
                await show_screen(chat_id, format_summary(state), kb_summary())
                return

            if step == "edit_price":
                try:
                    state["price"] = float(text.replace(",", "."))
                except ValueError:
                    await show_screen(
                        chat_id,
                        "⚠️ Цена должна быть числом. Пришлите ещё раз.",
                        kb_cancel_edit(),
                    )
                    return
                state["step"] = "summary"
                await show_screen(chat_id, format_summary(state), kb_summary())
                return

            if step == "edit_barcode":
                state["barcode"] = None if text.lower() in ("нет", "-", "no", "none") else text
                state["step"] = "summary"
                await show_screen(chat_id, format_summary(state), kb_summary())
                return

            if step == "edit_article":
                state["article_number"] = None if text.lower() in ("нет", "-", "no", "none") else text
                state["step"] = "summary"
                await show_screen(chat_id, format_summary(state), kb_summary())
                return

            if step == "edit_photos":
                await show_screen(
                    chat_id,
                    "⚠️ Сейчас жду фото, не текст. Пришлите фото или нажмите «Отмена».",
                    kb_edit_photos(has_photos=bool(state["images"])),
                )
                return

            if step == "summary":
                # Текст на этапе сводки — просто напомним про кнопки
                await show_screen(chat_id, format_summary(state), kb_summary())
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

            reset_product(chat_id)
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