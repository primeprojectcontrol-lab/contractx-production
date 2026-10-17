from __future__ import annotations

import os
from typing import Optional

from fastapi import (
    APIRouter,
    Header,
    HTTPException,
    status,
)
from pydantic import (
    BaseModel,
)
from supabase import (
    Client,
    create_client,
)

from app.ai.cost_control import (
    get_cost_control_status,
)
from app.ai.model_registry import (
    list_models,
)
from app.ai.model_service import (
    get_project_model_policy,
    save_project_model_policy,
)


# =====================================================================
# MODEL GOVERNANCE ROUTER
# =====================================================================

router = APIRouter(
    prefix="/api/v1/models",
    tags=[
        "AI Model Governance"
    ],
)


# =====================================================================
# AUTHENTICATION / AUTHORIZATION
# =====================================================================

def _supabase() -> Client:

    url = os.getenv(
        "SUPABASE_URL",
        "",
    ).strip()

    key = (
        os.getenv(
            "SUPABASE_SERVICE_ROLE_KEY",
            "",
        ).strip()
        or os.getenv(
            "SUPABASE_KEY",
            "",
        ).strip()
    )

    if not url or not key:

        raise HTTPException(
            status_code=
                status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Authentication service is not "
                "currently available."
            ),
        )

    return create_client(
        url,
        key,
    )


def _bearer_token(
    authorization: Optional[str],
) -> str:

    value = (
        authorization
        or ""
    ).strip()

    if not value:

        raise HTTPException(
            status_code=
                status.HTTP_401_UNAUTHORIZED,
            detail=
                "Authentication required.",
        )

    scheme, separator, token = (
        value.partition(" ")
    )

    if (
        not separator
        or scheme.lower() != "bearer"
        or not token.strip()
    ):

        raise HTTPException(
            status_code=
                status.HTTP_401_UNAUTHORIZED,
            detail=
                "Authentication required.",
        )

    return token.strip()


def _require_authenticated_user(
    sb: Client,
    authorization: Optional[str],
) -> str:

    token = _bearer_token(
        authorization
    )

    try:

        auth_response = (
            sb.auth.get_user(
                token
            )
        )

        user = getattr(
            auth_response,
            "user",
            None,
        )

        user_id = getattr(
            user,
            "id",
            None,
        )

    except Exception as exc:

        raise HTTPException(
            status_code=
                status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Invalid or expired "
                "authentication token."
            ),
        ) from exc

    if not user_id:

        raise HTTPException(
            status_code=
                status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Invalid or expired "
                "authentication token."
            ),
        )

    return str(
        user_id
    )


def _is_platform_admin(
    sb: Client,
    user_id: str,
) -> bool:

    try:

        result = (
            sb.table(
                "user_profiles"
            )
            .select(
                "platform_role"
            )
            .eq(
                "user_id",
                user_id,
            )
            .limit(1)
            .execute()
        )

    except Exception:

        return False

    rows = (
        result.data
        or []
    )

    return bool(
        rows
        and str(
            rows[0].get(
                "platform_role"
            )
            or ""
        ).upper()
        == "PLATFORM_ADMIN"
    )


def _require_project_access(
    sb: Client,
    *,
    authorization: Optional[str],
    tenant_id: str,
    project_id: str,
) -> tuple[
    str,
    Optional[str],
]:

    user_id = (
        _require_authenticated_user(
            sb,
            authorization,
        )
    )

    try:

        project_result = (
            sb.table(
                "projects"
            )
            .select(
                "id,tenant_id,created_by"
            )
            .eq(
                "id",
                project_id,
            )
            .eq(
                "tenant_id",
                tenant_id,
            )
            .limit(1)
            .execute()
        )

    except Exception as exc:

        raise HTTPException(
            status_code=
                status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Unable to validate "
                "project access."
            ),
        ) from exc

    projects = (
        project_result.data
        or []
    )

    if not projects:

        raise HTTPException(
            status_code=
                status.HTTP_404_NOT_FOUND,
            detail=
                "Project not found.",
        )

    project = projects[0]

    if str(
        project.get(
            "created_by"
        )
        or ""
    ) == user_id:

        return (
            user_id,
            "OWNER",
        )

    try:

        membership_result = (
            sb.table(
                "project_users"
            )
            .select(
                "role,status"
            )
            .eq(
                "project_id",
                project_id,
            )
            .eq(
                "user_id",
                user_id,
            )
            .eq(
                "status",
                "ACTIVE",
            )
            .limit(1)
            .execute()
        )

    except Exception as exc:

        raise HTTPException(
            status_code=
                status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Unable to validate "
                "project membership."
            ),
        ) from exc

    memberships = (
        membership_result.data
        or []
    )

    if memberships:

        return (
            user_id,
            str(
                memberships[0].get(
                    "role"
                )
                or ""
            ).upper()
            or None,
        )

    if _is_platform_admin(
        sb,
        user_id,
    ):

        return (
            user_id,
            "PLATFORM_ADMIN",
        )

    raise HTTPException(
        status_code=
            status.HTTP_403_FORBIDDEN,
        detail=(
            "You do not have access "
            "to this project."
        ),
    )


def _require_project_admin(
    sb: Client,
    *,
    authorization: Optional[str],
    tenant_id: str,
    project_id: str,
) -> str:

    user_id, role = (
        _require_project_access(
            sb,
            authorization=authorization,
            tenant_id=tenant_id,
            project_id=project_id,
        )
    )

    if role in {
        "OWNER",
        "ADMIN",
        "PLATFORM_ADMIN",
    }:

        return user_id

    raise HTTPException(
        status_code=
            status.HTTP_403_FORBIDDEN,
        detail=(
            "Project administrator "
            "access is required."
        ),
    )


def _require_tenant_access(
    sb: Client,
    *,
    authorization: Optional[str],
    tenant_id: str,
) -> str:

    user_id = (
        _require_authenticated_user(
            sb,
            authorization,
        )
    )

    if _is_platform_admin(
        sb,
        user_id,
    ):

        return user_id

    try:

        project_result = (
            sb.table(
                "projects"
            )
            .select(
                "id,created_by"
            )
            .eq(
                "tenant_id",
                tenant_id,
            )
            .limit(200)
            .execute()
        )

    except Exception as exc:

        raise HTTPException(
            status_code=
                status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Unable to validate "
                "tenant access."
            ),
        ) from exc

    projects = (
        project_result.data
        or []
    )

    if any(
        str(
            project.get(
                "created_by"
            )
            or ""
        )
        == user_id
        for project in projects
    ):

        return user_id

    project_ids = [
        str(
            project.get(
                "id"
            )
        )
        for project in projects
        if project.get(
            "id"
        )
    ]

    if not project_ids:

        raise HTTPException(
            status_code=
                status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have access "
                "to this tenant."
            ),
        )

    try:

        membership_result = (
            sb.table(
                "project_users"
            )
            .select(
                "project_id"
            )
            .in_(
                "project_id",
                project_ids,
            )
            .eq(
                "user_id",
                user_id,
            )
            .eq(
                "status",
                "ACTIVE",
            )
            .limit(1)
            .execute()
        )

    except Exception as exc:

        raise HTTPException(
            status_code=
                status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Unable to validate "
                "tenant membership."
            ),
        ) from exc

    if membership_result.data:

        return user_id

    raise HTTPException(
        status_code=
            status.HTTP_403_FORBIDDEN,
        detail=(
            "You do not have access "
            "to this tenant."
        ),
    )


# =====================================================================
# REQUEST MODEL
# =====================================================================

class ModelSelectionRequest(
    BaseModel
):
    tenant_id: str
    project_id: str
    model_key: str


# =====================================================================
# HEALTH
# =====================================================================

@router.get(
    "/health"
)
async def model_router_health():

    return {
        "status":
            "ONLINE",
        "service":
            "ContractX AI Model Governance",
        "router":
            "model_router",
        "prefix":
            "/api/v1/models",
    }


# =====================================================================
# APPROVED MODELS
# =====================================================================

@router.get(
    "/approved"
)
async def approved_models():

    try:

        models = (
            list_models(
                include_coming_soon=True
            )
        )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to load approved models: "
                f"{exc}"
            ),
        ) from exc

    return {
        "status":
            "success",

        "models":
            models,

        "governance": {

            "models_per_provider":
                1,

            "active_provider":
                "openai",

            "anthropic":
                "coming_soon",

            "google_gemini":
                "coming_soon",

            "arbitrary_model_ids_allowed":
                False,

            "automatic_provider_fallback":
                False,

            "explicit_project_selection_required":
                True,
        },
    }


# =====================================================================
# GET PROJECT MODEL
# =====================================================================

@router.get(
    "/project"
)
async def get_project_model(
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(
        default=None,
        alias="Authorization",
    ),
):

    tenant_id = (
        tenant_id.strip()
    )

    project_id = (
        project_id.strip()
    )

    if not tenant_id:

        raise HTTPException(
            status_code=400,
            detail="tenant_id is required.",
        )

    if not project_id:

        raise HTTPException(
            status_code=400,
            detail="project_id is required.",
        )

    sb = _supabase()

    _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    try:

        policy = (
            get_project_model_policy(
                tenant_id,
                project_id,
            )
        )

        return {
            "status":
                "success",

            "configured":
                True,

            "policy":
                policy,
        }

    except RuntimeError as exc:

        # Project has no explicit model selected.
        # This is an application state rather than a server failure.

        return {
            "status":
                "selection_required",

            "configured":
                False,

            "policy":
                None,

            "message":
                str(exc),
        }

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to load project model policy: "
                f"{exc}"
            ),
        ) from exc


# =====================================================================
# SET PROJECT MODEL
# =====================================================================

@router.post(
    "/project"
)
async def set_project_model(
    payload: ModelSelectionRequest,
    authorization: Optional[str] = Header(
        default=None,
        alias="Authorization",
    ),
):

    tenant_id = (
        payload.tenant_id.strip()
    )

    project_id = (
        payload.project_id.strip()
    )

    if not tenant_id:

        raise HTTPException(
            status_code=400,
            detail="tenant_id is required.",
        )

    if not project_id:

        raise HTTPException(
            status_code=400,
            detail="project_id is required.",
        )

    sb = _supabase()

    _require_project_admin(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    try:

        policy = (
            save_project_model_policy(
                tenant_id=
                    tenant_id,

                project_id=
                    project_id,

                model_key=
                    payload.model_key,
            )
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:

        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to save project model policy: "
                f"{exc}"
            ),
        ) from exc

    return {
        "status":
            "success",

        "configured":
            True,

        "policy":
            policy,
    }


# =====================================================================
# COST CONTROLS
# =====================================================================

@router.get(
    "/cost-controls"
)
async def cost_controls(
    tenant_id: str,
    authorization: Optional[str] = Header(
        default=None,
        alias="Authorization",
    ),
):

    tenant_id = (
        tenant_id.strip()
    )

    if not tenant_id:

        raise HTTPException(
            status_code=400,
            detail="tenant_id is required.",
        )

    sb = _supabase()

    _require_tenant_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
    )

    try:

        cost_status = (
            get_cost_control_status(
                tenant_id
            )
        )

    except RuntimeError as exc:

        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to load model cost controls: "
                f"{exc}"
            ),
        ) from exc

    return {
        "status":
            "success",

        **cost_status,
    }
