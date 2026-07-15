import os
import base64
import logging

from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton, BotCommand
from aiogram.filters import Command

logger = logging.getLogger(__name__)

# Состояние диалога для каждого чата (в памяти процесса)
user_states: dict[int, dict] = {}


def reset_state(chat_id: int, keep_photos=False):
    """
    Сбрасывает состояние. 
    Если keep_photos=True, то оставляет накопленные фото (нужно при переходе между шагами).
    По умолчанию после сохранения товара возвращает бота в режим ожидания новых фото ("photos").
    """
    if chat_id not in user_states:
        user_states[chat_id] = {}
        
    user_states[chat_id].update({
        "step": "photos",  # По умолчанию бот ВСЕГДА готов принимать фото
        "images": [] if not keep_photos else user_states[chat_id].get("images", []),
        "name": None,
        "price": None,
        "barcode": None,
        "article_number": None,
        "last_bot_msg_id": None,  # ID сообщения бота, которое мы будем редактировать
    })


def get_photos_keyboard(photos_count: int) -> InlineKeyboardMarkup:
    """Клавиатура, показывающая сколько фото загружено и кнопку завершения"""
    buttons = []
    if photos_count > 0:
        buttons.append([InlineKeyboardButton(text=f"📥 Оформить товар ({photos_count} фото)", callback_query_data="flow_done_photos")])
        buttons.append([InlineKeyboardButton(text="🗑 Сбросить фото", callback_query_data="flow_reset")])
    else:
        buttons.append([InlineKeyboardButton(text="📸 Ожидаю фото товаров...", callback_query_data="none")])
        
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_cancel_keyboard() -> InlineKeyboardMarkup:
    """Кнопка отмены для шагов ввода текста"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="❌ Отменить оформление", callback_query_data="flow_reset")]
    ])


def build_bot(db, upload_base64_to_s3, generate_keywords, Product):
    """
    Собирает Telegram-бота с инлайн-интерфейсом и постоянным режимом накопления фото.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан — бот отключён")
        return None, None

    bot = Bot(token=token)
    dp = Dispatcher()

    async def on_startup(bot: Bot):
        await bot.set_my_commands([
            BotCommand(command="start", description="Запустить/Сбросить бота"),
        ])

    dp.startup.register(on_startup)

    # --- КОМАНДА СТАРТ / СБРОС ---
    @dp.message(Command("start"))
    async def cmd_start(message: Message):
        reset_state(message.chat.id)
        msg = await message.answer(
            "👋 Привет! Я готов к работе в фоновом режиме.\n\n"
            "📸 **Просто отправляй мне фото товаров** в течение дня.\n"
            "Как только решишь внести товар в базу — нажми кнопку под сообщением.",
            reply_markup=get_photos_keyboard(0)
        )
        user_states[message.chat.id]["last_bot_msg_id"] = msg.message_id
        # Удаляем команду пользователя, чтобы не засорять чат
        try:
            await message.delete()
        except Exception:
            pass

    # --- СБРОС СОСТОЯНИЯ (КНОПКА) ---
    @dp.callback_query(F.data == "flow_reset")
    async def handle_reset(callback: CallbackQuery):
        reset_state(callback.message.chat.id)
        await callback.message.edit_text(
            "🗑 Всё сброшено. Я снова готов принимать новые фото.\n\n"
            "📸 Отправляй фотографии товара по одной:",
            reply_markup=get_photos_keyboard(0)
        )
        await callback.answer("Состояние сброшено")

    # --- ПРИЕМ ФОТОГРАФИЙ ---
    @dp.message(F.photo)
    async def handle_photo(message: Message):
        chat_id = message.chat.id
        if chat_id not in user_states:
            reset_state(chat_id)

        state = user_states[chat_id]
        
        # Если пользователь шлет фото, когда бот в процессе оформления другого товара
        if state["step"] != "photos":
            await message.answer("⚠️ Сейчас идет оформление товара. Допиши данные или нажми «Отменить оформление».")
            try:
                await message.delete()
            except Exception:
                pass
            return

        # Скачиваем и сохраняем фото в память
        photo = message.photo[-1]
        file = await bot.get_file(photo.file_id)
        file_bytes = await bot.download_file(file.file_path)
        b64 = base64.b64encode(file_bytes.read()).decode("utf-8")
        state["images"].append(b64)

        photos_count = len(state["images"])

        # Обновляем старое сообщение бота, если оно существует
        if state["last_bot_msg_id"]:
            try:
                await bot.edit_message_text(
                    chat_id=chat_id,
                    message_id=state["last_bot_msg_id"],
                    text=f"✅ Успешно сохранено фото #{photos_count}.\n\n"
                         f"📸 Можешь отправить еще фотографии или нажать кнопку ниже для сохранения:",
                    reply_markup=get_photos_keyboard(photos_count)
                )
            except Exception:
                # Если сообщение удалить не удалось или его нет, шлем новое
                msg = await message.answer(
                    f"✅ Фото #{photos_count} получено.",
                    reply_markup=get_photos_keyboard(photos_count)
                )
                state["last_bot_msg_id"] = msg.message_id
        else:
            msg = await message.answer(
                f"✅ Фото #{photos_count} получено.",
                reply_markup=get_photos_keyboard(photos_count)
            )
            state["last_bot_msg_id"] = msg.message_id

        # Удаляем входящее сообщение с фото от пользователя, чтобы чат оставался идеально чистым
        try:
            await message.delete()
        except Exception:
            pass

    # --- ЗАВЕРШЕНИЕ СБОРА ФОТО -> ПЕРЕХОД К НАЗВАНИЮ ---
    @dp.callback_query(F.data == "flow_done_photos")
    async def handle_done_photos(callback: CallbackQuery):
        chat_id = callback.message.chat.id
        state = user_states.get(chat_id)
        
        if not state or not state["images"]:
            await callback.answer("⚠️ Сначала отправьте хотя бы одно фото!", show_alert=True)
            return

        state["step"] = "name"
        await callback.message.edit_text(
            "✏️ **Шаг 1 из 4**\n\nВведите **название** товара:",
            reply_markup=get_cancel_keyboard()
        )
        await callback.answer()

    # --- ОБРАБОТКА ВВОДА ДАННЫХ (ИМЯ, ЦЕНА, ШТРИХКОД, АРТИКУЛ) ---
    @dp.message(F.text)
    async def handle_text(message: Message):
        chat_id = message.chat.id
        state = user_states.get(chat_id)
        
        # Если бот просто ждет фото, обычный текст игнорируем или просим слать фото
        if not state or state["step"] == "photos":
            # Удаляем мусорные текстовые сообщения
            try:
                await message.delete()
            except Exception:
                pass
            return

        text = message.text.strip()

        # Удаляем входящий текст пользователя, чтобы не засорять чат
        try:
            await message.delete()
        except Exception:
            pass

        if state["step"] == "name":
            state["name"] = text
            state["step"] = "price"
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=state["last_bot_msg_id"],
                text=f"✏️ Название: *{state['name']}*\n\n💰 **Шаг 2 из 4**\nВведите **цену** товара (только цифры, например: 450):",
                parse_mode="Markdown",
                reply_markup=get_cancel_keyboard()
            )
            return

        if state["step"] == "price":
            try:
                state["price"] = float(text.replace(",", "."))
            except ValueError:
                # В случае ошибки ввода временно присылаем предупреждение и удаляем его
                err_msg = await message.answer("⚠️ Введите цену числом, например: 450")
                await asyncio.sleep(3)
                await err_msg.delete()
                return
                
            state["step"] = "barcode"
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=state["last_bot_msg_id"],
                text=f"✏️ Название: *{state['name']}*\n"
                     f"💰 Цена: *{state['price']} ₸*\n\n"
                     f"📦 **Шаг 3 из 4**\nСканируйте или введите **штрихкод**:",
                parse_mode="Markdown",
                reply_markup=get_cancel_keyboard()
            )
            return

        if state["step"] == "barcode":
            state["barcode"] = text
            state["step"] = "article"
            
            # Для последнего шага добавляем специальную инлайн-кнопку пропуска артикула
            finish_keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🚀 Загрузить без артикула", callback_query_data="flow_skip_article")],
                [InlineKeyboardButton(text="❌ Отменить", callback_query_data="flow_reset")]
            ])
            
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=state["last_bot_msg_id"],
                text=f"✏️ Название: *{state['name']}*\n"
                     f"💰 Цена: *{state['price']} ₸*\n"
                     f"📦 Штрихкод: *{state['barcode']}*\n\n"
                     f"🔖 **Шаг 4 из 4**\nВведите **артикул** товара (или нажмите кнопку ниже, чтобы пропустить):",
                parse_mode="Markdown",
                reply_markup=finish_keyboard
            )
            return

        if state["step"] == "article":
            state["article_number"] = text
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=state["last_bot_msg_id"],
                text="⏳ **Сохранение...**\nОтправляю изображения в S3-хранилище и генерирую поисковые ИИ-теги."
            )
            await save_product(chat_id)
            return

    # --- ПРОПУСК АРТИКУЛА (КНОПКА) ---
    @dp.callback_query(F.data == "flow_skip_article")
    async def handle_skip_article(callback: CallbackQuery):
        chat_id = callback.message.chat.id
        state = user_states.get(chat_id)
        if not state or state["step"] != "article":
            await callback.answer("Ошибка шага", show_alert=True)
            return
            
        state["article_number"] = None
        await callback.message.edit_text(
            "⏳ **Сохранение...**\nОтправляю изображения в S3-хранилище и генерирую поисковые ИИ-теги."
        )
        await callback.answer()
        await save_product(chat_id)

    # --- СОХРАНЕНИЕ ТОВАРА НА БЭКЕНД ---
    async def save_product(chat_id: int):
        state = user_states[chat_id]
        try:
            uploaded_urls = []
            for img in state["images"]:
                url = await upload_base64_to_s3(img)
                if url:
                    uploaded_urls.append(url)

            # Генерация ключевых слов через Gemini (твоя встроенная функция)
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

            # Показываем красивый отчет об успешном добавлении
            success_msg = (
                f"✅ **Товар успешно добавлен на сайт!**\n\n"
                f"📦 *{product.name}*\n"
                f"💰 Цена: *{product.price} ₸*\n"
                f"🖼 Фотографий в S3: *{len(uploaded_urls)}*\n"
                f"📦 Штрихкод: *{product.barcode or '—'}*\n"
                f"🔖 Артикул: *{product.article_number or '—'}*\n"
                f"🔍 ИИ-теги: *{product.keywords or '—'}*"
            )
            
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=state["last_bot_msg_id"],
                text=success_msg,
                parse_mode="Markdown"
            )
            
            # Ждем 5 секунд, чтобы пользователь успел прочитать отчет о добавлении,
            # и возвращаем бота в режим бесшумного сбора новых фоток!
            import asyncio
            await asyncio.sleep(5)
            
            reset_state(chat_id) # Очищаем старые данные, переводим step в "photos"
            
            msg = await bot.send_message(
                chat_id=chat_id,
                text="🤖 **Я снова готов к работе!**\n\n"
                     "📸 Просто присылай мне новые фотографии товаров по одной. Я буду копить их в фоне.",
                reply_markup=get_photos_keyboard(0)
            )
            user_states[chat_id]["last_bot_msg_id"] = msg.message_id

        except Exception as e:
            logger.error(f"Bot save_product error: {e}")
            await bot.send_message(
                chat_id=chat_id,
                text="❌ **Произошла критическая ошибка при сохранении.**\n"
                     "Пожалуйста, нажмите /start, чтобы сбросить сессию и попробовать заново."
            )
            reset_state(chat_id)

    return bot, dp
