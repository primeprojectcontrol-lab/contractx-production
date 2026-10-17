from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

# Load the backend .env before importing provider/cost-control modules.
# This keeps OPENAI_API_KEY, SUPABASE_URL and backend Supabase keys
# server-side and available consistently across the AI gateway.
try:
    from dotenv import load_dotenv

    _project_root = Path(__file__).resolve().parents[2]
    load_dotenv(_project_root / ".env", override=False)
    load_dotenv(override=False)
except Exception:
    # Environment variables supplied by the process/container still work.
    pass

from app.ai.cost_control import (
    calculate_cost_usd,
    estimate_messages_input_tokens,
    get_plan_limits,
    get_tenant_plan_code,
    preflight_cost_check,
    write_usage_record,
)
from app.ai.model_registry import (
    DEFAULT_MODEL_KEY,
    ApprovedModel,
    get_model,
)
from app.ai.provider_service import (
    invoke_provider,
)

logger = logging.getLogger(__name__)

def _supabase_runtime_config() -> Dict[str, str]:
    url = os.getenv("SUPABASE_URL", "").strip()

    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_SERVICE_KEY", "").strip()
        or os.getenv("SUPABASE_KEY", "").strip()
    )

    return {
        "url": url,
        "key": key,
    }


_supabase_client = None
_supabase_client_signature = None


@dataclass
class ModelInvocationResult:
    text: str
    request_id: str
    plan_code: str
    model_key: str
    model_id: str
    provider: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float

    def public_dict(
        self,
    ) -> Dict[str, Any]:
        return {
            "request_id":
                self.request_id,
            "plan_code":
                self.plan_code,
            "model_key":
                self.model_key,
            "model_id":
                self.model_id,
            "provider":
                self.provider,
            "input_tokens":
                self.input_tokens,
            "output_tokens":
                self.output_tokens,
            "total_tokens":
                self.total_tokens,
            "estimated_cost_usd":
                round(
                    self.estimated_cost_usd,
                    6,
                ),
        }


def get_supabase_client():
    global _supabase_client
    global _supabase_client_signature

    config = _supabase_runtime_config()
    url = config["url"]
    key = config["key"]

    if not url or not key:
        logger.error(
            "Project AI policy persistence unavailable: "
            "SUPABASE_URL or backend Supabase key is missing."
        )
        return None

    signature = (
        url,
        key[:12],
        len(key),
    )

    if (
        _supabase_client is not None
        and _supabase_client_signature == signature
    ):
        return _supabase_client

    try:
        from supabase import create_client

        _supabase_client = create_client(
            url,
            key,
        )
        _supabase_client_signature = signature
        return _supabase_client

    except Exception:
        logger.exception(
            "Unable to initialize Supabase for model policy."
        )
        _supabase_client = None
        _supabase_client_signature = None
        return None


def get_model_policy_persistence_status() -> Dict[str, Any]:
    config = _supabase_runtime_config()

    return {
        "supabase_url_configured": bool(config["url"]),
        "backend_supabase_key_configured": bool(config["key"]),
        "client_initializes": get_supabase_client() is not None,
    }


def get_project_model_policy(
    tenant_id: str,
    project_id: str,
) -> Dict[str, Any]:
    """
    Resolve only the model explicitly selected for this tenant/project.

    ContractX does not silently choose a provider/model for governed AI calls.
    If no project AI selection exists, the caller must ask the user/admin to
    select and save an active approved model.
    """

    db = get_supabase_client()

    if db is None:
        raise RuntimeError(
            "Project AI model selection cannot be verified because "
            "the backend policy store is unavailable."
        )

    try:
        result = (
            db
            .table(
                "project_ai_settings"
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
            .limit(1)
            .execute()
        )

        rows = (
            result.data
            or []
        )

        if not rows:
            raise RuntimeError(
                "No AI model is selected for this project. "
                "Select an available approved model before running ContractX AI."
            )

        row = rows[0]

        key = str(
            row.get(
                "model_key"
            )
            or ""
        ).strip()

        if not key:
            raise RuntimeError(
                "The project AI policy does not contain a selected model."
            )

        model = (
            get_model(
                key,
                require_active=True,
            )
        )

        stored_provider = str(
            row.get(
                "provider"
            )
            or ""
        ).strip()

        if (
            stored_provider
            and stored_provider
            != model.provider
        ):
            raise RuntimeError(
                "The selected project AI policy does not match "
                "the approved provider registry."
            )

        return {
            **row,
            "tenant_id":
                tenant_id,
            "project_id":
                project_id,
            "model_key":
                model.key,
            "provider":
                model.provider,
            "model_id":
                model.model_id,
            "display_name":
                model.display_name,
            "source":
                "project_policy",
            "configured":
                True,
        }

    except RuntimeError:
        raise

    except Exception as exc:
        logger.exception(
            "Project model policy lookup failed."
        )

        raise RuntimeError(
            "Unable to verify the selected project AI model."
        ) from exc


def save_project_model_policy(
    *,
    tenant_id: str,
    project_id: str,
    model_key: str,
) -> Dict[str, Any]:
    model = (
        get_model(
            model_key,
            require_active=True,
        )
    )

    db = get_supabase_client()

    if db is None:
        config = _supabase_runtime_config()

        raise RuntimeError(
            "Project AI policy persistence is unavailable on the backend. "
            f"SUPABASE_URL configured={bool(config['url'])}; "
            f"backend Supabase key configured={bool(config['key'])}. "
            "The OpenAI API key is unrelated to this persistence check."
        )

    row = {
        "tenant_id":
            tenant_id,
        "project_id":
            project_id,
        "model_key":
            model.key,
        "provider":
            model.provider,
        "deployment_mode":
            "external_api",
        "auto_upgrade":
            False,
        "customer_admin_approved":
            True,
    }

    result = (
        db
        .table(
            "project_ai_settings"
        )
        .upsert(
            row,
            on_conflict=
                "tenant_id,project_id",
        )
        .execute()
    )

    saved = (
        result.data
        or [row]
    )[0]

    return {
        **saved,
        "model_key":
            model.key,
        "provider":
            model.provider,
        "model_id":
            model.model_id,
        "display_name":
            model.display_name,
        "source":
            "project_policy",
        "configured":
            True,
    }


def invoke_model_chat(
    *,
    tenant_id: str,
    project_id: str,
    capability: str,
    messages: List[
        Dict[str, str]
    ],
    temperature: float = 0.15,
    requested_output_tokens: Optional[
        int
    ] = None,
    response_format: Optional[
        Dict[str, Any]
    ] = None,
) -> ModelInvocationResult:
    policy = (
        get_project_model_policy(
            tenant_id,
            project_id,
        )
    )

    model = (
        get_model(
            policy.get(
                "model_key"
            ),
            require_active=True,
        )
    )

    plan_code = (
        get_tenant_plan_code(
            tenant_id
        )
    )

    limits = (
        get_plan_limits(
            plan_code
        )
    )

    output_ceiling = int(
        limits[
            "max_output_tokens"
        ]
    )

    if requested_output_tokens is None:
        requested_output_tokens = min(
            2500,
            output_ceiling,
        )
    else:
        requested_output_tokens = min(
            int(
                requested_output_tokens
            ),
            output_ceiling,
        )

    estimated_input_tokens = (
        estimate_messages_input_tokens(
            messages
        )
    )

    decision = (
        preflight_cost_check(
            tenant_id=
                tenant_id,
            capability=
                capability,
            model=
                model,
            estimated_input_tokens=
                estimated_input_tokens,
            requested_output_tokens=
                requested_output_tokens,
        )
    )

    if not decision.allowed:
        request_id = (
            write_usage_record(
                tenant_id=
                    tenant_id,
                project_id=
                    project_id,
                plan_code=
                    decision.plan_code,
                capability=
                    capability,
                model=
                    model,
                input_tokens=
                    estimated_input_tokens,
                output_tokens=
                    0,
                estimated_cost_usd=
                    0,
                request_status=
                    "blocked",
                block_reason=
                    decision.reason,
            )
        )

        raise RuntimeError(
            "AI request blocked by ContractX cost controls: "
            f"{decision.reason} "
            f"(request_id={request_id})"
        )

    try:
        provider_result = (
            invoke_provider(
                model=
                    model,
                messages=
                    messages,
                temperature=
                    temperature,
                max_output_tokens=
                    requested_output_tokens,
                response_format=
                    response_format,
            )
        )

        if not provider_result.text:
            raise RuntimeError(
                "AI provider returned an empty response."
            )

        input_tokens = (
            provider_result.input_tokens
            or estimated_input_tokens
        )

        output_tokens = (
            provider_result.output_tokens
        )

        actual_cost = (
            calculate_cost_usd(
                model=
                    model,
                input_tokens=
                    input_tokens,
                output_tokens=
                    output_tokens,
            )
        )

        request_id = (
            write_usage_record(
                tenant_id=
                    tenant_id,
                project_id=
                    project_id,
                plan_code=
                    decision.plan_code,
                capability=
                    capability,
                model=
                    model,
                input_tokens=
                    input_tokens,
                output_tokens=
                    output_tokens,
                estimated_cost_usd=
                    actual_cost,
                request_status=
                    "success",
            )
        )

        return ModelInvocationResult(
            text=
                provider_result.text,
            request_id=
                request_id,
            plan_code=
                decision.plan_code,
            model_key=
                model.key,
            model_id=
                model.model_id,
            provider=
                model.provider,
            input_tokens=
                input_tokens,
            output_tokens=
                output_tokens,
            total_tokens=
                input_tokens
                + output_tokens,
            estimated_cost_usd=
                actual_cost,
        )

    except Exception as exc:
        request_id = (
            write_usage_record(
                tenant_id=
                    tenant_id,
                project_id=
                    project_id,
                plan_code=
                    decision.plan_code,
                capability=
                    capability,
                model=
                    model,
                input_tokens=
                    estimated_input_tokens,
                output_tokens=
                    0,
                estimated_cost_usd=
                    0,
                request_status=
                    "failed",
                block_reason=
                    type(
                        exc
                    ).__name__,
            )
        )

        raise RuntimeError(
            "ContractX AI provider call failed. "
            f"request_id={request_id}"
        ) from exc
