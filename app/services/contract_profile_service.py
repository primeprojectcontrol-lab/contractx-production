import sys
import json
from pathlib import Path
from typing import Dict, Any
from pydantic import BaseModel, Field

# --- MODULE PATH RESOLUTION FIX ---
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Import initialized clients from retrieval_engine
from app.retrieval_engine import openai_client, supabase_client


class ContractProfileSchema(BaseModel):
    contract_type: str = Field(..., description="e.g., FIDIC Red Book 1999, PSSCOC 2020")
    governing_law: str = Field(..., description="e.g., UAE Law, Singapore SOP Act")
    employer_name: str
    contractor_name: str
    engineer_name: str
    contract_value_usd: float
    start_date: str
    completion_date: str
    notice_time_bar_days: int = 28
    eot_clause_ref: str = "Sub-Clause 8.4"
    ld_rate_per_day: float = 0.0


def extract_and_save_contract_profile(tenant_id: str, project_id: str, contract_text_sample: str) -> Dict[str, Any]:
    """
    Extracts structural contract profile metadata via GPT-4o and saves to Supabase.
    """
    prompt = (
        "Extract the core contract profile metadata from the construction contract excerpt below.\n"
        "Return a JSON object with keys: contract_type, governing_law, employer_name, contractor_name, "
        "engineer_name, contract_value_usd, start_date (YYYY-MM-DD), completion_date (YYYY-MM-DD), "
        "notice_time_bar_days (integer), eot_clause_ref, ld_rate_per_day (float)."
    )
    
    response = openai_client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": contract_text_sample[:4000]}
        ],
        temperature=0.0
    )
    
    parsed = json.loads(response.choices[0].message.content)
    parsed["tenant_id"] = tenant_id
    parsed["project_id"] = project_id
    
    # Save/Upsert into Supabase contract_profiles
    supabase_client.table("contract_profiles").upsert(parsed, on_conflict="project_id").execute()
    return parsed
# --- STANDALONE TEST BLOCK ---
if __name__ == "__main__":
    print("Testing Contract Profile Extraction Service...")

    # Sample contract snippet for verification
    dummy_contract_text = """
    THIS SUB-CONTRACT AGREEMENT is entered into for the Apex Tower Project.
    Employer: Apex Developments LLC.
    Main Contractor: BuildCorp Infrastructure Ltd.
    Engineer: Vertex Engineering Consultants.
    Contract Value: USD 12,500,000.00.
    Commencement Date: 1st January 2026. Completion Date: 31st December 2027.
    Governing Law: Laws of the United Arab Emirates.
    Sub-Clause 20.1 Notice Period: The Contractor shall give notice to the Engineer as soon as practicable,
    and not later than 28 days after the Contractor became aware, or should have become aware, of the event or circumstance.
    Liquidated Damages: USD 5,000 per day of delay, capped at 10% of Contract Price.
    """

    test_tenant_id = "tenant_demo_01"
    test_project_id = "11111111-1111-1111-1111-111111111111"

    try:
        profile = extract_and_save_contract_profile(
            tenant_id=test_tenant_id,
            project_id=test_project_id,
            contract_text_sample=dummy_contract_text
        )
        print("\n--- Extraction Successful ---")
        print(json.dumps(profile, indent=2))
    except Exception as e:
        print(f"\n[!] Extraction Failed: {str(e)}")
        