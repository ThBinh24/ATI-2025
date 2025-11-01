from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user, require_roles
from app.core.security import create_access_token
from app.schemas.schemas import AuthResponse, BanUserRequest, LoginRequest, RegisterRequest, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    role = payload.role or "student"
    if role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Direct admin registration is not allowed.",
        )
    user = auth_service.register_user(payload.name, payload.email, payload.password, role)
    return user


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest):
    user = auth_service.authenticate_user(payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    return AuthResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=list[UserOut])
def list_users(_: dict = Depends(require_roles("admin"))):
    return auth_service.get_users()


@router.post("/users/{user_id}/ban", response_model=UserOut)
def ban_user(user_id: int, payload: BanUserRequest, _: dict = Depends(require_roles("admin"))):
    return auth_service.ban_user(user_id, payload.reason)


@router.post("/users/{user_id}/unban", response_model=UserOut)
def unban_user(user_id: int, _: dict = Depends(require_roles("admin"))):
    return auth_service.unban_user(user_id)


@router.get("/users/banned", response_model=list[UserOut])
def banned_users(_: dict = Depends(require_roles("admin"))):
    return auth_service.get_banned_users()
