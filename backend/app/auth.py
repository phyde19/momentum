from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, Request, status

from app.config import Settings, get_settings
from app.models import ActorType


@dataclass
class Actor:
    actor_type: ActorType
    actor_id: str
    email: str | None = None


@lru_cache
def _get_jwk_client(certs_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(certs_url)


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.replace("Bearer ", "", 1).strip()
    return None


def _decode_cloudflare_token(token: str, settings: Settings) -> dict:
    if not settings.cloudflare_team_domain or not settings.cloudflare_access_audience:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Cloudflare auth is enabled but required env vars are missing.",
        )

    try:
        jwk_client = _get_jwk_client(settings.cloudflare_certs_url)
        signing_key = jwk_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.cloudflare_access_audience,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Cloudflare Access token: {exc}",
        ) from exc


def get_request_id(request: Request) -> str:
    return request.headers.get("X-Request-Id", str(uuid4()))


def get_current_actor(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> Actor:
    if settings.auth_mode == "dev":
        email = request.headers.get("X-Dev-User-Email", settings.dev_auth_email)
        return Actor(actor_type=ActorType.human, actor_id=email, email=email)

    token = request.headers.get("Cf-Access-Jwt-Assertion") or _extract_bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Cloudflare Access JWT assertion.",
        )

    claims = _decode_cloudflare_token(token, settings)
    email = claims.get("email")
    subject = claims.get("sub") or email
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cloudflare token is missing identity claims.",
        )
    return Actor(actor_type=ActorType.human, actor_id=str(subject), email=email)
