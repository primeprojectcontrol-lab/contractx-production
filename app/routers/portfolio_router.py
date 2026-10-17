from __future__ import annotations



import os

from collections import defaultdict

from datetime import date

from typing import Any, Optional

from uuid import UUID



from fastapi import APIRouter, Header, HTTPException, Query, status

from supabase import Client, create_client





router = APIRouter(prefix="/api/v1/portfolio", tags=["Portfolio"])





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

                "Portfolio service requires SUPABASE_URL and "

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


def _accessible_project_ids(
    sb: Client,
    *,
    user_id: str,
    tenant_projects: list[dict[str, Any]],
) -> set[str]:
    """
    Return only projects visible to the authenticated caller.

    tenant_id is used only as a scope selector. Normal users may see projects
    they created or projects where they hold an ACTIVE project_users
    membership. PLATFORM_ADMIN may see all projects in the tenant.
    """
    if _is_platform_admin(sb, user_id):
        return {
            _string(row.get("id"))
            for row in tenant_projects
            if row.get("id")
        }

    tenant_project_ids = {
        _string(row.get("id"))
        for row in tenant_projects
        if row.get("id")
    }

    accessible = {
        _string(row.get("id"))
        for row in tenant_projects
        if (
            row.get("id")
            and _string(row.get("created_by")) == user_id
        )
    }

    if not tenant_project_ids:
        return accessible

    try:
        membership_result = (
            sb.table("project_users")
            .select("project_id")
            .eq("user_id", user_id)
            .eq("status", "ACTIVE")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate portfolio project access.",
        ) from exc

    for row in membership_result.data or []:
        project_id = _string(row.get("project_id"))
        if project_id in tenant_project_ids:
            accessible.add(project_id)

    return accessible


def _safe_rows(

    sb: Client,

    table: str,

    columns: str = "*",

    *,

    tenant_id: Optional[str] = None,

) -> list[dict[str, Any]]:

    """

    Read a table without making the whole Portfolio page fail if an optional

    module table is absent or temporarily unavailable.

    """

    try:

        query = sb.table(table).select(columns)



        if tenant_id:

            query = query.eq("tenant_id", tenant_id)



        result = query.execute()

        return list(result.data or [])

    except Exception:

        return []





def _string(value: Any) -> str:

    return str(value or "").strip()





def _normalise_status(value: Any) -> str:

    raw = _string(value).upper()

    return raw or "ACTIVE"





def _project_name(row: dict[str, Any]) -> str:

    return (

        _string(row.get("project_name"))

        or _string(row.get("name"))

        or _string(row.get("title"))

        or "Untitled Project"

    )





def _project_code(row: dict[str, Any]) -> Optional[str]:

    return (

        _string(row.get("project_code"))

        or _string(row.get("code"))

        or None

    )





def _project_jurisdiction(row: dict[str, Any]) -> Optional[str]:

    return (

        _string(row.get("jurisdiction"))

        or _string(row.get("country"))

        or _string(row.get("region"))

        or None

    )





def _project_role(row: dict[str, Any]) -> Optional[str]:

    return (

        _string(row.get("stakeholder_role"))

        or _string(row.get("role"))

        or _string(row.get("company_type"))

        or None

    )





def _iso_date(value: Any) -> Optional[str]:

    text = _string(value)

    return text or None





@router.get("/health")

def portfolio_health():

    return {

        "status": "ONLINE",

        "service": "ContractX Portfolio",

        "router": "portfolio_router",

        "prefix": "/api/v1/portfolio",

        "features": {

            "project_register": True,

            "task_rollup": True,

            "document_rollup": True,

            "project_user_rollup": True,

            "portfolio_summary": True,

            "module_navigation": True,

        },

    }





@router.get("/projects")

def portfolio_projects(

    tenant_id: str = Query(..., min_length=1),

    status: Optional[str] = None,

    search: Optional[str] = None,

    authorization: Optional[str] = Header(
        default=None,
        alias="Authorization",
    ),

):

    sb = _supabase()

    tenant_id = tenant_id.strip()

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tenant_id is required.",
        )

    authenticated_user_id = _require_authenticated_user(
        sb,
        authorization,
    )



    project_rows = _safe_rows(

        sb,

        "projects",

        "*",

        tenant_id=tenant_id,

    )



    accessible_project_ids = _accessible_project_ids(
        sb,
        user_id=authenticated_user_id,
        tenant_projects=project_rows,
    )

    project_rows = [
        row
        for row in project_rows
        if _string(row.get("id")) in accessible_project_ids
    ]


    # Portfolio should still respond cleanly for a tenant with no projects.

    if not project_rows:

        return {

            "status": "success",

            "tenant_id": tenant_id,

            "projects": [],

            "summary": {

                "projects": 0,

                "active": 0,

                "on_hold": 0,

                "archived": 0,

                "open_tasks": 0,

                "overdue_tasks": 0,

                "critical_tasks": 0,

                "documents": 0,

                "project_users": 0,

            },

        }



    project_ids = {

        _string(row.get("id"))

        for row in project_rows

        if row.get("id")

    }



    # These tables are part of the existing ContractX project/task/vault model.

    # Queries are intentionally defensive: missing optional data returns 0 rather

    # than breaking the Portfolio workspace.

    task_rows = _safe_rows(

        sb,

        "project_tasks",

        "project_id,status,priority,due_date,updated_at,created_at",

        tenant_id=tenant_id,

    )

    document_rows = _safe_rows(

        sb,

        "project_documents",

        "project_id,id,created_at,updated_at",

        tenant_id=tenant_id,

    )

    user_rows = _safe_rows(

        sb,

        "project_users",

        "project_id,user_id,status,joined_at,updated_at",

    )



    task_by_project: dict[str, list[dict[str, Any]]] = defaultdict(list)

    doc_by_project: dict[str, list[dict[str, Any]]] = defaultdict(list)

    user_by_project: dict[str, list[dict[str, Any]]] = defaultdict(list)



    for row in task_rows:

        pid = _string(row.get("project_id"))

        if pid in project_ids:

            task_by_project[pid].append(row)



    for row in document_rows:

        pid = _string(row.get("project_id"))

        if pid in project_ids:

            doc_by_project[pid].append(row)



    for row in user_rows:

        pid = _string(row.get("project_id"))

        if pid in project_ids:

            user_by_project[pid].append(row)



    today = date.today()

    projects: list[dict[str, Any]] = []



    for project in project_rows:

        pid = _string(project.get("id"))

        tasks = task_by_project.get(pid, [])

        docs = doc_by_project.get(pid, [])

        members = user_by_project.get(pid, [])



        open_tasks = [

            row

            for row in tasks

            if _normalise_status(row.get("status"))

            not in {"COMPLETED", "CANCELLED"}

        ]



        overdue = 0

        critical = 0



        for row in open_tasks:

            if _string(row.get("priority")).upper() == "CRITICAL":

                critical += 1



            due = _string(row.get("due_date"))

            if due:

                try:

                    if date.fromisoformat(due[:10]) < today:

                        overdue += 1

                except ValueError:

                    pass



        completed = sum(

            1

            for row in tasks

            if _normalise_status(row.get("status")) == "COMPLETED"

        )



        active_members = sum(

            1

            for row in members

            if _normalise_status(row.get("status")) == "ACTIVE"

        )



        activity_candidates: list[str] = []



        for source in (project, *tasks, *docs, *members):

            for key in ("updated_at", "created_at", "joined_at"):

                value = _string(source.get(key))

                if value:

                    activity_candidates.append(value)



        last_activity = max(activity_candidates) if activity_candidates else None



        projects.append(

            {

                "id": pid,

                "tenant_id": tenant_id,

                "project_name": _project_name(project),

                "project_code": _project_code(project),

                "status": _normalise_status(project.get("status")),

                "jurisdiction": _project_jurisdiction(project),

                "stakeholder_role": _project_role(project),

                "organization_id": _string(project.get("organization_id")) or None,

                "created_at": _iso_date(project.get("created_at")),

                "updated_at": _iso_date(project.get("updated_at")),

                "last_activity": last_activity,

                "metrics": {

                    "tasks_total": len(tasks),

                    "tasks_open": len(open_tasks),

                    "tasks_completed": completed,

                    "tasks_overdue": overdue,

                    "tasks_critical": critical,

                    "documents": len(docs),

                    "project_users": active_members,

                },

            }

        )



    if status:

        wanted = status.strip().upper()

        projects = [

            project

            for project in projects

            if project["status"] == wanted

        ]



    if search:

        needle = search.strip().lower()

        if needle:

            projects = [

                project

                for project in projects

                if needle

                in " ".join(

                    str(project.get(key) or "").lower()

                    for key in (

                        "project_name",

                        "project_code",

                        "jurisdiction",

                        "stakeholder_role",

                        "status",

                    )

                )

            ]



    projects.sort(

        key=lambda project: (

            project.get("status") != "ACTIVE",

            str(project.get("project_name") or "").lower(),

        )

    )



    summary = {

        "projects": len(projects),

        "active": sum(1 for p in projects if p["status"] == "ACTIVE"),

        "on_hold": sum(

            1 for p in projects if p["status"] in {"ON_HOLD", "HOLD"}

        ),

        "archived": sum(

            1 for p in projects if p["status"] in {"ARCHIVED", "INACTIVE"}

        ),

        "open_tasks": sum(p["metrics"]["tasks_open"] for p in projects),

        "overdue_tasks": sum(p["metrics"]["tasks_overdue"] for p in projects),

        "critical_tasks": sum(p["metrics"]["tasks_critical"] for p in projects),

        "documents": sum(p["metrics"]["documents"] for p in projects),

        "project_users": sum(p["metrics"]["project_users"] for p in projects),

    }



    return {

        "status": "success",

        "tenant_id": tenant_id,

        "projects": projects,

        "summary": summary,

    }
