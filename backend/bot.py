import os
import re
import base64
import asyncio
import logging
from io import BytesIO
from typing import Optional

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

# Кэш результатов поиска: chat_id -> список product_id по индексу выбора
search_cache: dict[int, list[str]] = {}


def get_lock(chat_id: int) -> asyncio.Lock:
    if chat_id not in chat_locks:
        chat_locks[chat_id] = asyncio.Lock()
    return chat_locks[chat_id]


def blank_state():
    return {
        "session_active": False,
        # Общий:  menu | idle
        # Создание: photos | name | price | barcode | article | summary | edit_menu
        #           edit_photos | edit_name | edit_price | edit_barcode | edit_article
        # Управление: find_query | find_results
        #             manage | edit_existing_menu | edit_existing_<field>
        #             confirm_delete
        "step": "idle",
        # данные создаваемого товара
        "images": [],
        "name": None,
        "price": None,
        "barcode": None,
        "article_number": None,
        # управление существующим товаром
        "managing_id": None,
        "managing_doc": None,  # свежий снимок из БД
        # ID единственного экрана
        "screen_message_id": None,
    }


def reset_to_menu(chat_id: int):
    state = user_states.get(chat_id) or blank_state()
    new_state = blank_state()
    new_state["session_active"] = state.get("session_active", False)
    if new_state["session_active"]:
        new_state["step"] = "menu"
    user_states[chat_id] = new_state


def reset_product_data(chat_id: int):
    """Обнуляет данные текущего создаваемого товара, сессию оставляет."""
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
    return (
        "📋 Проверьте данные товара:\n\n"
        f"📸 Фото: {len(state['images'])} шт.\n"
        f"✏️ Название: {state['name']}\n"
        f"💰 Цена: {state['price']} ₸\n"
        f"📦 Штрихкод: {state['barcode'] or '—'}\n"
        f"🔖 Артикул: {state['article_number'] or '—'}\n\n"
        "Всё верно?"
    )


def format_product_card(doc: dict) -> str:
    images = doc.get("images") or []
    return (
        f"📦 {doc.get('name', '(без названия)')}\n\n"
        f"💰 Цена: {doc.get('price', '—')} ₸\n"
        f"📸 Фото: {len(images)} шт.\n"
        f"📦 Штрихкод: {doc.get('barcode') or '—'}\n"
        f"🔖 Артикул: {doc.get('article_number') or '—'}"
    )


# ============= Уведомление админов =============

def _parse_admin_chat_ids() -> list[int]:
    raw = os.environ.get("ADMIN_CHAT_IDS", "").strip()
    if not raw:
        return []
    ids = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(int(part))
        except ValueError:
            logger.warning(f"ADMIN_CHAT_IDS: не могу распарсить '{part}'")
    return ids


async def notify_admins(
    bot: Bot,
    name: str,
    barcode: Optional[str],
    first_image_url: Optional[str],
    link: str,
):
    admin_ids = _parse_admin_chat_ids()
    if not admin_ids:
        logger.info("ADMIN_CHAT_IDS не задан — уведомление не отправлено")
        return

    caption = (
        "🆕 Новая заявка на добавление товара\n\n"
        f"📦 {name}\n"
        f"Штрихкод: {barcode or '—'}\n\n"
        f"Открыть на сайте: {link}"
    )

    for chat_id in admin_ids:
        try:
            if first_image_url:
                await bot.send_photo(chat_id=chat_id, photo=first_image_url, caption=caption)
            else:
                await bot.send_message(chat_id=chat_id, text=caption)
        except Exception as e:
            logger.error(f"notify_admins: не удалось отправить в {chat_id}: {e}")


def build_bot(db, upload_base64_to_s3, generate_keywords, Product, delete_s3_object=None):
    """
    delete_s3_object — опциональная функция для чистки S3 при удалении/замене фото.
    Если её нет, старые фото просто остаются в S3.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан — бот отключён")
        return None, None

    bot = Bot(token=token)
    dp = Dispatcher()

    # ============= Управление единственным экраном =============

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

    def kb_main_menu() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="➕ Добавить товар", callback_data="menu_add")],
            [InlineKeyboardButton(text="🔍 Найти товар", callback_data="menu_find")],
            [InlineKeyboardButton(text="⏹ Завершить сессию", callback_data="stop_session")],
        ])

    def kb_back_to_menu() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="⬅️ В меню", callback_data="go_menu")],
        ])

    # --- клавиатуры для создания товара ---
    def kb_photos(has_photos: bool) -> InlineKeyboardMarkup:
        rows = []
        if has_photos:
            rows.append([InlineKeyboardButton(text="✅ Готово", callback_data="done_photos")])
        rows.append([InlineKeyboardButton(text="⬅️ В меню", callback_data="go_menu")])
        return InlineKeyboardMarkup(inline_keyboard=rows)

    def kb_edit_photos(has_photos: bool) -> InlineKeyboardMarkup:
        rows = []
        if has_photos:
            rows.append([InlineKeyboardButton(text="✅ Готово", callback_data="edit_photos_done")])
        rows.append([InlineKeyboardButton(text="⬅️ Отмена", callback_data="back_to_summary")])
        return InlineKeyboardMarkup(inline_keyboard=rows)

    def kb_summary() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Сохранить", callback_data="save_product")],
            [InlineKeyboardButton(text="✏️ Изменить", callback_data="edit_menu")],
            [InlineKeyboardButton(text="⬅️ В меню", callback_data="go_menu")],
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
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="⬅️ Отмена", callback_data="back_to_summary")],
        ])

    # --- клавиатуры для управления существующим товаром ---
    def kb_search_results(count: int) -> InlineKeyboardMarkup:
        rows = []
        # ряды по 5 кнопок с номерами
        row = []
        for i in range(1, count + 1):
            row.append(InlineKeyboardButton(text=str(i), callback_data=f"pick_{i}"))
            if len(row) == 5:
                rows.append(row)
                row = []
        if row:
            rows.append(row)
        rows.append([InlineKeyboardButton(text="⬅️ В меню", callback_data="go_menu")])
        return InlineKeyboardMarkup(inline_keyboard=rows)

    def kb_manage() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✏️ Редактировать", callback_data="manage_edit")],
            [InlineKeyboardButton(text="🗑 Удалить", callback_data="manage_delete")],
            [InlineKeyboardButton(text="⬅️ В меню", callback_data="go_menu")],
        ])

    def kb_edit_existing_menu() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="📸 Фото", callback_data="ee_photos"),
                InlineKeyboardButton(text="✏️ Название", callback_data="ee_name"),
            ],
            [
                InlineKeyboardButton(text="💰 Цена", callback_data="ee_price"),
                InlineKeyboardButton(text="📦 Штрихкод", callback_data="ee_barcode"),
            ],
            [InlineKeyboardButton(text="🔖 Артикул", callback_data="ee_article")],
            [InlineKeyboardButton(text="⬅️ Назад", callback_data="back_to_manage")],
        ])

    def kb_cancel_ee() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="⬅️ Отмена", callback_data="back_to_ee_menu")],
        ])

    def kb_confirm_delete() -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Да, удалить", callback_data="confirm_delete_yes")],
            [InlineKeyboardButton(text="⬅️ Отмена", callback_data="back_to_manage")],
        ])

    # ============= Команды =============

    async def on_startup(bot: Bot):
        await bot.set_my_commands([
            BotCommand(command="start", description="Открыть меню"),
            BotCommand(command="stop", description="Завершить сессию"),
        ])

    dp.startup.register(on_startup)

    async def show_main_menu(chat_id: int):
        state = user_states.setdefault(chat_id, blank_state())
        state["session_active"] = True
        state["step"] = "menu"
        await show_screen(
            chat_id,
            "👋 Ansar HW · Управление каталогом\n\nЧто хочешь сделать?",
            kb_main_menu(),
        )

    @dp.message(Command("start"))
    async def cmd_start(message: Message):
        chat_id = message.chat.id
        await delete_user_message(message)
        async with get_lock(chat_id):
            await clear_screen(chat_id)
            user_states[chat_id] = blank_state()
            await show_main_menu(chat_id)

    @dp.message(Command("stop"))
    async def cmd_stop(message: Message):
        chat_id = message.chat.id
        await delete_user_message(message)
        async with get_lock(chat_id):
            await clear_screen(chat_id)
            user_states[chat_id] = blank_state()
            await bot.send_message(chat_id, "⏹ Сессия завершена. /start чтобы начать снова.")

    # ============= Меню callbacks =============

    @dp.callback_query(F.data == "go_menu")
    async def cb_go_menu(query: CallbackQuery):
        chat_id = query.message.chat.id
        await query.answer()
        async with get_lock(chat_id):
            reset_to_menu(chat_id)
            await show_main_menu(chat_id)

    @dp.callback_query(F.data == "stop_session")
    async def cb_stop_session(query: CallbackQuery):
        chat_id = query.message.chat.id
        await query.answer()
        async with get_lock(chat_id):
            await clear_screen(chat_id)
            user_states[chat_id] = blank_state()
            await bot.send_message(chat_id, "⏹ Сессия завершена. /start чтобы начать снова.")

    @dp.callback_query(F.data == "menu_add")
    async def cb_menu_add(query: CallbackQuery):
        chat_id = query.message.chat.id
        await query.answer()
        async with get_lock(chat_id):
            reset_product_data(chat_id)  # step -> photos
            await show_screen(
                chat_id,
                "📸 Отправьте фото товара (можно несколько, по одному).\n\n"
                "Когда закончите — нажмите «Готово».",
                kb_photos(has_photos=False),
            )

    @dp.callback_query(F.data == "menu_find")
    async def cb_menu_find(query: CallbackQuery):
        chat_id = query.message.chat.id
        await query.answer()
        async with get_lock(chat_id):
            state = user_states.setdefault(chat_id, blank_state())
            state["step"] = "find_query"
            await show_screen(
                chat_id,
                "🔍 Пришлите название или штрихкод товара сообщением.\n"
                "Поиск не учитывает регистр и работает по части слова.",
                kb_back_to_menu(),
            )

    # ============= Фото =============

    @dp.message(F.photo)
    async def handle_photo(message: Message):
        chat_id = message.chat.id
        state = user_states.get(chat_id)
        if not state or not state.get("session_active"):
            await delete_user_message(message)
            return
        if state["step"] not in ("photos", "edit_photos", "ee_photos"):
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
            step = state["step"]
            if step not in ("photos", "edit_photos", "ee_photos"):
                await delete_user_message(message)
                return

            state["images"].append(b64)
            await delete_user_message(message)

            if step == "photos":
                await show_screen(
                    chat_id,
                    f"📸 Фото добавлено: {len(state['images'])} шт.\n\n"
                    f"Пришлите ещё или нажмите «Готово».",
                    kb_photos(has_photos=True),
                )
            elif step == "edit_photos":
                await show_screen(
                    chat_id,
                    f"📸 Всего фото: {len(state['images'])} шт.\n\n"
                    f"Пришлите ещё или нажмите «Готово» чтобы вернуться к сводке.",
                    kb_edit_photos(has_photos=True),
                )
            else:  # ee_photos — редактирование фото существующего товара
                await show_screen(
                    chat_id,
                    f"📸 Новых фото: {len(state['images'])} шт.\n\n"
                    f"Пришлите ещё или нажмите «Готово» чтобы заменить старые фото.",
                    InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(text="✅ Готово", callback_data="ee_photos_done")],
                        [InlineKeyboardButton(text="⬅️ Отмена", callback_data="back_to_ee_menu")],
                    ]),
                )

    # ============= Создание товара: callbacks =============

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
            await show_screen(chat_id, "✏️ Что хотите изменить?", kb_edit_menu())

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
            state["images"] = []
            state["step"] = "edit_photos"
            await query.answer()
            await show_screen(
                chat_id,
                "📸 Пришлите новые фото товара (можно несколько).\n"
                "⚠️ Старые фото удалены. Когда закончите — нажмите «Готово».",
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
                f"✏️ Текущее название: {state['name']}\n\nПришлите новое название.",
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
                f"💰 Текущая цена: {state['price']} ₸\n\nПришлите новую цену числом.",
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
                f"📦 Текущий штрихкод: {state['barcode'] or '—'}\n\nПришлите новый штрихкод.",
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
                f"🔖 Текущий артикул: {state['article_number'] or '—'}\n\nПришлите новый артикул.",
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

    # ============= Найти товар: callbacks =============

    @dp.callback_query(F.data.startswith("pick_"))
    async def cb_pick_product(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or state["step"] != "find_results":
                await query.answer()
                return
            try:
                idx = int(query.data.split("_", 1)[1]) - 1
            except ValueError:
                await query.answer()
                return
            ids = search_cache.get(chat_id, [])
            if idx < 0 or idx >= len(ids):
                await query.answer("Товар недоступен", show_alert=True)
                return

            product_id = ids[idx]
            doc = await db.products.find_one({"id": product_id})
            if not doc:
                await query.answer("Товар не найден в БД", show_alert=True)
                return

            state["managing_id"] = product_id
            state["managing_doc"] = doc
            state["step"] = "manage"
            await query.answer()
            await show_screen(chat_id, format_product_card(doc), kb_manage())

    @dp.callback_query(F.data == "manage_edit")
    async def cb_manage_edit(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or state["step"] != "manage":
                await query.answer()
                return
            state["step"] = "edit_existing_menu"
            await query.answer()
            await show_screen(chat_id, "✏️ Что изменить?", kb_edit_existing_menu())

    @dp.callback_query(F.data == "back_to_manage")
    async def cb_back_to_manage(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("managing_id"):
                await query.answer()
                return
            # перечитываем свежий снимок из БД
            doc = await db.products.find_one({"id": state["managing_id"]})
            if not doc:
                # товар удалили — обратно в меню
                reset_to_menu(chat_id)
                await query.answer("Товар больше не существует", show_alert=True)
                await show_main_menu(chat_id)
                return
            state["managing_doc"] = doc
            state["step"] = "manage"
            await query.answer()
            await show_screen(chat_id, format_product_card(doc), kb_manage())

    @dp.callback_query(F.data == "back_to_ee_menu")
    async def cb_back_to_ee_menu(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state:
                await query.answer()
                return
            state["step"] = "edit_existing_menu"
            state["images"] = []  # сбрасываем буфер новых фото
            await query.answer()
            await show_screen(chat_id, "✏️ Что изменить?", kb_edit_existing_menu())

    # --- редактирование конкретных полей существующего товара ---
    @dp.callback_query(F.data == "ee_name")
    async def cb_ee_name(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("managing_doc"):
                await query.answer()
                return
            state["step"] = "ee_name"
            await query.answer()
            await show_screen(
                chat_id,
                f"✏️ Текущее название: {state['managing_doc'].get('name')}\n\nПришлите новое название.",
                kb_cancel_ee(),
            )

    @dp.callback_query(F.data == "ee_price")
    async def cb_ee_price(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("managing_doc"):
                await query.answer()
                return
            state["step"] = "ee_price"
            await query.answer()
            await show_screen(
                chat_id,
                f"💰 Текущая цена: {state['managing_doc'].get('price')} ₸\n\nПришлите новую цену числом.",
                kb_cancel_ee(),
            )

    @dp.callback_query(F.data == "ee_barcode")
    async def cb_ee_barcode(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("managing_doc"):
                await query.answer()
                return
            state["step"] = "ee_barcode"
            await query.answer()
            await show_screen(
                chat_id,
                f"📦 Текущий штрихкод: {state['managing_doc'].get('barcode') or '—'}\n\n"
                f"Пришлите новый штрихкод. Напишите «-» чтобы очистить.",
                kb_cancel_ee(),
            )

    @dp.callback_query(F.data == "ee_article")
    async def cb_ee_article(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("managing_doc"):
                await query.answer()
                return
            state["step"] = "ee_article"
            await query.answer()
            await show_screen(
                chat_id,
                f"🔖 Текущий артикул: {state['managing_doc'].get('article_number') or '—'}\n\n"
                f"Пришлите новый артикул. Напишите «-» чтобы очистить.",
                kb_cancel_ee(),
            )

    @dp.callback_query(F.data == "ee_photos")
    async def cb_ee_photos(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("managing_doc"):
                await query.answer()
                return
            state["step"] = "ee_photos"
            state["images"] = []
            await query.answer()
            await show_screen(
                chat_id,
                "📸 Пришлите новые фото товара.\n"
                "⚠️ ВНИМАНИЕ: старые фото будут удалены безвозвратно (обнуление до нуля).\n\n"
                "Когда закончите — нажмите «Готово».",
                InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="⬅️ Отмена", callback_data="back_to_ee_menu")],
                ]),
            )

    @dp.callback_query(F.data == "ee_photos_done")
    async def cb_ee_photos_done(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or state["step"] != "ee_photos" or not state["images"]:
                await query.answer()
                return
            await query.answer()
            await show_screen(chat_id, "⏳ Заменяю фото...")
            await apply_ee_photos(chat_id)

    # --- удаление ---
    @dp.callback_query(F.data == "manage_delete")
    async def cb_manage_delete(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or not state.get("managing_doc"):
                await query.answer()
                return
            state["step"] = "confirm_delete"
            await query.answer()
            doc = state["managing_doc"]
            await show_screen(
                chat_id,
                f"🗑 Точно удалить товар «{doc.get('name')}»?\n\n"
                f"Это действие необратимо: удалятся данные из БД и все фото из S3.",
                kb_confirm_delete(),
            )

    @dp.callback_query(F.data == "confirm_delete_yes")
    async def cb_confirm_delete_yes(query: CallbackQuery):
        chat_id = query.message.chat.id
        async with get_lock(chat_id):
            state = user_states.get(chat_id)
            if not state or state["step"] != "confirm_delete" or not state.get("managing_doc"):
                await query.answer()
                return
            await query.answer()
            await show_screen(chat_id, "⏳ Удаляю товар...")
            await do_delete_product(chat_id)

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

            # --- поиск ---
            if step == "find_query":
                await show_screen(chat_id, f"⏳ Ищу «{text}»...", kb_back_to_menu())
                await perform_search(chat_id, text)
                return

            # --- обычный флоу создания ---
            if step == "photos":
                await show_screen(
                    chat_id,
                    "⚠️ Сейчас жду фото. Пришлите фото или нажмите «Готово».",
                    kb_photos(has_photos=bool(state["images"])),
                )
                return

            if step == "name":
                state["name"] = text
                state["step"] = "price"
                await show_screen(chat_id, f"✏️ Название: {text}\n\n💰 Пришлите цену числом.")
                return

            if step == "price":
                try:
                    state["price"] = float(text.replace(",", "."))
                except ValueError:
                    await show_screen(chat_id, "⚠️ Цена должна быть числом. Пришлите ещё раз.")
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
                    f"🔖 Пришлите артикул. Если нет — напишите «нет» или «-».",
                )
                return

            if step == "article":
                state["article_number"] = None if text.lower() in ("нет", "-", "no", "none") else text
                state["step"] = "summary"
                await show_screen(chat_id, format_summary(state), kb_summary())
                return

            # --- редактирование данных создаваемого товара ---
            if step == "edit_name":
                state["name"] = text
                state["step"] = "summary"
                await show_screen(chat_id, format_summary(state), kb_summary())
                return

            if step == "edit_price":
                try:
                    state["price"] = float(text.replace(",", "."))
                except ValueError:
                    await show_screen(chat_id, "⚠️ Цена должна быть числом.", kb_cancel_edit())
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

            # --- редактирование существующего товара ---
            if step == "ee_name":
                await apply_ee_field(chat_id, "name", text)
                return
            if step == "ee_price":
                try:
                    val = float(text.replace(",", "."))
                except ValueError:
                    await show_screen(chat_id, "⚠️ Цена должна быть числом.", kb_cancel_ee())
                    return
                await apply_ee_field(chat_id, "price", val)
                return
            if step == "ee_barcode":
                val = None if text.lower() in ("нет", "-", "no", "none") else text
                await apply_ee_field(chat_id, "barcode", val)
                return
            if step == "ee_article":
                val = None if text.lower() in ("нет", "-", "no", "none") else text
                await apply_ee_field(chat_id, "article_number", val)
                return

    # ============= Действия: поиск, сохранение, редактирование, удаление =============

    async def perform_search(chat_id: int, query: str):
        state = user_states.setdefault(chat_id, blank_state())
        try:
            # Ищем по name (regex) и barcode (точное совпадение)
            regex = {"$regex": re.escape(query), "$options": "i"}
            or_query = {
                "$or": [
                    {"name": regex},
                    {"barcode": query},
                    {"article_number": regex},
                    {"keywords": regex},
                ]
            }
            docs = await db.products.find(or_query).sort("created_at", -1).to_list(100)
        except Exception as e:
            logger.error(f"Search failed: {e}")
            await show_screen(chat_id, "❌ Ошибка поиска. Попробуйте позже.", kb_back_to_menu())
            return

        if not docs:
            await show_screen(
                chat_id,
                f"🔍 По запросу «{query}» ничего не найдено.\n\nПришлите другой запрос.",
                kb_back_to_menu(),
            )
            state["step"] = "find_query"
            return

        # Сохраняем порядок IDs для выбора по номеру
        search_cache[chat_id] = [d["id"] for d in docs]
        state["step"] = "find_results"

        lines = [f"🔍 Найдено {len(docs)} товар(ов) по запросу «{query}»:\n"]
        for i, d in enumerate(docs, 1):
            barcode = d.get("barcode") or "—"
            lines.append(f"{i}. {d.get('name')} — {d.get('price')} ₸  ·  {barcode}")
        lines.append("\nНажмите номер товара, чтобы открыть его.")
        await show_screen(chat_id, "\n".join(lines), kb_search_results(len(docs)))

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

            reset_to_menu(chat_id)
            await show_screen(
                chat_id,
                f"✅ Товар добавлен: {product.name} — {product.price} ₸\n\n"
                f"Что дальше?",
                kb_main_menu(),
            )
        except Exception as e:
            logger.error(f"Bot save_product error: {e}")
            reset_to_menu(chat_id)
            await show_screen(
                chat_id,
                "❌ Ошибка при сохранении. Попробуйте снова.",
                kb_main_menu(),
            )

    async def apply_ee_field(chat_id: int, field: str, value):
        """Редактирует одно поле у существующего товара."""
        state = user_states.get(chat_id)
        if not state or not state.get("managing_id"):
            return
        try:
            from datetime import datetime, timezone
            await db.products.update_one(
                {"id": state["managing_id"]},
                {"$set": {field: value, "updated_at": datetime.now(timezone.utc)}},
            )
            doc = await db.products.find_one({"id": state["managing_id"]})
            state["managing_doc"] = doc
            state["step"] = "manage"
            await show_screen(
                chat_id,
                f"✅ Изменено\n\n{format_product_card(doc)}",
                kb_manage(),
            )
        except Exception as e:
            logger.error(f"apply_ee_field error: {e}")
            await show_screen(chat_id, "❌ Ошибка при сохранении.", kb_manage())

    async def apply_ee_photos(chat_id: int):
        """Заменяет все фото товара новыми. Старые удаляет из S3."""
        state = user_states.get(chat_id)
        if not state or not state.get("managing_id") or not state.get("managing_doc"):
            return
        try:
            # Заливаем новые
            new_urls = []
            for img in state["images"]:
                url = await upload_base64_to_s3(img)
                if url:
                    new_urls.append(url)

            # Удаляем старые из S3 если есть функция
            old_urls = state["managing_doc"].get("images") or []
            if delete_s3_object:
                for old in old_urls:
                    try:
                        await delete_s3_object(old)
                    except Exception as e:
                        logger.warning(f"Не удалось удалить старое фото {old}: {e}")

            from datetime import datetime, timezone
            await db.products.update_one(
                {"id": state["managing_id"]},
                {"$set": {"images": new_urls, "updated_at": datetime.now(timezone.utc)}},
            )
            doc = await db.products.find_one({"id": state["managing_id"]})
            state["managing_doc"] = doc
            state["images"] = []
            state["step"] = "manage"
            await show_screen(
                chat_id,
                f"✅ Фото заменены\n\n{format_product_card(doc)}",
                kb_manage(),
            )
        except Exception as e:
            logger.error(f"apply_ee_photos error: {e}")
            await show_screen(chat_id, "❌ Ошибка при замене фото.", kb_manage())

    async def do_delete_product(chat_id: int):
        state = user_states.get(chat_id)
        if not state or not state.get("managing_id"):
            return
        try:
            doc = state.get("managing_doc") or await db.products.find_one({"id": state["managing_id"]})
            if not doc:
                reset_to_menu(chat_id)
                await show_screen(chat_id, "Товар уже удалён.", kb_main_menu())
                return

            # Чистим S3
            if delete_s3_object:
                for url in doc.get("images") or []:
                    try:
                        await delete_s3_object(url)
                    except Exception as e:
                        logger.warning(f"S3 delete failed for {url}: {e}")

            await db.products.delete_one({"id": state["managing_id"]})

            reset_to_menu(chat_id)
            await show_screen(
                chat_id,
                f"🗑 Товар «{doc.get('name')}» удалён.\n\nЧто дальше?",
                kb_main_menu(),
            )
        except Exception as e:
            logger.error(f"do_delete_product error: {e}")
            reset_to_menu(chat_id)
            await show_screen(chat_id, "❌ Ошибка при удалении.", kb_main_menu())

    return bot, dp