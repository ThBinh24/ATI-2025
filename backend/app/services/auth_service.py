from typing import Dict, Optional

from fastapi import HTTPException, status
from app.core.security import hash_password, verify_password
from app.dao import users_dao

ALLOWED_ROLES = {"admin", "employer", "student"}


def _sanitize_user(user: Optional[Dict]) -> Optional[Dict]:
    if not user:
        return None
    user = dict(user)
    user.pop("password_hash", None)
    return user


def register_user(name: str, email: str, password: str, role: str = "student") -> Dict:
    if not email or not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email and password are required.")
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role.")
    existing = users_dao.get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered.")
    pwd_hash = hash_password(password)
    user_id = users_dao.create_user(
        {
            "name": name or "",
            "email": email,
            "password_hash": pwd_hash,
            "role": role,
        }
    )
    return _sanitize_user(users_dao.get_user_by_id(user_id))


def authenticate_user(email: str, password: str) -> Optional[Dict]:
    if not email or not password:
        return None
    user = users_dao.get_user_by_email(email)
    if not user:
        return None
    if not verify_password(password, user.get("password_hash", "")):
        return None
    return _sanitize_user(user)


def get_user(user_id: int) -> Optional[Dict]:
    return _sanitize_user(users_dao.get_user_by_id(user_id))


def get_users() -> list[Dict]:
    return [_sanitize_user(user) for user in users_dao.list_users()]


def ban_user(user_id: int, reason: str) -> Dict:
    if not reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ban reason is required.")
    user = users_dao.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.get("role") == "admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot ban another admin.")
    updated = users_dao.ban_user(user_id, reason.strip())
    if not updated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to ban user.")
    return _sanitize_user(users_dao.get_user_by_id(user_id))


def get_banned_users() -> list[Dict]:
    return [_sanitize_user(user) for user in users_dao.list_banned_users()]
