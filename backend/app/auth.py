"""Google ID 토큰 검증 + 사용자 의존성."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User


_request_session = google_requests.Request()


def _verify_google_token(token: str) -> dict:
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GOOGLE_CLIENT_ID가 설정되지 않았습니다.",
        )
    try:
        info = id_token.verify_oauth2_token(
            token, _request_session, settings.google_client_id
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"유효하지 않은 토큰: {e}",
        )

    domain_filter = settings.allowed_email_domain.strip()
    email = info.get("email", "")
    if domain_filter and not email.endswith("@" + domain_filter):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{domain_filter} 도메인 계정만 허용됩니다.",
        )
    if not info.get("email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이메일 인증이 되지 않은 계정입니다.",
        )
    return info


def _get_or_create_demo_user(db: Session) -> User:
    user = db.query(User).filter(User.email == "demo@local").first()
    if user is None:
        user = User(email="demo@local", name="Demo User", picture=None)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    if settings.demo_mode:
        # 인증 우회: 단일 공용 demo 계정 반환
        return _get_or_create_demo_user(db)

    if not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization 헤더가 필요합니다.",
        )
    token = authorization.split(" ", 1)[1].strip()
    info = _verify_google_token(token)

    email = info["email"]
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            email=email,
            name=info.get("name") or email.split("@")[0],
            picture=info.get("picture"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # 프로필 정보 갱신
        changed = False
        new_name = info.get("name")
        new_picture = info.get("picture")
        if new_name and user.name != new_name:
            user.name = new_name
            changed = True
        if new_picture and user.picture != new_picture:
            user.picture = new_picture
            changed = True
        if changed:
            db.commit()

    return user
