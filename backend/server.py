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
from datetime import datetime, timezone, timedelta
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
    recognized_name: Optional[str] = None


class PendingProduct(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: Optional[str] = None
    images: List[str] = Field(default_factory=list)
    barcode: Optional[str] = None
    article_number: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PendingProductCreate(BaseModel):
    name: Optional[str] = None
    images: List[str] = Field(..., min_length=1, max_length=5)
    barcode: Optional[str] = None
    article_number: Optional[str] = None
    note: Optional[str] = None


class PendingApproveRequest(BaseModel):
    name: str
    price: float
    images: List[str] = Field(..., min_length=1, max_length=5)
    barcode: Optional[str] = None
    article_number: Optional[str] = None


class SearchLog(BaseModel):
    """Запись о каждом поиске по фото."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    query: str                  # что распознал ИИ, как есть
    query_lower: str            # нижний регистр — для группировки
    found: bool                 # нашлось ли что-то в каталоге
    results_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    if not all([s3_endpoint, s3_bucket, s3_access_key, s3_secret_key]):
        return False
    if not image_url:
        return False
    try:
        domain = s3_endpoint.replace("https://", "")
        prefix = f"https://{s3_bucket}.{domain}/"
        if not image_url.startswith(prefix):
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
        return True
    except Exception as e:
        logger.error(f"Error deleting S3 object: {e}")
        return False


async def upload_images_to_s3(images: List[str], folder: str = "products") -> List[str]:
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
            "которыми обычный человек мог бы назвать этот предмет. "
            "Верни ТОЛЬКО слова через пробел, без запятых. Никаких пояснений."
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
            return kw
    except Exception as e:
        logging.error(f"Failed to generate keywords: {e}")
    return ""


async def log_search(query: str, found: bool, results_count: int = 0):
    """
    Пишет запись о поиске. Вызывается фоном — не задерживает ответ кассиру.
    Ошибка записи лога не должна ломать поиск.
    """
    try:
        if not query:
            return
        entry = SearchLog(
            query=query.strip(),
            query_lower=query.strip().lower(),
            found=found,
            results_count=results_count,
        )
        await db.search_logs.insert_one(entry.dict())
    except Exception as e:
        logger.error(f"log_search failed: {e}")


def product_doc_to_model(doc: dict) -> dict:
    if 'image_base64' in doc and 'images' not in doc:
        doc['images'] = [doc['image_base64']] if doc['image_base64'] else []
        del doc['image_base64']
    if '_id' in doc:
        del doc['_id']
    return doc


# ============= Bot bootstrap =============

bot_instance = None
bot_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.products.create_index("id")
    await db.products.create_index("name")
    await db.products.create_index("barcode")
    await db.pending_products.create_index("id")
    await db.pending_products.create_index("created_at")
    await db.search_logs.create_index("created_at")
    await db.search_logs.create_index("query_lower")
    await db.search_logs.create_index("found")

    global bot_task, bot_instance
    bot, dp = build_bot(db, upload_base64_to_s3, generate_keywords, Product, delete_s3_object)
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


# ============= Categories =============

@api_router.get("/categories", response_model=List[Category])
async def get_categories():
    categories = await db.categories.find().to_list(1000)
    return [Category(**{k: v for k, v in c.items() if k != '_id'}) for c in categories] if categories else []


@api_router.post("/categories", response_model=Category)
async def create_category(category: Category):
    await db.categories.insert_one(category.dict())
    return category


# ============= Products =============

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


@api_router.get("/products/paged")
async def get_products_paged(
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    page: int = 1,
    limit: int = 20
):
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20

    query = {}
    if category:
        query["category"] = category
    if subcategory:
        query["subcategory"] = subcategory

    total = await db.products.count_documents(query)
    pages = (total + limit - 1) // limit

    skip = (page - 1) * limit
    docs = await db.products.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

    items = []
    for p in docs:
        doc = product_doc_to_model(p)
        if doc.get('images') and len(doc['images']) > 1:
            doc['images'] = [doc['images'][0]]
        items.append(Product(**doc))

    return {"items": items, "total": total, "page": page, "pages": pages, "limit": limit}


@api_router.get("/products/random", response_model=List[Product])
async def get_products_random(limit: int = 4):
    """Случайные товары для секции 'Интересное'."""
    if limit < 1 or limit > 20:
        limit = 4

    docs = await db.products.aggregate([
        {"$sample": {"size": limit}}
    ]).to_list(limit)

    result = []
    for p in docs:
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
    """
    Один шаг ИИ, без гадания.
    - ИИ говорит одно слово (что на фото)
    - Ищем в БД по name, потом добираем по keywords
    - Каждый поиск пишется в search_logs
    """
    try:
        img_base64 = request.image_base64
        if "," in img_base64:
            img_base64 = img_base64.split(",")[1]

        messages = [{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Ты - система распознавания товаров. "
                        "Назови главный предмет на фото ОДНИМ-ДВУМЯ СЛОВАМИ на русском языке "
                        "(например: Кружка, Мочалка, Ваза). "
                        "Не пиши объяснений, только само название предмета."
                    ),
                },
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}}
            ]
        }]

        ai_keyword = await call_openrouter(messages)
        logging.info(f"AI recognized: {ai_keyword}")

        if not ai_keyword:
            asyncio.create_task(log_search("(не распознано)", found=False, results_count=0))
            return SearchResponse(
                products=[],
                confidence="not_found",
                ai_analysis="ИИ не смог распознать товар",
                recognized_name=None,
            )

        clean_keyword = ai_keyword.strip('."\' \n').split('\n')[0]
        first_word = clean_keyword.split('-')[0].split(' ')[0]

        # Сначала все совпадения по name
        name_matches = await db.products.find(
            {"name": {"$regex": first_word, "$options": "i"}}
        ).sort("created_at", -1).to_list(30)

        matched_docs = list(name_matches)
        matched_ids = {d["id"] for d in matched_docs}

        # Если по name меньше 10, добираем из keywords
        TARGET = 10
        if len(matched_docs) < TARGET:
            keyword_matches = await db.products.find(
                {"keywords": {"$regex": first_word, "$options": "i"}}
            ).sort("created_at", -1).to_list(30)

            for doc in keyword_matches:
                if doc["id"] not in matched_ids:
                    matched_docs.append(doc)
                    matched_ids.add(doc["id"])
                    if len(matched_docs) >= TARGET:
                        break

        # Пишем лог фоном — ответ кассиру не задерживается
        asyncio.create_task(
            log_search(clean_keyword, found=bool(matched_docs), results_count=len(matched_docs))
        )

        if not matched_docs:
            return SearchResponse(
                products=[],
                confidence="not_found",
                ai_analysis=f"Товара «{clean_keyword}» нет в каталоге",
                recognized_name=clean_keyword,
            )

        products_list = [Product(**product_doc_to_model(p)) for p in matched_docs]

        if len(products_list) == 1:
            return SearchResponse(
                products=products_list,
                confidence="single",
                ai_analysis=f"Распознано: {clean_keyword}",
                recognized_name=clean_keyword,
            )

        return SearchResponse(
            products=products_list,
            confidence="multiple",
            ai_analysis=f"Найдено {len(products_list)} вариантов «{clean_keyword}»",
            recognized_name=clean_keyword,
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
    for img_url in product.get("images", []):
        await delete_s3_object(img_url)
    await db.products.delete_one({"id": product_id})
    return {"message": "Product deleted successfully"}


# ============= Статистика поиска =============

@api_router.get("/search-logs/stats")
async def get_search_stats(days: int = 7, limit: int = 20):
    """
    Сводка по поискам за период.
    Возвращает: сколько всего искали, сколько нашлось,
    топ запросов которых НЕТ в каталоге, и топ найденных.
    """
    if days < 1 or days > 365:
        days = 7
    if limit < 1 or limit > 50:
        limit = 20

    since = datetime.now(timezone.utc) - timedelta(days=days)
    period_filter = {"created_at": {"$gte": since}}

    total = await db.search_logs.count_documents(period_filter)
    found_count = await db.search_logs.count_documents({**period_filter, "found": True})
    not_found_count = total - found_count

    # Топ запросов, которых нет в каталоге
    not_found_pipeline = [
        {"$match": {**period_filter, "found": False}},
        {"$group": {
            "_id": "$query_lower",
            "count": {"$sum": 1},
            "label": {"$first": "$query"},
            "last_seen": {"$max": "$created_at"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    not_found_docs = await db.search_logs.aggregate(not_found_pipeline).to_list(limit)
    top_not_found = [
        {
            "query": d.get("label") or d["_id"],
            "count": d["count"],
            "last_seen": d["last_seen"],
        }
        for d in not_found_docs
    ]

    # Топ найденных — что чаще всего ищут вообще
    found_pipeline = [
        {"$match": {**period_filter, "found": True}},
        {"$group": {
            "_id": "$query_lower",
            "count": {"$sum": 1},
            "label": {"$first": "$query"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    found_docs = await db.search_logs.aggregate(found_pipeline).to_list(limit)
    top_found = [
        {"query": d.get("label") or d["_id"], "count": d["count"]}
        for d in found_docs
    ]

    return {
        "days": days,
        "total_searches": total,
        "found_count": found_count,
        "not_found_count": not_found_count,
        "success_rate": round(found_count / total * 100, 1) if total else 0.0,
        "top_not_found": top_not_found,
        "top_found": top_found,
    }


@api_router.get("/search-logs")
async def get_search_logs(days: int = 7, only_not_found: bool = False, limit: int = 100):
    """Сырой список последних поисков — для отладки."""
    if days < 1 or days > 365:
        days = 7
    if limit < 1 or limit > 500:
        limit = 100

    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = {"created_at": {"$gte": since}}
    if only_not_found:
        query["found"] = False

    docs = await db.search_logs.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    result = []
    for d in docs:
        if '_id' in d:
            del d['_id']
        result.append(d)
    return result


@api_router.delete("/search-logs")
async def clear_search_logs():
    """Очистить всю статистику поиска."""
    res = await db.search_logs.delete_many({})
    return {"deleted": res.deleted_count}


# ============= Pending =============

@api_router.post("/pending-products", response_model=PendingProduct)
async def create_pending_product(data: PendingProductCreate):
    payload = data.dict()
    payload["images"] = await upload_images_to_s3(payload.get("images", []), folder="pending")

    pending = PendingProduct(**payload)
    await db.pending_products.insert_one(pending.dict())

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
    pending = await db.pending_products.find_one({"id": pending_id})
    if not pending:
        raise HTTPException(status_code=404, detail="Pending product not found")

    product_dict = data.dict()
    product_dict["images"] = await upload_images_to_s3(product_dict.get("images", []))
    product_dict["keywords"] = await generate_keywords(data.name, data.images[0])

    product = Product(**product_dict)
    await db.products.insert_one(product.dict())

    admin_urls = set(product_dict["images"])
    for old_url in pending.get("images", []):
        if old_url not in admin_urls:
            await delete_s3_object(old_url)

    await db.pending_products.delete_one({"id": pending_id})
    return product


@api_router.delete("/pending-products/{pending_id}")
async def reject_pending_product(pending_id: str):
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
    return {"message": "Smart AI Product Catalog API", "version": "2.2.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(api_router)