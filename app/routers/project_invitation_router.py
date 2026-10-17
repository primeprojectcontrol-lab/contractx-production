from __future__ import annotations



import os

from datetime import datetime, timezone, timedelta



from fastapi import APIRouter, Header, HTTPException, status

from pydantic import BaseModel

from supabase import create_client



router = APIRouter(

    prefix="/api/v1/project-invitations",

    tags=["Project Invitations"],

)



SUPABASE_URL = os.getenv("SUPABASE_URL", "")

SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

CONTRACTX_FRONTEND_URL = os.getenv(

    "CONTRACTX_FRONTEND_URL",

    "http://localhost:3000",

).rstrip("/")



service = (

    create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

    else None

)





class InviteProjectUserRequest(BaseModel):

    project_id: str

    email: str

    role: str = "MEMBER"





class SendInvitationRequest(BaseModel):

    invitation_id: str





def _require_service():

    if service is None:

        raise HTTPException(

            status_code=503,

            detail="Supabase service-role configuration is unavailable.",

        )

    return service





def _bearer_token(authorization: str | None) -> str:

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



def _normalize_email(value: str) -> str:

    email = (value or "").strip().lower()

    if not email or "@" not in email or email.startswith("@") or email.endswith("@"):

        raise HTTPException(status_code=400, detail="A valid email address is required.")

    return email





def _normalize_role(value: str) -> str:

    role = (value or "MEMBER").strip().upper()

    if role not in {"ADMIN", "MEMBER"}:

        raise HTTPException(status_code=400, detail="Role must be ADMIN or MEMBER.")

    return role





def _require_project_admin(svc, token: str, project_id: str) -> str:

    try:
        auth_result = svc.auth.get_user(token)
        user = getattr(auth_result, "user", None)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session.",
        ) from exc

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session.",
        )

    user_id = str(user.id)

    project_result = (
        svc.table("projects")
        .select("id,created_by")
        .eq("id", project_id)
        .maybe_single()
        .execute()
    )

    if not project_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    if str(project_result.data.get("created_by") or "") == user_id:
        return user_id

    profile = (
        svc.table("user_profiles")
        .select("platform_role")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )

    if (
        profile.data
        and str(profile.data.get("platform_role") or "").upper()
        == "PLATFORM_ADMIN"
    ):
        return user_id

    membership = (
        svc.table("project_users")
        .select("role,status")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )

    if not membership.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project administrator access required.",
        )

    role = str(membership.data.get("role") or "").upper()
    membership_status = str(membership.data.get("status") or "").upper()

    if (
        membership_status != "ACTIVE"
        or role not in {"OWNER", "ADMIN"}
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project administrator access required.",
        )

    return user_id



def _project_context(svc, project_id: str) -> dict:

    result = (

        svc.table("projects")

        .select("id,organization_id,project_name,project_code,status")

        .eq("id", project_id)

        .single()

        .execute()

    )



    if not result.data:

        raise HTTPException(status_code=404, detail="Project not found.")



    if not result.data.get("organization_id"):

        raise HTTPException(

            status_code=409,

            detail="Project is not linked to a ContractX organization.",

        )



    return result.data





def _invitee_state(svc, project_id: str, email: str) -> dict:

    result = svc.rpc(

        "service_project_invitee_state",

        {

            "p_project_id": project_id,

            "p_email": email,

        },

    ).execute()



    rows = result.data or []

    if not rows:

        raise HTTPException(

            status_code=500,

            detail="Unable to resolve invitation account state.",

        )



    return rows[0]





def _active_project_user_count(svc, project_id: str) -> int:

    result = (

        svc.table("project_users")

        .select("id", count="exact")

        .eq("project_id", project_id)

        .eq("status", "ACTIVE")

        .execute()

    )

    return int(result.count or 0)





def _pending_invitation(svc, project_id: str, email: str):

    result = (

        svc.table("project_invitations")

        .select("id,project_id,email,role,status,expires_at,invited_at")

        .eq("project_id", project_id)

        .eq("email", email)

        .eq("status", "PENDING")

        .order("invited_at", desc=True)

        .limit(1)

        .execute()

    )

    rows = result.data or []

    return rows[0] if rows else None





def _upsert_pending_invitation(

    svc,

    *,

    project: dict,

    email: str,

    role: str,

    invited_by: str,

) -> dict:

    current = _pending_invitation(svc, project["id"], email)

    now = datetime.now(timezone.utc)

    expires_at = now + timedelta(days=7)



    payload = {

        "project_id": project["id"],

        "organization_id": project["organization_id"],

        "email": email,

        "role": role,

        "status": "PENDING",

        "invited_by": invited_by,

        "invited_at": now.isoformat(),

        "expires_at": expires_at.isoformat(),

        "updated_at": now.isoformat(),

    }



    if current:

        result = (

            svc.table("project_invitations")

            .update(payload)

            .eq("id", current["id"])

            .execute()

        )

    else:

        result = svc.table("project_invitations").insert(payload).execute()



    rows = result.data or []

    if not rows:

        raise HTTPException(

            status_code=500,

            detail="Pending invitation could not be created.",

        )



    return rows[0]





def _send_new_supabase_invite(svc, invitation: dict, project: dict) -> None:

    project_name = (

        project.get("project_name")

        or project.get("project_code")

        or "ContractX Project"

    )



    redirect_to = (

        f"{CONTRACTX_FRONTEND_URL}/portfolio"

        f"?project={invitation['project_id']}"

    )



    try:

        svc.auth.admin.invite_user_by_email(

            invitation["email"],

            {

                "redirect_to": redirect_to,

                "data": {

                    "contractx_project_id": invitation["project_id"],

                    "contractx_project_name": project_name,

                    "contractx_role": invitation["role"],

                },

            },

        )

    except Exception as exc:

        raise HTTPException(

            status_code=status.HTTP_502_BAD_GATEWAY,

            detail=(
                "Invitation was recorded but email delivery failed. "
                "Please retry or contact the project administrator."
            ),

        ) from exc





@router.get("/health")

def project_invitation_health():

    return {

        "status": "ok",

        "module": "project_invitations",

        "service_role_configured": bool(

            SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

        ),

    }





@router.post("/invite")

def invite_project_user(

    payload: InviteProjectUserRequest,

    authorization: str | None = Header(default=None),

):

    svc = _require_service()

    token = _bearer_token(authorization)

    email = _normalize_email(payload.email)

    role = _normalize_role(payload.role)



    invited_by = _require_project_admin(svc, token, payload.project_id)

    project = _project_context(svc, payload.project_id)

    state = _invitee_state(svc, payload.project_id, email)



    # Already an active member: do not create duplicate access.

    if state.get("active_project_member"):

        return {

            "mode": "already_active",

            "status": "ACTIVE",

            "message": f"{email} already has active access to this project.",

        }



    auth_user_id = state.get("auth_user_id")

    email_confirmed = bool(state.get("email_confirmed"))



    # Fully registered user: enforce organization boundary and add directly.

    if auth_user_id and email_confirmed:

        if not state.get("same_organization"):

            raise HTTPException(

                status_code=409,

                detail="User belongs to a different ContractX organization.",

            )



        if _active_project_user_count(svc, payload.project_id) >= 3:

            raise HTTPException(

                status_code=409,

                detail="This project already has the maximum 3 active users.",

            )



        existing = (

            svc.table("project_users")

            .select("id")

            .eq("project_id", payload.project_id)

            .eq("user_id", auth_user_id)

            .maybe_single()

            .execute()

        )



        membership_payload = {

            "project_id": payload.project_id,

            "user_id": auth_user_id,

            "role": role,

            "status": "ACTIVE",

            "updated_at": datetime.now(timezone.utc).isoformat(),

        }



        if existing.data:

            (

                svc.table("project_users")

                .update(membership_payload)

                .eq("id", existing.data["id"])

                .execute()

            )

        else:

            membership_payload["joined_at"] = datetime.now(

                timezone.utc

            ).isoformat()

            svc.table("project_users").insert(membership_payload).execute()



        return {

            "mode": "existing_user",

            "status": "ACTIVE",

            "message": f"{email} was added to the project.",

        }



    # New email OR an auth user created by a previous invitation but not yet

    # confirmed. Both remain in PENDING state until the recipient accepts.

    invitation = _upsert_pending_invitation(

        svc,

        project=project,

        email=email,

        role=role,

        invited_by=invited_by,

    )



    if not auth_user_id:

        _send_new_supabase_invite(svc, invitation, project)

        message = f"Invitation sent to {email}."

    else:

        message = (

            f"Invitation for {email} is pending acceptance. "

            "The user has not completed account verification yet."

        )



    return {

        "mode": "invitation",

        "status": "PENDING",

        "message": message,

        "invitation": invitation,

    }





@router.post("/send")

def send_project_invitation(

    payload: SendInvitationRequest,

    authorization: str | None = Header(default=None),

):

    svc = _require_service()

    token = _bearer_token(authorization)

    try:
        auth_result = svc.auth.get_user(token)
        auth_user = getattr(auth_result, "user", None)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session.",
        ) from exc

    if not auth_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session.",
        )




    invitation_result = (

        svc.table("project_invitations")

        .select("id,project_id,email,role,status,expires_at")

        .eq("id", payload.invitation_id)

        .single()

        .execute()

    )



    if not invitation_result.data:

        raise HTTPException(status_code=404, detail="Invitation not found.")



    invitation = invitation_result.data

    _require_project_admin(svc, token, invitation["project_id"])



    if str(invitation.get("status") or "").upper() != "PENDING":

        raise HTTPException(

            status_code=400,

            detail="Only pending invitations can be sent.",

        )



    project = _project_context(svc, invitation["project_id"])

    state = _invitee_state(

        svc,

        invitation["project_id"],

        invitation["email"],

    )



    # Supabase creates auth.users as part of an invite. Do not attempt to

    # convert an unconfirmed invited account into a normal organization user.

    if state.get("auth_user_id") and not state.get("email_confirmed"):

        return {

            "status": "PENDING",

            "message": (

                f"Invitation for {invitation['email']} is still pending "

                "account verification."

            ),

        }



    if state.get("auth_user_id") and state.get("email_confirmed"):

        return {

            "status": "REGISTERED",

            "message": (

                f"{invitation['email']} has already completed account "

                "verification. Use Add / Invite User to activate access."

            ),

        }



    _send_new_supabase_invite(svc, invitation, project)



    return {

        "status": "PENDING",

        "message": f"Invitation sent to {invitation['email']}.",

    }





@router.post("/resend")

def resend_project_invitation(

    payload: SendInvitationRequest,

    authorization: str | None = Header(default=None),

):

    # For already-created Supabase invite users, the normal invite endpoint

    # must not create a second account or bypass verification. Until a branded

    # transactional-mail provider is connected, keep the invitation pending

    # and surface its state clearly.

    return send_project_invitation(payload, authorization)
