# app/services/risk_decision_service.py

from datetime import datetime, date
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

class RiskScoreInput(BaseModel):
    event_date: Optional[date] = None
    notice_given_date: Optional[date] = None
    notice_time_bar_days: int = 28
    financial_claim_usd: float = 0.0
    contract_value_usd: float = 0.0
    time_extension_requested_days: int = 0
    missing_evidence_count: int = 0
    is_client_admission: bool = False

class RiskAssessmentResult(BaseModel):
    total_risk_score: int
    risk_classification: str
    breakdown: Dict[str, int]
    triggered_rules: List[str]
    required_action: str
    recommended_next_step: str

def calculate_deterministic_risk(input_data: RiskScoreInput) -> RiskAssessmentResult:
    """
    Calculates deterministic risk using strict formula:
    RISK SCORE = Severity + Notice Exposure + Financial Exposure + Time Exposure + Evidence Deficiency
    """
    severity_score = 10
    notice_exposure_score = 0
    financial_exposure_score = 0
    time_exposure_score = 0
    evidence_deficiency_score = 0
    triggered_rules = []

    # 1. Notice Exposure Calculation (Max 30 Pts)
    if input_data.event_date:
        today = date.today()
        elapsed_days = (today - input_data.event_date).days
        
        if input_data.notice_given_date:
            notice_delay = (input_data.notice_given_date - input_data.event_date).days
            if notice_delay > input_data.notice_time_bar_days:
                notice_exposure_score = 30
                triggered_rules.append(f"TIME_BAR_EXCEEDED: Notice given {notice_delay} days after event (Limit: {input_data.notice_time_bar_days} days).")
            else:
                notice_exposure_score = 5
        else:
            if elapsed_days > input_data.notice_time_bar_days:
                notice_exposure_score = 30
                triggered_rules.append(f"TIME_BAR_LAPSED: No notice submitted and {elapsed_days} days elapsed since event.")
            elif elapsed_days > (input_data.notice_time_bar_days - 7):
                notice_exposure_score = 20
                triggered_rules.append(f"TIME_BAR_URGENT: Only {input_data.notice_time_bar_days - elapsed_days} days remaining to submit formal notice.")

    # 2. Financial Exposure Calculation (Max 20 Pts)
    if input_data.contract_value_usd > 0 and input_data.financial_claim_usd > 0:
        claim_ratio = input_data.financial_claim_usd / input_data.contract_value_usd
        if claim_ratio > 0.05:  # > 5% of Contract Value
            financial_exposure_score = 20
            triggered_rules.append("FINANCIAL_EXPOSURE_HIGH: Claim value exceeds 5% of total contract value.")
        elif claim_ratio > 0.01:
            financial_exposure_score = 10

    # 3. Time Exposure Calculation (Max 15 Pts)
    if input_data.time_extension_requested_days > 30:
        time_exposure_score = 15
        triggered_rules.append("TIME_EXPOSURE_CRITICAL: Delay impact exceeds 30 calendar days.")
    elif input_data.time_extension_requested_days > 7:
        time_exposure_score = 8

    # 4. Evidence Deficiency Calculation (Max 10 Pts)
    if input_data.missing_evidence_count > 2:
        evidence_deficiency_score = 10
        triggered_rules.append("EVIDENCE_DEFICIENCY: Critical lack of supporting contemporary records in Project Vault.")
    elif input_data.missing_evidence_count > 0:
        evidence_deficiency_score = 5

    # Total Score Calculation
    total_score = min(100, severity_score + notice_exposure_score + financial_exposure_score + time_exposure_score + evidence_deficiency_score)

    # Classification Matrix
    if total_score >= 70:
        classification = "CRITICAL"
        action = "Immediate executive escalation required. Prepare EOT notice and verify contemporaneous records."
        next_step = "Draft and issue formal Notice of Claim to prevent time-bar forfeiture."
    elif total_score >= 45:
        classification = "HIGH"
        action = "Review contemporary site logs, consultant correspondence, and program revisions."
        next_step = "Consolidate delay evidence and issue formal clarification letter to Client."
    elif total_score >= 25:
        classification = "MEDIUM"
        action = "Log event in Monthly Delay Register and monitor progress."
        next_step = "Track impact in weekly site meeting minutes."
    else:
        classification = "LOW"
        action = "Standard contract administration tracking."
        next_step = "Archive record in Project Vault."

    return RiskAssessmentResult(
        total_risk_score=total_score,
        risk_classification=classification,
        breakdown={
            "severity": severity_score,
            "notice_exposure": notice_exposure_score,
            "financial_exposure": financial_exposure_score,
            "time_exposure": time_exposure_score,
            "evidence_deficiency": evidence_deficiency_score
        },
        triggered_rules=triggered_rules,
        required_action=action,
        recommended_next_step=next_step
    )