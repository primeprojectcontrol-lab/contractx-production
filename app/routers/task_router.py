from __future__ import annotations



import json

import os

from datetime import date, datetime, timedelta, timezone

from typing import Optional

from urllib import request as urllib_request

from urllib.error import URLError, HTTPError

from uuid import UUID, uuid4



from fastapi import APIRouter, Header, HTTPException, Query, status

from pydantic import BaseModel, Field, field_validator

from supabase import Client, create_client





router = APIRouter(prefix="/api/v1/tasks", tags=["Project Tasks"])





ALLOWED_STATUS = {

    "OPEN",

    "IN_PROGRESS",

    "BLOCKED",

    "COMPLETED",

    "CANCELLED",

}



ALLOWED_PRIORITY = {

    "LOW",

    "MEDIUM",

    "HIGH",

    "CRITICAL",

}



ALLOWED_CATEGORY = {

    "GENERAL",

    "CONTRACT",

    "CLAIMS",

    "DELAY",

    "DOCUMENTS",

    "COMMERCIAL",

    "LEGAL",

}



NOTIFICATION_TYPES = {

    "TASK_ASSIGNED",

    "TASK_REASSIGNED",

    "TASK_UPDATED",

    "TASK_DUE_SOON",

    "TASK_OVERDUE",

    "TASK_COMPLETED",

}





def _supabase() -> Client:

    url = os.getenv("SUPABASE_URL", "").strip()

    key = (

        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

        or os.getenv("SUPABASE_KEY", "").strip()

    )



    if not url or not key:

        raise HTTPException(

            status_code=503,

            detail=(

                "Task service requires SUPABASE_URL and "

                "SUPABASE_SERVICE_ROLE_KEY."

            ),

        )



    return create_client(url, key)





def _bearer_token(
    authorization: Optional[str],
) -> str:
    value = (authorization or "").strip()

    if not value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    scheme, separator, token = value.partition(" ")

    if (
        not separator
        or scheme.lower() != "bearer"
        or not token.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    return token.strip()


def _require_authenticated_user(
    sb: Client,
    authorization: Optional[str],
) -> str:
    """
    Validate the caller through Supabase Auth before any service-role task
    operation.
    """
    token = _bearer_token(authorization)

    try:
        auth_response = sb.auth.get_user(token)
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
    sb: Client,
    user_id: str,
) -> bool:
    try:
        result = (
            sb.table("user_profiles")
            .select("platform_role")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return False

    rows = result.data or []

    return bool(
        rows
        and str(rows[0].get("platform_role") or "").upper()
        == "PLATFORM_ADMIN"
    )


def _require_project_access(
    sb: Client,
    *,
    authorization: Optional[str],
    tenant_id: str,
    project_id: str,
) -> tuple[str, dict]:
    """
    Authenticate the caller and enforce authoritative project access.

    Request-supplied tenant/project identifiers define scope only. Access
    requires project ownership, ACTIVE project membership, or PLATFORM_ADMIN.
    """
    user_id = _require_authenticated_user(
        sb,
        authorization,
    )

    project = _validate_scope(
        sb,
        tenant_id,
        project_id,
    )

    if str(project.get("created_by") or "") == user_id:
        return user_id, project

    member = _project_member(
        sb,
        project_id,
        user_id,
        required=False,
    )

    if member:
        return user_id, project

    if _is_platform_admin(sb, user_id):
        return user_id, project

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this project.",
    )


def _require_same_user_or_platform_admin(
    sb: Client,
    *,
    authenticated_user_id: str,
    requested_user_id: str,
) -> None:
    """
    Protect user-private pins and notifications from horizontal IDOR.
    """
    try:
        parsed_user_id = str(UUID(requested_user_id))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="User ID must be a valid UUID.",
        ) from exc

    if parsed_user_id == authenticated_user_id:
        return

    if _is_platform_admin(sb, authenticated_user_id):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You cannot access another user's private task data.",
    )


def _utc_now_iso() -> str:

    return datetime.now(timezone.utc).isoformat()





def _normalise_optional_text(value: Optional[str]) -> Optional[str]:

    if value is None:

        return None



    cleaned = value.strip()

    return cleaned or None





def _project_uuid(project_id: str) -> str:

    try:

        return str(UUID(project_id.strip()))

    except ValueError as exc:

        raise HTTPException(

            status_code=422,

            detail="project_id must be a valid UUID.",

        ) from exc





def _validate_scope(sb: Client, tenant_id: str, project_id: str) -> dict:

    parsed_project_id = _project_uuid(project_id)



    result = (

        sb.table("projects")

        .select("id,tenant_id,project_name,project_code,created_by")

        .eq("id", parsed_project_id)

        .limit(1)

        .execute()

    )



    if not result.data:

        raise HTTPException(status_code=404, detail="Project not found.")



    project = result.data[0]

    project_tenant_id = str(project.get("tenant_id") or "").strip()



    if project_tenant_id != tenant_id.strip():

        raise HTTPException(

            status_code=403,

            detail="Project does not belong to the supplied tenant.",

        )



    return project





def _project_member(

    sb: Client,

    project_id: str,

    user_id: Optional[str],

    *,

    required: bool = False,

) -> Optional[dict]:

    if not user_id:

        if required:

            raise HTTPException(status_code=422, detail="A project user is required.")

        return None



    try:

        parsed_user_id = str(UUID(user_id))

    except ValueError as exc:

        raise HTTPException(

            status_code=422,

            detail="User ID must be a valid UUID.",

        ) from exc



    result = (

        sb.table("project_users")

        .select("id,project_id,user_id,role,status")

        .eq("project_id", project_id)

        .eq("user_id", parsed_user_id)

        .eq("status", "ACTIVE")

        .limit(1)

        .execute()

    )



    if not result.data:

        if required:

            raise HTTPException(

                status_code=422,

                detail="The selected user is not an active member of this project.",

            )

        return None



    return result.data[0]





def _member_profile_map(sb: Client, user_ids: list[str]) -> dict[str, dict]:

    if not user_ids:

        return {}



    profiles = (

        sb.table("user_profiles")

        .select("user_id,full_name,job_title,status")

        .in_("user_id", user_ids)

        .execute()

    )



    return {

        str(row.get("user_id")): row

        for row in (profiles.data or [])

    }





def _get_auth_email(sb: Client, user_id: str) -> Optional[str]:

    try:

        response = sb.auth.admin.get_user_by_id(user_id)

        user = getattr(response, "user", None)

        email = getattr(user, "email", None)

        return str(email).strip() if email else None

    except Exception:

        return None





def _send_task_email(

    *,

    recipient_email: Optional[str],

    recipient_name: Optional[str],

    project_name: str,

    task_title: str,

    priority: str,

    due_date: Optional[str],

    task_id: str,

) -> str:

    """

    Optional email delivery using Resend.



    Configure:

      RESEND_API_KEY

      CONTRACTX_EMAIL_FROM  e.g. ContractX <tasks@contractx.co>

      CONTRACTX_APP_URL     e.g. https://app.contractx.co



    Email delivery never blocks task creation.

    """

    api_key = os.getenv("RESEND_API_KEY", "").strip()

    email_from = os.getenv("CONTRACTX_EMAIL_FROM", "").strip()

    app_url = os.getenv("CONTRACTX_APP_URL", "http://localhost:3000").rstrip("/")



    if not recipient_email or not api_key or not email_from:

        return "SKIPPED"



    task_url = f"{app_url}/tasks?task={task_id}"



    due_copy = due_date or "No due date"

    name = recipient_name or "Project Team Member"



    payload = {

        "from": email_from,

        "to": [recipient_email],

        "subject": f"ContractX task assigned: {task_title}",

        "html": (

            f"<p>Hello {name},</p>"

            f"<p>A ContractX project task has been assigned to you.</p>"

            f"<p><strong>Project:</strong> {project_name}<br>"

            f"<strong>Task:</strong> {task_title}<br>"

            f"<strong>Priority:</strong> {priority}<br>"

            f"<strong>Due:</strong> {due_copy}</p>"

            f'<p><a href="{task_url}">Open Task in ContractX</a></p>'

        ),

    }



    req = urllib_request.Request(

        "https://api.resend.com/emails",

        data=json.dumps(payload).encode("utf-8"),

        headers={

            "Authorization": f"Bearer {api_key}",

            "Content-Type": "application/json",

        },

        method="POST",

    )



    try:

        with urllib_request.urlopen(req, timeout=8) as response:

            if 200 <= response.status < 300:

                return "SENT"

            return "FAILED"

    except (HTTPError, URLError, TimeoutError):

        return "FAILED"

    except Exception:

        return "FAILED"





def _create_notification(

    sb: Client,

    *,

    tenant_id: str,

    project_id: str,

    user_id: Optional[str],

    actor_user_id: Optional[str],

    task_id: Optional[str],

    notification_type: str,

    title: str,

    message: Optional[str] = None,

    dedupe_key: Optional[str] = None,

    email_status: str = "SKIPPED",

) -> Optional[dict]:

    if not user_id:

        return None



    if notification_type not in NOTIFICATION_TYPES:

        return None



    row = {

        "id": str(uuid4()),

        "tenant_id": tenant_id,

        "project_id": project_id,

        "user_id": user_id,

        "actor_user_id": actor_user_id,

        "task_id": task_id,

        "notification_type": notification_type,

        "title": title,

        "message": message,

        "email_status": email_status,

        "dedupe_key": dedupe_key,

    }



    try:

        result = sb.table("project_notifications").insert(row).execute()

        return (result.data or [row])[0]

    except Exception as exc:

        # Duplicate dedupe keys are intentionally ignored.

        if dedupe_key and "duplicate" in str(exc).lower():

            return None

        return None





def _validate_enum(value: str, allowed: set[str], label: str) -> str:

    normalised = value.strip().upper()



    if normalised not in allowed:

        raise HTTPException(

            status_code=422,

            detail=f"Invalid {label}. Allowed values: {', '.join(sorted(allowed))}.",

        )



    return normalised





class TaskWrite(BaseModel):

    tenant_id: str = Field(min_length=1, max_length=200)

    project_id: str = Field(min_length=1)

    actor_user_id: Optional[str] = None

    assigned_to: Optional[str] = None

    title: str = Field(min_length=1, max_length=300)

    description: Optional[str] = None

    status: str = "OPEN"

    priority: str = "MEDIUM"

    category: str = "GENERAL"

    owner: Optional[str] = None

    due_date: Optional[date] = None

    linked_module: Optional[str] = None

    linked_record_id: Optional[str] = None



    @field_validator("tenant_id", "title")

    @classmethod

    def strip_required_text(cls, value: str) -> str:

        cleaned = value.strip()

        if not cleaned:

            raise ValueError("Value cannot be blank.")

        return cleaned



    @field_validator("status", "priority", "category")

    @classmethod

    def normalise_enum_text(cls, value: str) -> str:

        return value.strip().upper()



    @field_validator(

        "description",

        "owner",

        "linked_module",

        "linked_record_id",

        mode="before",

    )

    @classmethod

    def strip_optional_text(cls, value):

        if value is None:

            return None

        cleaned = str(value).strip()

        return cleaned or None





class ResolveTaskBody(BaseModel):

    tenant_id: str = Field(min_length=1)

    project_id: str = Field(min_length=1)

    actor_user_id: Optional[str] = None

    resolution_note: str = Field(min_length=1, max_length=5000)





@router.get("/health")

def task_health():

    return {

        "status": "ONLINE",

        "service": "ContractX Project Tasks",

        "router": "task_router",

        "prefix": "/api/v1/tasks",

        "features": {

            "project_assignment": True,

            "same_project_user_validation": True,

            "user_specific_pins": True,

            "in_app_notifications": True,

            "optional_assignment_email": True,

            "due_and_overdue_notifications": True,

            "resolution_audit": True,

            "dashboard_summary": True,

        },

    }





@router.get("/members")

def project_members(

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()

    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )



    memberships = (

        sb.table("project_users")

        .select("user_id,role,status")

        .eq("project_id", project_id)

        .eq("status", "ACTIVE")

        .execute()

    )



    rows = memberships.data or []

    user_ids = [str(row["user_id"]) for row in rows if row.get("user_id")]

    profiles = _member_profile_map(sb, user_ids)



    members = []

    for membership in rows:

        user_id = str(membership.get("user_id"))

        profile = profiles.get(user_id, {})



        members.append(

            {

                "user_id": user_id,

                "full_name": profile.get("full_name") or "Project User",

                "job_title": profile.get("job_title"),

                "project_role": membership.get("role"),

                "status": membership.get("status"),

            }

        )



    members.sort(key=lambda item: str(item.get("full_name") or "").lower())



    return {

        "status": "success",

        "tenant_id": tenant_id,

        "project_id": project_id,

        "members": members,

    }





@router.get("")

def list_tasks(

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    query: Optional[str] = None,

    status: Optional[str] = None,

    priority: Optional[str] = None,

    category: Optional[str] = None,

    assigned_to: Optional[str] = None,

    assigned_by: Optional[str] = None,

    pinned_by: Optional[str] = None,

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()

    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    authenticated_user_id, _ = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )



    q = (

        sb.table("project_tasks")

        .select("*")

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

    )



    if status:

        q = q.eq("status", _validate_enum(status, ALLOWED_STATUS, "status filter"))



    if priority:

        q = q.eq(

            "priority",

            _validate_enum(priority, ALLOWED_PRIORITY, "priority filter"),

        )



    if category:

        q = q.eq(

            "category",

            _validate_enum(category, ALLOWED_CATEGORY, "category filter"),

        )



    if assigned_to:

        _project_member(sb, project_id, assigned_to, required=True)

        q = q.eq("assigned_to", str(UUID(assigned_to)))



    if assigned_by:

        q = q.eq("assigned_by", str(UUID(assigned_by)))



    result = q.order("created_at", desc=True).execute()

    rows = result.data or []



    if query:

        needle = query.lower().strip()

        if needle:

            rows = [

                row

                for row in rows

                if needle

                in " ".join(

                    str(row.get(key) or "").lower()

                    for key in (

                        "title",

                        "description",

                        "owner",

                        "category",

                        "linked_module",

                        "linked_record_id",

                        "source_type",

                        "source_reference",

                        "resolution_note",

                    )

                )

            ]



    pin_ids: set[str] = set()

    if pinned_by:

        _project_member(sb, project_id, pinned_by, required=True)

        _require_same_user_or_platform_admin(
            sb,
            authenticated_user_id=authenticated_user_id,
            requested_user_id=pinned_by,
        )



        pin_result = (

            sb.table("task_pins")

            .select("task_id")

            .eq("tenant_id", tenant_id)

            .eq("project_id", project_id)

            .eq("user_id", str(UUID(pinned_by)))

            .execute()

        )

        pin_ids = {

            str(row.get("task_id"))

            for row in (pin_result.data or [])

            if row.get("task_id")

        }



    assignee_ids = {

        str(row.get("assigned_to"))

        for row in rows

        if row.get("assigned_to")

    }

    profiles = _member_profile_map(sb, list(assignee_ids))



    for row in rows:

        row["is_pinned"] = str(row.get("id")) in pin_ids

        assignee_id = str(row.get("assigned_to") or "")

        profile = profiles.get(assignee_id)

        row["assignee_name"] = (

            profile.get("full_name") if profile else None

        )

        row["assignee_job_title"] = (

            profile.get("job_title") if profile else None

        )



    return {

        "status": "success",

        "tasks": rows,

        "count": len(rows),

    }





@router.get("/summary")

def task_summary(

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    user_id: Optional[str] = None,

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()

    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )



    q = (

        sb.table("project_tasks")

        .select("id,status,priority,due_date,assigned_to")

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

    )



    if user_id:

        _project_member(sb, project_id, user_id, required=True)

        q = q.eq("assigned_to", str(UUID(user_id)))



    rows = q.execute().data or []

    today = date.today()

    due_7 = today + timedelta(days=7)



    def parsed_due(row: dict) -> Optional[date]:

        value = row.get("due_date")

        if not value:

            return None

        try:

            return date.fromisoformat(str(value)[:10])

        except ValueError:

            return None



    def active(row: dict) -> bool:

        return row.get("status") not in {"COMPLETED", "CANCELLED"}



    return {

        "status": "success",

        "total": len(rows),

        "open": sum(1 for r in rows if r.get("status") == "OPEN"),

        "in_progress": sum(1 for r in rows if r.get("status") == "IN_PROGRESS"),

        "blocked": sum(1 for r in rows if r.get("status") == "BLOCKED"),

        "completed": sum(1 for r in rows if r.get("status") == "COMPLETED"),

        "cancelled": sum(1 for r in rows if r.get("status") == "CANCELLED"),

        "closed": sum(

            1 for r in rows if r.get("status") in {"COMPLETED", "CANCELLED"}

        ),

        "critical": sum(

            1 for r in rows if r.get("priority") == "CRITICAL" and active(r)

        ),

        "overdue": sum(

            1

            for r in rows

            if active(r)

            and parsed_due(r) is not None

            and parsed_due(r) < today

        ),

        "due_today": sum(

            1

            for r in rows

            if active(r) and parsed_due(r) == today

        ),

        "due_7_days": sum(

            1

            for r in rows

            if active(r)

            and parsed_due(r) is not None

            and today < parsed_due(r) <= due_7

        ),

        "priority": {

            level.lower(): sum(

                1 for r in rows if r.get("priority") == level and active(r)

            )

            for level in ("CRITICAL", "HIGH", "MEDIUM", "LOW")

        },

    }





@router.post("")

def create_task(
    payload: TaskWrite,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):

    sb = _supabase()



    tenant_id = payload.tenant_id.strip()

    project_id = _project_uuid(payload.project_id)

    authenticated_user_id, project = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )



    status = _validate_enum(payload.status, ALLOWED_STATUS, "task status")

    priority = _validate_enum(payload.priority, ALLOWED_PRIORITY, "task priority")

    category = _validate_enum(payload.category, ALLOWED_CATEGORY, "task category")



    actor_member = _project_member(

        sb,

        project_id,

        authenticated_user_id,

        required=False,

    )

    assignee_member = _project_member(

        sb,

        project_id,

        payload.assigned_to,

        required=False,

    )



    actor_user_id = (

        str(actor_member["user_id"]) if actor_member else None

    )

    assigned_to = (

        str(assignee_member["user_id"]) if assignee_member else None

    )



    row = {

        "id": str(uuid4()),

        "tenant_id": tenant_id,

        "project_id": project_id,

        "title": payload.title.strip(),

        "description": _normalise_optional_text(payload.description),

        "status": status,

        "priority": priority,

        "category": category,

        "owner": _normalise_optional_text(payload.owner),

        "due_date": payload.due_date.isoformat() if payload.due_date else None,

        "linked_module": _normalise_optional_text(payload.linked_module),

        "linked_record_id": _normalise_optional_text(payload.linked_record_id),

        "assigned_by": actor_user_id,

        "assigned_to": assigned_to,

        "completed_at": _utc_now_iso() if status == "COMPLETED" else None,

        "completed_by": actor_user_id if status == "COMPLETED" else None,

    }



    result = sb.table("project_tasks").insert(row).execute()

    task = (result.data or [row])[0]



    if assigned_to:

        profile = _member_profile_map(sb, [assigned_to]).get(assigned_to, {})

        recipient_email = _get_auth_email(sb, assigned_to)



        email_status = _send_task_email(

            recipient_email=recipient_email,

            recipient_name=profile.get("full_name"),

            project_name=str(

                project.get("project_name")

                or project.get("project_code")

                or "ContractX Project"

            ),

            task_title=task["title"],

            priority=priority,

            due_date=task.get("due_date"),

            task_id=str(task["id"]),

        )



        _create_notification(

            sb,

            tenant_id=tenant_id,

            project_id=project_id,

            user_id=assigned_to,

            actor_user_id=actor_user_id,

            task_id=str(task["id"]),

            notification_type="TASK_ASSIGNED",

            title="New task assigned to you",

            message=f'{task["title"]} · Priority {priority}',

            email_status=email_status,

        )



    return {

        "status": "success",

        "message": "Task created.",

        "task": task,

    }





@router.patch("/{task_id}")

def update_task(
    task_id: UUID, payload: TaskWrite,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):

    sb = _supabase()



    tenant_id = payload.tenant_id.strip()

    project_id = _project_uuid(payload.project_id)

    authenticated_user_id, _ = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )



    status = _validate_enum(payload.status, ALLOWED_STATUS, "task status")

    priority = _validate_enum(payload.priority, ALLOWED_PRIORITY, "task priority")

    category = _validate_enum(payload.category, ALLOWED_CATEGORY, "task category")



    existing_result = (

        sb.table("project_tasks")

        .select("*")

        .eq("id", str(task_id))

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .limit(1)

        .execute()

    )



    if not existing_result.data:

        raise HTTPException(status_code=404, detail="Task not found.")



    existing = existing_result.data[0]



    actor_member = _project_member(

        sb,

        project_id,

        authenticated_user_id,

        required=False,

    )

    assignee_member = _project_member(

        sb,

        project_id,

        payload.assigned_to,

        required=False,

    )



    actor_user_id = (

        str(actor_member["user_id"]) if actor_member else None

    )

    assigned_to = (

        str(assignee_member["user_id"]) if assignee_member else None

    )

    previous_assignee = (

        str(existing.get("assigned_to"))

        if existing.get("assigned_to")

        else None

    )



    row = {

        "title": payload.title.strip(),

        "description": _normalise_optional_text(payload.description),

        "status": status,

        "priority": priority,

        "category": category,

        "owner": _normalise_optional_text(payload.owner),

        "due_date": payload.due_date.isoformat() if payload.due_date else None,

        "linked_module": _normalise_optional_text(payload.linked_module),

        "linked_record_id": _normalise_optional_text(payload.linked_record_id),

        "assigned_to": assigned_to,

        "updated_at": _utc_now_iso(),

    }



    if status == "COMPLETED":

        row["completed_at"] = existing.get("completed_at") or _utc_now_iso()

        row["completed_by"] = existing.get("completed_by") or actor_user_id

    elif existing.get("status") == "COMPLETED" and status != "COMPLETED":

        row["completed_at"] = None

        row["completed_by"] = None



    result = (

        sb.table("project_tasks")

        .update(row)

        .eq("id", str(task_id))

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .execute()

    )



    if not result.data:

        raise HTTPException(status_code=404, detail="Task not found.")



    task = result.data[0]



    if assigned_to and assigned_to != previous_assignee:

        _create_notification(

            sb,

            tenant_id=tenant_id,

            project_id=project_id,

            user_id=assigned_to,

            actor_user_id=actor_user_id,

            task_id=str(task_id),

            notification_type="TASK_REASSIGNED",

            title="Task assigned to you",

            message=task.get("title"),

        )

    elif assigned_to and assigned_to == previous_assignee:

        _create_notification(

            sb,

            tenant_id=tenant_id,

            project_id=project_id,

            user_id=assigned_to,

            actor_user_id=actor_user_id,

            task_id=str(task_id),

            notification_type="TASK_UPDATED",

            title="Assigned task updated",

            message=task.get("title"),

        )



    return {

        "status": "success",

        "message": "Task updated.",

        "task": task,

    }





@router.post("/{task_id}/resolve")

def resolve_task(
    task_id: UUID, payload: ResolveTaskBody,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):

    sb = _supabase()



    tenant_id = payload.tenant_id.strip()

    project_id = _project_uuid(payload.project_id)

    authenticated_user_id, _ = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )



    actor_member = _project_member(

        sb,

        project_id,

        authenticated_user_id,

        required=False,

    )

    actor_user_id = (

        str(actor_member["user_id"]) if actor_member else None

    )



    existing = (

        sb.table("project_tasks")

        .select("*")

        .eq("id", str(task_id))

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .limit(1)

        .execute()

    )



    if not existing.data:

        raise HTTPException(status_code=404, detail="Task not found.")



    current = existing.data[0]



    result = (

        sb.table("project_tasks")

        .update(

            {

                "status": "COMPLETED",

                "resolution_note": payload.resolution_note.strip(),

                "completed_at": _utc_now_iso(),

                "completed_by": actor_user_id,

                "updated_at": _utc_now_iso(),

            }

        )

        .eq("id", str(task_id))

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .execute()

    )



    task = (result.data or [current])[0]



    notify_user = (

        str(current.get("assigned_by"))

        if current.get("assigned_by")

        else None

    )



    if notify_user and notify_user != actor_user_id:

        _create_notification(

            sb,

            tenant_id=tenant_id,

            project_id=project_id,

            user_id=notify_user,

            actor_user_id=actor_user_id,

            task_id=str(task_id),

            notification_type="TASK_COMPLETED",

            title="Task resolved",

            message=task.get("title"),

        )



    return {

        "status": "success",

        "message": "Task resolved.",

        "task": task,

    }





@router.post("/{task_id}/pin")

def pin_task(

    task_id: UUID,

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    user_id: str = Query(..., min_length=1),

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()



    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    authenticated_user_id, _ = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _project_member(sb, project_id, user_id, required=True)

    _require_same_user_or_platform_admin(
        sb,
        authenticated_user_id=authenticated_user_id,
        requested_user_id=user_id,
    )



    task_exists = (

        sb.table("project_tasks")

        .select("id")

        .eq("id", str(task_id))

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .limit(1)

        .execute()

    )



    if not task_exists.data:

        raise HTTPException(status_code=404, detail="Task not found.")



    row = {

        "id": str(uuid4()),

        "tenant_id": tenant_id,

        "project_id": project_id,

        "task_id": str(task_id),

        "user_id": str(UUID(user_id)),

    }



    try:

        sb.table("task_pins").insert(row).execute()

    except Exception:

        pass



    return {"status": "success", "pinned": True, "task_id": str(task_id)}





@router.delete("/{task_id}/pin")

def unpin_task(

    task_id: UUID,

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    user_id: str = Query(..., min_length=1),

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()



    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    authenticated_user_id, _ = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _project_member(sb, project_id, user_id, required=True)

    _require_same_user_or_platform_admin(
        sb,
        authenticated_user_id=authenticated_user_id,
        requested_user_id=user_id,
    )



    (

        sb.table("task_pins")

        .delete()

        .eq("task_id", str(task_id))

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .eq("user_id", str(UUID(user_id)))

        .execute()

    )



    return {"status": "success", "pinned": False, "task_id": str(task_id)}





@router.get("/notifications")

def list_notifications(

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    user_id: str = Query(..., min_length=1),

    limit: int = Query(20, ge=1, le=100),

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()



    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    authenticated_user_id, _ = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _project_member(sb, project_id, user_id, required=True)

    _require_same_user_or_platform_admin(
        sb,
        authenticated_user_id=authenticated_user_id,
        requested_user_id=user_id,
    )



    result = (

        sb.table("project_notifications")

        .select("*")

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .eq("user_id", str(UUID(user_id)))

        .order("created_at", desc=True)

        .limit(limit)

        .execute()

    )



    return {

        "status": "success",

        "notifications": result.data or [],

    }





@router.get("/notifications/unread-count")

def unread_notification_count(

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    user_id: str = Query(..., min_length=1),

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()



    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    authenticated_user_id, _ = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _project_member(sb, project_id, user_id, required=True)

    _require_same_user_or_platform_admin(
        sb,
        authenticated_user_id=authenticated_user_id,
        requested_user_id=user_id,
    )



    result = (

        sb.table("project_notifications")

        .select("id")

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .eq("user_id", str(UUID(user_id)))

        .eq("is_read", False)

        .execute()

    )



    return {

        "status": "success",

        "unread": len(result.data or []),

    }





@router.post("/notifications/{notification_id}/read")

def mark_notification_read(

    notification_id: UUID,

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    user_id: str = Query(..., min_length=1),

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()



    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    authenticated_user_id, _ = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _project_member(sb, project_id, user_id, required=True)

    _require_same_user_or_platform_admin(
        sb,
        authenticated_user_id=authenticated_user_id,
        requested_user_id=user_id,
    )



    result = (

        sb.table("project_notifications")

        .update({"is_read": True, "read_at": _utc_now_iso()})

        .eq("id", str(notification_id))

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .eq("user_id", str(UUID(user_id)))

        .execute()

    )



    if not result.data:

        raise HTTPException(status_code=404, detail="Notification not found.")



    return {"status": "success", "read": True}





@router.post("/notifications/read-all")

def mark_all_notifications_read(

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    user_id: str = Query(..., min_length=1),

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()



    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    authenticated_user_id, _ = _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    _project_member(sb, project_id, user_id, required=True)

    _require_same_user_or_platform_admin(
        sb,
        authenticated_user_id=authenticated_user_id,
        requested_user_id=user_id,
    )



    (

        sb.table("project_notifications")

        .update({"is_read": True, "read_at": _utc_now_iso()})

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .eq("user_id", str(UUID(user_id)))

        .eq("is_read", False)

        .execute()

    )



    return {"status": "success", "read_all": True}





@router.post("/notifications/sweep")

def sweep_due_notifications(

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    """

    Lightweight due-date notification sweep.



    Safe to call on dashboard/task-page load or from a daily scheduler.

    Dedupe keys prevent repeated notifications for the same task/date/type.

    """

    sb = _supabase()



    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )



    rows = (

        sb.table("project_tasks")

        .select("id,title,due_date,status,assigned_to")

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .execute()

    ).data or []



    today = date.today()

    tomorrow = today + timedelta(days=1)

    created = 0



    for task in rows:

        if task.get("status") in {"COMPLETED", "CANCELLED"}:

            continue



        assigned_to = task.get("assigned_to")

        due_value = task.get("due_date")



        if not assigned_to or not due_value:

            continue



        try:

            due = date.fromisoformat(str(due_value)[:10])

        except ValueError:

            continue



        notification_type = None

        title = None



        if due < today:

            notification_type = "TASK_OVERDUE"

            title = "Task overdue"

        elif due in {today, tomorrow}:

            notification_type = "TASK_DUE_SOON"

            title = "Task due soon"



        if not notification_type:

            continue



        dedupe_key = (

            f"{notification_type}:{task['id']}:{assigned_to}:{today.isoformat()}"

        )



        result = _create_notification(

            sb,

            tenant_id=tenant_id,

            project_id=project_id,

            user_id=str(assigned_to),

            actor_user_id=None,

            task_id=str(task["id"]),

            notification_type=notification_type,

            title=title,

            message=f'{task.get("title") or "Project task"} · Due {due.isoformat()}',

            dedupe_key=dedupe_key,

        )



        if result:

            created += 1



    return {"status": "success", "notifications_created": created}





@router.delete("/{task_id}")

def delete_task(

    task_id: UUID,

    tenant_id: str = Query(..., min_length=1),

    project_id: str = Query(..., min_length=1),

    authorization: Optional[str] = Header(default=None, alias="Authorization"),

):

    sb = _supabase()



    tenant_id = tenant_id.strip()

    project_id = _project_uuid(project_id)

    _require_project_access(
        sb,
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )



    existing = (

        sb.table("project_tasks")

        .select("id")

        .eq("id", str(task_id))

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .limit(1)

        .execute()

    )



    if not existing.data:

        raise HTTPException(status_code=404, detail="Task not found.")



    (

        sb.table("project_tasks")

        .delete()

        .eq("id", str(task_id))

        .eq("tenant_id", tenant_id)

        .eq("project_id", project_id)

        .execute()

    )



    return {

        "status": "success",

        "deleted": True,

        "task_id": str(task_id),

        "message": "Task deleted.",

    }
