"""Backend API tests for Smart AI Product Catalog v2.0.

Schema changes vs v1:
- `image_base64` (single str) -> `images` (List[str], 1..5)
- `category`, `subcategory`, `barcode`, `article_number` are now Optional
- New `ai_features` field on Product (AI description)
- SearchResponse has new `ai_analysis` field
- Root endpoint reports `features` (not `endpoints`) and `version` 2.0.0
- Legacy products stored with `image_base64` must be migrated transparently to `images`
"""
import base64
import io
import uuid

import pytest
import requests
from PIL import Image

from conftest import BASE_URL


# ===== Helpers =====

def _png_base64(color=(255, 0, 0), size=(64, 64)) -> str:
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


@pytest.fixture(scope="module")
def created_ids():
    return {"products": [], "categories": []}


# ===== Root / Version =====

class TestRoot:
    def test_root_endpoint_v2(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("version") == "2.0.0"
        assert "features" in data and isinstance(data["features"], list)
        assert any("Multi-image" in f for f in data["features"])


# ===== Categories =====

class TestCategories:
    def test_get_categories_list(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/categories")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_and_get_category(self, api_client, created_ids):
        payload = {
            "name": f"TEST_Cat_{uuid.uuid4().hex[:6]}",
            "subcategories": ["sub1", "sub2"],
        }
        r = api_client.post(f"{BASE_URL}/api/categories", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["subcategories"] == payload["subcategories"]
        assert "id" in data and "_id" not in data
        created_ids["categories"].append(data["id"])

        # verify persisted
        r2 = api_client.get(f"{BASE_URL}/api/categories")
        names = [c["name"] for c in r2.json()]
        assert payload["name"] in names


# ===== Products CRUD (v2 schema) =====

class TestProductsCreate:
    def test_create_product_full_v2(self, api_client, created_ids):
        """Create product with all fields + 2 images. Validates schema + AI feature extraction."""
        imgs = [_png_base64((255, 0, 0)), _png_base64((0, 0, 255))]
        payload = {
            "name": f"TEST_Product_{uuid.uuid4().hex[:6]}",
            "price": 9.99,
            "images": imgs,
            "category": "Beverages",
            "subcategory": "Soda",
            "barcode": f"TEST-BC-{uuid.uuid4().hex[:8]}",
            "article_number": f"ART-{uuid.uuid4().hex[:6]}",
        }
        r = api_client.post(f"{BASE_URL}/api/products", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["price"] == 9.99
        assert isinstance(data.get("images"), list) and len(data["images"]) == 2
        assert "image_base64" not in data  # legacy field must not be present
        assert data["barcode"] == payload["barcode"]
        assert "ai_features" in data  # field exists (string or None)
        assert "id" in data
        created_ids["products"].append(data["id"])
        created_ids["full_id"] = data["id"]
        created_ids["last_barcode"] = payload["barcode"]
        created_ids["last_name"] = payload["name"]

    def test_create_product_minimal_optional_fields_empty(self, api_client, created_ids):
        """Only name + price + 1 image required. Optional fields omitted."""
        payload = {
            "name": f"TEST_Minimal_{uuid.uuid4().hex[:6]}",
            "price": 1.5,
            "images": [_png_base64((10, 200, 10))],
        }
        r = api_client.post(f"{BASE_URL}/api/products", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["category"] is None
        assert data["subcategory"] is None
        assert data["barcode"] is None
        assert data["article_number"] is None
        assert len(data["images"]) == 1
        created_ids["products"].append(data["id"])
        created_ids["minimal_id"] = data["id"]

    def test_create_product_rejects_zero_images(self, api_client):
        payload = {
            "name": f"TEST_NoImg_{uuid.uuid4().hex[:6]}",
            "price": 1.0,
            "images": [],
        }
        r = api_client.post(f"{BASE_URL}/api/products", json=payload)
        # Pydantic validator should fail -> 422
        assert r.status_code == 422, f"Expected 422 for empty images, got {r.status_code}: {r.text}"

    def test_create_product_rejects_more_than_5_images(self, api_client):
        payload = {
            "name": f"TEST_TooMany_{uuid.uuid4().hex[:6]}",
            "price": 1.0,
            "images": [_png_base64((i * 30, 0, 0)) for i in range(6)],
        }
        r = api_client.post(f"{BASE_URL}/api/products", json=payload)
        assert r.status_code == 422, f"Expected 422 for >5 images, got {r.status_code}: {r.text}"

    def test_create_product_missing_images_field(self, api_client):
        """If 'images' is omitted, default is [] -> validator should reject (422)."""
        payload = {
            "name": f"TEST_NoImgField_{uuid.uuid4().hex[:6]}",
            "price": 1.0,
        }
        r = api_client.post(f"{BASE_URL}/api/products", json=payload)
        assert r.status_code == 422, r.text


class TestProductsRead:
    def test_get_product_by_id(self, api_client, created_ids):
        pid = created_ids["full_id"]
        r = api_client.get(f"{BASE_URL}/api/products/{pid}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == pid
        assert isinstance(body["images"], list) and len(body["images"]) >= 1
        assert "ai_features" in body

    def test_get_product_not_found(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/products/non-existent-id-xyz")
        assert r.status_code == 404

    def test_list_products(self, api_client, created_ids):
        r = api_client.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        ids = [p["id"] for p in data]
        assert created_ids["full_id"] in ids
        # ensure images is a list on every returned product (legacy migration)
        for p in data:
            assert isinstance(p.get("images"), list)
            assert "image_base64" not in p

    def test_list_products_filter_category(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/products", params={"category": "Beverages"})
        assert r.status_code == 200
        for p in r.json():
            assert p["category"] == "Beverages"


class TestProductsUpdate:
    def test_partial_update_price_and_name(self, api_client, created_ids):
        pid = created_ids["full_id"]
        r = api_client.put(
            f"{BASE_URL}/api/products/{pid}",
            json={"price": 19.99, "name": "TEST_Updated_Name"},
        )
        assert r.status_code == 200, r.text
        # verify via GET
        g = api_client.get(f"{BASE_URL}/api/products/{pid}")
        body = g.json()
        assert body["price"] == 19.99
        assert body["name"] == "TEST_Updated_Name"

    def test_update_with_new_images_triggers_reextract(self, api_client, created_ids):
        pid = created_ids["full_id"]
        new_imgs = [_png_base64((123, 234, 45))]
        r = api_client.put(
            f"{BASE_URL}/api/products/{pid}",
            json={"images": new_imgs},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["images"]) == 1
        assert "ai_features" in body  # may be re-extracted

    def test_update_product_not_found(self, api_client):
        r = api_client.put(
            f"{BASE_URL}/api/products/non-existent",
            json={"price": 1.0},
        )
        assert r.status_code == 404


# ===== Search =====

class TestSearch:
    def test_text_search_finds_updated(self, api_client, created_ids):
        r = api_client.get(f"{BASE_URL}/api/products/search/text", params={"q": "TEST_Updated"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert any(p["id"] == created_ids["full_id"] for p in data)
        for p in data:
            assert isinstance(p["images"], list)

    def test_barcode_search_found(self, api_client, created_ids):
        bc = created_ids["last_barcode"]
        r = api_client.get(f"{BASE_URL}/api/products/search/barcode", params={"barcode": bc})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["barcode"] == bc
        assert isinstance(body["images"], list)

    def test_barcode_search_not_found(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/products/search/barcode",
            params={"barcode": "DOES-NOT-EXIST-9999"},
        )
        assert r.status_code == 404

    def test_photo_search_returns_ai_analysis(self, api_client):
        """Photo search should return 200 with SearchResponse(products, confidence, ai_analysis)."""
        img_b64 = _png_base64((0, 255, 0))
        r = api_client.post(
            f"{BASE_URL}/api/products/search/photo",
            json={"image_base64": img_b64},
            timeout=90,
        )
        assert r.status_code == 200, f"Photo search failed: {r.status_code} - {r.text}"
        data = r.json()
        assert "products" in data and isinstance(data["products"], list)
        assert "confidence" in data
        assert data["confidence"] in ("high", "no_match", "no_products")
        # New in v2.0
        assert "ai_analysis" in data, "ai_analysis field missing from SearchResponse"
        # If we have products in DB, ai_analysis should be non-empty
        if data["confidence"] != "no_products":
            assert data["ai_analysis"] is not None
            assert isinstance(data["ai_analysis"], str)


# ===== Legacy data compatibility =====

class TestLegacyCompat:
    def test_legacy_product_image_base64_migrates_to_images(self, api_client, created_ids):
        """Insert a legacy-shaped doc directly via Mongo to simulate v1 data, then GET via API."""
        import asyncio
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
        except Exception:
            pytest.skip("motor not installed in test env")

        import os
        from dotenv import load_dotenv
        from pathlib import Path
        load_dotenv(Path(__file__).parent.parent / ".env")
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if not mongo_url or not db_name:
            pytest.skip("MONGO_URL / DB_NAME not available")

        legacy_id = str(uuid.uuid4())
        legacy_doc = {
            "id": legacy_id,
            "name": f"TEST_Legacy_{uuid.uuid4().hex[:6]}",
            "price": 7.77,
            "image_base64": _png_base64((50, 50, 200)),  # legacy single image field
            "category": "Beverages",
            "subcategory": None,
            "barcode": None,
            "article_number": None,
        }

        async def _insert():
            c = AsyncIOMotorClient(mongo_url)
            await c[db_name].products.insert_one(legacy_doc)
            c.close()

        asyncio.run(_insert())
        created_ids["products"].append(legacy_id)

        # GET via API and verify migration
        r = api_client.get(f"{BASE_URL}/api/products/{legacy_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body["images"], list)
        assert len(body["images"]) == 1
        assert "image_base64" not in body

        # Also check it shows up in LIST with images array
        rl = api_client.get(f"{BASE_URL}/api/products")
        assert rl.status_code == 200
        match = next((p for p in rl.json() if p["id"] == legacy_id), None)
        assert match is not None
        assert isinstance(match["images"], list) and len(match["images"]) == 1


# ===== Cleanup =====

class TestZCleanup:
    def test_delete_created_products(self, api_client, created_ids):
        for pid in created_ids["products"]:
            r = api_client.delete(f"{BASE_URL}/api/products/{pid}")
            assert r.status_code in (200, 404), r.text
            g = api_client.get(f"{BASE_URL}/api/products/{pid}")
            assert g.status_code == 404

    def test_delete_product_not_found(self, api_client):
        r = api_client.delete(f"{BASE_URL}/api/products/non-existent")
        assert r.status_code == 404
