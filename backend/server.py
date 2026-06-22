from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


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


# ============= AI Functions =============

async def call_openrouter(messages: list) -> str:
    api_key = os.environ.get('OPENROUTER_API_KEY') or os.environ.get('EMERGENT_LLM_KEY')
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "google/gemini-2.0-flash-exp:free",
                "messages": messages
            }
        )
        result = response.json()
        return result['choices'][0]['message']['content'].strip()


async def extract_product_features(image_base64: str) -> str:
    try:
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": """Analyze ONLY the product in this image (ignore background).
Extract:
1. PRODUCT TYPE
2. BRAND/LOGO
3. TEXT ON PACKAGING
4. COLORS of the product
5. SHAPE
6. BARCODE numbers if visible
7. UNIQUE FEATURES
Be concise. Focus ONLY on the product."""
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                    }
                ]
            }
        ]
        return await call_openrouter(messages)
    except Exception as e:
        logging.error(f"Error extracting features: {str(e)}")
        return ""


async def find_matching_product(query_image_base64: str, all_products: List[Product]) -> tuple:
    try:
        if not all_products:
            return None, "No products in database"

        query_features = await extract_product_features(query_image_base64)
        if not query_features:
            return None, "Could not analyze image"

        product_catalog = []
        for i, p in enumerate(all_products):
            entry = f"#{i+1} - Name: {p.name}"
            if p.category:
                entry += f" | Category: {p.category}"
            if p.barcode:
                entry += f" | Barcode: {p.barcode}"
            if p.ai_features:
                entry += f"\n   Features: {p.ai_features}"
            product_catalog.append(entry)

        catalog_text = "\n\n".join(product_catalog)

        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"""Find the BEST matching product for the image.

EXTRACTED FEATURES:
{query_features}

PRODUCT CATALOG:
{catalog_text}

If confident match found, respond with ONLY the product number (e.g. "3").
If no match, respond with "0".
Respond with ONLY a single number."""
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{query_image_base64}"}
                    }
                ]
            }
        ]

        result = await call_openrouter(messages)
        match = re.search(r'\d+', result)
        if match:
            match_index = int(match.group()) - 1
            if 0 <= match_index < len(all_products):
                return all_products[match_index], query_features

        return None, query_features

    except Exception as e:
        logging.error(f"Error in matching: {str(e)}")
        return None, str(e)


# ============= Helper Functions =============

def product_doc_to_model(doc: dict) -> dict:
    if 'image_base64' in doc and 'images' not in doc:
        doc['images'] = [doc['image_base64']] if doc['image_base64'] else []
        del doc['image_base64']
    if '_id' in doc:
        del doc['_id']
    return doc


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
    product = Product(**product_data.dict())
    if product.images:
        ai_features = await extract_product_features(product.images[0])
        product.ai_features = ai_features
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

    if 'images' in update_data and update_data['images']:
        ai_features = await extract_product_features(update_data['images'][0])
        update_data['ai_features'] = ai_features

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
    return {
        "message": "Smart AI Product Catalog API",
        "version": "2.0.0",
    }


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