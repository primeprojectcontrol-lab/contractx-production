import { createClient } from "@supabase/supabase-js";

const PROJECT_URL =
  "https://oqoefbyiqlbvywoavmev.supabase.co";

const PUBLISHABLE_KEY =
  "sb_publishable__ZNnujw2maqYRVk7-S1QnA_W8jeCmS8";

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const USER_ID =
  "d2beb011-b052-4bb8-bd36-fa1ccd70baab";

const EMAIL =
  "admin@contractx.co";

const NEW_PASSWORD =
  "ContractX-Admin@2026!";

if (!SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is missing from .env"
  );
}

// Admin client
const admin = createClient(
  PROJECT_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Reset password
const { data: updatedUser, error: updateError } =
  await admin.auth.admin.updateUserById(
    USER_ID,
    {
      password: NEW_PASSWORD,
      email_confirm: true,
    }
  );

if (updateError) {
  console.error(
    "PASSWORD RESET FAILED:",
    updateError.message
  );
  process.exit(1);
}

console.log("PASSWORD RESET SUCCESSFUL");
console.log("Email:", updatedUser.user.email);
console.log("User ID:", updatedUser.user.id);

// Public client — exactly like browser login
const publicClient = createClient(
  PROJECT_URL,
  PUBLISHABLE_KEY
);

// Immediately test new password
const { data, error } =
  await publicClient.auth.signInWithPassword({
    email: EMAIL,
    password: NEW_PASSWORD,
  });

if (error) {
  console.error(
    "LOGIN TEST FAILED:",
    error.message
  );
  process.exit(1);
}

console.log("");
console.log("LOGIN TEST SUCCESSFUL");
console.log("Email:", data.user.email);
console.log("User ID:", data.user.id);

await publicClient.auth.signOut();
