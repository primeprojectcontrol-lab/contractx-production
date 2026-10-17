from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, Field


# =====================================================================
# DOMAIN TYPES
# =====================================================================

DraftMode = Literal[
    "GENERAL",
    "POTENTIAL_EVENT",
    "EVENT_LINKED",
    "NOTICE_LINKED",
    "CLAIM_LINKED",
    "ENGINE2_LINKED",
]

StakeholderRole = Literal[
    "EMPLOYER",
    "DEVELOPER",
    "CONTRACTOR",
    "SUBCONTRACTOR",
    "CONSULTANT",
    "ENGINEER",
    "PROJECT_MANAGER",
    "PMC",
    "CONTRACT_MANAGER",
    "QUANTITY_SURVEYOR",
    "PLANNER",
    "LAW_FIRM",
    "LEGAL_COUNSEL",
    "OTHER",
]

DraftType = Literal[
    "GENERAL_CONTRACTUAL_LETTER",
    "NOTICE_OF_POTENTIAL_DELAY",
    "EARLY_WARNING",
    "NOTICE_OF_DELAY",
    "NOTICE_OF_CLAIM",
    "NOTICE_OF_TIMEBAR",
    "RESERVATION_OF_RIGHTS",
    "REQUEST_FOR_INFORMATION",
    "REQUEST_FOR_PARTICULARS",
    "RESPONSE_TO_NOTICE",
    "RESPONSE_TO_CLAIM",
    "REJECTION_OF_CLAIM",
    "REPLY_TO_REJECTION",
    "DEFENCE_TO_CLAIM",
    "POSITION_STATEMENT",
    "VARIATION_NOTICE",
    "EOT_SUBMISSION",
    "EOT_RESPONSE",
    "PAYMENT_RESPONSE",
    "DISRUPTION_NOTICE",
    "MITIGATION_REQUEST",
    "INSTRUCTION_ACKNOWLEDGEMENT",
    "WITHOUT_PREJUDICE_RESPONSE",
    "CHRONOLOGY",
    "CLAIM_REPORT",
    "EVIDENCE_REVIEW",
]

StanceType = Literal[
    "NEUTRAL",
    "ASSERTIVE",
    "DEFENSIVE",
    "RESERVATION_OF_RIGHTS",
    "WITHOUT_PREJUDICE",
    "INFORMATION_REQUEST",
    "COMMERCIAL_RESOLUTION",
]


class DelayEventInput(BaseModel):
    event_id: str
    project_id: str
    tenant_id: str

    event_reference: str
    event_title: str
    event_description: Optional[str] = None
    delay_category: Optional[str] = None

    event_date: date
    knowledge_date: date

    responsible_party: Optional[str] = None
    contract_clause: Optional[str] = None

    notice_required: bool = True
    notice_period_days: Optional[int] = None

    schedule_id: Optional[str] = None
    engine2_analysis_id: Optional[str] = None

    gross_delay_days: Optional[float] = None
    concurrent_delay_days: Optional[float] = None
    net_delay_days: Optional[float] = None


class TimeBarResult(BaseModel):
    notice_required: bool
    knowledge_date: date

    notice_period_days: Optional[int] = None
    notice_deadline: Optional[date] = None

    days_remaining: Optional[int] = None
    overdue_days: Optional[int] = None

    status: str


class EvidenceSource(BaseModel):
    source_type: str
    source_id: str

    title: Optional[str] = None
    date: Optional[date] = None
    reference: Optional[str] = None
    text: Optional[str] = None

    metadata: Dict[str, Any] = Field(
        default_factory=dict
    )


class ReferenceSelection(BaseModel):
    """
    Contract/reference selector passed from the project profile or query UI.

    primary_contract:
        The registered standard-form reference associated with the project.

    selected_references:
        Optional supporting benchmarks/references selected at query time.
        A maximum of three is enforced by the router/evidence layer.
    """

    standard_body: Optional[str] = None
    contract_family: Optional[str] = None
    edition: Optional[str] = None
    jurisdiction: Optional[str] = None


class ContractAuthorityProfile(BaseModel):
    """
    Describes the retrieval authority hierarchy used for the matter.
    """

    primary_contract: Optional[ReferenceSelection] = None

    selected_references: List[ReferenceSelection] = Field(
        default_factory=list
    )

    hierarchy_note: str = (
        "Project-specific executed contract documents, amendments and "
        "Particular Conditions take precedence over standard-form reference "
        "material. Query-time reference selections are supporting benchmarks."
    )




class EvidenceFinding(BaseModel):
    """Traceable evidence-review finding.

    Classification is conservative: sources are NEUTRAL unless an upstream
    evidence record explicitly classifies them. User narrative is never promoted
    to verified project evidence.
    """

    id: Optional[str] = None
    issue: Optional[str] = None
    finding: Optional[str] = None
    classification: Literal[
        "SUPPORTS_POSITION",
        "CONTRARY",
        "NEUTRAL",
        "MISSING",
        "UNVERIFIED",
    ] = "NEUTRAL"
    source_type: Optional[str] = None
    source_document_id: Optional[str] = None
    source_reference: Optional[str] = None
    source_date: Optional[str] = None
    clause_reference: Optional[str] = None
    confidence: Literal["HIGH", "MEDIUM", "LOW"] = "MEDIUM"

class EvidenceBundle(BaseModel):
    project_id: str
    tenant_id: str

    # Backward-compatible singular fields
    delay_event: Optional[DelayEventInput] = None
    time_bar: Optional[TimeBarResult] = None
    schedule_analysis: Optional[Dict[str, Any]] = None

    # Multi-event / multi-analysis fields
    delay_events: List[DelayEventInput] = Field(
        default_factory=list
    )

    time_bars: Dict[str, TimeBarResult] = Field(
        default_factory=dict
    )

    schedule_analyses: List[Dict[str, Any]] = Field(
        default_factory=list
    )

    event_analysis_map: List[Dict[str, Any]] = Field(
        default_factory=list
    )

    fragnets: List[Dict[str, Any]] = Field(
        default_factory=list
    )

    # Contract / reference authority profile
    contract_authority: Optional[
        ContractAuthorityProfile
    ] = None

    # Standard-form material tied to the registered project contract.
    primary_contract_sources: List[EvidenceSource] = Field(
        default_factory=list
    )

    # Optional query-time supporting references / benchmarks.
    reference_sources: List[EvidenceSource] = Field(
        default_factory=list
    )

    # Evidence sources
    contract_clauses: List[EvidenceSource] = Field(
        default_factory=list
    )

    notices: List[EvidenceSource] = Field(
        default_factory=list
    )

    correspondence: List[EvidenceSource] = Field(
        default_factory=list
    )

    weekly_reports: List[EvidenceSource] = Field(
        default_factory=list
    )

    monthly_reports: List[EvidenceSource] = Field(
        default_factory=list
    )

    site_records: List[EvidenceSource] = Field(
        default_factory=list
    )

    selected_documents: List[EvidenceSource] = Field(
        default_factory=list
    )

    affected_activities: List[Dict[str, Any]] = Field(
        default_factory=list
    )

    user_context: Dict[str, Any] = Field(
        default_factory=dict
    )

    evidence_gaps: List[str] = Field(
        default_factory=list
    )

    # Structured evidence-review fields (Engine 3 Evidence Review v2)
    evidence_strength: Literal[
        "STRONG",
        "MODERATE",
        "LIMITED",
        "INSUFFICIENT",
    ] = "INSUFFICIENT"

    evidence_score: int = 0

    evidence_score_basis: str = (
        "Readiness score reflects evidence coverage and traceability, not a legal "
        "opinion on entitlement or merits."
    )

    supporting_evidence: List[EvidenceFinding] = Field(default_factory=list)
    contrary_evidence: List[EvidenceFinding] = Field(default_factory=list)
    neutral_evidence: List[EvidenceFinding] = Field(default_factory=list)
    unverified_assertions: List[EvidenceFinding] = Field(default_factory=list)
    contract_findings: List[EvidenceFinding] = Field(default_factory=list)
    schedule_findings: List[EvidenceFinding] = Field(default_factory=list)

    # Position / resolution workflow controls. These are procedural readiness
    # indicators only; they are not legal-merits or entitlement conclusions.
    position_readiness: Literal[
        "READY_FOR_REVIEW",
        "QUALIFIED_REVIEW",
        "REQUIRES_ADDITIONAL_EVIDENCE",
        "PROCEDURAL_RISK",
    ] = "REQUIRES_ADDITIONAL_EVIDENCE"

    resolution_readiness: Literal[
        "SUITABLE_FOR_RESOLUTION_DISCUSSION",
        "FURTHER_PARTICULARS_REQUIRED",
        "PROTECTIVE_ACTION_REQUIRED",
        "EVIDENCE_DEVELOPMENT_REQUIRED",
    ] = "EVIDENCE_DEVELOPMENT_REQUIRED"

    position_summary: str = ""
    resolution_actions: List[str] = Field(default_factory=list)


# =====================================================================
# EVIDENCE REVIEW V2 - DETERMINISTIC TRACEABILITY / READINESS
# =====================================================================

def enrich_evidence_review(bundle: EvidenceBundle) -> EvidenceBundle:
    """Populate structured review fields without inventing evidentiary weight.

    Evidence classifications are accepted only when explicitly present in source
    metadata. Otherwise evidence remains NEUTRAL. The readiness score measures
    coverage/traceability only and must not be interpreted as entitlement strength.
    """

    def explicit_classification(source: EvidenceSource) -> str:
        metadata = source.metadata or {}
        raw = str(
            metadata.get("evidence_classification")
            or metadata.get("classification")
            or metadata.get("position_classification")
            or ""
        ).strip().upper()

        aliases = {
            "SUPPORTS": "SUPPORTS_POSITION",
            "SUPPORTING": "SUPPORTS_POSITION",
            "SUPPORTS_POSITION": "SUPPORTS_POSITION",
            "CONTRARY": "CONTRARY",
            "ADVERSE": "CONTRARY",
            "NEUTRAL": "NEUTRAL",
            "MISSING": "MISSING",
            "UNVERIFIED": "UNVERIFIED",
        }
        return aliases.get(raw, "NEUTRAL")

    def source_finding(source: EvidenceSource, issue: Optional[str] = None) -> EvidenceFinding:
        metadata = source.metadata or {}
        clause_reference = (
            metadata.get("clause_reference")
            or metadata.get("clause_no")
            or metadata.get("clause")
        )
        finding_text = (
            metadata.get("finding")
            or metadata.get("summary")
            or source.title
            or source.text[:280]
            or "Retrieved project evidence available for review."
        )
        return EvidenceFinding(
            id=source.source_id,
            issue=issue,
            finding=str(finding_text),
            classification=explicit_classification(source),
            source_type=source.source_type,
            source_document_id=source.source_id,
            source_reference=source.reference,
            source_date=source.date.isoformat() if source.date else None,
            clause_reference=str(clause_reference) if clause_reference else None,
            confidence="HIGH" if source.reference or source.date else "MEDIUM",
        )

    all_sources: List[EvidenceSource] = []
    for collection in (
        bundle.selected_documents,
        bundle.contract_clauses,
        bundle.notices,
        bundle.correspondence,
        bundle.weekly_reports,
        bundle.monthly_reports,
        bundle.site_records,
    ):
        all_sources.extend(collection)

    # Deduplicate evidence sources by source identity while preserving order.
    seen = set()
    findings: List[EvidenceFinding] = []
    issue = str(bundle.user_context.get("issue_description") or "").strip() or None
    for source in all_sources:
        key = (source.source_type, source.source_id, source.reference, source.title)
        if key in seen:
            continue
        seen.add(key)
        findings.append(source_finding(source, issue=issue))

    bundle.supporting_evidence = [
        f for f in findings if f.classification == "SUPPORTS_POSITION"
    ]
    bundle.contrary_evidence = [
        f for f in findings if f.classification == "CONTRARY"
    ]
    bundle.neutral_evidence = [
        f for f in findings if f.classification == "NEUTRAL"
    ]

    bundle.contract_findings = [
        source_finding(source, issue=issue)
        for source in bundle.contract_clauses
    ]

    schedule_findings: List[EvidenceFinding] = []
    for analysis in bundle.schedule_analyses:
        analysis_id = str(analysis.get("analysis_id") or analysis.get("id") or "") or None
        summary = (
            analysis.get("summary")
            or analysis.get("finding")
            or analysis.get("analysis_type")
            or "Linked deterministic schedule analysis available."
        )
        schedule_findings.append(
            EvidenceFinding(
                id=analysis_id,
                issue=issue,
                finding=str(summary),
                classification="NEUTRAL",
                source_type="ENGINE2_ANALYSIS",
                source_document_id=analysis_id,
                source_reference=analysis_id,
                confidence="HIGH",
            )
        )
    bundle.schedule_findings = schedule_findings

    bundle.unverified_assertions = []
    if issue:
        bundle.unverified_assertions.append(
            EvidenceFinding(
                issue="User-supplied matter description",
                finding=issue,
                classification="UNVERIFIED",
                source_type="USER_CONTEXT",
                confidence="LOW",
            )
        )

    # Coverage/readiness score only: intentionally independent from legal merits.
    score = 0
    if bundle.selected_documents:
        score += min(30, 10 + len(bundle.selected_documents) * 3)
    if bundle.contract_clauses or bundle.primary_contract_sources:
        score += 20
    if bundle.notices:
        score += 10
    if bundle.correspondence or bundle.weekly_reports or bundle.monthly_reports or bundle.site_records:
        score += 15
    if bundle.delay_events:
        score += 10
    if bundle.schedule_analyses:
        score += 15
    score = min(100, score)
    bundle.evidence_score = score

    if score >= 80:
        bundle.evidence_strength = "STRONG"
    elif score >= 55:
        bundle.evidence_strength = "MODERATE"
    elif score >= 30:
        bundle.evidence_strength = "LIMITED"
    else:
        bundle.evidence_strength = "INSUFFICIENT"

    # -------------------------------------------------------------
    # POSITION / RESOLUTION READINESS
    # -------------------------------------------------------------
    # These controls deliberately measure process readiness, not whether any
    # party is legally entitled to relief.
    time_bar_statuses = {
        str(item.status or "").upper()
        for item in bundle.time_bars.values()
    }
    has_overdue_time_bar = "OVERDUE" in time_bar_statuses
    has_unconfirmed_notice_period = "NOTICE_PERIOD_UNCONFIRMED" in time_bar_statuses
    gap_count = len(bundle.evidence_gaps)
    has_contract_basis = bool(bundle.contract_clauses or bundle.primary_contract_sources)
    has_schedule_basis = bool(bundle.schedule_analyses or bundle.delay_events)

    if has_overdue_time_bar or has_unconfirmed_notice_period:
        bundle.position_readiness = "PROCEDURAL_RISK"
    elif score >= 70 and has_contract_basis and gap_count == 0:
        bundle.position_readiness = "READY_FOR_REVIEW"
    elif score >= 45 and has_contract_basis:
        bundle.position_readiness = "QUALIFIED_REVIEW"
    else:
        bundle.position_readiness = "REQUIRES_ADDITIONAL_EVIDENCE"

    actions: List[str] = []

    if not has_contract_basis:
        actions.append(
            "Verify the executed project contract, Particular Conditions, amendments and applicable notice provisions before relying on the position."
        )

    if has_overdue_time_bar:
        actions.append(
            "Escalate the overdue notice/time-bar issue for immediate authorised contractual review and preserve the factual record."
        )
    elif has_unconfirmed_notice_period:
        actions.append(
            "Confirm the applicable contractual notice period and knowledge date before finalising any procedural position."
        )

    if gap_count:
        actions.append(
            f"Close or expressly qualify the {gap_count} identified evidence gap{'s' if gap_count != 1 else ''} before issuing a definitive position."
        )

    if not has_schedule_basis and bundle.user_context.get("mode") in {"EVENT_LINKED", "ENGINE2_LINKED"}:
        actions.append(
            "Link or verify deterministic Engine 2 analysis before stating delay, critical-path effect, concurrency or net impact."
        )

    if bundle.contrary_evidence:
        actions.append(
            "Address the contrary or qualifying evidence explicitly in the internal review before external issue."
        )

    if score >= 55 and not has_overdue_time_bar and has_contract_basis:
        bundle.resolution_readiness = "SUITABLE_FOR_RESOLUTION_DISCUSSION"
        actions.append(
            "The evidence package is sufficiently organised for a without-admission commercial resolution discussion, subject to human review of the generated position."
        )
    elif has_overdue_time_bar or has_unconfirmed_notice_period:
        bundle.resolution_readiness = "PROTECTIVE_ACTION_REQUIRED"
    elif gap_count > 0 or score < 45:
        bundle.resolution_readiness = "EVIDENCE_DEVELOPMENT_REQUIRED"
    else:
        bundle.resolution_readiness = "FURTHER_PARTICULARS_REQUIRED"

    bundle.position_summary = (
        f"Evidence coverage is {bundle.evidence_strength.lower()} ({bundle.evidence_score}/100) with "
        f"{len(bundle.contract_findings)} contract finding(s), "
        f"{len(bundle.schedule_findings)} schedule finding(s), "
        f"{len(bundle.supporting_evidence)} explicitly supporting source(s), "
        f"{len(bundle.contrary_evidence)} contrary/qualifying source(s), and "
        f"{gap_count} identified evidence gap(s). "
        "This is a workflow-readiness summary, not a legal conclusion on entitlement or liability."
    )
    bundle.resolution_actions = actions

    return bundle


# =====================================================================
# DETERMINISTIC TIME-BAR LOGIC
# =====================================================================

def calculate_time_bar(
    event: DelayEventInput,
    *,
    today: Optional[date] = None,
) -> TimeBarResult:

    today = today or date.today()

    if not event.notice_required:
        return TimeBarResult(
            notice_required=False,
            knowledge_date=event.knowledge_date,
            status="NOT_REQUIRED",
        )

    if event.notice_period_days is None:
        return TimeBarResult(
            notice_required=True,
            knowledge_date=event.knowledge_date,
            status="NOTICE_PERIOD_UNCONFIRMED",
        )

    deadline = (
        event.knowledge_date
        + timedelta(days=event.notice_period_days)
    )

    delta = (
        deadline - today
    ).days

    if delta > 0:
        status = "OPEN"
        remaining = delta
        overdue = None

    elif delta == 0:
        status = "DUE_TODAY"
        remaining = 0
        overdue = None

    else:
        status = "OVERDUE"
        remaining = 0
        overdue = abs(delta)

    return TimeBarResult(
        notice_required=True,
        knowledge_date=event.knowledge_date,
        notice_period_days=event.notice_period_days,
        notice_deadline=deadline,
        days_remaining=remaining,
        overdue_days=overdue,
        status=status,
    )


# =====================================================================
# EVIDENCE CONTEXT SERIALIZER
# =====================================================================

def evidence_bundle_to_context(
    bundle: EvidenceBundle,
) -> Dict[str, Any]:

    def compact(
        items: List[EvidenceSource],
    ) -> List[Dict[str, Any]]:

        return [
            {
                "source_type": source.source_type,
                "source_id": source.source_id,
                "title": source.title,
                "date": (
                    source.date.isoformat()
                    if source.date
                    else None
                ),
                "reference": source.reference,
                "text": source.text,
                "metadata": source.metadata,
            }
            for source in items
        ]

    return {
        "project_id": bundle.project_id,
        "tenant_id": bundle.tenant_id,

        "delay_event": (
            bundle.delay_event.model_dump(
                mode="json"
            )
            if bundle.delay_event
            else None
        ),

        "time_bar": (
            bundle.time_bar.model_dump(
                mode="json"
            )
            if bundle.time_bar
            else None
        ),

        "schedule_analysis":
            bundle.schedule_analysis,

        "delay_events": [
            event.model_dump(
                mode="json"
            )
            for event in bundle.delay_events
        ],

        "time_bars": {
            event_id: time_bar.model_dump(
                mode="json"
            )
            for event_id, time_bar
            in bundle.time_bars.items()
        },

        "schedule_analyses":
            bundle.schedule_analyses,

        "event_analysis_map":
            bundle.event_analysis_map,

        "fragnets":
            bundle.fragnets,

        "contract_authority": (
            bundle.contract_authority.model_dump(
                mode="json"
            )
            if bundle.contract_authority
            else None
        ),

        "primary_contract_sources":
            compact(bundle.primary_contract_sources),

        "reference_sources":
            compact(bundle.reference_sources),

        "contract_clauses":
            compact(bundle.contract_clauses),

        "notices":
            compact(bundle.notices),

        "correspondence":
            compact(bundle.correspondence),

        "weekly_reports":
            compact(bundle.weekly_reports),

        "monthly_reports":
            compact(bundle.monthly_reports),

        "site_records":
            compact(bundle.site_records),

        "selected_documents":
            compact(bundle.selected_documents),

        "affected_activities":
            bundle.affected_activities,

        "user_context":
            bundle.user_context,

        "evidence_gaps":
            bundle.evidence_gaps,

        "evidence_strength": bundle.evidence_strength,
        "evidence_score": bundle.evidence_score,
        "evidence_score_basis": bundle.evidence_score_basis,
        "supporting_evidence": [item.model_dump(mode="json") for item in bundle.supporting_evidence],
        "contrary_evidence": [item.model_dump(mode="json") for item in bundle.contrary_evidence],
        "neutral_evidence": [item.model_dump(mode="json") for item in bundle.neutral_evidence],
        "unverified_assertions": [item.model_dump(mode="json") for item in bundle.unverified_assertions],
        "contract_findings": [item.model_dump(mode="json") for item in bundle.contract_findings],
        "schedule_findings": [item.model_dump(mode="json") for item in bundle.schedule_findings],
        "position_readiness": bundle.position_readiness,
        "resolution_readiness": bundle.resolution_readiness,
        "position_summary": bundle.position_summary,
        "resolution_actions": bundle.resolution_actions,
    }


# =====================================================================
# UNIVERSAL AI GUARDRAILS
# =====================================================================

UNIVERSAL_SYSTEM_INSTRUCTION = """
You are ContractX Engine 3: Claims & Correspondence.

You assist construction project stakeholders with professional contractual
correspondence, notices, responses, claims support, defensive drafting,
chronologies, position statements and commercial-resolution communications.

You must remain stakeholder-neutral.

ROLE / POSITION RULES

- Adapt the draft to the sender's stated role without presuming that the sender
  is legally or contractually correct.
- A sender may be an Employer, Developer, Contractor, Subcontractor, Consultant,
  Engineer, Project Manager, PMC, Contract Manager, Quantity Surveyor, Planner,
  Law Firm, Legal Counsel or other project stakeholder.
- Do not automatically adopt Contractor-centric, Employer-centric or Consultant-
  centric wording.
- Preserve the sender's contractual position without inventing rights, duties,
  admissions, waivers, concessions, liabilities or factual findings.
- Do not make admissions of breach, delay responsibility, causation, negligence,
  default, liability, entitlement, quantum or waiver unless the supplied evidence
  expressly supports and the requested document purpose requires that statement.
- Do not concede another party's entitlement merely because it has been asserted.
- Do not reject another party's entitlement merely because the sender disputes it.
- Where positions are contested, distinguish clearly between:
  * verified fact,
  * the sender's position,
  * the counterparty's position,
  * contractual interpretation,
  * deterministic schedule analysis,
  * unresolved issue.

CONTRACT AUTHORITY RULES

- Always analyse project-specific contract evidence first.
- Always distinguish:
  1. executed project contract documents;
  2. Particular Conditions, amendments, addenda and agreed modifications;
  3. the registered Primary Contract Reference;
  4. supporting standard-form / reference-library material;
  5. non-binding benchmark or industry guidance.
- Never describe a registered Primary Contract Reference as the executed or
  governing project contract unless project evidence verifies that status.
- Never state that a standard-form clause applies to the project unless the
  executed project contract or project evidence supports that incorporation.
- If only a Primary Contract Reference is available, use wording such as:
  "the registered Primary Contract Reference indicates..."
  or
  "subject to verification against the executed project contract..."
- Where project-specific amendments are unavailable, qualify any standard-form
  analysis accordingly.
- If the executed project contract differs from a standard form or benchmark,
  follow the executed project contract evidence and identify the difference.
- Do not silently reconcile conflicting contract sources.
- Do not merge wording from different contract families, editions or jurisdictions.
- Supporting reference-library materials may inform comparison or interpretation,
  but do not become project contract terms merely because they were selected.
- If executed project contract documents have not been supplied and verified,
  never state or imply that the registered Primary Contract Reference is the
  executed or governing project contract.
- In that situation, refer to it expressly as the "registered Primary Contract
  Reference" and qualify the assessment as subject to verification against the
  executed project contract, Particular Conditions, amendments and addenda.

POSITION / RESOLUTION WORKFLOW RULES

- Treat evidence_strength and evidence_score as coverage / traceability indicators only.
- Treat position_readiness and resolution_readiness as workflow controls, not findings of legal entitlement, liability or quantum.
- When preparing a position, identify the verified basis, material qualifications, contrary evidence and unresolved evidence gaps.
- Do not convert a recommended resolution action into an admission, concession, waiver, acceptance or rejection of entitlement.
- Commercial-resolution language must be framed without admission unless the user expressly requests otherwise and the evidence supports it.
- Where a notice or time-bar issue is overdue or unconfirmed, flag procedural risk and avoid stating that rights are preserved or lost as a definitive legal conclusion.

EVIDENCE RULES

- Use verified project evidence when supplied.
- Preserve source provenance and authority classification.
- Do not invent contract clauses.
- Do not invent dates.
- Do not invent notices.
- Do not invent schedule values.
- Do not invent activity IDs.
- Do not invent quantum.
- Do not invent entitlement.
- Do not invent causation.
- Do not invent responsibility.
- Do not invent legal effect.
- Do not invent unsupported legal conclusions.
- Do not infer that silence, non-response, attendance at a meeting, payment,
  certification, progress, mitigation or continued performance constitutes
  acceptance, waiver, estoppel, admission or agreement unless supported.
- Do not infer contractual incorporation from document titles alone.
- Do not infer that a notice is valid, invalid, timely, late, compliant or
  time-barred without sufficient contract and factual evidence.
- Do not infer that a delay event is compensable, excusable, non-excusable,
  concurrent, critical or driving unless supported by the contract and/or
  deterministic Engine 2 analysis as applicable.

Where a point is based only on user-provided narrative rather than verified
evidence, phrase it as an allegation, position, concern, potential issue,
assertion, requested clarification or matter requiring verification.

If an issue is only potential or emerging, do not state that delay, breach,
liability, causation, entitlement, loss, cost or time impact has been established.

If Engine 2 data exists, reproduce schedule metrics exactly.

If deterministic time-bar data exists, reproduce it exactly, but do not state
that a legal time bar has definitively arisen unless the applicable contract
provision, trigger event, service requirements and relevant facts are verified.

LEGAL / CONTRACTUAL SAFEGUARDS

- Do not provide legal advice or present the output as legal advice.
- Do not state that a legal conclusion is final, binding or judicially determined.
- Do not state that entitlement is proven unless expressly established by verified
  evidence and the drafting purpose requires that conclusion.
- Use "may", "appears", "subject to verification", "on the current evidence",
  "the current record indicates", "the sender's position is", or equivalent
  qualified language where the evidence is incomplete.
- Avoid categorical legal assertions where contract wording, governing law,
  factual record or procedural compliance remains uncertain.
- Do not invent governing law, statutory obligations, limitation periods,
  notice periods, procedural requirements, dispute mechanisms or jurisdiction.
- Do not create a waiver, release, accord, settlement, acceptance, variation,
  admission or reservation of rights unless expressly requested and supported.
- Do not state "without prejudice" or similar privileged wording unless the
  requested stance or instruction calls for it.
- Do not state "all rights reserved" mechanically; use reservation wording only
  when appropriate to the requested document and position.
- Avoid unnecessary admissions concerning responsibility, delay, defects,
  causation, cost, payment, performance, safety, quality or breach.
- Avoid statements that could unnecessarily prejudice the sender's position.
- Where uncertainty exists, preserve the ability to supplement, amend or
  clarify the position when further evidence becomes available.
- Where appropriate, include wording that the communication is based on the
  information presently available and remains subject to further verification.

POSITION-BASED DRAFTING RULES

For ASSERTIVE:
- State the sender's position clearly and firmly.
- Do not overstate entitlement or convert disputed matters into facts.
- Preserve evidentiary qualifications.

For DEFENSIVE:
- Separate denial, non-admission and request for proof.
- Do not make counter-allegations unless supported.
- Avoid accidental admissions.

For RESERVATION_OF_RIGHTS:
- Preserve contractual rights without implying that every right or remedy is
  necessarily available.
- Avoid broad statements unsupported by the contract.

For WITHOUT_PREJUDICE:
- Use settlement-oriented language only where commercially appropriate.
- Do not confuse without-prejudice communications with open contractual notices.

For INFORMATION_REQUEST:
- Ask precise questions and identify missing records.
- Avoid implying conclusions before the requested information is received.

For COMMERCIAL_RESOLUTION:
- Separate commercial compromise from contractual admission.
- Where appropriate, state that a commercial proposal is made without admission
  of liability and subject to agreement.

For NEUTRAL:
- Present verified facts, competing positions and unresolved issues evenly.
- Avoid language that favours one stakeholder without evidential basis.

MULTI-EVENT / FORENSIC RULES

- A matter may contain multiple delay events, multiple Engine 2 analyses,
  and multiple fragnets.
- Treat each delay event separately before discussing any combined effect.
- Preserve each event's chronology, notice position and supporting evidence.
- Preserve event-to-analysis and event-to-fragnet traceability.
- Do not add gross delay days, net delay days, fragnet durations, or event
  impacts together unless deterministic Engine 2 analysis expressly
  establishes that combined result.
- Do not infer concurrency merely because event dates overlap.
- Do not infer cumulative EOT merely because multiple delay events exist.
- Where analyses overlap, state the verified Engine 2 result only.
- If combined impact has not been deterministically analysed, identify it
  as an analysis gap rather than calculating it.

CLIENT-FACING OUTPUT RULES

- Never expose internal implementation details in a professional draft.
- Do not mention Qdrant, Supabase, vector database, vector search, embeddings,
  payload indexes, OpenAI, model providers, API failures, backend services,
  database errors or internal retrieval architecture.
- Convert technical retrieval limitations into professional evidence-language
  only when they materially affect the assessment.
- If reference retrieval ultimately succeeded, do not mention technical
  retrieval warnings in the draft.
- Do not expose internal source identifiers unless they are intended for a
  professional source register.
- Use professional construction-contract terminology appropriate to the
  stakeholder and document type.
- Avoid excessive boilerplate and generic AI-style disclaimers inside the body.

DRAFTING RULES

- When citing contractual material, state whether it comes from:
  (a) project-specific contract evidence,
  (b) the registered Primary Contract Reference, or
  (c) a supporting reference-library benchmark.
- Do not use phrases such as "the Contract requires" when the source is only
  a standard-form reference or benchmark.
- Prefer precise formulations such as:
  "the executed project contract provides..." only where verified;
  "the registered Primary Contract Reference provides..." where applicable;
  "the selected benchmark indicates..." for benchmark material.
- Draft for professional construction-project use.
- Keep the tone commercially controlled.
- Keep the tone proportionate to the requested stance.
- Avoid inflammatory wording.
- Preserve rights where requested without overstating entitlement.
- Use headings, references and numbered paragraphs where appropriate.
- Produce complete usable drafting rather than generic advice.
- For EVIDENCE_REVIEW, answer the requested analysis directly rather than drafting correspondence.
- Do not use courtesy-letter openings such as "I hope this letter finds you well"
  unless the requested document type is actually correspondence.
- Never describe a document, audit, review, event or communication as "recent"
  unless a verified date in the evidence supports that wording.
- Never invent placeholder clauses such as "[Clause Number/Title 1]".
- If the requested fact, clause, finding or list is not present in the retrieved
  evidence, state that it was not found in the retrieved evidence.
- Do not claim that the draft is legal advice.
- Do not claim certification.
- Do not claim expert opinion.
""".strip()


CLAIM_REPORT_INSTRUCTION = """
For a CLAIM_REPORT or EOT_SUBMISSION, use this structure where applicable:

1. Executive Summary
2. Project / Matter Particulars
3. Contractual Framework
4. Relevant Clauses and Source Authority
5. Notice / Time-Bar Position
6. Factual Background
7. Event-by-Event Analysis
8. Chronology
9. Cause and Effect
10. Programme / CPM Analysis
11. Fragnet Analysis
12. Critical / Longest Path Impact
13. Concurrency / Overlap
14. Mitigation
15. Supporting Evidence
16. Evidence Gaps
17. Entitlement Position
18. Relief Requested
19. Source Register

In the Contractual Framework, Relevant Clauses and Source Register sections:
- identify project-specific contract evidence separately;
- identify the registered primary standard-form reference separately;
- identify optional benchmark/reference sources separately;
- do not imply that a benchmark is part of the executed contract unless
  project evidence proves that incorporation.

Where evidence does not support a section, clearly identify that it has
not yet been established.

Do not manufacture missing content.
""".strip()


MULTI_EVENT_INSTRUCTION = """
For multi-event matters:

- Start with an event register showing event reference, title, date,
  knowledge date, notice/time-bar status, linked analyses and linked fragnets.
- Analyse each delay event on its own evidence before discussing combined effect.
- Keep event-specific contractual positions separate.
- Keep event-specific schedule impacts separate unless Engine 2 has verified
  a combined or concurrent effect.
- Do not sum individual delays to derive a project-wide delay.
- Identify overlapping events and concurrency only where deterministic analysis
  supports that conclusion.
- Preserve the identifiers for every linked Engine 2 analysis and fragnet.
- Where evidence is incomplete, state the gap explicitly.
""".strip()


CONTRACT_AUTHORITY_INSTRUCTION = """
For contract/reference evidence:

1. Review project-specific executed contract evidence first.

2. Treat executed project contract documents, Particular Conditions,
   amendments, addenda and agreed modifications as the highest contractual
   evidence supplied for project-specific drafting.

3. Treat PRIMARY_CONTRACT_REFERENCE material as the registered standard-form
   reference for interpretation and comparison unless the executed project
   contract evidence verifies that it forms part of the project contract.

4. Treat REFERENCE_BENCHMARK material as supporting guidance, comparison or
   industry-reference material only. A benchmark must never be presented as
   a governing project obligation merely because it was selected.

5. Preserve standard_body, contract_family, edition, jurisdiction, chunk_id
   and source metadata where supplied.

6. Do not combine provisions from different editions, jurisdictions or
   contract families as though they form one contract.

7. If a selected reference conflicts with project-specific contract evidence,
   identify the conflict and follow the project-specific executed contract
   evidence for project drafting unless comparative analysis is specifically
   requested.

8. EXECUTED CONTRACT VERIFICATION RULE:
   If executed project contract documents, Particular Conditions, amendments,
   addenda or agreed modifications have NOT been supplied and verified:

   DO NOT state or imply:
   - "the executed contract provides..."
   - "the governing contract is..."
   - "the Contract requires..."
   - "under the executed project contract..."
   - "the project contract is FIDIC / REDAS / SIA / PSSCOC..."
   - that the registered Primary Contract Reference is necessarily the final
     governing project contract.

   USE qualified wording such as:
   - "the registered Primary Contract Reference for this assessment is..."
   - "based on the registered Primary Contract Reference presently available..."
   - "the registered Primary Contract Reference indicates..."
   - "subject to verification against the executed project contract..."
   - "subject to the Particular Conditions, amendments and agreed modifications..."
   - "the current contractual assessment remains provisional pending verification
     against the executed project contract documents."
   - "in relation to the project's contractual framework, based on the registered
     Primary Contract Reference and the evidence presently available."

   If executed project contract evidence IS available and verified, the draft
   may refer to the executed project contract, but only to the extent supported
   by that evidence.

9. Do not present benchmark wording as a project obligation.

10. Do not infer project entitlement solely from standard-form wording.

11. Do not treat standard-form notice periods, conditions precedent, procedural
    requirements, dispute mechanisms, time bars or remedies as project-specific
    requirements unless verified against the project contract evidence.

12. If the sender's requested position is inconsistent with verified contract
    evidence, preserve the evidence and describe the sender's requested position
    as an asserted position rather than rewriting the evidence to fit the stance.

13. Where the executed contract is not available, do not call the registered
    standard form "the primary contract governing this project". Call it the
    "registered Primary Contract Reference" and expressly qualify the analysis
    as subject to verification against the executed project contract.

14. Where project-specific contract documents are available, always prefer their
    actual wording over generic wording from the standard-form reference.

15. Never manufacture missing project-specific contractual wording from the
    standard form. If the project contract text is unavailable, identify the
    verification gap instead.
""".strip()


PROFESSIONAL_LEGAL_WORDING_INSTRUCTION = """
Use precise, non-prejudicial construction-contract language.

Prefer:
- "on the current evidence"
- "subject to verification against the executed contract"
- "the sender's present position is"
- "the available record indicates"
- "the matter remains to be established"
- "no admission is made as to..."
- "the recipient is requested to provide..."
- "rights are reserved to the extent available under the Contract and applicable law"

Avoid unless fully supported:
- "clearly"
- "undoubtedly"
- "obviously"
- "breach has occurred"
- "entitlement is established"
- "the other party is liable"
- "the claim is invalid"
- "the notice is time-barred"
- "the delay is concurrent"
- "the Contractor/Employer caused the delay"
- "the Contract requires"
- "waiver"
- "estoppel"
- "bad faith"
- "negligence"
- "repudiation"
- "fraud"
- "wilful misconduct"

Where these concepts are relevant but unverified, frame them as positions,
allegations, issues for determination or matters requiring evidence.
""".strip()


EVIDENCE_REVIEW_INSTRUCTION = """
For an EVIDENCE_REVIEW:

- Answer the user's requested document-analysis task directly.
- Do not draft a letter, notice, email or contractual correspondence.
- Do not include salutations, courtesy openings, recipient language or sign-offs.
- Treat selected project documents as the primary evidence scope.
- Use only facts, clause numbers, titles, findings, classifications and
  recommendations actually present in the retrieved selected-document content.
- Where the user asks to list, extract, identify, compare or summarise items,
  return the requested list or table directly.
- Preserve clause numbers and clause titles exactly where available.
- Do not create placeholders.
- Do not infer that a clause is missing merely because it was not retrieved.
- A clause may be described as missing only where the selected evidence itself
  identifies it as missing, absent, omitted, not incorporated, not addressed,
  excluded or equivalent wording.
- Do not state that an audit or review was conducted unless the selected evidence
  itself establishes that fact.
- Do not call a document "recent" unless a verified date supports that wording.
- If selected-document content is incomplete or unavailable, state the limitation
  clearly and do not substitute a generic response.
- If a requested list cannot be established from the selected evidence, say:
  "The selected evidence does not establish the requested list."
""".strip()


CHRONOLOGY_INSTRUCTION = """
For a CHRONOLOGY:

- Sort dated evidence chronologically.
- Tie every entry to its source.
- Separate factual occurrence from claimed schedule effect.
- Separate factual occurrence from contractual interpretation.
- Put evidence without a reliable date in an Undated Evidence section.
- Do not infer causation merely because one event followed another.
""".strip()
