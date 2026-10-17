from app.routers.engine2_router import _load_schedule_parser

row, parser = _load_schedule_parser(
    tenant_id="tenant_demo_01",
    project_id="d2b1a957-6d56-4e24-801d-15f7802214b0",
    schedule_id="8a31bc41-936d-4f1d-afef-a3e78ef302aa",
)

print("FILE:", row.get("file_name"))

for name in ["TASK", "PROJWBS", "TASKPRED", "TASKRSRC", "RSRC"]:
    df = parser.tables.get(name)
    print(name, 0 if df is None else len(df))

print()
print("Normalized activities:", len(parser.get_activities()))
print("Normalized WBS:", len(parser.get_wbs()))
print("Normalized relationships:", len(parser.get_relationships()))
