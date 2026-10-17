from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID


class EvidenceGraphService:
    """
    Thin deterministic persistence layer for the ContractX Evidence Graph.

    AI may propose nodes/edges later, but persistence should preserve provenance.
    """

    def __init__(self, db):
        self.db = db

    def create_node(
        self,
        *,
        tenant_id: str,
        project_id: str,
        node_type: str,
        title: str,
        source_document_id: Optional[str] = None,
        source_ref: Optional[str] = None,
        event_date: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        provenance: Optional[Dict[str, Any]] = None,
        confidence: Optional[float] = None,
    ) -> Dict[str, Any]:
        row = {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "node_type": node_type,
            "title": title,
            "source_document_id": source_document_id,
            "source_ref": source_ref,
            "event_date": event_date,
            "payload": payload or {},
            "provenance": provenance or {},
            "confidence": confidence,
        }

        result = (
            self.db.table("evidence_nodes")
            .insert(row)
            .execute()
        )

        return result.data[0] if result.data else row

    def create_edge(
        self,
        *,
        tenant_id: str,
        project_id: str,
        from_node_id: str,
        to_node_id: str,
        edge_type: str,
        payload: Optional[Dict[str, Any]] = None,
        provenance: Optional[Dict[str, Any]] = None,
        confidence: Optional[float] = None,
    ) -> Dict[str, Any]:
        if from_node_id == to_node_id:
            raise ValueError("Evidence edges cannot self-reference.")

        row = {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "from_node_id": from_node_id,
            "to_node_id": to_node_id,
            "edge_type": edge_type,
            "payload": payload or {},
            "provenance": provenance or {},
            "confidence": confidence,
        }

        result = (
            self.db.table("evidence_edges")
            .insert(row)
            .execute()
        )

        return result.data[0] if result.data else row

    def project_graph(
        self,
        *,
        tenant_id: str,
        project_id: str,
    ) -> Dict[str, List[Dict[str, Any]]]:
        nodes = (
            self.db.table("evidence_nodes")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .execute()
        )

        edges = (
            self.db.table("evidence_edges")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .execute()
        )

        return {
            "nodes": nodes.data or [],
            "edges": edges.data or [],
        }
