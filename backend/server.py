from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import ipaddress
import re
import bcrypt
import jwt
import httpx
import stripe
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from bson import ObjectId

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return user


# ---------------------------------------------------------------------------
# Email (Emergent managed Resend) -- low-stock alert to admin
# ---------------------------------------------------------------------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
ALERT_EMAIL = os.environ.get("ALERT_EMAIL", "delivered@resend.dev")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "seed phrase", "recovery phrase", "verify your card", "social security number")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms in email")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError("Credential ask in email")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError("Links must be https")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError("Bad URL host")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError("Anchor host mismatch")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    async with httpx.AsyncClient(timeout=30) as http_client:
        resp = await http_client.post(
            f"{EMAIL_BASE_URL}/api/v1/email/send",
            headers={"X-Email-Key": EMAIL_KEY},
            json=payload,
        )
    resp.raise_for_status()
    return resp.json().get("id")


async def send_low_stock_alert(product_name: str, size: str) -> None:
    try:
        name = escape(product_name)
        subject = f"[{EMAIL_FROM_NAME}] Estoque baixo: {name} ({escape(size)})"
        html = (
            f'<table role="presentation" width="100%"><tr><td style="padding:24px;'
            f'font-family:Arial,sans-serif">'
            f'<h2 style="color:#4A3B2E">Alerta de estoque baixo</h2>'
            f'<p>A vela <strong>{name}</strong> no tamanho <strong>{escape(size)}</strong> '
            f'está com apenas <strong>1 unidade</strong> em estoque.</p>'
            f'<p>Acesse o painel para reabastecer.</p>'
            f'<p style="font-size:12px;color:#999">Enviado por {escape(EMAIL_FROM_NAME)}. '
            f'Nunca solicitamos senhas por e-mail.</p></td></tr></table>'
        )
        await send_email(to=ALERT_EMAIL, subject=subject, html=html)
    except Exception as e:  # noqa
        logger.error(f"Low-stock email failed: {e}")


async def check_variant_alerts(product_id: str) -> None:
    prod = await db.products.find_one({"id": product_id})
    if not prod:
        return
    changed = False
    for v in prod.get("variants", []):
        if v.get("stock") == 1 and not v.get("low_stock_alerted"):
            v["low_stock_alerted"] = True
            changed = True
            await send_low_stock_alert(prod["name"], v.get("size", ""))
        elif v.get("stock") != 1 and v.get("low_stock_alerted"):
            v["low_stock_alerted"] = False
            changed = True
    if changed:
        await db.products.update_one({"id": product_id}, {"$set": {"variants": prod["variants"]}})


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class VariantInput(BaseModel):
    size: str
    weight_g: int = 0
    burn_hours: int = 0
    price: float
    stock: int = 0


class ProductInput(BaseModel):
    name: str
    description: str = ""
    aroma: str = ""
    image_url: str = ""
    category: str = "Coleção Flores"
    on_promotion: bool = False
    discount_percent: int = 0
    variants: List[VariantInput] = []


class CartItemInput(BaseModel):
    product_id: str
    size: str
    quantity: int


class CheckoutInput(BaseModel):
    items: List[CartItemInput]
    origin_url: str


class StatusUpdate(BaseModel):
    status: str


def public_user(user: dict) -> dict:
    return {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}


def variant_price(product: dict, variant: dict) -> float:
    price = variant["price"]
    if product.get("on_promotion") and product.get("discount_percent"):
        return round(price * (1 - product["discount_percent"] / 100), 2)
    return round(price, 2)


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(data: RegisterInput):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    doc = {
        "name": data.name, "email": email,
        "password_hash": hash_password(data.password), "role": "customer",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    uid = str(result.inserted_id)
    token = create_access_token(uid, email)
    return {"token": token, "user": {"id": uid, "name": data.name, "email": email, "role": "customer"}}


@api_router.post("/auth/login")
async def login(data: LoginInput):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    uid = str(user["_id"])
    token = create_access_token(uid, email)
    return {"token": token, "user": {"id": uid, "name": user["name"], "email": email, "role": user["role"]}}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


# ---------------------------------------------------------------------------
# Product routes
# ---------------------------------------------------------------------------
@api_router.get("/products")
async def list_products():
    return await db.products.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)


@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    prod = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not prod:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return prod


@api_router.post("/products")
async def create_product(data: ProductInput, admin: dict = Depends(get_admin_user)):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    for v in doc["variants"]:
        v["low_stock_alerted"] = v.get("stock") == 1
    await db.products.insert_one(doc)
    await check_variant_alerts(doc["id"])
    return await db.products.find_one({"id": doc["id"]}, {"_id": 0})


@api_router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductInput, admin: dict = Depends(get_admin_user)):
    existing = await db.products.find_one({"id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    prev = {v["size"]: v.get("low_stock_alerted", False) for v in existing.get("variants", [])}
    doc = data.model_dump()
    for v in doc["variants"]:
        v["low_stock_alerted"] = prev.get(v["size"], False)
    await db.products.update_one({"id": product_id}, {"$set": doc})
    await check_variant_alerts(product_id)
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return {"success": True}


# ---------------------------------------------------------------------------
# Orders + Stripe checkout
# ---------------------------------------------------------------------------
async def build_order_items(items: List[CartItemInput]):
    order_items = []
    total = 0.0
    for it in items:
        prod = await db.products.find_one({"id": it.product_id})
        if not prod:
            raise HTTPException(status_code=404, detail="Produto não encontrado")
        variant = next((v for v in prod.get("variants", []) if v["size"] == it.size), None)
        if not variant:
            raise HTTPException(status_code=404, detail=f"Tamanho indisponível para {prod['name']}")
        if variant["stock"] < it.quantity:
            raise HTTPException(status_code=400, detail=f"Estoque insuficiente para {prod['name']} ({it.size})")
        price = variant_price(prod, variant)
        total += price * it.quantity
        order_items.append({
            "product_id": prod["id"], "name": prod["name"], "size": it.size,
            "price": price, "quantity": it.quantity, "image_url": prod.get("image_url", ""),
        })
    return order_items, round(total, 2)


@api_router.post("/orders/checkout")
async def checkout(data: CheckoutInput, user: dict = Depends(get_current_user)):
    if not data.items:
        raise HTTPException(status_code=400, detail="Carrinho vazio")
    order_items, total = await build_order_items(data.items)

    order = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"], "user_name": user["name"], "user_email": user["email"],
        "items": order_items, "total": total,
        "status": "aguardando_pagamento", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(order)

    line_items = [{
        "price_data": {
            "currency": "brl",
            "unit_amount": int(round(oi["price"] * 100)),
            "product_data": {"name": f"{oi['name']} — {oi['size']}"},
        },
        "quantity": oi["quantity"],
    } for oi in order_items]

    origin = data.origin_url.rstrip("/")
    session = stripe.checkout.Session.create(
        line_items=line_items,
        mode="payment",
        success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/payment/cancel?order_id={order['id']}",
        metadata={"order_id": order["id"], "user_id": user["id"]},
    )

    await db.payment_transactions.insert_one({
        "session_id": session.id, "order_id": order["id"], "user_id": user["id"],
        "amount": total, "currency": "brl",
        "status": "initiated", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.orders.update_one({"id": order["id"]}, {"$set": {"session_id": session.id}})

    return {"checkout_url": session.url, "session_id": session.id, "order_id": order["id"]}


async def fulfill_order(order_id: str):
    """Idempotent: mark order paid, decrement stock, fire low-stock alerts."""
    order = await db.orders.find_one({"id": order_id})
    if not order or order.get("payment_status") == "paid":
        return
    for it in order["items"]:
        await db.products.update_one(
            {"id": it["product_id"], "variants.size": it["size"]},
            {"$inc": {"variants.$.stock": -it["quantity"]}},
        )
    await db.orders.update_one(
        {"id": order_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"payment_status": "paid", "status": "confirmado",
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    for it in order["items"]:
        await check_variant_alerts(it["product_id"])


@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "updated_at": datetime.now(timezone.utc).isoformat()}},
                )
                await fulfill_order(record["order_id"])
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {"session_id": record["session_id"], "status": record["status"],
            "payment_status": record["payment_status"], "order_id": record.get("order_id")}


@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except (stripe.error.SignatureVerificationError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        oid = (obj.get("metadata") or {}).get("order_id")
        if oid:
            await fulfill_order(oid)
    return {"status": "ok"}


@api_router.get("/orders/my")
async def my_orders(user: dict = Depends(get_current_user)):
    return await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.get("/orders")
async def all_orders(admin: dict = Depends(get_admin_user)):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.put("/orders/{order_id}/status")
async def update_status(order_id: str, data: StatusUpdate, admin: dict = Depends(get_admin_user)):
    valid = {"aguardando_pagamento", "confirmado", "em_producao", "enviado", "entregue", "cancelado"}
    if data.status not in valid:
        raise HTTPException(status_code=400, detail="Status inválido")
    result = await db.orders.update_one({"id": order_id}, {"$set": {"status": data.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@api_router.get("/")
async def root():
    return {"message": "Jardim das Velas API"}


# ---------------------------------------------------------------------------
# App wiring + seed
# ---------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

IMG = {
    "cherry": "https://static.prod-images.emergentagent.com/jobs/fb5ce246-6070-4fdc-9e9b-60bafea00ac3/images/c921b46e4f5bb1d8a7933b12a198f82adff9e4b0912be527aa7e317e947475fd.jpeg",
    "daisy": "https://static.prod-images.emergentagent.com/jobs/fb5ce246-6070-4fdc-9e9b-60bafea00ac3/images/0b112dea909075c9b79bc5f97f03196d1f150bdc0a67b67b42339d2a3e59515f.jpeg",
    "rose": "https://static.prod-images.emergentagent.com/jobs/fb5ce246-6070-4fdc-9e9b-60bafea00ac3/images/bfe374fbed0eb58c3d11fdc9d0aecbd0f4c4789ea4e4ec7e4ce61eb57b66cffd.jpeg",
    "peony": "https://static.prod-images.emergentagent.com/jobs/fb5ce246-6070-4fdc-9e9b-60bafea00ac3/images/d315dc8d113bb4290a505e8027b86ec515b5601ddc2f101aaff1693210bd9796.jpeg",
    "devotional": "https://static.prod-images.emergentagent.com/jobs/fb5ce246-6070-4fdc-9e9b-60bafea00ac3/images/aec198724df82aa4948c9516e1ec9bb35c92f50319b732e85902defd552aeac7.jpeg",
}

SAMPLE_PRODUCTS = [
    {"name": "Vela Flor de Cerejeira", "aroma": "Baunilha", "category": "Coleção Flores", "image_url": IMG["cherry"],
     "description": "Vela aromática com delicadas flores de cerejeira esculpidas à mão em cera. Perfume suave de baunilha.",
     "on_promotion": False, "discount_percent": 0,
     "variants": [
         {"size": "150 ml", "weight_g": 90, "burn_hours": 15, "price": 45.0, "stock": 8},
         {"size": "265 ml", "weight_g": 165, "burn_hours": 30, "price": 68.0, "stock": 5},
     ]},
    {"name": "Vela Margarida", "aroma": "Lavanda", "category": "Coleção Flores", "image_url": IMG["daisy"],
     "description": "Vela decorada com margarida branca e amarela. Aroma relaxante de lavanda.",
     "on_promotion": True, "discount_percent": 10,
     "variants": [
         {"size": "150 ml", "weight_g": 90, "burn_hours": 15, "price": 45.0, "stock": 10},
         {"size": "265 ml", "weight_g": 165, "burn_hours": 30, "price": 68.0, "stock": 1},
     ]},
    {"name": "Vela Rosa", "aroma": "Cereja e Avelã", "category": "Coleção Flores", "image_url": IMG["rose"],
     "description": "Elegante vela em formato de rosa vermelha. Fragrância marcante de cereja e avelã.",
     "on_promotion": False, "discount_percent": 0,
     "variants": [
         {"size": "150 ml", "weight_g": 90, "burn_hours": 15, "price": 45.0, "stock": 6},
         {"size": "265 ml", "weight_g": 140, "burn_hours": 30, "price": 68.0, "stock": 4},
     ]},
    {"name": "Vela Peônia", "aroma": "Bambu e Chá Branco", "category": "Coleção Flores", "image_url": IMG["peony"],
     "description": "Vela com peônia azul esculpida em cera. Aroma sofisticado de bambu e chá branco.",
     "on_promotion": False, "discount_percent": 0,
     "variants": [
         {"size": "150 ml", "weight_g": 90, "burn_hours": 15, "price": 45.0, "stock": 7},
         {"size": "265 ml", "weight_g": 140, "burn_hours": 30, "price": 68.0, "stock": 3},
     ]},
    {"name": "Vela Rogai por Nós", "aroma": "Consultar aromas disponíveis", "category": "Coleção Devocional", "image_url": IMG["devotional"],
     "description": "Vela devocional em copo de vidro com tampa de bambu, gel transparente com detalhes dourados e imagem de Nossa Senhora.",
     "on_promotion": False, "discount_percent": 0,
     "variants": [
         {"size": "300 ml", "weight_g": 260, "burn_hours": 40, "price": 90.0, "stock": 4},
     ]},
]


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("id", unique=True)
    await db.orders.create_index("id", unique=True)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@jardimdasvelas.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "name": "Administrador", "email": admin_email,
            "password_hash": hash_password(admin_password), "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    cust_email = "cliente@jardimdasvelas.com"
    if await db.users.find_one({"email": cust_email}) is None:
        await db.users.insert_one({
            "name": "Cliente Demo", "email": cust_email,
            "password_hash": hash_password("cliente123"), "role": "customer",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Seed catalog once. Migrate away from any old (variant-less) schema.
    has_variants = await db.products.find_one({"variants": {"$exists": True}})
    if has_variants is not None:
        return
    await db.products.delete_many({})
    for p in SAMPLE_PRODUCTS:
        doc = dict(p)
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        for v in doc["variants"]:
            v["low_stock_alerted"] = v["stock"] == 1
        await db.products.insert_one(doc)

    logger.info("Startup seeding complete")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
