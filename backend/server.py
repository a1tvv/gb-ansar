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

async def upload_base64_to_s3(base64_data: str, folder: str = "products") -> str:
    if not all([s3_endpoint, s3_bucket, s3_access_key, s3_secret_key]):
        logger.error("S3 credentials are not fully set!")
        return ""

    try:
        # Очищаем строку от префикса 'data:image/jpeg;base64,' если он есть
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
        ) as client:
            await client.put_object(
                Bucket=s3_bucket,
                Key=file_name,
                Body=image_bytes,
                ContentType='image/jpeg',
                ACL='public-read'  # Делаем файл доступным по ссылке
            )

        # Формируем публичную ссылку DigitalOcean
        domain = s3_endpoint.replace("https://", "")
        public_url = f"https://{s3_bucket}.{domain}/{file_name}"
        return public_url

    except Exception as e:
        logger.error(f"Error uploading to S3: {str(e)}")
        return ""

# Жизненный цикл (открытие/закрытие БД)
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    client.close()

app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


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
    keywords: str = "" # ДОБАВЛЯЕМ СЮДА (Строка с синонимами через пробел)
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


async def call_openrouter(messages: list, retries=3) -> str:
    api_key = os.environ.get('OPENROUTER_API_KEY') or os.environ.get('EMERGENT_LLM_KEY')
    async with httpx.AsyncClient(timeout=60.0) as http_client:
        for i in range(retries):
            response = await http_client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                     "model": "google/gemini-3.5-flash",
                    "messages": messages
                }
            )
            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content'].strip()
            elif response.status_code == 429:
                await asyncio.sleep(2 ** (i + 1))
            else:
                logging.error(f"API Error: {response.status_code} - {response.text}")
                return ""
    return ""

async def find_matching_product(query_image_base64: str, all_products: List[Product]) -> tuple:
    try:
        if not all_products:
            return None, "No products in database"

        if "," in query_image_base64:
            query_image_base64 = query_image_base64.split(",")[1]

        product_catalog = "\n".join([
            f"#{i+1} - {p.name}" + (f" | {p.category}" if p.category else "") 
            for i, p in enumerate(all_products)
        ])

        # === ДОБАВЛЕН ТОТ САМЫЙ ПРОМПТ ДЛЯ РОБАСТНОСТИ ===
        system_prompt = (
            "Ты — складской сканер высокой точности. Твоя задача — извлекать сущности из изображений "
            "даже при плохом освещении, бликах и шумах. Не отказывайся от ответа, если картинка не идеальна — "
            "делай вероятностный прогноз на основе имеющихся данных."
        )

        messages = [{
            "role": "user",
            "content": [
                {
                    "type": "text", 
                    "text": f"{system_prompt}\n\nCatalog:\n{product_catalog}\n\nTask: Compare image to products. Return ONLY number (1, 2...) or 0."
                },
                {
                    "type": "image_url", 
                    "image_url": {"url": f"data:image/jpeg;base64,{query_image_base64}"}
                }
            ]
        }]

        result = await call_openrouter(messages)
        logging.info(f"AI raw response: {result}") 
        
        match = re.search(r'\d+', result)
        if match:
            match_index = int(match.group()) - 1
            if 0 <= match_index < len(all_products):
                return all_products[match_index], result
                
        return None, result

    except Exception as e:
        logging.error(f"Error in matching: {str(e)}")
        return None, str(e)

async def extract_product_features(image_base64: str) -> str:
    try:
        messages = [{
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe this product briefly: type, brand, color, shape."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
            ]
        }]
        return await call_openrouter(messages)
    except Exception as e:
        logging.error(f"Error extracting features: {str(e)}")
        return ""

def product_doc_to_model(doc: dict) -> dict:
    if 'image_base64' in doc and 'images' not in doc:
        doc['images'] = [doc['image_base64']] if doc['image_base64'] else []
        del doc['image_base64']
    if '_id' in doc:
        del doc['_id']
    return doc

@api_router.get("/categories", response_model=List[Category])
async def get_categories():
    categories = await db.categories.find().to_list(1000)
    return [Category(**{k: v for k, v in c.items() if k != '_id'}) for c in categories] if categories else []

@api_router.post("/categories", response_model=Category)
async def create_category(category: Category):
    await db.categories.insert_one(category.dict())
    return category
    
@api_router.post("/products", response_model=Product)
async def create_product(product_data: ProductCreate
    product_dict = product_data.dict()
    uploaded_image_urls = []
    
    # Обрабатываем список картинок
    for image_data in product_dict.get("images", []):
        if image_data.startswith("data:image") or len(image_data) > 1000:
            url = await upload_base64_to_s3(image_data)
            if url:
                uploaded_image_urls.append(url)
        else:
            uploaded_image_urls.append(image_data)
            
    product_dict["images"] = uploaded_image_urls
    
    # === НОВАЯ ЛОГИКА: ГЕНЕРАЦИЯ KEYWORDS ===
    generated_keywords = ""
    # Если есть хотя бы одна загруженная картинка или base64, пытаемся сгенерировать синонимы
    if product_data.images and (product_data.images[0].startswith("data:image") or len(product_data.images[0]) > 1000):
        try:
             first_img_base64 = product_data.images[0]
             if "," in first_img_base64:
                 first_img_base64 = first_img_base64.split(",")[1]

             kw_prompt = (
                 f"Официальное название этого товара: '{product_data.name}'. "
                 "Посмотри на фото и напиши 10 синонимов, ассоциаций или простых слов, "
                 "которыми обычный человек мог бы назвать этот предмет (например: если это кружка, напиши 'стакан чашка бокал'). "
                 "Верни ТОЛЬКО слова через пробел, без запятых и других символов. Никаких пояснений."
             )
             kw_messages = [{
                 "role": "user",
                 "content": [
                     {"type": "text", "text": kw_prompt},
                     {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{first_img_base64}"}}
                 ]
             }]
             
             ai_keywords_response = await call_openrouter(kw_messages)
             if ai_keywords_response:
                 # Убираем возможные запятые и лишние переносы
                 generated_keywords = ai_keywords_response.replace(',', ' ').replace('\n', ' ').strip()
                 logging.info(f"Generated keywords for {product_data.name}: {generated_keywords}")
        except Exception as e:
             logging.error(f"Failed to generate keywords: {e}")

    # Добавляем сгенерированные кейворды (даже если они пустые)
    product_dict["keywords"] = generated_keywords
    
    # Генерируем финальную модель и сохраняем
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
    
    products = await db.products.find(query).skip(skip).limit(limit).to_list(limit)
    result = []
    for p in products:
        doc = product_doc_to_model(p)
        # Отдаём только первую картинку для каталога
        if doc.get('images') and len(doc['images']) > 1:
            doc['images'] = [doc['images'][0]]
        result.append(Product(**doc))
    return result

@api_router.get("/products/search/text", response_model=List[Product])
async def search_by_text(q: str):
    products = await db.products.find({"name": {"$regex": q, "$options": "i"}}).to_list(1000)
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

        messages = [{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Ты - система распознавания товаров. Назови главный предмет на фото ОДНИМ-ДВУМЯ СЛОВАМИ на русском языке (например: Кружка, Мочалка, Ваза). Не пиши никаких объяснений, только само название предмета."
                },
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}
                }
            ]
        }]

        ai_keyword = await call_openrouter(messages)
        logging.info(f"AI recognized: {ai_keyword}")

        if not ai_keyword:
            return SearchResponse(products=[], confidence="no_match", ai_analysis="Не удалось распознать ИИ")

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
            return SearchResponse(products=[], confidence="low", ai_analysis=f"Распознано как '{clean_keyword}', но в базе не найдено")

        products_list = [Product(**product_doc_to_model(p)) for p in matched_docs]
        return SearchResponse(products=products_list, confidence="high", ai_analysis=f"Распознано: {clean_keyword}")

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
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted successfully"}

@api_router.get("/")
async def root():
    return {"message": "Smart AI Product Catalog API", "version": "2.0.0"}

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(api_router)
