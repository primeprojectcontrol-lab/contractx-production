import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://oqoefbyiqlbvywoavmev.supabase.co",
  "sb_publishable__ZNnujw2maqYRVk7-S1QnA_W8jeCmS8"
);

const { data, error } = await supabase.auth.signInWithPassword({
  email: "admin@contractx.co",
  password: "ContractX-Admin@2026!",
});

if (error) {
  console.error("LOGIN FAILED:", error.message);
  process.exit(1);
}

console.log("LOGIN SUCCESS");
console.log(data.user.email);
console.log(data.user.id);
