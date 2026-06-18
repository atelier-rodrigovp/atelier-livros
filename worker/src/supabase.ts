import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service_role — SÓ no worker

if (!url || !key) {
  throw new Error("Worker exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
}

// O worker usa service_role (ignora RLS) — por isso SEMPRE filtra por owner.
export const sb = createClient(url, key, {
  auth: { persistSession: false },
});

export const OWNER = process.env.OWNER_USER_ID!;
