"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { limparSuporteNoLogout } from "@/lib/suporte";

export async function logout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await limparSuporteNoLogout(user.id);
  await supabase.auth.signOut();
  redirect("/login");
}
