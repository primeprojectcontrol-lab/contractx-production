from __future__ import annotations

import hashlib
import os
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.connectors.base import AuthorizationRequired, ConnectorError
from app.connectors.connector_service import ConnectorService
from app.indexing.private_indexing_service import get_private_project_indexer
from app.connectors.microsoft_auth import (
    build_authorization_url,
    exchange_authorization_code,
    microsoft_oauth_configured,
    oauth_state_store,
)
from app.connectors.token_store import token_store

router = APIRouter(
    prefix="/api/v1/vault",
    tags=["Private Project Vault"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "",
)
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Backend Vault mutations should use the server-only service role key
# when available. Never expose this key to the Next.js/browser frontend.
BACKEND_SUPABASE_KEY = (
    SUPABASE_SERVICE_ROLE_KEY
    or SUPABASE_KEY
)

# Active development connector configuration.
LOCAL_CDE_ROOT = os.getenv(
    "CONTRACTX_LOCAL_CDE_ROOT",
    "",
).strip()

CONTRACTX_FRONTEND_URL = os.getenv(
    "CONTRACTX_FRONTEND_URL",
    "http://localhost:3000",
).rstrip("/")

try:
    from supabase import create_client

    db = (
        create_client(
            SUPABASE_URL,
            BACKEND_SUPABASE_KEY,
        )
        if SUPABASE_URL and BACKEND_SUPABASE_KEY
        else None
    )
except Exception:
    db = None


# =====================================================================
# LIVE PROJECT_DOCUMENTS SCHEMA MAPPING
# =====================================================================
#
# Current live columns:
#
# id
# tenant_id
# project_id
# file_name
# storage_path
# file_hash
# file_size_bytes
# document_category
# stakeholder_tier
# flow_direction
# letter_reference_no
# subject_heading
# sender_entity
# recipient_entity
# date_sent
# date_received
# is_formal_notice
# governing_clause_ref
# time_bar_days
# time_bar_deadline
# cde_source
# cde_document_id
# created_at
# updated_at
#
# Added Secure Vault fields:
#
# source_id
# storage_mode
# external_document_id
# external_path
# external_version
# content_hash
# last_synced_at
# sync_status
# index_status
# processing_percent
# file_extension
#
# API responses are normalized to the frontend field names so the
# Documents page does not need to know the physical DB column names.
# =====================================================================


class DataSourceCreate(BaseModel):
    tenant_id: str
    project_id: str
    source_type: str
    display_name: str
    hosting_mode: str = "customer_controlled"
    data_region: Optional[str] = None
    customer_controlled: bool = True
    access_mode: str = "read_index"
    external_root: Optional[str] = None
    connector_mode: Optional[str] = None


class SourceScopeUpdate(BaseModel):
    selected_ids: list[str] = []
    access_mode: str = "read_index"


def _require_db():
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Supabase is not configured.",
        )



# =====================================================================
# AUTHORIZATION HELPERS
# =====================================================================

def _bearer_token(authorization: Optional[str]) -> str:
    """
    Require a Supabase bearer token on protected Vault routes.

    The service-role client remains backend-only. The caller's bearer token is
    independently validated before any project-scoped service-role operation.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return token


def _require_authenticated_user(
    authorization: Optional[str],
) -> str:
    """
    Validate the caller with Supabase Auth and return the authenticated user ID.
    """
    _require_db()
    token = _bearer_token(authorization)

    try:
        auth_response = db.auth.get_user(token)
        user = getattr(auth_response, "user", None)
        user_id = getattr(user, "id", None)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        ) from exc

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )

    return str(user_id)


def _is_platform_admin(
    *,
    user_id: str,
) -> bool:
    try:
        response = (
            db.table("user_profiles")
            .select("platform_role")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return False

    rows = response.data or []
    return bool(
        rows
        and str(rows[0].get("platform_role") or "").upper()
        == "PLATFORM_ADMIN"
    )


def _require_project_access_for_user(
    *,
    user_id: str,
    tenant_id: str,
    project_id: str,
) -> None:
    """
    Authorize an already-authenticated caller against the live project registry.

    Authorization is based on projects + project_users, not on tenant/project IDs
    supplied by the frontend. Project creators, ACTIVE project members and
    PLATFORM_ADMIN users are permitted.
    """
    _require_db()

    try:
        project_response = (
            db.table("projects")
            .select("id,tenant_id,created_by")
            .eq("id", project_id)
            .eq("tenant_id", tenant_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate project access.",
        ) from exc

    projects = project_response.data or []
    if not projects:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    project = projects[0]
    if str(project.get("created_by") or "") == user_id:
        return

    try:
        membership_response = (
            db.table("project_users")
            .select("role,status")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .eq("status", "ACTIVE")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate project membership.",
        ) from exc

    if membership_response.data:
        return

    if _is_platform_admin(user_id=user_id):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this project.",
    )


def _require_project_access(
    *,
    authorization: Optional[str],
    tenant_id: str,
    project_id: str,
) -> str:
    """
    Validate authentication plus project membership before service-role access.
    """
    user_id = _require_authenticated_user(authorization)
    _require_project_access_for_user(
        user_id=user_id,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    return user_id


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_extension(filename: Optional[str]) -> str:
    if not filename:
        return ""

    if "." not in filename:
        return ""

    return filename.rsplit(".", 1)[-1].lower().strip()


def _normalise_category(value: Any) -> str:
    if value is None:
        return "other"

    raw = str(value).strip()

    reverse = {
        "EXECUTED_CONTRACT": "executed_contract",
        "CLIENT_CORRESPONDENCE": "client_correspondence",
        "SUBCONTRACTOR_CORRESPONDENCE": "subcontractor_correspondence",
        "SITE_INSTRUCTION": "site_instruction",
        "FORMAL_NOTICE": "formal_notice",
        "EOT_CLAIM_SUBMISSION": "eot_claim_submission",
        "MINUTES_OF_MEETING": "minutes_of_meeting",
        "VARIATION_ORDER": "variation_order",
        "COMMERCIAL_PAYMENT": "commercial_payment",
    }

    return reverse.get(
        raw,
        raw.lower(),
    )


def _normalise_document(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Preserve physical database schema internally while exposing a stable
    frontend-facing document contract.
    """

    document_date = (
        row.get("date_sent")
        or row.get("date_received")
        or row.get("created_at")
    )

    uploaded_at = row.get("created_at")

    return {
        # Stable identifiers
        "id": row.get("id"),
        "tenant_id": row.get("tenant_id"),
        "project_id": row.get("project_id"),

        # Stable frontend names
        "file_name": row.get("file_name"),
        "subject": row.get("subject_heading"),
        "letter_ref": row.get("letter_reference_no"),
        "sender": row.get("sender_entity"),
        "recipient": row.get("recipient_entity"),
        "document_date": document_date,
        "uploaded_at": uploaded_at,

        # Classification
        "category": _normalise_category(
            row.get("document_category")
        ),
        "document_type": _normalise_category(
            row.get("document_category")
        ),
        "stakeholder_tier": (
            str(row.get("stakeholder_tier"))
            if row.get("stakeholder_tier") is not None
            else None
        ),
        "flow_direction": (
            str(row.get("flow_direction"))
            if row.get("flow_direction") is not None
            else None
        ),

        # Contract / notice metadata
        "is_formal_notice": row.get("is_formal_notice"),
        "governing_clause_ref": row.get(
            "governing_clause_ref"
        ),
        "time_bar_days": row.get("time_bar_days"),
        "time_bar_deadline": row.get(
            "time_bar_deadline"
        ),

        # Storage / source
        "storage_path": row.get("storage_path"),
        "storage_mode": (
            row.get("storage_mode")
            or "contractx_managed"
        ),
        "source_id": row.get("source_id"),
        "cde_source": row.get("cde_source"),
        "cde_document_id": row.get("cde_document_id"),
        "external_document_id": row.get(
            "external_document_id"
        ),
        "external_path": row.get("external_path"),
        "external_version": row.get(
            "external_version"
        ),
        "last_synced_at": row.get("last_synced_at"),

        # Integrity / file
        "file_hash": row.get("file_hash"),
        "content_hash": row.get("content_hash"),
        "file_size_bytes": row.get(
            "file_size_bytes"
        ),
        "file_extension": (
            row.get("file_extension")
            or _safe_extension(
                row.get("file_name")
            )
        ),

        # Processing state
        "sync_status": (
            row.get("sync_status")
            or "ready"
        ),
        "index_status": (
            row.get("index_status")
            or "pending"
        ),
        "processing_percent": (
            row.get("processing_percent")
            or 0
        ),

        # Audit timestamps
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _map_category_filter(category: str) -> str:
    """
    UI category -> live PostgreSQL document_category enum value.
    """

    mapping = {
        "executed_contract": "EXECUTED_CONTRACT",
        "main_contract": "EXECUTED_CONTRACT",

        "client_correspondence": "CLIENT_CORRESPONDENCE",
        "correspondence": "CLIENT_CORRESPONDENCE",

        "subcontractor_correspondence": "SUBCONTRACTOR_CORRESPONDENCE",

        "site_instruction": "SITE_INSTRUCTION",
        "site_record": "SITE_INSTRUCTION",

        "formal_notice": "FORMAL_NOTICE",
        "notice": "FORMAL_NOTICE",
        "notices": "FORMAL_NOTICE",

        "eot_claim_submission": "EOT_CLAIM_SUBMISSION",
        "claim": "EOT_CLAIM_SUBMISSION",
        "claims": "EOT_CLAIM_SUBMISSION",

        "minutes_of_meeting": "MINUTES_OF_MEETING",
        "meeting_minutes": "MINUTES_OF_MEETING",

        "variation_order": "VARIATION_ORDER",
        "commercial_payment": "COMMERCIAL_PAYMENT",

        "programme_schedule": "PROGRAMME_SCHEDULE",
        "programme": "PROGRAMME_SCHEDULE",
        "schedule": "PROGRAMME_SCHEDULE",
    }

    key = category.strip().lower()

    mapped = mapping.get(key)
    if not mapped:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported document category. "
                "Use one of the configured ContractX Vault categories."
            ),
        )

    return mapped


# =====================================================================
# HEALTH
# =====================================================================


@router.get("/connectors/status")
async def connector_status():
    """
    Public capability/readiness metadata only.

    No provider secrets, tokens or customer configuration are returned.
    """
    microsoft_ready = microsoft_oauth_configured()

    return {
        "status": "ok",
        "connectors": {
            "contractx_vault": {
                "ready": True,
                "state": "native",
                "message": "ContractX Managed Vault is native to the platform.",
            },
            "private_server_local_simulator": {
                "ready": bool(LOCAL_CDE_ROOT),
                "state": "development_adapter",
                "message": "Local CDE Test is available when CONTRACTX_LOCAL_CDE_ROOT is configured.",
            },
            "onedrive": {
                "ready": microsoft_ready,
                "state": "active" if microsoft_ready else "platform_setup_pending",
                "message": (
                    "Microsoft OneDrive connector is available."
                    if microsoft_ready
                    else "ContractX Microsoft platform registration/configuration is pending."
                ),
            },
            "sharepoint": {
                "ready": microsoft_ready,
                "state": "active" if microsoft_ready else "platform_setup_pending",
                "message": (
                    "Microsoft SharePoint connector is available."
                    if microsoft_ready
                    else "ContractX Microsoft platform registration/configuration is pending."
                ),
            },
            "procore": {
                "ready": False,
                "state": "platform_setup_pending",
                "message": "ContractX Procore developer-app/OAuth integration is pending.",
            },
            "aconex": {
                "ready": False,
                "state": "platform_setup_pending",
                "message": "ContractX Oracle Aconex OAuth integration registration/publication is pending.",
            },
            "autodesk_acc": {
                "ready": False,
                "state": "platform_setup_pending",
                "message": "ContractX Autodesk Platform Services integration is pending.",
            },
            "aws_s3": {
                "ready": False,
                "state": "platform_setup_pending",
                "message": "ContractX AWS S3 cross-account connector is pending.",
            },
            "azure_blob": {
                "ready": False,
                "state": "platform_setup_pending",
                "message": "ContractX Azure Blob connector is pending.",
            },
            "private_server": {
                "ready": False,
                "state": "platform_setup_pending",
                "message": "ContractX production Private Server / On-Prem agent/gateway is pending.",
            },
            "other_cde": {
                "ready": False,
                "state": "integration_assessment_required",
                "message": "Provider-specific CDE integration assessment is required.",
            },
        },
    }


@router.get("/health")
async def vault_health():
    return {
        "status": "ok",
        "module": "private_project_vault",
        "database_configured": db is not None,
        "backend_service_role_configured": bool(
            SUPABASE_SERVICE_ROLE_KEY
        ),
        "local_cde_root_configured": bool(
            LOCAL_CDE_ROOT
        ),
        "storage_bucket": "project-documents",
        "schema_mode": "live_project_documents_compatible",
    }


# =====================================================================
# SUMMARY / INTELLIGENCE DECK
# =====================================================================


@router.get("/summary")
async def vault_summary(
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()

    docs = (
        db.table("project_documents")
        .select(
            (
                "id,"
                "document_category,"
                "file_name,"
                "file_extension,"
                "index_status,"
                "processing_percent,"
                "created_at,"
                "date_sent,"
                "date_received,"
                "source_id,"
                "storage_mode,"
                "last_synced_at"
            ),
            count="exact",
        )
        .eq(
            "tenant_id",
            tenant_id,
        )
        .eq(
            "project_id",
            project_id,
        )
        .execute()
    )

    rows = docs.data or []

    counts: Dict[str, int] = {}

    for row in rows:
        category = _normalise_category(
            row.get("document_category")
        )

        counts[category] = (
            counts.get(
                category,
                0,
            )
            + 1
        )

    indexed = sum(
        1
        for row in rows
        if (
            row.get("index_status")
            or ""
        ).lower()
        == "ready"
    )

    last_upload = max(
        [
            row.get("created_at")
            for row in rows
            if row.get("created_at")
        ]
        or [None]
    )

    last_document_date = max(
        [
            row.get("date_sent")
            or row.get("date_received")
            for row in rows
            if (
                row.get("date_sent")
                or row.get("date_received")
            )
        ]
        or [None]
    )

    contractx_managed = sum(
        1
        for row in rows
        if (
            row.get("storage_mode")
            or "contractx_managed"
        )
        == "contractx_managed"
    )

    customer_hosted = len(rows) - contractx_managed

    sources = (
        db.table("data_sources")
        .select("*")
        .eq(
            "tenant_id",
            tenant_id,
        )
        .eq(
            "project_id",
            project_id,
        )
        .order(
            "created_at",
            desc=False,
        )
        .execute()
    )

    connected_sources = sources.data or []

    active_sources = sum(
        1
        for source in connected_sources
        if source.get("connection_status")
        == "connected"
    )

    return {
        "status": "success",
        "total_documents": len(rows),
        "indexed_documents": indexed,
        "index_coverage_percent": (
            round(
                indexed
                / len(rows)
                * 100,
                1,
            )
            if rows
            else 0
        ),
        "last_upload_at": last_upload,
        "last_document_date": last_document_date,
        "category_counts": counts,
        "connected_sources": connected_sources,
        "active_source_count": active_sources,
        "storage_statistics": {
            "contractx_managed_documents": (
                contractx_managed
            ),
            "customer_hosted_documents": (
                customer_hosted
            ),
        },
        "security": {
            "data_ownership": "customer",
            "tenant_isolation": "enabled",
            "ai_training": "disabled",
            "processing_policy": (
                "authorised_project_context_only"
            ),
        },
    }


# =====================================================================
# DOCUMENT REGISTER
# =====================================================================


@router.get("/documents")
async def list_documents(
    tenant_id: str,
    project_id: str,
    page: int = 1,
    page_size: int = 20,
    query: Optional[str] = None,
    category: Optional[str] = None,
    file_extension: Optional[str] = None,
    source_id: Optional[str] = None,
    index_status: Optional[str] = None,
    document_date_from: Optional[str] = None,
    document_date_to: Optional[str] = None,
    uploaded_from: Optional[str] = None,
    uploaded_to: Optional[str] = None,
    sort_by: str = "document_date",
    sort_direction: str = "desc",
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()

    page = max(
        page,
        1,
    )

    page_size = min(
        max(
            page_size,
            1,
        ),
        100,
    )

    offset = (
        page - 1
    ) * page_size

    # Frontend sort field -> live DB field
    sort_map = {
        "document_date": "date_sent",
        "uploaded_at": "created_at",
        "file_name": "file_name",
        "letter_ref": "letter_reference_no",
        "sender": "sender_entity",
        "recipient": "recipient_entity",
        "processing_percent": "processing_percent",
    }

    db_sort_field = sort_map.get(
        sort_by,
        "date_sent",
    )

    q = (
        db.table("project_documents")
        .select(
            "*",
            count="exact",
        )
        .eq(
            "tenant_id",
            tenant_id,
        )
        .eq(
            "project_id",
            project_id,
        )
    )

    # --------------------------------------------------------------
    # Search
    # --------------------------------------------------------------

    if query:
        safe = (
            query
            .replace(
                ",",
                " ",
            )
            .replace(
                "%",
                "",
            )
            .strip()
        )

        if safe:
            q = q.or_(
                (
                    f"file_name.ilike.%{safe}%,"
                    f"subject_heading.ilike.%{safe}%,"
                    f"letter_reference_no.ilike.%{safe}%,"
                    f"sender_entity.ilike.%{safe}%,"
                    f"recipient_entity.ilike.%{safe}%"
                )
            )

    # --------------------------------------------------------------
    # Classification / file filters
    # --------------------------------------------------------------

    if category:
        q = q.eq(
            "document_category",
            _map_category_filter(
                category
            ),
        )

    if file_extension:
        q = q.eq(
            "file_extension",
            file_extension
            .lower()
            .lstrip("."),
        )

    if source_id:
        q = q.eq(
            "source_id",
            source_id,
        )

    if index_status:
        q = q.eq(
            "index_status",
            index_status,
        )

    # --------------------------------------------------------------
    # Document date filters
    #
    # date_sent is the primary business document date in the current
    # schema. date_received remains available in normalized responses.
    # --------------------------------------------------------------

    if document_date_from:
        q = q.gte(
            "date_sent",
            document_date_from,
        )

    if document_date_to:
        q = q.lte(
            "date_sent",
            document_date_to,
        )

    # --------------------------------------------------------------
    # Upload date filters -> created_at
    # --------------------------------------------------------------

    if uploaded_from:
        q = q.gte(
            "created_at",
            uploaded_from,
        )

    if uploaded_to:
        # Include the complete selected day.
        upload_to_end = (
            f"{uploaded_to}T23:59:59.999999+00:00"
            if "T" not in uploaded_to
            else uploaded_to
        )

        q = q.lte(
            "created_at",
            upload_to_end,
        )

    result = (
        q.order(
            db_sort_field,
            desc=(
                sort_direction.lower()
                != "asc"
            ),
            nullsfirst=False,
        )
        .range(
            offset,
            offset
            + page_size
            - 1,
        )
        .execute()
    )

    total = (
        result.count
        or 0
    )

    rows = (
        result.data
        or []
    )

    return {
        "status": "success",
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": max(
            1,
            (
                total
                + page_size
                - 1
            )
            // page_size,
        ),
        "documents": [
            _normalise_document(
                row
            )
            for row in rows
        ],
    }


async def _delete_document_impl(
    document_id: str,
    tenant_id: str,
    project_id: str,
):
    """
    Delete one document from the ContractX project vault.

    ContractX-managed files are removed from the private Supabase Storage
    bucket before the register row is deleted. External customer-CDE files
    are never deleted by this endpoint.

    Current indexed-document deletion is deliberately conservative: if a
    future private-index purge is required, that cleanup must be wired into
    the ingestion/index service rather than silently leaving orphan vectors.
    """

    _require_db()

    result = (
        db.table("project_documents")
        .select("*")
        .eq("id", document_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    document = result.data[0]

    if (
        str(document.get("tenant_id")) != str(tenant_id)
        or str(document.get("project_id")) != str(project_id)
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "The document does not belong to the active "
                "tenant/project context."
            ),
        )

    index_status = str(
        document.get("index_status")
        or "pending"
    ).lower()

    # Do not create orphan vectors once private indexing is live.
    # Current uploaded documents at pending/10% can be deleted safely.
    if index_status == "ready":
        raise HTTPException(
            status_code=409,
            detail=(
                "This document is already indexed. "
                "Private-index purge must be completed before deletion "
                "to preserve evidence provenance."
            ),
        )

    storage_mode = str(
        document.get("storage_mode")
        or "contractx_managed"
    ).lower()

    storage_path = document.get("storage_path")

    if (
        storage_mode == "contractx_managed"
        and storage_path
    ):
        try:
            db.storage.from_(
                "project-documents"
            ).remove(
                [storage_path]
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Unable to remove the document from the "
                    "ContractX private storage bucket. "
                    f"{str(exc)}"
                ),
            )

    # Remove upload/processing tracking records for this document.
    try:
        (
            db.table("document_ingestion_jobs")
            .delete()
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .eq("document_id", document_id)
            .execute()
        )
    except Exception:
        # Job history cleanup must not leave the actual document orphaned.
        pass

    (
        db.table("project_documents")
        .delete()
        .eq("id", document_id)
        .execute()
    )

    return {
        "status": "success",
        "document_id": document_id,
        "storage_object_removed": (
            storage_mode == "contractx_managed"
            and bool(storage_path)
        ),
        "external_customer_file_changed": False,
        "message": (
            "Document deleted from the ContractX project vault. "
            "No external customer-CDE file was changed."
        ),
    }



@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    return await _delete_document_impl(
        document_id=document_id,
        tenant_id=tenant_id,
        project_id=project_id,
    )


@router.post("/documents/{document_id}/remove")
async def remove_document_post(
    document_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    return await _delete_document_impl(
        document_id=document_id,
        tenant_id=tenant_id,
        project_id=project_id,
    )



# =====================================================================
# PRIVATE DOCUMENT INDEX / RETRY
# =====================================================================


@router.post("/documents/{document_id}/index")
async def index_project_document(
    document_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    """
    Index or re-index one registered private project document.

    UI contract:
    - remains 10% while processing
    - becomes 100% only after extraction, embeddings, Qdrant upsert and
      Evidence Graph document-node creation all succeed
    """
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()

    document_result = (
        db.table(
            "project_documents"
        )
        .select("*")
        .eq(
            "id",
            document_id,
        )
        .eq(
            "tenant_id",
            tenant_id,
        )
        .eq(
            "project_id",
            project_id,
        )
        .limit(1)
        .execute()
    )

    if not document_result.data:
        raise HTTPException(
            status_code=404,
            detail="Project document not found.",
        )

    job_result = (
        db.table(
            "document_ingestion_jobs"
        )
        .select("*")
        .eq(
            "document_id",
            document_id,
        )
        .order(
            "updated_at",
            desc=True,
        )
        .limit(1)
        .execute()
    )

    job_id = (
        str(
            job_result.data[0][
                "id"
            ]
        )
        if job_result.data
        else str(
            uuid.uuid4()
        )
    )

    if not job_result.data:
        (
            db.table(
                "document_ingestion_jobs"
            )
            .insert(
                {
                    "id":
                        job_id,
                    "tenant_id":
                        tenant_id,
                    "project_id":
                        project_id,
                    "document_id":
                        document_id,
                    "source_id":
                        document_result.data[0].get(
                            "source_id"
                        ),
                    "stage":
                        "uploaded",
                    "transfer_percent":
                        100,
                    "processing_percent":
                        10,
                    "current_task":
                        "Queued for private indexing",
                    "started_at":
                        _utc_now(),
                    "updated_at":
                        _utc_now(),
                }
            )
            .execute()
        )

    try:
        indexer = (
            get_private_project_indexer()
        )

        result = (
            await indexer.index_document(
                document_id=document_id,
                tenant_id=tenant_id,
                project_id=project_id,
                job_id=job_id,
            )
        )

        return {
            "status":
                "success",
            "job_id":
                job_id,
            **result,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Private project indexing failed. "
                f"{str(exc)}"
            ),
        ) from exc



# =====================================================================
# PRIVATE PROJECT BATCH INDEX / RETRY
# =====================================================================


@router.post("/documents/index-pending")
async def index_pending_project_documents(
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    """
    Index every non-ready private project document for one tenant/project.

    This is intentionally project-scoped and does not touch the
    standard_contract_library reference collection.
    """
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()

    docs_result = (
        db.table(
            "project_documents"
        )
        .select("*")
        .eq(
            "tenant_id",
            tenant_id,
        )
        .eq(
            "project_id",
            project_id,
        )
        .execute()
    )

    documents = [
        row
        for row in (
            docs_result.data
            or []
        )
        if str(
            row.get(
                "index_status"
            )
            or ""
        ).lower()
        != "ready"
        and str(
            row.get(
                "index_status"
            )
            or ""
        ).lower()
        != "not_requested"
    ]

    if not documents:
        return {
            "status":
                "success",
            "tenant_id":
                tenant_id,
            "project_id":
                project_id,
            "attempted":
                0,
            "ready":
                0,
            "failed":
                0,
            "items":
                [],
            "message":
                "No pending project documents require indexing.",
        }

    indexer = (
        get_private_project_indexer()
    )

    items: list[
        dict[str, Any]
    ] = []

    ready_count = 0
    failed_count = 0

    for document in documents:
        document_id = str(
            document.get(
                "id"
            )
            or ""
        )

        if not document_id:
            continue

        job_result = (
            db.table(
                "document_ingestion_jobs"
            )
            .select("*")
            .eq(
                "document_id",
                document_id,
            )
            .order(
                "updated_at",
                desc=True,
            )
            .limit(1)
            .execute()
        )

        if job_result.data:
            job_id = str(
                job_result.data[0][
                    "id"
                ]
            )
        else:
            job_id = str(
                uuid.uuid4()
            )

            (
                db.table(
                    "document_ingestion_jobs"
                )
                .insert(
                    {
                        "id":
                            job_id,
                        "tenant_id":
                            tenant_id,
                        "project_id":
                            project_id,
                        "document_id":
                            document_id,
                        "source_id":
                            document.get(
                                "source_id"
                            ),
                        "stage":
                            "queued",
                        "transfer_percent":
                            100,
                        "processing_percent":
                            10,
                        "current_task":
                            "Queued for private indexing",
                        "started_at":
                            _utc_now(),
                        "updated_at":
                            _utc_now(),
                    }
                )
                .execute()
            )

        try:
            result = (
                await indexer.index_document(
                    document_id=document_id,
                    tenant_id=tenant_id,
                    project_id=project_id,
                    job_id=job_id,
                )
            )

            ready_count += 1

            items.append(
                {
                    "document_id":
                        document_id,
                    "file_name":
                        document.get(
                            "file_name"
                        ),
                    "status":
                        "ready",
                    "processing_percent":
                        100,
                    "chunk_count":
                        result.get(
                            "chunk_count"
                        ),
                }
            )

        except Exception as exc:
            failed_count += 1

            items.append(
                {
                    "document_id":
                        document_id,
                    "file_name":
                        document.get(
                            "file_name"
                        ),
                    "status":
                        "failed",
                    "processing_percent":
                        10,
                    "error":
                        str(exc),
                }
            )

    return {
        "status":
            (
                "success"
                if failed_count == 0
                else "completed_with_errors"
            ),
        "tenant_id":
            tenant_id,
        "project_id":
            project_id,
        "attempted":
            len(items),
        "ready":
            ready_count,
        "failed":
            failed_count,
        "items":
            items,
        "message":
            (
                f"Batch private indexing complete: "
                f"{ready_count} ready, "
                f"{failed_count} failed."
            ),
    }


# =====================================================================
# INGESTION JOB STATUS
# =====================================================================


@router.get("/jobs/{job_id}")
async def get_ingestion_job(
    job_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_db()

    result = (
        db.table(
            "document_ingestion_jobs"
        )
        .select("*")
        .eq(
            "id",
            job_id,
        )
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail=(
                "Ingestion job not found."
            ),
        )

    job = result.data
    user_id = _require_authenticated_user(authorization)
    _require_project_access_for_user(
        user_id=user_id,
        tenant_id=str(job.get("tenant_id") or ""),
        project_id=str(job.get("project_id") or ""),
    )

    return job


# =====================================================================
# DATA SOURCES
# =====================================================================


@router.post("/sources")
async def register_source(
    payload: DataSourceCreate,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )

    _require_db()

    allowed_source_types = {
        "contractx_vault",
        "sharepoint",
        "onedrive",
        "aws_s3",
        "azure_blob",
        "private_server",
        "aconex",
        "procore",
        "autodesk_acc",
        "other_cde",
    }

    if (
        payload.source_type
        not in allowed_source_types
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported data source type.",
        )

    allowed_hosting_modes = {
        "contractx_managed",
        "customer_controlled",
        "customer_private",
    }

    if (
        payload.hosting_mode
        not in allowed_hosting_modes
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported hosting mode.",
        )

    allowed_access_modes = {
        "metadata_only",
        "read_only",
        "read_index",
        "read_process",
    }

    if (
        payload.access_mode
        not in allowed_access_modes
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported access mode.",
        )

    if not payload.display_name.strip():
        raise HTTPException(
            status_code=400,
            detail="Data source display name is required.",
        )

    is_local_simulator = (
        payload.source_type == "private_server"
        and payload.connector_mode == "local_simulator"
    )

    is_contractx_vault = (
        payload.source_type == "contractx_vault"
    )

    if payload.connector_mode and not is_local_simulator:
        raise HTTPException(
            status_code=400,
            detail=(
                "connector_mode is only supported for "
                "private_server/local_simulator in the current development build."
            ),
        )

    # Provider credentials are deliberately NOT accepted here.
    # This endpoint completes registration only.
    # OAuth / secret-manager integration is the next connector step.
    row = {
        "tenant_id": payload.tenant_id,
        "project_id": payload.project_id,
        "source_type": payload.source_type,
        "display_name": (
            payload.display_name.strip()
        ),
        "hosting_mode": (
            payload.hosting_mode
        ),
        "data_region": (
            payload.data_region.strip()
            if payload.data_region
            else None
        ),
        "customer_controlled": (
            payload.customer_controlled
        ),
        "access_mode": (
            payload.access_mode
        ),
        "external_root": (
            payload.external_root.strip()
            if payload.external_root
            else None
        ),
        "connection_status": (
            "connected"
            if is_contractx_vault
            else (
                "disconnected"
                if is_local_simulator
                else "pending"
            )
        ),
        "configuration": {
            "registration_complete": True,
            "connector_mode": (
                "local_simulator"
                if is_local_simulator
                else None
            ),
            "connection_mode": (
                "contractx_managed"
                if is_contractx_vault
                else (
                    "local_test"
                    if is_local_simulator
                    else "customer_managed"
                )
            ),
            "customer_setup_required": (
                False
                if is_contractx_vault
                else not is_local_simulator
            ),
        },
        "updated_at": _utc_now(),
    }

    result = (
        db.table("data_sources")
        .insert(row)
        .execute()
    )

    source = (
        result.data[0]
        if result.data
        else row
    )

    customer_setup_required = False if is_contractx_vault else not is_local_simulator

    return {
        "status": "registered",
        "registration_complete": True,
        "customer_setup_required": customer_setup_required,
        "source": source,
        "message": (
            "ContractX Managed Vault is connected natively to this project."
            if is_contractx_vault
            else (
                "Local CDE Test registered. ContractX can verify the configured local folder now."
                if is_local_simulator
                else (
                    "CDE source registered. The customer or their IT administrator "
                    "must complete the provider-specific connection before ContractX "
                    "can mark it connected."
                )
            )
        ),
    }



def _get_source_or_404(
    source_id: str,
    tenant_id: str,
    project_id: str,
) -> Dict[str, Any]:
    result = (
        db.table("data_sources")
        .select("*")
        .eq("id", source_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Data source registration not found.",
        )

    source = result.data[0]

    if (
        str(source.get("tenant_id")) != str(tenant_id)
        or str(source.get("project_id")) != str(project_id)
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "The data source does not belong to the active "
                "tenant/project context."
            ),
        )

    return source


def _set_source_status(
    source_id: str,
    status_value: str,
) -> Dict[str, Any]:
    result = (
        db.table("data_sources")
        .update(
            {
                "connection_status": status_value,
                "updated_at": _utc_now(),
            }
        )
        .eq("id", source_id)
        .execute()
    )

    return (
        result.data[0]
        if result.data
        else {"id": source_id, "connection_status": status_value}
    )


@router.post("/sources/{source_id}/authorize")
async def authorize_source(
    source_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()

    source = _get_source_or_404(
        source_id,
        tenant_id,
        project_id,
    )

    source_type = str(
        source.get("source_type")
        or ""
    ).lower()

    configuration = source.get("configuration") or {}
    if not isinstance(configuration, dict):
        configuration = {}

    connector_mode = str(
        configuration.get("connector_mode")
        or ""
    ).lower()

    is_local_simulator = (
        source_type == "private_server"
        and connector_mode == "local_simulator"
    )

    if source_type == "contractx_vault":
        updated_source = _set_source_status(
            source_id,
            "connected",
        )

        return {
            "status": "success",
            "customer_setup_required": False,
            "connection_status": "connected",
            "source": updated_source,
            "connection": {
                "source_type": "contractx_vault",
                "hosting_mode": "contractx_managed",
                "native": True,
            },
            "message": (
                "ContractX Managed Vault is connected natively. "
                "No external provider adapter is required."
            ),
        }

    if is_local_simulator:
        try:
            connector = ConnectorService.for_source(
                source
            )
            connection = await connector.test_connection()

        except ConnectorError as exc:
            _set_source_status(
                source_id,
                "error",
            )

            raise HTTPException(
                status_code=503,
                detail=str(exc),
            ) from exc

        updated_source = _set_source_status(
            source_id,
            "connected",
        )

        return {
            "status": "success",
            "customer_setup_required": False,
            "connection_status": "connected",
            "source": updated_source,
            "connection": connection,
            "message": (
                "Local CDE Test connected successfully."
            ),
        }

    if source_type in {
        "onedrive",
        "sharepoint",
    }:
        if not microsoft_oauth_configured():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Microsoft connector is installed but OAuth is not configured. "
                    "Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and "
                    "MICROSOFT_REDIRECT_URI in the backend environment."
                ),
            )

        authorization_url = build_authorization_url(
            source_id=source_id,
            tenant_id=tenant_id,
            project_id=project_id,
        )

        return {
            "status": "authorization_required",
            "customer_setup_required": True,
            "connection_status": "pending",
            "source_id": source_id,
            "source_type": source_type,
            "authorization_url": authorization_url,
            "message": (
                "Redirecting to Microsoft to authorize ContractX read access."
            ),
        }

    return {
        "status": "customer_setup_required",
        "customer_setup_required": True,
        "connection_status": (
            source.get("connection_status")
            or "pending"
        ),
        "source_id": source_id,
        "source_type": source_type,
        "message": (
            "This source is registered for customer-managed connection. "
            "A real provider adapter must be enabled before ContractX can "
            "verify and mark the source connected."
        ),
    }



@router.get("/oauth/microsoft/callback")
async def microsoft_oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    """
    Microsoft Entra OAuth callback.

    Tokens are stored server-side only. No access or refresh token is written
    to Supabase or exposed to the browser.
    """
    if error:
        target = (
            f"{CONTRACTX_FRONTEND_URL}/documents"
            f"?cde_error={urllib.parse.quote(error_description or error)}"
        )

        return RedirectResponse(
            url=target,
            status_code=302,
        )

    if not code or not state:
        raise HTTPException(
            status_code=400,
            detail=(
                "Microsoft OAuth callback is missing code/state."
            ),
        )

    try:
        oauth_context = oauth_state_store.consume(
            state
        )

        source = _get_source_or_404(
            oauth_context.source_id,
            oauth_context.tenant_id,
            oauth_context.project_id,
        )

        source_type = str(
            source.get("source_type")
            or ""
        ).lower()

        if source_type not in {
            "onedrive",
            "sharepoint",
        }:
            raise HTTPException(
                status_code=400,
                detail=(
                    "OAuth callback source is not a Microsoft connector."
                ),
            )

        token_response = exchange_authorization_code(
            code
        )

        token_store.set(
            oauth_context.source_id,
            access_token=token_response[
                "access_token"
            ],
            refresh_token=token_response.get(
                "refresh_token"
            ),
            expires_in=int(
                token_response.get(
                    "expires_in",
                    3600,
                )
            ),
            scope=str(
                token_response.get(
                    "scope"
                )
                or ""
            ),
            token_type=str(
                token_response.get(
                    "token_type"
                )
                or "Bearer"
            ),
        )

        connector = ConnectorService.for_source(
            source
        )

        connection = await connector.test_connection()

        configuration = dict(
            source.get("configuration")
            or {}
        )

        configuration["connection_mode"] = (
            "microsoft_delegated_oauth"
        )
        configuration[
            "customer_setup_required"
        ] = False
        configuration[
            "oauth_verified_at"
        ] = _utc_now()
        configuration[
            "microsoft_provider"
        ] = source_type

        (
            db.table("data_sources")
            .update(
                {
                    "configuration":
                        configuration,
                    "connection_status":
                        "connected",
                    "updated_at":
                        _utc_now(),
                }
            )
            .eq(
                "id",
                oauth_context.source_id,
            )
            .execute()
        )

        target = (
            f"{CONTRACTX_FRONTEND_URL}/documents"
            f"?cde_connected=1"
            f"&source_id={urllib.parse.quote(oauth_context.source_id)}"
            f"&provider={urllib.parse.quote(source_type)}"
        )

        return RedirectResponse(
            url=target,
            status_code=302,
        )

    except HTTPException:
        raise

    except Exception as exc:
        target = (
            f"{CONTRACTX_FRONTEND_URL}/documents"
            f"?cde_error={urllib.parse.quote(str(exc)[:400])}"
        )

        return RedirectResponse(
            url=target,
            status_code=302,
        )


@router.post("/sources/{source_id}/test")
async def test_source_connection(
    source_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()
    source = _get_source_or_404(source_id, tenant_id, project_id)

    source_type = str(
        source.get("source_type")
        or ""
    ).lower()

    if source_type == "contractx_vault":
        _set_source_status(
            source_id,
            "connected",
        )

        return {
            "status": "success",
            "connection_status": "connected",
            "source_id": source_id,
            "connection": {
                "source_type": "contractx_vault",
                "native": True,
            },
            "message": (
                "ContractX Managed Vault connection verified."
            ),
        }

    try:
        connector = ConnectorService.for_source(source)
        connection = await connector.test_connection()
    except AuthorizationRequired as exc:
        _set_source_status(source_id, "error")
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ConnectorError as exc:
        _set_source_status(source_id, "error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    _set_source_status(source_id, "connected")

    return {
        "status": "success",
        "connection_status": "connected",
        "source_id": source_id,
        "connection": connection,
        "message": "CDE connection verified.",
    }


@router.get("/sources/{source_id}/browse")
async def browse_source(
    source_id: str,
    tenant_id: str,
    project_id: str,
    parent_item_id: Optional[str] = None,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()
    source = _get_source_or_404(
        source_id,
        tenant_id,
        project_id,
    )

    source_type = str(
        source.get("source_type")
        or ""
    ).lower()

    # ContractX Managed Vault is native Supabase-backed project storage.
    # It is not an external CDE and must never be routed through
    # ConnectorService.
    if source_type == "contractx_vault":
        docs = (
            db.table("project_documents")
            .select(
                "id,file_name,file_extension,index_status,"
                "processing_percent,created_at,storage_path"
            )
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .eq("storage_mode", "contractx_managed")
            .order("created_at", desc=True)
            .execute()
        )

        items = [
            {
                "id": str(row.get("id") or ""),
                "name": row.get("file_name") or "Project Document",
                "kind": "file",
                "file_extension": row.get("file_extension"),
                "index_status": row.get("index_status"),
                "processing_percent": row.get("processing_percent"),
                "created_at": row.get("created_at"),
                "storage_path": row.get("storage_path"),
                "native": True,
            }
            for row in (docs.data or [])
        ]

        return {
            "status": "success",
            "source_id": source_id,
            "source_type": "contractx_vault",
            "native": True,
            "parent_item_id": None,
            "items": items,
            "selected_ids": [],
            "access_mode": "read_index",
            "message": (
                "ContractX Managed Vault is native project storage. "
                "No external browse adapter or CDE scope is required."
            ),
        }

    try:
        connector = ConnectorService.for_source(source)
        items = await connector.list_items(
            parent_item_id=parent_item_id
        )
    except AuthorizationRequired as exc:
        raise HTTPException(
            status_code=401,
            detail=str(exc),
        ) from exc
    except ConnectorError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    configuration = dict(
        source.get("configuration")
        or {}
    )
    scope = configuration.get(
        "sync_scope"
    ) or {}

    return {
        "status": "success",
        "source_id": source_id,
        "parent_item_id": parent_item_id,
        "items": items,
        "selected_ids": scope.get(
            "selected_ids",
            [],
        ),
        "access_mode": scope.get(
            "access_mode",
            source.get("access_mode")
            or "read_index",
        ),
    }


@router.get("/sources/{source_id}/scope")
async def get_source_scope(
    source_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()
    source = _get_source_or_404(source_id, tenant_id, project_id)
    configuration = dict(source.get("configuration") or {})

    return {
        "status": "success",
        "scope": configuration.get("sync_scope") or {
            "selected_ids": [],
            "access_mode": source.get("access_mode") or "read_index",
        },
    }


@router.post("/sources/{source_id}/scope")
async def save_source_scope(
    source_id: str,
    tenant_id: str,
    project_id: str,
    payload: SourceScopeUpdate,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()
    source = _get_source_or_404(source_id, tenant_id, project_id)

    source_type = str(
        source.get("source_type")
        or ""
    ).lower()

    if source_type == "contractx_vault":
        return {
            "status": "success",
            "native": True,
            "selected_count": 0,
            "access_mode": "read_index",
            "message": (
                "ContractX Managed Vault does not require a CDE sync scope. "
                "Files uploaded to the project Vault are registered directly."
            ),
        }

    allowed_modes = {
        "metadata_only",
        "read_only",
        "read_index",
        "read_process",
    }

    if payload.access_mode not in allowed_modes:
        raise HTTPException(status_code=400, detail="Unsupported CDE access mode.")

    selected_ids = list(
        dict.fromkeys(
            str(value).strip()
            for value in payload.selected_ids
            if str(value).strip()
        )
    )

    configuration = dict(source.get("configuration") or {})
    configuration["sync_scope"] = {
        "selected_ids": selected_ids,
        "access_mode": payload.access_mode,
        "saved_at": _utc_now(),
    }

    (
        db.table("data_sources")
        .update(
            {
                "configuration": configuration,
                "access_mode": payload.access_mode,
                "updated_at": _utc_now(),
            }
        )
        .eq("id", source_id)
        .execute()
    )

    return {
        "status": "success",
        "selected_count": len(selected_ids),
        "access_mode": payload.access_mode,
        "message": f"CDE sync scope saved ({len(selected_ids)} selected item(s)).",
    }


@router.post("/sources/{source_id}/sync")
async def sync_source(
    source_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    """
    Synchronize the selected CDE scope into the ContractX project document
    register.

    For customer-controlled sources, ContractX does not delete or modify the
    original file. The project_documents row stores provenance and an external
    pointer. In read_index/read_process modes the connector also verifies that
    the selected file content can actually be read.

    Indexing is intentionally separate. Newly registered CDE documents remain
    at 10% / pending until the real private indexing pipeline marks them ready.
    """
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()

    source = _get_source_or_404(
        source_id,
        tenant_id,
        project_id,
    )

    source_type = str(
        source.get("source_type")
        or ""
    ).lower()

    if source_type == "contractx_vault":
        docs = (
            db.table("project_documents")
            .select("id", count="exact")
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .eq("storage_mode", "contractx_managed")
            .execute()
        )

        return {
            "status": "success",
            "sync_status": "native",
            "source_id": source_id,
            "native": True,
            "document_count": docs.count or 0,
            "message": (
                "ContractX Managed Vault is already synchronized natively. "
                "No external CDE sync is required."
            ),
        }

    configuration = dict(
        source.get("configuration")
        or {}
    )

    scope = configuration.get(
        "sync_scope"
    ) or {}

    selected_ids = (
        scope.get("selected_ids")
        or []
    )

    access_mode = str(
        scope.get("access_mode")
        or source.get("access_mode")
        or "read_index"
    ).strip().lower()

    if not selected_ids:
        raise HTTPException(
            status_code=409,
            detail=(
                "No CDE scope is selected. "
                "Choose at least one file or folder first."
            ),
        )

    if access_mode not in {
        "metadata_only",
        "read_only",
        "read_index",
        "read_process",
    }:
        raise HTTPException(
            status_code=400,
            detail="Unsupported CDE access mode.",
        )

    try:
        connector = (
            ConnectorService.for_source(
                source
            )
        )

        # ----------------------------------------------------------
        # Expand selected folders recursively.
        # ----------------------------------------------------------
        file_ids: list[str] = []
        seen_ids: set[str] = set()

        async def collect_item(
            item_id: str,
        ) -> None:
            item_id = str(
                item_id
            ).strip()

            if (
                not item_id
                or item_id in seen_ids
            ):
                return

            seen_ids.add(
                item_id
            )

            metadata = await (
                connector.get_metadata(
                    item_id
                )
            )

            kind = str(
                metadata.get("kind")
                or metadata.get("type")
                or ""
            ).strip().lower()

            if kind == "folder":
                children = await (
                    connector.list_items(
                        parent_item_id=item_id
                    )
                )

                for child in children:
                    child_id = str(
                        child.get("id")
                        or ""
                    ).strip()

                    if child_id:
                        await collect_item(
                            child_id
                        )

                return

            if kind == "file":
                file_ids.append(
                    item_id
                )

        for selected_id in selected_ids:
            await collect_item(
                str(selected_id)
            )

        if not file_ids:
            raise HTTPException(
                status_code=409,
                detail=(
                    "The selected CDE scope contains "
                    "no readable files."
                ),
            )

        # ----------------------------------------------------------
        # Register/update project_documents rows.
        # ----------------------------------------------------------
        now = _utc_now()

        registered_count = 0
        updated_count = 0
        duplicate_count = 0
        failed_count = 0

        items: list[dict[str, Any]] = []

        def infer_category(
            file_name: str,
            external_path: str,
        ) -> str:
            value = (
                f"{external_path} {file_name}"
            ).lower()

            if "contract" in value:
                return "EXECUTED_CONTRACT"

            if (
                "notice" in value
                or "notification" in value
            ):
                return "FORMAL_NOTICE"

            if (
                "meeting" in value
                or "minutes" in value
                or "mom" in value
            ):
                return "MINUTES_OF_MEETING"

            if (
                "variation" in value
                or "change order" in value
                or "vo-" in value
            ):
                return "VARIATION_ORDER"

            if (
                "claim" in value
                or "eot" in value
            ):
                return "EOT_CLAIM_SUBMISSION"

            return (
                "CLIENT_CORRESPONDENCE"
            )

        for item_id in file_ids:
            try:
                metadata = await (
                    connector.get_metadata(
                        item_id
                    )
                )

                file_name = str(
                    metadata.get("name")
                    or "CDE Document"
                )

                external_path = str(
                    metadata.get(
                        "external_path"
                    )
                    or metadata.get(
                        "relative_path"
                    )
                    or file_name
                )

                extension = str(
                    metadata.get(
                        "file_extension"
                    )
                    or _safe_extension(
                        file_name
                    )
                    or ""
                ).lower().lstrip(".")

                # read_index/read_process must prove that ContractX can
                # actually fetch the selected content.
                raw: Optional[bytes] = None

                if access_mode in {
                    "read_index",
                    "read_process",
                }:
                    raw = await (
                        connector.fetch_content(
                            item_id
                        )
                    )

                    if not raw:
                        raise ConnectorError(
                            "Selected CDE file is empty."
                        )

                file_hash = str(
                    metadata.get(
                        "file_hash"
                    )
                    or ""
                ).strip()

                if (
                    not file_hash
                    and raw is not None
                ):
                    file_hash = (
                        hashlib.sha256(
                            raw
                        ).hexdigest()
                    )

                if not file_hash:
                    # A deterministic fallback is used only for metadata-only
                    # sources where content cannot be read. It must remain
                    # namespaced to the source so it cannot collide with a
                    # real content hash.
                    file_hash = hashlib.sha256(
                        (
                            f"cde:{source_id}:"
                            f"{item_id}:"
                            f"{external_path}"
                        ).encode("utf-8")
                    ).hexdigest()

                content_hash = (
                    hashlib.sha256(
                        raw
                    ).hexdigest()
                    if raw is not None
                    else file_hash
                )

                file_size = (
                    len(raw)
                    if raw is not None
                    else metadata.get("size")
                )

                external_version = str(
                    metadata.get("etag")
                    or metadata.get("eTag")
                    or ""
                ).strip() or None

                # The live schema requires storage_path even when the
                # customer keeps the original file in its own CDE.
                external_storage_path = (
                    f"cde://{source_id}/"
                    f"{external_path}"
                )

                existing = (
                    db.table(
                        "project_documents"
                    )
                    .select("*")
                    .eq(
                        "tenant_id",
                        tenant_id,
                    )
                    .eq(
                        "file_hash",
                        file_hash,
                    )
                    .limit(1)
                    .execute()
                )

                if existing.data:
                    existing_row = (
                        existing.data[0]
                    )

                    # If this exact CDE document is already registered,
                    # refresh its provenance. If the same bytes were uploaded
                    # elsewhere, preserve that existing document instead of
                    # silently rebinding it to this source.
                    same_cde_document = (
                        str(
                            existing_row.get(
                                "source_id"
                            )
                            or ""
                        )
                        == str(source_id)
                        and str(
                            existing_row.get(
                                "external_document_id"
                            )
                            or ""
                        )
                        == str(item_id)
                    )

                    if same_cde_document:
                        (
                            db.table(
                                "project_documents"
                            )
                            .update(
                                {
                                    "external_path":
                                        external_path,
                                    "external_version":
                                        external_version,
                                    "content_hash":
                                        content_hash,
                                    "last_synced_at":
                                        now,
                                    "sync_status":
                                        "ready",
                                    "updated_at":
                                        now,
                                }
                            )
                            .eq(
                                "id",
                                existing_row["id"],
                            )
                            .execute()
                        )

                        updated_count += 1

                        document_id = str(
                            existing_row["id"]
                        )

                    else:
                        duplicate_count += 1

                        document_id = str(
                            existing_row["id"]
                        )

                    items.append(
                        {
                            "document_id":
                                document_id,
                            "external_id":
                                item_id,
                            "name":
                                file_name,
                            "path":
                                external_path,
                            "status":
                                (
                                    "updated"
                                    if same_cde_document
                                    else "duplicate_existing"
                                ),
                        }
                    )

                    continue

                document_id = str(
                    uuid.uuid4()
                )

                document_category = (
                    infer_category(
                        file_name,
                        external_path,
                    )
                )

                row: Dict[str, Any] = {
                    "id":
                        document_id,
                    "tenant_id":
                        tenant_id,
                    "project_id":
                        project_id,

                    "file_name":
                        file_name,
                    "storage_path":
                        external_storage_path,
                    "file_hash":
                        file_hash,
                    "file_size_bytes":
                        file_size,

                    "document_category":
                        document_category,
                    "stakeholder_tier":
                        "THIRD_PARTY",
                    "flow_direction":
                        "INTERNAL",
                    "letter_reference_no":
                        None,
                    "subject_heading":
                        None,
                    "sender_entity":
                        "Not specified",
                    "recipient_entity":
                        "Not specified",
                    "date_sent":
                        None,
                    "is_formal_notice":
                        (
                            document_category
                            == "FORMAL_NOTICE"
                        ),
                    "governing_clause_ref":
                        None,

                    "cde_source":
                        str(
                            source.get(
                                "source_type"
                            )
                            or "private_server"
                        ),
                    "cde_document_id":
                        str(item_id),

                    "source_id":
                        source_id,
                    "storage_mode":
                        "customer_controlled",
                    "external_document_id":
                        str(item_id),
                    "external_path":
                        external_path,
                    "external_version":
                        external_version,
                    "content_hash":
                        content_hash,
                    "last_synced_at":
                        now,
                    "sync_status":
                        "ready",
                    "index_status":
                        (
                            "pending"
                            if access_mode
                            in {
                                "read_index",
                                "read_process",
                            }
                            else "not_requested"
                        ),
                    "processing_percent":
                        (
                            10
                            if access_mode
                            in {
                                "read_index",
                                "read_process",
                            }
                            else 0
                        ),
                    "file_extension":
                        extension,
                    "updated_at":
                        now,
                }

                (
                    db.table(
                        "project_documents"
                    )
                    .insert(
                        row
                    )
                    .execute()
                )

                if access_mode in {
                    "read_index",
                    "read_process",
                }:
                    job_id = str(
                        uuid.uuid4()
                    )

                    (
                        db.table(
                            "document_ingestion_jobs"
                        )
                        .insert(
                            {
                                "id":
                                    job_id,
                                "tenant_id":
                                    tenant_id,
                                "project_id":
                                    project_id,
                                "document_id":
                                    document_id,
                                "source_id":
                                    source_id,
                                "stage":
                                    "uploaded",
                                "transfer_percent":
                                    100,
                                "processing_percent":
                                    10,
                                "current_task":
                                    (
                                        "CDE file registered; "
                                        "awaiting private indexing"
                                    ),
                                "started_at":
                                    now,
                                "updated_at":
                                    now,
                            }
                        )
                        .execute()
                    )

                    indexer = (
                        get_private_project_indexer()
                    )

                    await indexer.index_document(
                        document_id=document_id,
                        tenant_id=tenant_id,
                        project_id=project_id,
                        job_id=job_id,
                        raw=raw,
                    )

                registered_count += 1

                items.append(
                    {
                        "document_id":
                            document_id,
                        "external_id":
                            item_id,
                        "name":
                            file_name,
                        "path":
                            external_path,
                        "status":
                            (
                                "ready"
                                if access_mode
                                in {
                                    "read_index",
                                    "read_process",
                                }
                                else "registered"
                            ),
                    }
                )

            except Exception as item_exc:
                failed_count += 1

                items.append(
                    {
                        "external_id":
                            str(item_id),
                        "status":
                            "failed",
                        "error":
                            str(item_exc),
                    }
                )

        configuration["last_sync"] = {
            "status":
                (
                    "completed"
                    if failed_count == 0
                    else "completed_with_errors"
                ),
            "completed_at":
                now,
            "selected_count":
                len(selected_ids),
            "discovered_count":
                len(file_ids),
            "registered_count":
                registered_count,
            "updated_count":
                updated_count,
            "duplicate_count":
                duplicate_count,
            "failed_count":
                failed_count,
            "items":
                items,
            "mode":
                access_mode,
        }

        (
            db.table(
                "data_sources"
            )
            .update(
                {
                    "configuration":
                        configuration,
                    "last_sync_at":
                        now,
                    "connection_status":
                        "connected",
                    "updated_at":
                        now,
                }
            )
            .eq(
                "id",
                source_id,
            )
            .execute()
        )

        if (
            registered_count == 0
            and updated_count == 0
            and duplicate_count == 0
        ):
            raise HTTPException(
                status_code=500,
                detail=(
                    "CDE sync completed but no project "
                    "documents could be registered."
                ),
            )

        return {
            "status":
                "success",
            "sync_status":
                (
                    "completed"
                    if failed_count == 0
                    else "completed_with_errors"
                ),
            "source_id":
                source_id,
            "last_sync_at":
                now,
            "discovered_count":
                len(file_ids),
            "registered_count":
                registered_count,
            "updated_count":
                updated_count,
            "duplicate_count":
                duplicate_count,
            "failed_count":
                failed_count,
            "items":
                items,
            "message":
                (
                    f"CDE sync complete. "
                    f"{registered_count} document(s) registered, "
                    f"{updated_count} refreshed, "
                    f"{duplicate_count} already existed, "
                    f"{failed_count} failed. "
                    "Read & Index documents were processed into the "
                    "private project evidence index. Successfully indexed "
                    "documents are now 100% Ready."
                ),
        }

    except HTTPException:
        raise

    except AuthorizationRequired as exc:
        raise HTTPException(
            status_code=401,
            detail=str(exc),
        ) from exc

    except ConnectorError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

@router.post("/sources/{source_id}/disconnect")
async def disconnect_source(
    source_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()

    _get_source_or_404(
        source_id,
        tenant_id,
        project_id,
    )

    source = _set_source_status(
        source_id,
        "revoked",
    )

    return {
        "status": "success",
        "source": source,
        "customer_source_files_changed": False,
        "message": (
            "Data source disconnected from ContractX. "
            "Customer repository files were not changed."
        ),
    }


@router.post("/sources/{source_id}/phase-out")
async def phase_out_source(
    source_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()

    _get_source_or_404(
        source_id,
        tenant_id,
        project_id,
    )

    source = _set_source_status(
        source_id,
        "revoked",
    )

    return {
        "status": "success",
        "source": source,
        "customer_source_files_changed": False,
        "message": (
            "CDE source phased out from active ContractX use. "
            "Registration and audit history were retained."
        ),
    }


async def _remove_source_registration_impl(
    source_id: str,
    tenant_id: str,
    project_id: str,
):
    _require_db()

    _get_source_or_404(
        source_id,
        tenant_id,
        project_id,
    )

    linked = (
        db.table("project_documents")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("project_id", project_id)
        .eq("source_id", source_id)
        .limit(1)
        .execute()
    )

    linked_count = linked.count or 0

    if linked_count > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                "This data source has project documents linked to it. "
                "Disconnect the source instead so document provenance "
                "and audit history are preserved."
            ),
        )

    (
        db.table("data_sources")
        .delete()
        .eq("id", source_id)
        .execute()
    )

    return {
        "status": "success",
        "removed_source_id": source_id,
        "customer_source_files_changed": False,
        "message": (
            "ContractX data-source registration removed. "
            "No customer repository files were changed."
        ),
    }


@router.delete("/sources/{source_id}")
async def remove_source_registration(
    source_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    return await _remove_source_registration_impl(
        source_id,
        tenant_id,
        project_id,
    )


@router.post("/sources/{source_id}/remove")
async def remove_source_registration_post(
    source_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    """
    POST alias retained for clients/proxies that do not issue DELETE cleanly.
    """
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    return await _remove_source_registration_impl(
        source_id,
        tenant_id,
        project_id,
    )


# =====================================================================
# CONTRACTX VAULT UPLOAD
# =====================================================================


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    project_id: str = Form(...),

    # Frontend-friendly fields
    category: str = Form(
        "client_correspondence"
    ),
    document_date: Optional[str] = Form(
        None
    ),
    letter_ref: Optional[str] = Form(
        None
    ),
    subject: Optional[str] = Form(
        None
    ),
    sender: Optional[str] = Form(
        None
    ),
    recipient: Optional[str] = Form(
        None
    ),

    # Optional existing project-document metadata
    stakeholder_tier: str = Form(
        "THIRD_PARTY"
    ),
    flow_direction: str = Form(
        "INTERNAL"
    ),
    is_formal_notice: bool = Form(
        False
    ),
    governing_clause_ref: Optional[str] = Form(
        None
    ),
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _require_db()

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file name is missing.",
        )

    raw = await file.read()

    if not raw:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    job_id = str(
        uuid.uuid4()
    )

    document_id = str(
        uuid.uuid4()
    )

    extension = _safe_extension(
        file.filename
    )

    safe_filename = (
        file.filename
        .replace("\\", "_")
        .replace("/", "_")
    )

    storage_path = (
        f"{tenant_id}/"
        f"{project_id}/"
        f"{document_id}/"
        f"{safe_filename}"
    )

    file_hash = hashlib.sha256(
        raw
    ).hexdigest()

    allowed_stakeholder_tiers = {
        "EMPLOYER_CLIENT",
        "MAIN_CONTRACTOR",
        "SUBCONTRACTOR",
        "SUPERPORTING_CONSULTANT",
        "THIRD_PARTY",
    }

    allowed_flow_directions = {
        "INCOMING",
        "OUTGOING",
        "INTERNAL",
    }

    stakeholder_tier = (
        stakeholder_tier
        .strip()
        .upper()
    )

    flow_direction = (
        flow_direction
        .strip()
        .upper()
    )

    if stakeholder_tier not in allowed_stakeholder_tiers:
        raise HTTPException(
            status_code=400,
            detail="Invalid stakeholder tier.",
        )

    if flow_direction not in allowed_flow_directions:
        raise HTTPException(
            status_code=400,
            detail="Invalid flow direction.",
        )

    # Existing tenant-level unique index uses (tenant_id, file_hash).
    existing = (
        db.table("project_documents")
        .select("id,file_name")
        .eq("tenant_id", tenant_id)
        .eq("file_hash", file_hash)
        .limit(1)
        .execute()
    )

    if existing.data:
        existing_doc = existing.data[0]
        raise HTTPException(
            status_code=409,
            detail=(
                "This exact file already exists in the tenant Vault. "
                f"Existing document: "
                f"{existing_doc.get('file_name') or existing_doc.get('id')}"
            ),
        )

    # --------------------------------------------------------------
    # Create processing job
    # --------------------------------------------------------------

    db.table(
        "document_ingestion_jobs"
    ).insert(
        {
            "id": job_id,
            "tenant_id": tenant_id,
            "project_id": project_id,
            "document_id": (
                document_id
            ),
            "stage": "uploading",
            "transfer_percent": 10,
            "processing_percent": 0,
            "current_task": (
                "Receiving secure upload"
            ),
            "updated_at": _utc_now(),
        }
    ).execute()

    try:
        # ----------------------------------------------------------
        # Store original file
        # ----------------------------------------------------------

        try:
            db.storage.from_(
                "project-documents"
            ).upload(
                path=storage_path,
                file=raw,
                file_options={
                    "content-type": (
                        "application/octet-stream"
                        if extension == "xer"
                        else (
                            file.content_type
                            or "application/octet-stream"
                        )
                    ),
                },
            )
        except Exception as storage_exc:
            # Make the storage issue explicit but do not leak credentials.
            raise RuntimeError(
                (
                    "Unable to store file in project-documents bucket. "
                    f"Storage response: {str(storage_exc)[:300]}"
                )
            ) from storage_exc

        # ----------------------------------------------------------
        # Insert into EXISTING project_documents schema
        # ----------------------------------------------------------

        document_category = (
            _map_category_filter(
                category
            )
        )

        row: Dict[str, Any] = {
            "id": document_id,
            "tenant_id": tenant_id,
            "project_id": project_id,

            # Existing live storage fields
            "file_name": safe_filename,
            "storage_path": storage_path,
            "file_hash": file_hash,
            "file_size_bytes": len(raw),

            # Existing live document metadata
            "document_category": (
                document_category
            ),
            "stakeholder_tier": stakeholder_tier,
            "flow_direction": flow_direction,
            "letter_reference_no": (
                letter_ref
            ),
            "subject_heading": subject,
            "sender_entity": (
                sender.strip()
                if sender and sender.strip()
                else "Not specified"
            ),
            "recipient_entity": (
                recipient.strip()
                if recipient and recipient.strip()
                else "Not specified"
            ),
            "date_sent": document_date,
            "is_formal_notice": (
                True
                if document_category == "FORMAL_NOTICE"
                else is_formal_notice
            ),
            "governing_clause_ref": (
                governing_clause_ref
            ),

            # Existing CDE provenance
            "cde_source": (
                "contractx_vault"
            ),
            "cde_document_id": (
                document_id
            ),

            # New Vault fields
            "storage_mode": (
                "contractx_managed"
            ),
            "file_extension": extension,
            "sync_status": "ready",
            "index_status": (
                "not_requested"
                if extension == "xer"
                else "pending"
            ),
            "processing_percent": (
                100
                if extension == "xer"
                else 10
            ),

            "updated_at": _utc_now(),
        }

        db.table(
            "project_documents"
        ).insert(
            row
        ).execute()

        # Mark transfer complete only after both object storage and
        # project_documents persistence have succeeded.
        if extension == "xer":
            # XER is a deterministic scheduling source for Engine 2.
            # Store it securely in the Vault, but do not send it through
            # the generic document-text embedding pipeline.
            db.table(
                "document_ingestion_jobs"
            ).update(
                {
                    "stage": "complete",
                    "transfer_percent": 100,
                    "processing_percent": 100,
                    "current_task": (
                        "Programme file stored; available "
                        "for Delay & Forensic import"
                    ),
                    "completed_at": _utc_now(),
                    "updated_at": _utc_now(),
                }
            ).eq(
                "id",
                job_id,
            ).execute()

            return {
                "status": "stored",
                "job_id": job_id,
                "document_id": document_id,
                "transfer_percent": 100,
                "processing_percent": 100,
                "stage": "complete",
                "indexing": {
                    "status": "not_requested",
                    "reason": (
                        "XER programme files are handled by "
                        "ContractX Delay & Forensic / Engine 2, "
                        "not generic text-vector indexing."
                    ),
                },
                "document": _normalise_document(
                    {
                        **row,
                        "created_at": _utc_now(),
                    }
                ),
                "message": (
                    "Programme XER stored successfully in the "
                    "ContractX Managed Vault. It is ready for "
                    "Delay & Forensic schedule import."
                ),
            }

        db.table(
            "document_ingestion_jobs"
        ).update(
            {
                "stage": "uploaded",
                "transfer_percent": 100,
                "processing_percent": 10,
                "current_task": (
                    "Upload complete; awaiting "
                    "extraction and private indexing"
                ),
                "updated_at": _utc_now(),
            }
        ).eq(
            "id",
            job_id,
        ).execute()

        # ----------------------------------------------------------
        # Real private-project indexing
        # ----------------------------------------------------------
        indexer = (
            get_private_project_indexer()
        )

        indexing_result = (
            await indexer.index_document(
                document_id=document_id,
                tenant_id=tenant_id,
                project_id=project_id,
                job_id=job_id,
                raw=raw,
            )
        )

        return {
            "status": "ready",
            "job_id": job_id,
            "document_id": document_id,
            "transfer_percent": 100,
            "processing_percent": 100,
            "stage": "complete",
            "indexing": indexing_result,
            "document": _normalise_document(
                {
                    **row,
                    "created_at": _utc_now(),
                }
            ),
            "message": (
                "Document uploaded, extracted and indexed successfully. "
                "Private project evidence is 100% Ready."
            ),
        }

    except Exception as exc:
        try:
            db.table(
                "document_ingestion_jobs"
            ).update(
                {
                    "stage": "failed",
                    "error_message": (
                        str(exc)
                    ),
                    "current_task": (
                        "Document ingestion failed"
                    ),
                    "updated_at": _utc_now(),
                }
            ).eq(
                "id",
                job_id,
            ).execute()
        except Exception:
            pass

        # Avoid leaving an orphaned object if metadata persistence failed
        # after the file reached object storage.
        try:
            db.storage.from_(
                "project-documents"
            ).remove(
                [storage_path]
            )
        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail=(
                "Secure document upload failed. "
                f"{str(exc)}"
            ),
        )
