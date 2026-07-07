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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'gb-ansar-db')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

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
                    "model": "nvidia/nemotron-nano-2-vl:free",
                    "messages": messages  # <--- ВОТ ЭТО ДОЛЖНО БЫТЬ ОБЯЗАТЕЛЬНО
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
            f"#{i+1} - {p.name}" + (f" | {p.category}" if p.category else "") + (f" | barcode:{p.barcode}" if p.barcode else "")
            for i, p in enumerate(all_products)
        ])

       messages = [{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": f"""You are a precise search agent. 
Catalog:
{product_catalog}

Rules:
1. Compare the image with the catalog.
2. Return ONLY the number (e.g., 1, 2, 3) if a match exists.
3. If no match is found or the image is unclear, return ONLY 0.
4. DO NOT write words, sentences, or explanations. Just a single digit."""
                },
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{query_image_base64}"}
                }
            ]
        }]

        result = await call_openrouter(messages)
        
        # Логирование ответа нейросети
        logging.info(f"AI raw response: {result}") 
        
        match = re.search(r'\d+', result)
        if match:
            match_index = int(match.group()) - 1
            logging.info(f"AI matched index: {match_index}")
            
            if 0 <= match_index < len(all_products):
                return all_products[match_index], result
                
        logging.warning("AI could not find a valid match index")
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
async def create_product(product_data: ProductCreate):
    product = Product(**product_data.dict())
    await db.products.insert_one(product.dict())
    return product


@api_router.get("/products", response_model=List[Product])
async def get_products(category: Optional[str] = None, subcategory: Optional[str] = None):
    query = {}
    if category:
        query["category"] = category
    if subcategory:
        query["subcategory"] = subcategory
    products = await db.products.find(query).to_list(1000)
    return [Product(**product_doc_to_model(p)) for p in products]


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
        all_products_docs = await db.products.find().to_list(1000)
        if not all_products_docs:
            return SearchResponse(products=[], confidence="no_products")
        products_list = [Product(**product_doc_to_model(p)) for p in all_products_docs]
        matched_product, ai_analysis = await find_matching_product(request.image_base64, products_list)
        if matched_product:
            return SearchResponse(products=[matched_product], confidence="high", ai_analysis=ai_analysis)
        else:
            return SearchResponse(products=[], confidence="no_match", ai_analysis=ai_analysis)
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


@app.get("/")
async def health():
    return {"status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@app.get("/")
async def health(): return {"status": "ok"}
app.include_router(api_router)
