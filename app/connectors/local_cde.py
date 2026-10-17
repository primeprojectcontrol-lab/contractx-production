from __future__ import annotations

import base64
import hashlib
import mimetypes
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .base import ConnectorError, ConnectorItem


def _encode_item_id(relative_path: str) -> str:
    raw = relative_path.encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_item_id(item_id: str) -> str:
    try:
        padding = "=" * ((4 - len(item_id) % 4) % 4)
        return base64.urlsafe_b64decode(item_id + padding).decode("utf-8")
    except Exception as exc:
        raise ConnectorError("Invalid Local CDE item identifier.") from exc


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except Exception as exc:
        raise ConnectorError(
            f"Unable to calculate file hash for '{path.name}'."
        ) from exc

    return digest.hexdigest()


class LocalCDEConnector:
    """
    Development-only, read-only filesystem connector.

    Root is supplied through:
        CONTRACTX_LOCAL_CDE_ROOT=C:\\ContractX-CDE-Test

    The connector never deletes or modifies files in the source folder.
    """

    source_type = "local_cde"

    def __init__(
        self,
        source_id: str,
        root_path: Optional[str] = None,
    ) -> None:
        self.source_id = source_id

        configured_root = (
            root_path
            or os.getenv("CONTRACTX_LOCAL_CDE_ROOT", "").strip()
        )

        if not configured_root:
            raise ConnectorError(
                "Local CDE root is not configured. "
                "Set CONTRACTX_LOCAL_CDE_ROOT in the backend environment."
            )

        try:
            self.root = Path(configured_root).expanduser().resolve()
        except Exception as exc:
            raise ConnectorError(
                "Unable to resolve the configured Local CDE root."
            ) from exc

    def _validate_root(self) -> None:
        if not self.root.exists():
            raise ConnectorError(
                f"Local CDE root does not exist: {self.root}"
            )

        if not self.root.is_dir():
            raise ConnectorError(
                f"Local CDE root is not a directory: {self.root}"
            )

    def _resolve_relative_path(self, relative_path: str) -> Path:
        try:
            resolved = (self.root / relative_path).resolve()
        except Exception as exc:
            raise ConnectorError(
                "Unable to resolve Local CDE item."
            ) from exc

        try:
            resolved.relative_to(self.root)
        except ValueError as exc:
            raise ConnectorError(
                "Local CDE path traversal blocked."
            ) from exc

        return resolved

    def _path_from_item_id(self, item_id: str) -> Path:
        return self._resolve_relative_path(
            _decode_item_id(item_id)
        )

    def _relative_path(self, path: Path) -> str:
        try:
            return path.relative_to(self.root).as_posix()
        except ValueError as exc:
            raise ConnectorError(
                "Local CDE item is outside the configured root."
            ) from exc

    async def test_connection(self) -> Dict[str, Any]:
        self._validate_root()

        try:
            children = list(self.root.iterdir())
        except PermissionError as exc:
            raise ConnectorError(
                "ContractX does not have permission to read the Local CDE folder."
            ) from exc
        except Exception as exc:
            raise ConnectorError(
                "Unable to access the Local CDE folder."
            ) from exc

        return {
            "connected": True,
            "source_type": self.source_type,
            "source_id": self.source_id,
            "root_name": self.root.name,
            "root_path": str(self.root),
            "root_folders": sum(1 for item in children if item.is_dir()),
            "root_files": sum(1 for item in children if item.is_file()),
            "access_mode": "read_only",
            "message": "Local CDE connection verified.",
        }

    async def list_items(
        self,
        parent_item_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        self._validate_root()

        parent = (
            self._path_from_item_id(parent_item_id)
            if parent_item_id
            else self.root
        )

        if not parent.exists():
            raise ConnectorError(
                "Requested Local CDE folder does not exist."
            )

        if not parent.is_dir():
            raise ConnectorError(
                "Requested Local CDE item is not a folder."
            )

        try:
            children = sorted(
                parent.iterdir(),
                key=lambda item: (
                    not item.is_dir(),
                    item.name.lower(),
                ),
            )
        except PermissionError as exc:
            raise ConnectorError(
                "ContractX does not have permission to browse this folder."
            ) from exc

        results: List[Dict[str, Any]] = []

        for child in children:
            if child.name in {"desktop.ini", ".DS_Store", "Thumbs.db"}:
                continue

            # Do not follow a symlink that escapes the configured root.
            try:
                resolved_child = child.resolve()
                resolved_child.relative_to(self.root)
            except Exception:
                continue

            relative_path = self._relative_path(resolved_child)

            try:
                stat = resolved_child.stat()
            except Exception:
                continue

            if resolved_child.is_dir():
                item = ConnectorItem(
                    id=_encode_item_id(relative_path),
                    name=resolved_child.name,
                    kind="folder",
                    parent_path=(
                        self._relative_path(parent)
                        if parent != self.root
                        else ""
                    ),
                    etag=f"local-dir-{stat.st_mtime_ns}",
                    last_modified_at=str(stat.st_mtime),
                )

            elif resolved_child.is_file():
                mime_type, _ = mimetypes.guess_type(resolved_child.name)

                item = ConnectorItem(
                    id=_encode_item_id(relative_path),
                    name=resolved_child.name,
                    kind="file",
                    size=stat.st_size,
                    mime_type=mime_type or "application/octet-stream",
                    parent_path=(
                        self._relative_path(parent)
                        if parent != self.root
                        else ""
                    ),
                    etag=(
                        f"local-file-{stat.st_mtime_ns}-{stat.st_size}"
                    ),
                    last_modified_at=str(stat.st_mtime),
                )

            else:
                continue

            result = item.to_dict()
            result["source_type"] = self.source_type
            result["relative_path"] = relative_path
            results.append(result)

        return results

    async def get_metadata(
        self,
        item_id: str,
    ) -> Dict[str, Any]:
        self._validate_root()

        path = self._path_from_item_id(item_id)

        if not path.exists():
            raise ConnectorError(
                "Local CDE item no longer exists."
            )

        relative_path = self._relative_path(path)
        stat = path.stat()

        if path.is_dir():
            return {
                "id": _encode_item_id(relative_path),
                "name": path.name,
                "kind": "folder",
                "type": "folder",
                "relative_path": relative_path,
                "external_path": relative_path,
                "size": None,
                "mime_type": None,
                "etag": f"local-dir-{stat.st_mtime_ns}",
                "last_modified_at": str(stat.st_mtime),
                "source_type": self.source_type,
            }

        mime_type, _ = mimetypes.guess_type(path.name)

        return {
            "id": _encode_item_id(relative_path),
            "name": path.name,
            "kind": "file",
            "type": "file",
            "relative_path": relative_path,
            "external_path": relative_path,
            "size": stat.st_size,
            "mime_type": mime_type or "application/octet-stream",
            "etag": f"local-file-{stat.st_mtime_ns}-{stat.st_size}",
            "last_modified_at": str(stat.st_mtime),
            "file_hash": _sha256_file(path),
            "file_extension": path.suffix.lower().lstrip("."),
            "source_type": self.source_type,
        }

    async def fetch_content(
        self,
        item_id: str,
    ) -> bytes:
        self._validate_root()

        path = self._path_from_item_id(item_id)

        if not path.exists():
            raise ConnectorError(
                "Local CDE file no longer exists."
            )

        if not path.is_file():
            raise ConnectorError(
                "Folder content cannot be fetched as a file."
            )

        try:
            return path.read_bytes()
        except PermissionError as exc:
            raise ConnectorError(
                "ContractX does not have permission to read this Local CDE file."
            ) from exc
        except Exception as exc:
            raise ConnectorError(
                f"Unable to read Local CDE file '{path.name}'."
            ) from exc
