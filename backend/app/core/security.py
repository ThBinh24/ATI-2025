from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_SECRET

ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


class AuthError(Exception):
    """Raised when token verification fails."""


def _get_secret() -> str:
    if JWT_SECRET:
        return JWT_SECRET
    # Development fallback; should be overridden in production via environment
    return "dev-secret-change-me"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: Dict[str, Any], expires_minutes: Optional[int] = None) -> str:
    to_encode = data.copy()
    expire_delta = timedelta(
        minutes=expires_minutes if expires_minutes is not None else ACCESS_TOKEN_EXPIRE_MINUTES
    )
    expire = datetime.utcnow() + expire_delta
    to_encode.update({"exp": expire, "type": "access"})
    secret = _get_secret()
    return jwt.encode(to_encode, secret, algorithm=ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    secret = _get_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
    except JWTError as exc:  # includes ExpiredSignatureError, JWTClaimsError, etc.
        raise AuthError(str(exc)) from exc
    token_type = payload.get("type")
    if token_type != "access":
        raise AuthError("Invalid token type")
    return payload
