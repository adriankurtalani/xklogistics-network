import { supabase } from "./supabaseClient";

export async function logAdminAction(params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  await supabase.from("audit_log").insert({
    admin_id:    params.adminId,
    action:      params.action,
    target_type: params.targetType ?? null,
    target_id:   params.targetId ?? null,
    details:     params.details ?? null,
  });
}
