from __future__ import annotations

import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional

from .base import AuthorizationRequired, ConnectorError


MICROSOFT_CLIENT_ID = os.getenv(
    "MICROSOFT_CLIENT_ID",
    "",
).strip()

MICROSOFT_CLIENT_SECRET = os.getenv(
    "MICROSOFT_CLIENT_SECRET",
    "",
).strip()

MICROSOFT_TENANT_ID = os.getenv(
    "MICROSOFT_TENANT_ID",
    "organizations",
).strip() or "organizations"

MICROSOFT_REDIRECT_URI = os.getenv(
    "MICROSOFT_REDIRECT_URI",
    "http://127.0.0.1:8000/api/v1/vault/oauth/microsoft/callback",
).strip()

MICROSOFT_SCOPES = os.getenv(
    "MICROSOFT_SCOPES",
    "openid profile offline_access User.Read Files.Read.All Sites.Read.All",
).strip()

AUTHORITY = (
    f"https://login.microsoftonline.com/"
    f"{MICROSOFT_TENANT_ID}/oauth2/v2.0"
)

AUTHORIZE_ENDPOINT = f"{AUTHORITY}/authorize"
TOKEN_ENDPOINT = f"{AUTHORITY}/token"


@dataclass
class OAuthState:
    source_id: str
    tenant_id: str
    project_id: str
    created_at: float


class OAuthStateStore:
    """
    Short-lived server-side OAuth state storage.

    This prevents the browser from choosing an arbitrary source/project during
    the callback. Production can move this to Redis or another shared store.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._states: dict[str, OAuthState] = {}

    def create(
        self,
        *,
        source_id: str,
        tenant_id: str,
        project_id: str,
    ) -> str:
        state = secrets.token_urlsafe(32)

        with self._lock:
            self._states[state] = OAuthState(
                source_id=str(source_id),
                tenant_id=str(tenant_id),
                project_id=str(project_id),
                created_at=time.time(),
            )

        return state

    def consume(
        self,
        state: str,
        *,
        max_age_seconds: int = 600,
    ) -> OAuthState:
        with self._lock:
            record = self._states.pop(state, None)

        if not record:
            raise AuthorizationRequired(
                "Microsoft authorization state is invalid or has already been used."
            )

        if record.created_at < time.time() - max_age_seconds:
            raise AuthorizationRequired(
                "Microsoft authorization state expired. Start the connection again."
            )

        return record


oauth_state_store = OAuthStateStore()


def microsoft_oauth_configured() -> bool:
    return bool(
        MICROSOFT_CLIENT_ID
        and MICROSOFT_CLIENT_SECRET
        and MICROSOFT_REDIRECT_URI
    )


def require_microsoft_oauth_configured() -> None:
    if not microsoft_oauth_configured():
        raise ConnectorError(
            "Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID, "
            "MICROSOFT_CLIENT_SECRET and MICROSOFT_REDIRECT_URI in the backend environment."
        )


def build_authorization_url(
    *,
    source_id: str,
    tenant_id: str,
    project_id: str,
) -> str:
    require_microsoft_oauth_configured()

    state = oauth_state_store.create(
        source_id=source_id,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    params = {
        "client_id": MICROSOFT_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": MICROSOFT_REDIRECT_URI,
        "response_mode": "query",
        "scope": MICROSOFT_SCOPES,
        "state": state,
        "prompt": "select_account",
    }

    return (
        AUTHORIZE_ENDPOINT
        + "?"
        + urllib.parse.urlencode(params)
    )


def _post_token_form(
    payload: dict[str, str],
) -> dict[str, Any]:
    require_microsoft_oauth_configured()

    encoded = urllib.parse.urlencode(
        payload
    ).encode("utf-8")

    request = urllib.request.Request(
        TOKEN_ENDPOINT,
        data=encoded,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=30,
        ) as response:
            raw = response.read().decode("utf-8")

    except urllib.error.HTTPError as exc:
        body = exc.read().decode(
            "utf-8",
            errors="ignore",
        )

        raise AuthorizationRequired(
            f"Microsoft token request failed ({exc.code}): {body[:800]}"
        ) from exc

    except Exception as exc:
        raise ConnectorError(
            "Unable to reach Microsoft identity platform."
        ) from exc

    try:
        result = json.loads(raw)
    except Exception as exc:
        raise ConnectorError(
            "Microsoft returned an invalid token response."
        ) from exc

    if not result.get("access_token"):
        raise AuthorizationRequired(
            result.get("error_description")
            or result.get("error")
            or "Microsoft did not return an access token."
        )

    return result


def exchange_authorization_code(
    code: str,
) -> dict[str, Any]:
    return _post_token_form(
        {
            "client_id": MICROSOFT_CLIENT_ID,
            "client_secret": MICROSOFT_CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": MICROSOFT_REDIRECT_URI,
            "scope": MICROSOFT_SCOPES,
        }
    )


def refresh_access_token(
    refresh_token: str,
) -> dict[str, Any]:
    if not refresh_token:
        raise AuthorizationRequired(
            "Microsoft refresh token is unavailable. Reconnect the source."
        )

    return _post_token_form(
        {
            "client_id": MICROSOFT_CLIENT_ID,
            "client_secret": MICROSOFT_CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "redirect_uri": MICROSOFT_REDIRECT_URI,
            "scope": MICROSOFT_SCOPES,
        }
    )
