from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta

import jwt

from app.config import get_settings


PBKDF2_ITERATIONS = 120_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return (
        "pbkdf2_sha256$"
        f"{PBKDF2_ITERATIONS}$"
        f"{base64.b64encode(salt).decode('ascii')}$"
        f"{base64.b64encode(digest).decode('ascii')}"
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = password_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    salt = base64.b64decode(salt_raw.encode("ascii"))
    expected = base64.b64decode(digest_raw.encode("ascii"))
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations_raw))
    return hmac.compare_digest(actual, expected)


def create_access_token(*, user_id: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
