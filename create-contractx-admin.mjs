import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const userId = "d2beb011-b052-4bb8-bd36-fa1ccd70baab";

const newPassword = "ContractX-Admin@2026!";

const { data, error } = await supabase.auth.admin.updateUserById(
  userId,
  {
    password: newPassword,
    email_confirm: true,
  }
);

if (error) {
  console.error("Password reset failed:");
  console.error(error.message);
  process.exit(1);
}

console.log("Password reset successful.");
console.log("Email:", data.user.email);
console.log("User ID:", data.user.id);