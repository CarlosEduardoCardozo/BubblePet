"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { normalizePhoneBR } from "@/lib/phone";

type ActionResult = { error: string } | { success: true };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const tutorFields = z.object({
  nome: z.string().trim().min(2, "Nome muito curto"),
  telefone: z.string().trim().min(1, "Telefone é obrigatório"),
  email: z.string().trim(),
  cpf: z.string().trim(),
  observacoes: z.string().trim(),
});

type TutorFormResult =
  | { error: string }
  | {
      data: {
        nome: string;
        telefone: string;
        email: string | null;
        cpf: string | null;
        observacoes: string | null;
      };
    };

function readTutorForm(formData: FormData): TutorFormResult {
  const parsed = tutorFields.safeParse({
    nome: formData.get("nome"),
    telefone: formData.get("telefone"),
    email: formData.get("email") ?? "",
    cpf: formData.get("cpf") ?? "",
    observacoes: formData.get("observacoes") ?? "",
  });

  if (!parsed.success) {
    const message: string = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return { error: message };
  }

  if (parsed.data.email && !EMAIL_RE.test(parsed.data.email)) {
    return { error: "E-mail inválido" };
  }

  const telefone = normalizePhoneBR(parsed.data.telefone);
  if (!telefone) {
    return { error: "Telefone inválido. Use DDD + número, ex: (47) 99999-9999." };
  }

  return {
    data: {
      nome: parsed.data.nome,
      telefone,
      email: parsed.data.email || null,
      cpf: parsed.data.cpf || null,
      observacoes: parsed.data.observacoes || null,
    },
  };
}

export async function createTutor(formData: FormData): Promise<ActionResult> {
  const parsed = readTutorForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { error } = await supabase
    .from("tutores")
    .insert({ ...parsed.data, petshop_id: petshopId });
  if (error) return { error: error.message };

  revalidatePath("/tutores-pets");
  return { success: true };
}

export async function updateTutor(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = readTutorForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("tutores").update(parsed.data).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/tutores-pets");
  return { success: true };
}

export async function deleteTutor(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("tutores").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/tutores-pets");
  return { success: true };
}

const petFields = z.object({
  nome: z.string().trim().min(1, "Nome do pet é obrigatório"),
  especie: z.string().trim().min(1, "Espécie é obrigatória"),
  raca: z.string().trim(),
  porte: z.enum(["pequeno", "medio", "grande", ""]),
  nascimento: z.string().trim(),
  observacoes: z.string().trim(),
});

export async function createPet(
  tutorId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = petFields.safeParse({
    nome: formData.get("nome"),
    especie: formData.get("especie") ?? "cachorro",
    raca: formData.get("raca") ?? "",
    porte: formData.get("porte") ?? "",
    nascimento: formData.get("nascimento") ?? "",
    observacoes: formData.get("observacoes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { error } = await supabase.from("pets").insert({
    petshop_id: petshopId,
    tutor_id: tutorId,
    nome: parsed.data.nome,
    especie: parsed.data.especie,
    raca: parsed.data.raca || null,
    porte: parsed.data.porte || null,
    nascimento: parsed.data.nascimento || null,
    observacoes: parsed.data.observacoes || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/tutores-pets");
  return { success: true };
}

export async function deletePet(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("pets").update({ ativo: false }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/tutores-pets");
  return { success: true };
}
