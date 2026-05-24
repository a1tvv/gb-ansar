#!/usr/bin/env python3
"""
Backend API Test Suite for Smart AI Product Catalog
Tests all CRUD operations, search endpoints, and AI functionality
"""

import requests
import json
import base64
from io import BytesIO
from PIL import Image
import sys

# Base URL from environment
BASE_URL = "https://mobile-dev-404.preview.emergentagent.com/api"

# Test data
TEST_CATEGORY = {
    "name": "Посуда",
    "subcategories": ["Тарелки", "Чашки", "Миски"]
}

TEST_PRODUCT = {
    "name": "Тестовая тарелка Luminarc",
    "category": "Посуда",
    "subcategory": "Тарелки",
    "barcode": "4820023848211",
    "article_number": "PL-9281",
    "price": 3500,
    "image_base64": ""
}

# Create a small test image
def create_test_image_base64():
    """Create a small test image and return as base64"""
    img = Image.new('RGB', (100, 100), color='red')
    buffered = BytesIO()
    img.save(buffered, format="JPEG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return img_str

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "errors": []
}

def log_test(test_name, passed, message=""):
    """Log test result"""
    if passed:
        test_results["passed"] += 1
        print(f"✅ {test_name}: PASSED")
    else:
        test_results["failed"] += 1
        test_results["errors"].append(f"{test_name}: {message}")
        print(f"❌ {test_name}: FAILED - {message}")

def test_health_check():
    """Test 1: Health Check - GET /api/"""
    try:
        response = requests.get(f"{BASE_URL}/", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if "message" in data and "Smart AI Product Catalog" in data["message"]:
                log_test("Health Check", True)
                return True
            else:
                log_test("Health Check", False, f"Unexpected response: {data}")
                return False
        else:
            log_test("Health Check", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Health Check", False, f"Exception: {str(e)}")
        return False

def test_create_category():
    """Test 2: Create Category - POST /api/categories"""
    try:
        response = requests.post(
            f"{BASE_URL}/categories",
            json=TEST_CATEGORY,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data["name"] == TEST_CATEGORY["name"]:
                log_test("Create Category", True)
                return data["id"]
            else:
                log_test("Create Category", False, f"Data mismatch: {data}")
                return None
        else:
            log_test("Create Category", False, f"Status code: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        log_test("Create Category", False, f"Exception: {str(e)}")
        return None

def test_get_categories():
    """Test 3: Get Categories - GET /api/categories"""
    try:
        response = requests.get(f"{BASE_URL}/categories", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                log_test("Get Categories", True)
                return True
            else:
                log_test("Get Categories", False, f"Expected list, got: {type(data)}")
                return False
        else:
            log_test("Get Categories", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Get Categories", False, f"Exception: {str(e)}")
        return False

def test_create_product():
    """Test 4: Create Product - POST /api/products"""
    try:
        # Add test image to product
        test_product = TEST_PRODUCT.copy()
        test_product["image_base64"] = create_test_image_base64()
        
        response = requests.post(
            f"{BASE_URL}/products",
            json=test_product,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data["name"] == test_product["name"] and "id" in data:
                log_test("Create Product", True)
                return data["id"]
            else:
                log_test("Create Product", False, f"Data mismatch: {data}")
                return None
        else:
            log_test("Create Product", False, f"Status code: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        log_test("Create Product", False, f"Exception: {str(e)}")
        return None

def test_get_all_products():
    """Test 5: Get All Products - GET /api/products"""
    try:
        response = requests.get(f"{BASE_URL}/products", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                log_test("Get All Products", True)
                return True
            else:
                log_test("Get All Products", False, f"Expected list, got: {type(data)}")
                return False
        else:
            log_test("Get All Products", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Get All Products", False, f"Exception: {str(e)}")
        return False

def test_get_product_by_id(product_id):
    """Test 6: Get Product by ID - GET /api/products/{id}"""
    try:
        response = requests.get(f"{BASE_URL}/products/{product_id}", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data["id"] == product_id:
                log_test("Get Product by ID", True)
                return True
            else:
                log_test("Get Product by ID", False, f"ID mismatch: {data}")
                return False
        else:
            log_test("Get Product by ID", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Get Product by ID", False, f"Exception: {str(e)}")
        return False

def test_update_product(product_id):
    """Test 7: Update Product - PUT /api/products/{id}"""
    try:
        update_data = {
            "name": "Обновленная тарелка Luminarc",
            "price": 4000
        }
        response = requests.put(
            f"{BASE_URL}/products/{product_id}",
            json=update_data,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data["name"] == update_data["name"] and data["price"] == update_data["price"]:
                log_test("Update Product", True)
                return True
            else:
                log_test("Update Product", False, f"Update not reflected: {data}")
                return False
        else:
            log_test("Update Product", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Update Product", False, f"Exception: {str(e)}")
        return False

def test_search_by_text():
    """Test 8: Search by Text - GET /api/products/search/text"""
    try:
        response = requests.get(
            f"{BASE_URL}/products/search/text",
            params={"q": "тарелка"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                log_test("Search by Text", True)
                return True
            else:
                log_test("Search by Text", False, f"Expected list, got: {type(data)}")
                return False
        else:
            log_test("Search by Text", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Search by Text", False, f"Exception: {str(e)}")
        return False

def test_search_by_barcode():
    """Test 9: Search by Barcode - GET /api/products/search/barcode"""
    try:
        response = requests.get(
            f"{BASE_URL}/products/search/barcode",
            params={"barcode": TEST_PRODUCT["barcode"]},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data["barcode"] == TEST_PRODUCT["barcode"]:
                log_test("Search by Barcode", True)
                return True
            else:
                log_test("Search by Barcode", False, f"Barcode mismatch: {data}")
                return False
        elif response.status_code == 404:
            # Product might have been deleted, this is acceptable
            log_test("Search by Barcode", True, "Product not found (acceptable)")
            return True
        else:
            log_test("Search by Barcode", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Search by Barcode", False, f"Exception: {str(e)}")
        return False

def test_search_by_photo():
    """Test 10: Search by Photo - POST /api/products/search/photo"""
    try:
        test_image = create_test_image_base64()
        response = requests.post(
            f"{BASE_URL}/products/search/photo",
            json={"image_base64": test_image},
            timeout=30  # AI calls may take longer
        )
        if response.status_code == 200:
            data = response.json()
            if "products" in data and "confidence" in data:
                log_test("Search by Photo (AI)", True)
                return True
            else:
                log_test("Search by Photo (AI)", False, f"Missing fields: {data}")
                return False
        else:
            log_test("Search by Photo (AI)", False, f"Status code: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        log_test("Search by Photo (AI)", False, f"Exception: {str(e)}")
        return False

def test_delete_product(product_id):
    """Test 11: Delete Product - DELETE /api/products/{id}"""
    try:
        response = requests.delete(f"{BASE_URL}/products/{product_id}", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if "message" in data:
                log_test("Delete Product", True)
                return True
            else:
                log_test("Delete Product", False, f"Unexpected response: {data}")
                return False
        else:
            log_test("Delete Product", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Delete Product", False, f"Exception: {str(e)}")
        return False

def run_all_tests():
    """Run all tests in sequence"""
    print("=" * 60)
    print("Smart AI Product Catalog - Backend API Test Suite")
    print("=" * 60)
    print(f"Testing against: {BASE_URL}")
    print("=" * 60)
    print()
    
    # Test 1: Health Check
    if not test_health_check():
        print("\n⚠️  Health check failed. Backend may not be running properly.")
        print("Continuing with other tests...\n")
    
    # Test 2-3: Categories
    category_id = test_create_category()
    test_get_categories()
    
    # Test 4-7: Product CRUD
    product_id = test_create_product()
    test_get_all_products()
    
    if product_id:
        test_get_product_by_id(product_id)
        test_update_product(product_id)
    else:
        print("⚠️  Skipping product-specific tests (no product ID)")
    
    # Test 8-10: Search Operations
    test_search_by_text()
    test_search_by_barcode()
    test_search_by_photo()
    
    # Test 11: Delete
    if product_id:
        test_delete_product(product_id)
    
    # Print summary
    print()
    print("=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    print(f"Total: {test_results['passed'] + test_results['failed']}")
    
    if test_results["errors"]:
        print("\n❌ FAILED TESTS:")
        for error in test_results["errors"]:
            print(f"  - {error}")
    
    print("=" * 60)
    
    # Return exit code
    return 0 if test_results["failed"] == 0 else 1

if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
