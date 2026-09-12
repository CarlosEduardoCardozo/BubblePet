type ErroBanco = { code?: string; message?: string } | null | undefined;

/**
 * Traduz erros do Postgres/PostgREST pra frases que o dono do petshop
 * entende. Nunca devolve a mensagem crua de constraint pro usuário.
 */
export function mensagemErroBanco(
  error: ErroBanco,
  contexto?: { duplicado?: string; emUso?: string; fallback?: string }
): string {
  const fallback = contexto?.fallback ?? "Não foi possível salvar. Tente de novo.";
  if (!error) return fallback;

  switch (error.code) {
    case "23505":
      return contexto?.duplicado ?? "Já existe um registro com esses dados.";
    case "23503":
      return contexto?.emUso ?? "Esse registro está em uso e não pode ser removido.";
    case "23514":
      return "Algum valor está fora do permitido. Confira os campos.";
    case "23P01":
      return "Já existe um agendamento nesse horário.";
    case "PGRST116":
      return "Registro não encontrado.";
    default:
      // Exceções levantadas nas functions do banco (raise exception) já vêm
      // em português — repassa. Erros técnicos caem no fallback.
      if (error.code === "P0001" && error.message) return error.message;
      return fallback;
  }
}
