# app/services/schedule_context_service.py

class ScheduleContextService:
    @staticmethod
    def get_schedule_summary_context(supabase_client, schedule_id: str) -> str:
        """
        Retrieves top critical path variances and float metrics to enrich Engine 1 prompts.
        """
        if not supabase_client or not schedule_id:
            return "No schedule telemetry linked."

        try:
            res = supabase_client.table("schedule_tasks")\
                .select("task_code, task_name, total_float_days, is_critical")\
                .eq("schedule_id", schedule_id)\
                .eq("is_critical", True)\
                .limit(10)\
                .execute()
            
            critical_tasks = res.data or []
            summary_str = f"Linked Schedule ID: {schedule_id}\nCritical Path Activities:\n"
            for t in critical_tasks:
                summary_str += f"- Task {t['task_code']}: {t['task_name']} (Float: {t['total_float_days']} days)\n"
            return summary_str
        except Exception:
            return "Schedule telemetry unavailable."