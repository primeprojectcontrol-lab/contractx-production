from __future__ import annotations

import logging
import math
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.ai.model_registry import ApprovedModel

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv(
    "SUPABASE_URL",
    "",
)

SUPABASE_KEY = os.getenv(
    "SUPABASE_KEY",
    "",
)

DEFAULT_PLAN_CODE = os.getenv(
    "CONTRACTX_DEFAULT_PLAN_CODE",
    "trial",
)

_supabase_client = None


@dataclass(frozen=True)
class UsageSnapshot:
    input_tokens: int
    output_tokens: int
    total_tokens: int
    spend_usd: float


@dataclass(frozen=True)
class CostDecision:
    allowed: bool
    plan_code: str
    reason: Optional[str]
    max_input_tokens: int
    max_output_tokens: int
    monthly_token_allowance: int
    monthly_spend_usd: float
    capability_enabled: bool
    capability_request_limit: int
    capability_requests_used: int
    current_month_tokens: int
    current_month_spend_usd: float
    estimated_request_cost_usd: float

    def public_dict(self) -> Dict[str, Any]:
        return {
            "allowed":
                self.allowed,
            "plan_code":
                self.plan_code,
            "reason":
                self.reason,
            "max_input_tokens":
                self.max_input_tokens,
            "max_output_tokens":
                self.max_output_tokens,
            "monthly_token_allowance":
                self.monthly_token_allowance,
            "monthly_spend_usd":
                self.monthly_spend_usd,
            "capability_enabled":
                self.capability_enabled,
            "capability_request_limit":
                self.capability_request_limit,
            "capability_requests_used":
                self.capability_requests_used,
            "current_month_tokens":
                self.current_month_tokens,
            "current_month_spend_usd":
                round(
                    self.current_month_spend_usd,
                    6,
                ),
            "estimated_request_cost_usd":
                round(
                    self.estimated_request_cost_usd,
                    6,
                ),
        }


def get_supabase_client():
    global _supabase_client

    if _supabase_client is None:
        if (
            not SUPABASE_URL
            or not SUPABASE_KEY
        ):
            return None

        try:
            from supabase import (
                create_client,
            )

            _supabase_client = (
                create_client(
                    SUPABASE_URL,
                    SUPABASE_KEY,
                )
            )

        except Exception:
            logger.exception(
                "Unable to initialize Supabase for AI cost controls."
            )
            return None

    return _supabase_client


def estimate_text_tokens(
    text: str,
) -> int:
    if not text:
        return 0

    # Conservative provider-neutral planning estimate.
    return max(
        1,
        math.ceil(
            len(text)
            / 3.5
        ),
    )


def estimate_messages_input_tokens(
    messages: List[
        Dict[str, str]
    ],
) -> int:
    total_chars = 0

    for message in messages:
        total_chars += len(
            str(
                message.get(
                    "role",
                    "",
                )
            )
        )

        total_chars += len(
            str(
                message.get(
                    "content",
                    "",
                )
            )
        )

        total_chars += 12

    return estimate_text_tokens(
        "x" * total_chars
    )


def calculate_cost_usd(
    *,
    model: ApprovedModel,
    input_tokens: int,
    output_tokens: int,
) -> float:
    return (
        input_tokens
        / 1_000_000
        * model.input_cost_per_million_usd
        +
        output_tokens
        / 1_000_000
        * model.output_cost_per_million_usd
    )


def _month_start_iso() -> str:
    now = datetime.now(
        timezone.utc
    )

    return now.replace(
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    ).isoformat()


def get_tenant_plan_code(
    tenant_id: str,
) -> str:
    db = get_supabase_client()

    if db is None:
        return DEFAULT_PLAN_CODE

    try:
        result = (
            db
            .table(
                "tenant_ai_plan_assignments"
            )
            .select(
                "plan_code,"
                "effective_from,"
                "effective_to"
            )
            .eq(
                "tenant_id",
                tenant_id,
            )
            .lte(
                "effective_from",
                datetime.now(
                    timezone.utc
                ).isoformat(),
            )
            .order(
                "effective_from",
                desc=True,
            )
            .limit(10)
            .execute()
        )

        now = datetime.now(
            timezone.utc
        )

        for row in (
            result.data
            or []
        ):
            effective_to = (
                row.get(
                    "effective_to"
                )
            )

            if not effective_to:
                return row[
                    "plan_code"
                ]

            try:
                if (
                    datetime
                    .fromisoformat(
                        effective_to.replace(
                            "Z",
                            "+00:00",
                        )
                    )
                    > now
                ):
                    return row[
                        "plan_code"
                    ]

            except Exception:
                continue

    except Exception:
        logger.exception(
            "Tenant AI plan lookup failed."
        )

    return DEFAULT_PLAN_CODE


def get_plan_limits(
    plan_code: str,
) -> Dict[str, Any]:
    db = get_supabase_client()

    if db is None:
        defaults = {
            "trial": {
                "plan_code":
                    "trial",
                "monthly_token_allowance":
                    200_000,
                "max_input_tokens":
                    30_000,
                "max_output_tokens":
                    3_000,
                "monthly_spend_usd":
                    1.50,
                "capability_limits": {
                    "private_data": {
                        "enabled": True,
                        "max_requests_monthly": 50,
                    },
                    "contract_review": {
                        "enabled": True,
                        "max_requests_monthly": 5,
                    },
                    "claims": {
                        "enabled": True,
                        "max_requests_monthly": 20,
                    },
                },
            },
            "pro": {
                "plan_code":
                    "pro",
                "monthly_token_allowance":
                    10_000_000,
                "max_input_tokens":
                    100_000,
                "max_output_tokens":
                    8_000,
                "monthly_spend_usd":
                    100.00,
                "capability_limits": {
                    "private_data": {
                        "enabled": True,
                        "max_requests_monthly": 1000,
                    },
                    "contract_review": {
                        "enabled": True,
                        "max_requests_monthly": 100,
                    },
                    "claims": {
                        "enabled": True,
                        "max_requests_monthly": 500,
                    },
                },
            },
            "enterprise": {
                "plan_code":
                    "enterprise",
                "monthly_token_allowance":
                    100_000_000,
                "max_input_tokens":
                    200_000,
                "max_output_tokens":
                    16_000,
                "monthly_spend_usd":
                    1000.00,
                "capability_limits": {
                    "private_data": {
                        "enabled": True,
                        "max_requests_monthly": 10000,
                    },
                    "contract_review": {
                        "enabled": True,
                        "max_requests_monthly": 1000,
                    },
                    "claims": {
                        "enabled": True,
                        "max_requests_monthly": 5000,
                    },
                },
            },
        }

        return defaults.get(
            plan_code,
            defaults[
                "trial"
            ],
        )

    result = (
        db
        .table(
            "ai_plan_limits"
        )
        .select("*")
        .eq(
            "plan_code",
            plan_code,
        )
        .eq(
            "is_active",
            True,
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
            f"AI plan '{plan_code}' is not configured."
        )

    return rows[0]


def get_monthly_usage(
    tenant_id: str,
) -> UsageSnapshot:
    db = get_supabase_client()

    if db is None:
        return UsageSnapshot(
            0,
            0,
            0,
            0.0,
        )

    try:
        result = (
            db
            .table(
                "ai_usage_ledger"
            )
            .select(
                "input_tokens,"
                "output_tokens,"
                "total_tokens,"
                "estimated_cost_usd"
            )
            .eq(
                "tenant_id",
                tenant_id,
            )
            .gte(
                "created_at",
                _month_start_iso(),
            )
            .eq(
                "request_status",
                "success",
            )
            .execute()
        )

        input_tokens = 0
        output_tokens = 0
        total_tokens = 0
        spend = 0.0

        for row in (
            result.data
            or []
        ):
            input_tokens += int(
                row.get(
                    "input_tokens"
                )
                or 0
            )

            output_tokens += int(
                row.get(
                    "output_tokens"
                )
                or 0
            )

            total_tokens += int(
                row.get(
                    "total_tokens"
                )
                or 0
            )

            spend += float(
                row.get(
                    "estimated_cost_usd"
                )
                or 0
            )

        return UsageSnapshot(
            input_tokens=
                input_tokens,
            output_tokens=
                output_tokens,
            total_tokens=
                total_tokens,
            spend_usd=
                spend,
        )

    except Exception:
        logger.exception(
            "Monthly AI usage aggregation failed."
        )

        raise RuntimeError(
            "Unable to verify tenant AI allowance."
        )


def get_capability_request_count(
    *,
    tenant_id: str,
    capability: str,
) -> int:
    db = get_supabase_client()

    if db is None:
        return 0

    try:
        result = (
            db
            .table(
                "ai_usage_ledger"
            )
            .select(
                "id",
                count="exact",
            )
            .eq(
                "tenant_id",
                tenant_id,
            )
            .eq(
                "capability",
                capability,
            )
            .eq(
                "request_status",
                "success",
            )
            .gte(
                "created_at",
                _month_start_iso(),
            )
            .execute()
        )

        return int(
            result.count
            or 0
        )

    except Exception:
        logger.exception(
            "Capability AI usage count failed."
        )

        raise RuntimeError(
            "Unable to verify capability AI allowance."
        )


def preflight_cost_check(
    *,
    tenant_id: str,
    capability: str,
    model: ApprovedModel,
    estimated_input_tokens: int,
    requested_output_tokens: int,
) -> CostDecision:
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

    usage = (
        get_monthly_usage(
            tenant_id
        )
    )

    max_input_tokens = int(
        limits[
            "max_input_tokens"
        ]
    )

    max_output_tokens = int(
        limits[
            "max_output_tokens"
        ]
    )

    token_allowance = int(
        limits[
            "monthly_token_allowance"
        ]
    )

    spend_ceiling = float(
        limits[
            "monthly_spend_usd"
        ]
    )

    capability_limits = (
        limits.get(
            "capability_limits"
        )
        or {}
    )

    capability_policy = (
        capability_limits.get(
            capability
        )
        or {
            "enabled": False,
            "max_requests_monthly": 0,
        }
    )

    capability_enabled = bool(
        capability_policy.get(
            "enabled",
            False,
        )
    )

    capability_request_limit = int(
        capability_policy.get(
            "max_requests_monthly",
            0,
        )
        or 0
    )

    capability_requests_used = (
        get_capability_request_count(
            tenant_id=
                tenant_id,
            capability=
                capability,
        )
    )

    estimated_cost = (
        calculate_cost_usd(
            model=model,
            input_tokens=
                estimated_input_tokens,
            output_tokens=
                requested_output_tokens,
        )
    )

    reason = None

    if not capability_enabled:
        reason = (
            f"Capability '{capability}' is not enabled "
            f"for the {plan_code} plan."
        )

    elif (
        capability_request_limit > 0
        and capability_requests_used
        >= capability_request_limit
    ):
        reason = (
            f"Monthly request allowance reached for "
            f"capability '{capability}' on the {plan_code} plan."
        )

    elif (
        estimated_input_tokens
        > max_input_tokens
    ):
        reason = (
            f"Request input exceeds the {plan_code} "
            "plan input-token ceiling."
        )

    elif (
        requested_output_tokens
        > max_output_tokens
    ):
        reason = (
            f"Requested output exceeds the {plan_code} "
            "plan output-token ceiling."
        )

    elif (
        usage.total_tokens
        + estimated_input_tokens
        + requested_output_tokens
        > token_allowance
    ):
        reason = (
            f"Monthly AI token allowance reached "
            f"for the {plan_code} plan."
        )

    elif (
        usage.spend_usd
        + estimated_cost
        > spend_ceiling
    ):
        reason = (
            f"Monthly tenant AI spend ceiling reached "
            f"for the {plan_code} plan."
        )

    return CostDecision(
        allowed=
            reason is None,
        plan_code=
            plan_code,
        reason=
            reason,
        max_input_tokens=
            max_input_tokens,
        max_output_tokens=
            max_output_tokens,
        monthly_token_allowance=
            token_allowance,
        monthly_spend_usd=
            spend_ceiling,
        capability_enabled=
            capability_enabled,
        capability_request_limit=
            capability_request_limit,
        capability_requests_used=
            capability_requests_used,
        current_month_tokens=
            usage.total_tokens,
        current_month_spend_usd=
            usage.spend_usd,
        estimated_request_cost_usd=
            estimated_cost,
    )


def write_usage_record(
    *,
    tenant_id: str,
    project_id: Optional[str],
    plan_code: str,
    capability: str,
    model: ApprovedModel,
    input_tokens: int,
    output_tokens: int,
    estimated_cost_usd: float,
    request_status: str,
    block_reason: Optional[str] = None,
) -> str:
    request_id = str(
        uuid.uuid4()
    )

    db = get_supabase_client()

    if db is None:
        logger.warning(
            "AI usage ledger unavailable; request_id=%s status=%s",
            request_id,
            request_status,
        )

        return request_id

    row = {
        "request_id":
            request_id,
        "tenant_id":
            tenant_id,
        "project_id":
            project_id,
        "plan_code":
            plan_code,
        "capability":
            capability,
        "provider":
            model.provider,
        "model_key":
            model.key,
        "model_id":
            model.model_id,
        "model_tier":
            None,
        "input_tokens":
            int(
                input_tokens
            ),
        "output_tokens":
            int(
                output_tokens
            ),
        "total_tokens":
            int(
                input_tokens
                + output_tokens
            ),
        "estimated_cost_usd":
            round(
                float(
                    estimated_cost_usd
                ),
                6,
            ),
        "fallback_used":
            False,
        "request_status":
            request_status,
        "block_reason":
            block_reason,
    }

    (
        db
        .table(
            "ai_usage_ledger"
        )
        .insert(
            row
        )
        .execute()
    )

    return request_id


def get_cost_control_status(
    tenant_id: str,
) -> Dict[str, Any]:
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

    usage = (
        get_monthly_usage(
            tenant_id
        )
    )

    token_allowance = int(
        limits[
            "monthly_token_allowance"
        ]
    )

    spend_ceiling = float(
        limits[
            "monthly_spend_usd"
        ]
    )

    capability_limits = (
        limits.get(
            "capability_limits"
        )
        or {}
    )

    capability_usage = {}

    for (
        capability,
        policy,
    ) in capability_limits.items():
        used = (
            get_capability_request_count(
                tenant_id=
                    tenant_id,
                capability=
                    capability,
            )
        )

        capability_usage[
            capability
        ] = {
            "enabled":
                bool(
                    policy.get(
                        "enabled",
                        False,
                    )
                ),
            "max_requests_monthly":
                int(
                    policy.get(
                        "max_requests_monthly",
                        0,
                    )
                    or 0
                ),
            "requests_used":
                used,
        }

    return {
        "tenant_id":
            tenant_id,
        "plan_code":
            plan_code,
        "limits": {
            "monthly_token_allowance":
                token_allowance,
            "max_input_tokens":
                int(
                    limits[
                        "max_input_tokens"
                    ]
                ),
            "max_output_tokens":
                int(
                    limits[
                        "max_output_tokens"
                    ]
                ),
            "monthly_spend_usd":
                spend_ceiling,
            "capability_limits":
                capability_limits,
        },
        "current_month": {
            "input_tokens":
                usage.input_tokens,
            "output_tokens":
                usage.output_tokens,
            "total_tokens":
                usage.total_tokens,
            "spend_usd":
                round(
                    usage.spend_usd,
                    6,
                ),
            "token_utilisation_percent":
                round(
                    usage.total_tokens
                    / token_allowance
                    * 100,
                    2,
                )
                if token_allowance
                else 0,
            "spend_utilisation_percent":
                round(
                    usage.spend_usd
                    / spend_ceiling
                    * 100,
                    2,
                )
                if spend_ceiling
                else 0,
        },
        "capabilities":
            capability_usage,
    }
