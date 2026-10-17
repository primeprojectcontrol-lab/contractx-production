from __future__ import annotations

import asyncio
import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

from .base import AuthorizationRequired, ConnectorError
from .microsoft_auth import refresh_access_token
from .token_store import token_store


GRAPH_ROOT = "https://graph.microsoft.com/v1.0"


def _encode_ref(payload: dict[str, Any]) -> str:
    raw = json.dumps(
        payload,
        separators=(",", ":"),
    ).encode("utf-8")

    return (
        base64.urlsafe_b64encode(raw)
        .decode("ascii")
        .rstrip("=")
    )


def _decode_ref(item_id: str) -> dict[str, Any]:
    try:
        padding = "=" * (
            (4 - len(item_id) % 4) % 4
        )

        raw = base64.urlsafe_b64decode(
            item_id + padding
        ).decode("utf-8")

        value = json.loads(raw)

        if not isinstance(value, dict):
            raise ValueError("not an object")

        return value

    except Exception as exc:
        raise ConnectorError(
            "Invalid Microsoft Graph item identifier."
        ) from exc


class MicrosoftGraphConnector:
    """
    Read-only Microsoft Graph connector for ContractX.

    Supported source types:
    - onedrive
    - sharepoint

    OAuth tokens remain server-side in token_store.
    """

    def __init__(
        self,
        *,
        source_id: str,
        source_type: str,
    ) -> None:
        self.source_id = str(source_id)
        self.source_type = str(
            source_type
        ).lower()

        if self.source_type not in {
            "onedrive",
            "sharepoint",
        }:
            raise ConnectorError(
                "MicrosoftGraphConnector supports only OneDrive and SharePoint."
            )

    async def _access_token(self) -> str:
        record = token_store.get(
            self.source_id
        )

        if not record:
            raise AuthorizationRequired(
                "Microsoft authorization is required. Click Connect / Authorize first."
            )

        if token_store.is_expiring(
            self.source_id
        ):
            if not record.refresh_token:
                raise AuthorizationRequired(
                    "Microsoft authorization expired. Reconnect the source."
                )

            refreshed = await asyncio.to_thread(
                refresh_access_token,
                record.refresh_token,
            )

            token_store.set(
                self.source_id,
                access_token=refreshed["access_token"],
                refresh_token=(
                    refreshed.get("refresh_token")
                    or record.refresh_token
                ),
                expires_in=int(
                    refreshed.get(
                        "expires_in",
                        3600,
                    )
                ),
                scope=str(
                    refreshed.get("scope")
                    or record.scope
                ),
                token_type=str(
                    refreshed.get("token_type")
                    or "Bearer"
                ),
            )

            record = token_store.get(
                self.source_id
            )

        if not record:
            raise AuthorizationRequired(
                "Microsoft authorization is unavailable."
            )

        return record.access_token

    async def _request_json(
        self,
        path_or_url: str,
    ) -> dict[str, Any]:
        token = await self._access_token()

        url = (
            path_or_url
            if path_or_url.startswith("https://")
            else GRAPH_ROOT + path_or_url
        )

        def do_request() -> dict[str, Any]:
            request = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
                method="GET",
            )

            try:
                with urllib.request.urlopen(
                    request,
                    timeout=30,
                ) as response:
                    raw = response.read().decode(
                        "utf-8"
                    )

            except urllib.error.HTTPError as exc:
                body = exc.read().decode(
                    "utf-8",
                    errors="ignore",
                )

                if exc.code in {
                    401,
                    403,
                }:
                    raise AuthorizationRequired(
                        f"Microsoft Graph access denied ({exc.code}): {body[:800]}"
                    ) from exc

                raise ConnectorError(
                    f"Microsoft Graph request failed ({exc.code}): {body[:800]}"
                ) from exc

            except Exception as exc:
                raise ConnectorError(
                    "Unable to reach Microsoft Graph."
                ) from exc

            try:
                return json.loads(raw)
            except Exception as exc:
                raise ConnectorError(
                    "Microsoft Graph returned an invalid JSON response."
                ) from exc

        return await asyncio.to_thread(
            do_request
        )

    async def _request_bytes(
        self,
        path_or_url: str,
    ) -> bytes:
        token = await self._access_token()

        url = (
            path_or_url
            if path_or_url.startswith("https://")
            else GRAPH_ROOT + path_or_url
        )

        def do_request() -> bytes:
            request = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                },
                method="GET",
            )

            try:
                with urllib.request.urlopen(
                    request,
                    timeout=90,
                ) as response:
                    return response.read()

            except urllib.error.HTTPError as exc:
                body = exc.read().decode(
                    "utf-8",
                    errors="ignore",
                )

                if exc.code in {
                    401,
                    403,
                }:
                    raise AuthorizationRequired(
                        f"Microsoft Graph file access denied ({exc.code}): {body[:800]}"
                    ) from exc

                raise ConnectorError(
                    f"Microsoft Graph file download failed ({exc.code}): {body[:800]}"
                ) from exc

            except Exception as exc:
                raise ConnectorError(
                    "Unable to download file content from Microsoft Graph."
                ) from exc

        return await asyncio.to_thread(
            do_request
        )

    async def test_connection(
        self,
    ) -> dict[str, Any]:
        profile = await self._request_json(
            "/me?$select=id,displayName,userPrincipalName"
        )

        if self.source_type == "onedrive":
            drive = await self._request_json(
                "/me/drive?$select=id,driveType,name,webUrl"
            )

            return {
                "connected": True,
                "provider": "microsoft_graph",
                "source_type": self.source_type,
                "source_id": self.source_id,
                "user": {
                    "id": profile.get("id"),
                    "display_name": profile.get("displayName"),
                    "user_principal_name": profile.get("userPrincipalName"),
                },
                "drive": {
                    "id": drive.get("id"),
                    "name": drive.get("name"),
                    "drive_type": drive.get("driveType"),
                    "web_url": drive.get("webUrl"),
                },
                "access_mode": "read_only",
            }

        # SharePoint verification:
        sites = await self._request_json(
            "/sites?search=*&$select=id,name,displayName,webUrl&$top=5"
        )

        return {
            "connected": True,
            "provider": "microsoft_graph",
            "source_type": self.source_type,
            "source_id": self.source_id,
            "user": {
                "id": profile.get("id"),
                "display_name": profile.get("displayName"),
                "user_principal_name": profile.get("userPrincipalName"),
            },
            "site_count_sample": len(
                sites.get("value") or []
            ),
            "access_mode": "read_only",
        }

    async def _onedrive_root_items(
        self,
    ) -> list[dict[str, Any]]:
        data = await self._request_json(
            "/me/drive/root/children?"
            "$select=id,name,size,webUrl,eTag,lastModifiedDateTime,file,folder,parentReference"
            "&$top=200"
        )

        return [
            self._normalise_drive_item(item)
            for item in data.get("value") or []
        ]

    async def _sharepoint_sites(
        self,
    ) -> list[dict[str, Any]]:
        data = await self._request_json(
            "/sites?search=*&"
            "$select=id,name,displayName,webUrl&$top=100"
        )

        results: list[dict[str, Any]] = []

        for site in data.get("value") or []:
            site_id = str(
                site.get("id")
                or ""
            )

            if not site_id:
                continue

            results.append(
                {
                    "id": _encode_ref(
                        {
                            "kind": "site",
                            "site_id": site_id,
                        }
                    ),
                    "name": (
                        site.get("displayName")
                        or site.get("name")
                        or "SharePoint Site"
                    ),
                    "kind": "folder",
                    "web_url": site.get("webUrl"),
                    "size": None,
                    "mime_type": None,
                    "parent_path": "",
                    "etag": None,
                    "last_modified_at": None,
                    "source_type": "sharepoint",
                    "relative_path": (
                        site.get("webUrl")
                        or site.get("displayName")
                        or site.get("name")
                        or site_id
                    ),
                }
            )

        return results

    async def _site_root_items(
        self,
        *,
        site_id: str,
    ) -> list[dict[str, Any]]:
        drive = await self._request_json(
            f"/sites/{urllib.parse.quote(site_id, safe=',')}/drive?"
            "$select=id,name,webUrl,driveType"
        )

        drive_id = str(
            drive.get("id")
            or ""
        )

        if not drive_id:
            raise ConnectorError(
                "SharePoint site does not expose a default document library."
            )

        data = await self._request_json(
            f"/drives/{urllib.parse.quote(drive_id, safe='')}/root/children?"
            "$select=id,name,size,webUrl,eTag,lastModifiedDateTime,file,folder,parentReference"
            "&$top=200"
        )

        return [
            self._normalise_drive_item(
                item,
                explicit_drive_id=drive_id,
            )
            for item in data.get("value") or []
        ]

    async def _drive_children(
        self,
        *,
        drive_id: str,
        item_id: str,
    ) -> list[dict[str, Any]]:
        data = await self._request_json(
            f"/drives/{urllib.parse.quote(drive_id, safe='')}"
            f"/items/{urllib.parse.quote(item_id, safe='')}/children?"
            "$select=id,name,size,webUrl,eTag,lastModifiedDateTime,file,folder,parentReference"
            "&$top=200"
        )

        return [
            self._normalise_drive_item(
                item,
                explicit_drive_id=drive_id,
            )
            for item in data.get("value") or []
        ]

    def _normalise_drive_item(
        self,
        item: dict[str, Any],
        *,
        explicit_drive_id: Optional[str] = None,
    ) -> dict[str, Any]:
        parent_reference = (
            item.get("parentReference")
            or {}
        )

        drive_id = str(
            explicit_drive_id
            or parent_reference.get("driveId")
            or ""
        )

        item_id = str(
            item.get("id")
            or ""
        )

        kind = (
            "folder"
            if item.get("folder") is not None
            else "file"
        )

        name = str(
            item.get("name")
            or "Microsoft item"
        )

        parent_path = str(
            parent_reference.get("path")
            or ""
        )

        ref = {
            "kind": "drive_item",
            "drive_id": drive_id,
            "item_id": item_id,
            "name": name,
        }

        return {
            "id": _encode_ref(ref),
            "name": name,
            "kind": kind,
            "web_url": item.get("webUrl"),
            "size": item.get("size"),
            "mime_type": (
                (item.get("file") or {})
                .get("mimeType")
            ),
            "parent_path": parent_path,
            "etag": item.get("eTag"),
            "last_modified_at": item.get("lastModifiedDateTime"),
            "source_type": self.source_type,
            "relative_path": (
                f"{parent_path}/{name}"
                if parent_path
                else name
            ),
        }

    async def list_items(
        self,
        parent_item_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        if not parent_item_id:
            if self.source_type == "onedrive":
                return await self._onedrive_root_items()

            return await self._sharepoint_sites()

        ref = _decode_ref(
            parent_item_id
        )

        if ref.get("kind") == "site":
            return await self._site_root_items(
                site_id=str(
                    ref.get("site_id")
                    or ""
                )
            )

        if ref.get("kind") == "drive_item":
            drive_id = str(
                ref.get("drive_id")
                or ""
            )
            item_id = str(
                ref.get("item_id")
                or ""
            )

            if not drive_id or not item_id:
                raise ConnectorError(
                    "Microsoft Graph item reference is incomplete."
                )

            return await self._drive_children(
                drive_id=drive_id,
                item_id=item_id,
            )

        raise ConnectorError(
            "Unsupported Microsoft Graph browse reference."
        )

    async def get_metadata(
        self,
        item_id: str,
    ) -> dict[str, Any]:
        ref = _decode_ref(
            item_id
        )

        if ref.get("kind") == "site":
            site_id = str(
                ref.get("site_id")
                or ""
            )

            site = await self._request_json(
                f"/sites/{urllib.parse.quote(site_id, safe=',')}?"
                "$select=id,name,displayName,webUrl"
            )

            return {
                "id": item_id,
                "name": (
                    site.get("displayName")
                    or site.get("name")
                    or "SharePoint Site"
                ),
                "kind": "folder",
                "web_url": site.get("webUrl"),
                "size": None,
                "mime_type": None,
                "parent_path": "",
                "etag": None,
                "last_modified_at": None,
                "relative_path": (
                    site.get("webUrl")
                    or site_id
                ),
                "source_type": "sharepoint",
            }

        if ref.get("kind") != "drive_item":
            raise ConnectorError(
                "Unsupported Microsoft Graph item reference."
            )

        drive_id = str(
            ref.get("drive_id")
            or ""
        )
        graph_item_id = str(
            ref.get("item_id")
            or ""
        )

        if not drive_id or not graph_item_id:
            raise ConnectorError(
                "Microsoft Graph item reference is incomplete."
            )

        data = await self._request_json(
            f"/drives/{urllib.parse.quote(drive_id, safe='')}"
            f"/items/{urllib.parse.quote(graph_item_id, safe='')}?"
            "$select=id,name,size,webUrl,eTag,lastModifiedDateTime,file,folder,parentReference"
        )

        result = self._normalise_drive_item(
            data,
            explicit_drive_id=drive_id,
        )

        # Preserve ContractX's encoded item id.
        result["id"] = item_id

        return result

    async def fetch_content(
        self,
        item_id: str,
    ) -> bytes:
        ref = _decode_ref(
            item_id
        )

        if ref.get("kind") != "drive_item":
            raise ConnectorError(
                "Only Microsoft files can be fetched."
            )

        drive_id = str(
            ref.get("drive_id")
            or ""
        )
        graph_item_id = str(
            ref.get("item_id")
            or ""
        )

        if not drive_id or not graph_item_id:
            raise ConnectorError(
                "Microsoft Graph file reference is incomplete."
            )

        metadata = await self.get_metadata(
            item_id
        )

        if metadata.get("kind") != "file":
            raise ConnectorError(
                "Selected Microsoft item is a folder, not a file."
            )

        return await self._request_bytes(
            f"/drives/{urllib.parse.quote(drive_id, safe='')}"
            f"/items/{urllib.parse.quote(graph_item_id, safe='')}/content"
        )
