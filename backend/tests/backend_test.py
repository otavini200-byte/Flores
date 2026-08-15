"""NOVA Store backend API tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://product-manager-196.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@novastore.com"
ADMIN_PASS = "admin123"
CUST_EMAIL = "cliente@novastore.com"
CUST_PASS = "cliente123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token():
    r = requests.post(f"{API}/auth/login", json={"email": CUST_EMAIL, "password": CUST_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# --- Auth ---
class TestAuth:
    def test_login_admin(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_login_customer(self, customer_token):
        assert isinstance(customer_token, str)

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "no@x.com", "password": "bad"})
        assert r.status_code == 401

    def test_me_admin(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=auth(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "admin"
        assert d["email"] == ADMIN_EMAIL

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_new_user(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"name": "Test User", "email": email, "password": "pass1234"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == email.lower()
        assert data["user"]["role"] == "customer"

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={"name": "X", "email": CUST_EMAIL, "password": "pass1234"})
        assert r.status_code == 400


# --- Products ---
class TestProducts:
    def test_list_products_public(self):
        r = requests.get(f"{API}/products")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_product_unauth(self):
        r = requests.post(f"{API}/products", json={"name": "X", "price": 1.0})
        assert r.status_code == 401

    def test_create_product_as_customer_forbidden(self, customer_token):
        r = requests.post(f"{API}/products", headers=auth(customer_token),
                          json={"name": "X", "price": 1.0})
        assert r.status_code == 403

    def test_product_crud_flow(self, admin_token):
        payload = {"name": "TEST_ProdA", "description": "d", "price": 100.0,
                   "image_url": "", "category": "TestCat", "stock": 5,
                   "on_promotion": True, "discount_percent": 10}
        r = requests.post(f"{API}/products", headers=auth(admin_token), json=payload)
        assert r.status_code == 200, r.text
        prod = r.json()
        assert prod["name"] == "TEST_ProdA"
        assert prod["stock"] == 5
        pid = prod["id"]

        # GET
        r = requests.get(f"{API}/products/{pid}")
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_ProdA"

        # UPDATE stock to 1 (low stock)
        payload["stock"] = 1
        payload["name"] = "TEST_ProdA_upd"
        r = requests.put(f"{API}/products/{pid}", headers=auth(admin_token), json=payload)
        assert r.status_code == 200
        assert r.json()["stock"] == 1
        assert r.json()["name"] == "TEST_ProdA_upd"

        # Verify persisted
        r = requests.get(f"{API}/products/{pid}")
        assert r.json()["stock"] == 1

        # DELETE
        r = requests.delete(f"{API}/products/{pid}", headers=auth(admin_token))
        assert r.status_code == 200
        r = requests.get(f"{API}/products/{pid}")
        assert r.status_code == 404


# --- Orders ---
class TestOrders:
    def test_create_order_and_stock_decrement(self, admin_token, customer_token):
        # Create a fresh product with known stock
        payload = {"name": "TEST_OrderProd", "description": "d", "price": 50.0,
                   "image_url": "", "category": "TestCat", "stock": 3,
                   "on_promotion": False, "discount_percent": 0}
        r = requests.post(f"{API}/products", headers=auth(admin_token), json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]

        # Guest cannot create order
        r = requests.post(f"{API}/orders", json={"items": [{"product_id": pid, "quantity": 1}]})
        assert r.status_code == 401

        # Customer places order
        r = requests.post(f"{API}/orders", headers=auth(customer_token),
                          json={"items": [{"product_id": pid, "quantity": 2}]})
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["status"] == "pendente"
        assert order["total"] == 100.0
        assert len(order["items"]) == 1
        oid = order["id"]

        # Stock decremented
        r = requests.get(f"{API}/products/{pid}")
        assert r.json()["stock"] == 1  # 3 - 2

        # Insufficient stock
        r = requests.post(f"{API}/orders", headers=auth(customer_token),
                          json={"items": [{"product_id": pid, "quantity": 99}]})
        assert r.status_code == 400

        # my orders lists it
        r = requests.get(f"{API}/orders/my", headers=auth(customer_token))
        assert r.status_code == 200
        assert any(o["id"] == oid for o in r.json())

        # admin orders lists it
        r = requests.get(f"{API}/orders", headers=auth(admin_token))
        assert r.status_code == 200
        assert any(o["id"] == oid for o in r.json())

        # customer cannot list all orders
        r = requests.get(f"{API}/orders", headers=auth(customer_token))
        assert r.status_code == 403

        # admin updates status
        r = requests.put(f"{API}/orders/{oid}/status", headers=auth(admin_token),
                         json={"status": "enviado"})
        assert r.status_code == 200
        assert r.json()["status"] == "enviado"

        # invalid status
        r = requests.put(f"{API}/orders/{oid}/status", headers=auth(admin_token),
                         json={"status": "banana"})
        assert r.status_code == 400

        # customer sees updated status
        r = requests.get(f"{API}/orders/my", headers=auth(customer_token))
        my = [o for o in r.json() if o["id"] == oid][0]
        assert my["status"] == "enviado"

        # cleanup product
        requests.delete(f"{API}/products/{pid}", headers=auth(admin_token))

    def test_empty_cart(self, customer_token):
        r = requests.post(f"{API}/orders", headers=auth(customer_token), json={"items": []})
        assert r.status_code == 400
