import { createClient } from "@supabase/supabase-js";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const PROJECT_URL =
  "https://oqoefbyiqlbvywoavmev.supabase.co";

const USER_ID =
  "d2beb011-b052-4bb8-bd36-fa1ccd70baab";

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is missing from .env"
  );
}

const rl = readline.createInterface({
  input,
  output,
});

const newPassword = await rl.question(
  "Enter new ContractX admin password: "
);

const confirmPassword = await rl.question(
  "Confirm new password: "
);

rl.close();

if (!newPassword) {
  console.error("Password cannot be empty.");
  process.exit(1);
}

if (newPassword !== confirmPassword) {
  console.error("Passwords do not match.");
  process.exit(1);
}

if (newPassword.length < 12) {
  console.error(
    "Use a password of at least 12 characters."
  );
  process.exit(1);
}

const supabase = createClient(
  PROJECT_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const { data, error } =
  await supabase.auth.admin.updateUserById(
    USER_ID,
    {
      password: newPassword,
      email_confirm: true,
    }
  );

if (error) {
  console.error(
    "Password update failed:",
    error.message
  );
  process.exit(1);
}

console.log("");
console.log("ContractX admin password updated successfully.");
console.log("Email:", data.user.email);
console.log("User ID:", data.user.id);
console.log("");
console.log(
  "The new password is now active in Supabase Auth."
);