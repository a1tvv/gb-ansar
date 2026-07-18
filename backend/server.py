from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import os
import logging
import httpx
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import re
import aioboto3
import base64

from bot import build_bot, notify_admins

s3_endpoint = os.environ.get('S3_ENDPOINT_URL')
s3_bucket = os.environ.get('S3_BUCKET_NAME')
s3_access_key = os.environ.get('S3_ACCESS_KEY')
s3_secret_key = os.environ.get('S3_SECRET_KEY')

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'gb-ansar-db')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Публичный URL сайта — для формирования ссылок в уведомлениях админам
PUBLIC_SITE_URL = os.environ.get('PUBLIC_SITE_URL', 'https://gb-ansar.vercel.app')


# ============= Models =============

class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    subcategories: List[str] = []


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    images: List[str] = Field(default_factory=list)
    category: Optional[str] = None
    subcategory: Optional[str] = None
    barcode: Optional[str] = None
    article_number: Optional[str] = None
    ai_features: Optional[str] = None
    keywords: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProductCreate(BaseModel):
    name: str
    price: float
    images: List[str] = Field(..., min_length=1, max_length=5)
    category: Optional[str] = None
    subcategory: Optional[str] = None
    barcode: Optional[str] = None
    article_number: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    images: Optional[List[str]] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    barcode: Optional[str] = None
    article_number: Optional[str] = None


class PhotoSearchRequest(BaseModel):
    image_base64: str


class SearchResponse(BaseModel):
    products: List[Product]
    confidence: Optional[str] = None
    ai_analysis: Optional[str] = None


# ============= Pending Product Models =============

class PendingProduct(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: Optional[str] = None
    images: List[str] = Field(default_factory=list)
    barcode: Optional[str] = None
    article_number: Optional[str] = None
    note: Optional[str] = None  # свободный комментарий от кассира
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PendingProductCreate(BaseModel):
    name: Optional[str] = None
    images: List[str] = Field(..., min_length=1, max_length=5)
    barcode: Optional[str] = None
    article_number: Optional[str] = None
    note: Optional[str] = None


class PendingApproveRequest(BaseModel):
    """Данные которые админ вводит когда оформляет pending в реальный товар."""
    name: str
    price: float
    images: List[str] = Field(..., min_length=1, max_length=5)
    barcode: Optional[str] = None
    article_number: Optional[str] = None


# ============= Helpers =============

async def call_openrouter(messages: list, retries=3) -> str:
    api_key = os.environ.get('OPENROUTER_API_KEY') or os.environ.get('EMERGENT_LLM_KEY')
    async with httpx.AsyncClient(timeout=60.0) as http_client:
        for i in range(retries):
            response = await http_client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": "google/gemini-3.5-flash", "messages": messages}
            )
            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content'].strip()
            elif response.status_code == 429:
                await asyncio.sleep(2 ** (i + 1))
            else:
                logging.error(f"API Error: {response.status_code} - {response.text}")
                return ""
    return ""


async def upload_base64_to_s3(base64_data: str, folder: str = "products") -> str:
    if not all([s3_endpoint, s3_bucket, s3_access_key, s3_secret_key]):
        logger.error("S3 credentials are not fully set!")
        return ""
    try:
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]
        image_bytes = base64.b64decode(base64_data)
        file_name = f"{folder}/{uuid.uuid4()}.jpg"
        session = aioboto3.Session()
        async with session.client(
            's3',
            endpoint_url=s3_endpoint,
            aws_access_key_id=s3_access_key,
            aws_secret_access_key=s3_secret_key
        ) as s3:
            await s3.put_object(
                Bucket=s3_bucket,
                Key=file_name,
                Body=image_bytes,
                ContentType='image/jpeg',
                ACL='public-read'
            )
        domain = s3_endpoint.replace("https://", "")
        return f"https://{s3_bucket}.{domain}/{file_name}"
    except Exception as e:
        logger.error(f"Error uploading to S3: {str(e)}")
        return ""


async def delete_s3_object(image_url: str) -> bool:
    """Удаляет объект из S3 по его публичному URL."""
    if not all([s3_endpoint, s3_bucket, s3_access_key, s3_secret_key]):
        return False
    if not image_url:
        return False
    try:
        # Извлекаем ключ из URL: https://ansar-home.ams3.digitaloceanspaces.com/products/uuid.jpg -> products/uuid.jpg
        domain = s3_endpoint.replace("https://", "")
        prefix = f"https://{s3_bucket}.{domain}/"
        if not image_url.startswith(prefix):
            logger.warning(f"URL не из нашего бакета, пропускаю: {image_url}")
            return False
        key = image_url[len(prefix):]

        session = aioboto3.Session()
        async with session.client(
            's3',
            endpoint_url=s3_endpoint,
            aws_access_key_id=s3_access_key,
            aws_secret_access_key=s3_secret_key
        ) as s3:
            await s3.delete_object(Bucket=s3_bucket, Key=key)
        logger.info(f"S3 object deleted: {key}")
        return True
    except Exception as e:
        logger.error(f"Error deleting S3 object: {e}")
        return False


async def upload_images_to_s3(images: List[str], folder: str = "products") -> List[str]:
    """Пропускает через S3 список base64/URL. base64 заливает, готовые URL оставляет."""
    urls = []
    for image_data in images:
        if image_data.startswith("data:image") or len(image_data) > 1000:
            url = await upload_base64_to_s3(image_data, folder=folder)
            if url:
                urls.append(url)
        else:
            urls.append(image_data)
    return urls


async def generate_keywords(name: str, first_image: str) -> str:
    if not (first_image.startswith("data:image") or len(first_image) > 1000):
        return ""
    try:
        img = first_image.split(",")[1] if "," in first_image else first_image
        prompt = (
            f"Официальное название этого товара: '{name}'. "
            "Посмотри на фото и напиши 10 синонимов, ассоциаций или простых слов, "
            "которыми обычный человек мог бы назвать этот предмет (например: если это кружка, напиши 'стакан чашка бокал'). "
            "Верни ТОЛЬКО слова через пробел, без запятых и других символов. Никаких пояснений."
        )
        messages = [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}"}}
            ]
        }]
        resp = await call_openrouter(messages)
        if resp:
            kw = resp.replace(',', ' ').replace('\n', ' ').strip()
            logging.info(f"Generated keywords for {name}: {kw}")
            return kw
    except Exception as e:
        logging.error(f"Failed to generate keywords: {e}")
    return ""


def product_doc_to_model(doc: dict) -> dict:
    if 'image_base64' in doc and 'images' not in doc:
        doc['images'] = [doc['image_base64']] if doc['image_base64'] else []
        del doc['image_base64']
    if '_id' in doc:
        del doc['_id']
    return doc


# ============= Bot bootstrap =============

bot_instance = None  # понадобится для уведомлений
bot_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.products.create_index("id")
    await db.products.create_index("name")
    await db.products.create_index("barcode")
    await db.pending_products.create_index("id")
    await db.pending_products.create_index("created_at")

    global bot_task, bot_instance
    bot, dp = build_bot(db, upload_base64_to_s3, generate_keywords, Product)
    if bot and dp:
        bot_instance = bot
        bot_task = asyncio.create_task(dp.start_polling(bot))
        logging.info("Telegram bot polling started")
    else:
        logging.info("Telegram bot NOT started (нет TELEGRAM_BOT_TOKEN)")

    yield

    if bot_task:
        bot_task.cancel()
    client.close()


app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============= Category Routes =============

@api_router.get("/categories", response_model=List[Category])
async def get_categories():
    categories = await db.categories.find().to_list(1000)
    return [Category(**{k: v for k, v in c.items() if k != '_id'}) for c in categories] if categories else []


@api_router.post("/categories", response_model=Category)
async def create_category(category: Category):
    await db.categories.insert_one(category.dict())
    return category


# ============= Product Routes =============

@api_router.post("/products", response_model=Product)
async def create_product(product_data: ProductCreate):
    product_dict = product_data.dict()
    uploaded_urls = await upload_images_to_s3(product_dict.get("images", []))
    product_dict["keywords"] = await generate_keywords(product_data.name, product_data.images[0])
    product_dict["images"] = uploaded_urls
    product = Product(**product_dict)
    await db.products.insert_one(product.dict())
    return product


@api_router.get("/products", response_model=List[Product])
async def get_products(
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    skip: int = 0,
    limit: int = 20
):
    query = {}
    if category:
        query["category"] = category
    if subcategory:
        query["subcategory"] = subcategory

    products = await db.products.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    result = []
    for p in products:
        doc = product_doc_to_model(p)
        if doc.get('images') and len(doc['images']) > 1:
            doc['images'] = [doc['images'][0]]
        result.append(Product(**doc))
    return result


@api_router.get("/products/search/text", response_model=List[Product])
async def search_by_text(q: str):
    products = await db.products.find({"name": {"$regex": q, "$options": "i"}}).sort("created_at", -1).to_list(1000)
    return [Product(**product_doc_to_model(p)) for p in products]


@api_router.get("/products/search/barcode", response_model=Product)
async def search_by_barcode(barcode: str):
    product = await db.products.find_one({"barcode": barcode})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**product_doc_to_model(product))


@api_router.post("/products/search/photo", response_model=SearchResponse)
async def search_by_photo(request: PhotoSearchRequest):
    try:
        img_base64 = request.image_base64
        if "," in img_base64:
            img_base64 = img_base64.split(",")[1]

        # ШАГ 1: ИИ называет предмет
        messages = [{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Ты - система распознавания товаров. Назови главный предмет на фото ОДНИМ-ДВУМЯ СЛОВАМИ на русском языке (например: Кружка, Мочалка, Ваза). Не пиши никаких объяснений, только само название предмета."
                },
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}}
            ]
        }]

        ai_keyword = await call_openrouter(messages)
        logging.info(f"AI recognized: {ai_keyword}")

        if not ai_keyword:
            return SearchResponse(products=[], confidence="no_match", ai_analysis="Не удалось распознать товар")

        clean_keyword = ai_keyword.strip('."\' \n').split('\n')[0]
        first_word = clean_keyword.split('-')[0].split(' ')[0]

        regex_query = {
            "$or": [
                {"name": {"$regex": first_word, "$options": "i"}},
                {"keywords": {"$regex": first_word, "$options": "i"}}
            ]
        }
        matched_docs = await db.products.find(regex_query).to_list(20)

        if not matched_docs:
            return SearchResponse(
                products=[],
                confidence="not_found",
                ai_analysis=f"Товара «{clean_keyword}» нет в каталоге"
            )

        # ШАГ 2: всегда визуально сравниваем с эталонами (даже если кандидат один)
        # ИИ должен подтвердить что это тот самый товар, а не просто похожий
        content = [{
            "type": "text",
            "text": (
                "На ПЕРВОМ фото — товар, сфотографированный кассиром. "
                "Далее идут эталонные фото товаров из каталога с их номерами.\n\n"
                "Твоя задача: определить какой ИМЕННО из эталонов на первом фото. "
                "Сравнивай форму, упаковку, надписи, бренд, размер — форма важнее цвета.\n\n"
                "ВАЖНО: если ни один эталон не совпадает уверенно с фото кассира — верни 0. "
                "Лучше честный 0, чем случайное угадывание.\n\n"
                "ФОРМАТ ОТВЕТА — ТОЛЬКО ОДНА ЦИФРА (номер эталона или 0). Без пояснений."
            )
        }]

        content.append({"type": "text", "text": "ФОТО_КАССИРА:"})
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}
        })

        candidates_with_images = []
        for i, p in enumerate(matched_docs):
            imgs = p.get("images") or []
            if imgs:
                candidates_with_images.append(p)
                content.append({
                    "type": "text",
                    "text": f"ЭТАЛОН #{len(candidates_with_images)} — {p['name']}:"
                })
                content.append({
                    "type": "image_url",
                    "image_url": {"url": imgs[0]}
                })

        # Если ни у одного кандидата нет фото — сравнивать не с чем
        if not candidates_with_images:
            return SearchResponse(
                products=[],
                confidence="not_found",
                ai_analysis=f"Не удалось сравнить с эталонами"
            )

        refine_result = await call_openrouter([{"role": "user", "content": content}])
        logging.info(f"AI refined: {refine_result}")

        match = re.search(r'\d+', refine_result)
        if match:
            idx = int(match.group()) - 1
            if 0 <= idx < len(candidates_with_images):
                chosen = candidates_with_images[idx]
                return SearchResponse(
                    products=[Product(**product_doc_to_model(chosen))],
                    confidence="high",
                    ai_analysis=f"Распознано: {chosen['name']}"
                )

        # ИИ вернул 0 или что-то невалидное — товар не найден
        return SearchResponse(
            products=[],
            confidence="not_found",
            ai_analysis=f"Похожего товара «{clean_keyword}» нет в каталоге"
        )

    except Exception as e:
        logging.error(f"Error in photo search: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**product_doc_to_model(product))


@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, product_data: ProductUpdate):
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    update_data = {k: v for k, v in product_data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.products.update_one({"id": product_id}, {"$set": update_data})
    updated_product = await db.products.find_one({"id": product_id})
    return Product(**product_doc_to_model(updated_product))


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Чистим S3 при удалении
    for img_url in product.get("images", []):
        await delete_s3_object(img_url)

    await db.products.delete_one({"id": product_id})
    return {"message": "Product deleted successfully"}


# ============= Pending Product Routes =============

@api_router.post("/pending-products", response_model=PendingProduct)
async def create_pending_product(data: PendingProductCreate):
    """Кассир отправляет заявку на рассмотрение."""
    payload = data.dict()
    payload["images"] = await upload_images_to_s3(payload.get("images", []), folder="pending")

    pending = PendingProduct(**payload)
    await db.pending_products.insert_one(pending.dict())

    # Уведомляем админов в Telegram
    try:
        if bot_instance is not None:
            link = f"{PUBLIC_SITE_URL}/pending-detail?id={pending.id}"
            await notify_admins(
                bot_instance,
                name=pending.name or "(без названия)",
                barcode=pending.barcode,
                first_image_url=pending.images[0] if pending.images else None,
                link=link,
            )
    except Exception as e:
        logger.error(f"Failed to notify admins: {e}")

    return pending


@api_router.get("/pending-products", response_model=List[PendingProduct])
async def get_pending_products(skip: int = 0, limit: int = 20):
    docs = await db.pending_products.find().sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    result = []
    for d in docs:
        if '_id' in d:
            del d['_id']
        result.append(PendingProduct(**d))
    return result


@api_router.get("/pending-products/{pending_id}", response_model=PendingProduct)
async def get_pending_product(pending_id: str):
    doc = await db.pending_products.find_one({"id": pending_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Pending product not found")
    if '_id' in doc:
        del doc['_id']
    return PendingProduct(**doc)


@api_router.post("/pending-products/{pending_id}/approve", response_model=Product)
async def approve_pending_product(pending_id: str, data: PendingApproveRequest):
    """Админ оформляет pending: создаёт полноценный товар, удаляет заявку и её старые фото."""
    pending = await db.pending_products.find_one({"id": pending_id})
    if not pending:
        raise HTTPException(status_code=404, detail="Pending product not found")

    # Заливаем новые фото (те что прислал админ) — они могут быть base64 или готовые URL
    product_dict = data.dict()
    product_dict["images"] = await upload_images_to_s3(product_dict.get("images", []))
    product_dict["keywords"] = await generate_keywords(data.name, data.images[0])

    product = Product(**product_dict)
    await db.products.insert_one(product.dict())

    # Удаляем старые фото из pending (если админ их не переиспользовал)
    admin_urls = set(product_dict["images"])
    for old_url in pending.get("images", []):
        if old_url not in admin_urls:
            await delete_s3_object(old_url)

    await db.pending_products.delete_one({"id": pending_id})
    return product


@api_router.delete("/pending-products/{pending_id}")
async def reject_pending_product(pending_id: str):
    """Админ отклоняет: удаляет запись и все её фото из S3."""
    pending = await db.pending_products.find_one({"id": pending_id})
    if not pending:
        raise HTTPException(status_code=404, detail="Pending product not found")

    for img_url in pending.get("images", []):
        await delete_s3_object(img_url)

    await db.pending_products.delete_one({"id": pending_id})
    return {"message": "Pending product rejected and deleted"}


# ============= Meta =============

@api_router.get("/")
async def root():
    return {"message": "Smart AI Product Catalog API", "version": "2.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(api_router)