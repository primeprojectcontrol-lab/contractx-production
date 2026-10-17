# app/services/entitlement_service.py

from fastapi import HTTPException, status
import datetime

class EntitlementService:
    @staticmethod
    def verify_project_limit(tenant_id: str, current_project_count: int, subscription: dict):
        """
        Server-side guardrail: Blocks project creation if project limits are reached.
        """
        # Check Demo Expiration
        if subscription.get("status") == "DEMO":
            expires_at = subscription.get("demo_expires_at")
            if expires_at and datetime.datetime.now(datetime.timezone.utc) > expires_at:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Demo access has expired. Please upgrade or contact enterprise support."
                )

        # Enforce Project Limits
        project_limit = subscription.get("project_limit", 1)
        if current_project_count >= project_limit:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Project creation limit reached ({project_limit} project max). Upgrade plan to add projects."
            )

    @staticmethod
    def verify_feature_access(feature_flag: str, entitlements: dict):
        """
        Enforces feature entitlement rules server-side before execution.
        """
        if not entitlements.get(feature_flag, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Entitlement missing for feature: {feature_flag}. Upgrade plan to access."
            )