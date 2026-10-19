-- ============================================================
-- V2 · ETAPA 12 — A proposta no topo do portal pode ser mostrada como IMAGENS das páginas.
-- 'proposal_docs' (chave "planta") passa a incluir, além de PDFs, imagens png/jpg/webp de
-- documentos do projeto na categoria 'proposta' e visíveis. Substituição de texto na função atual,
-- com backup antes. Rode INTEIRO no SQL Editor. Transação.
-- Ao aparecer "Potential issue detected", escolha "Run and enable RLS".
-- ============================================================

begin;

create table if not exists bak_20261019b_build_project_json as
  select now() as saved_at, pg_get_functiondef('build_project_json(uuid)'::regprocedure) as definition;

do $do$
declare
  d text;
  novo text;
begin
  d := pg_get_functiondef('build_project_json(uuid)'::regprocedure);
  novo := replace(
    d,
    $a$and dq.storage_path ~* '\.pdf$'$a$,
    $b$and dq.storage_path ~* '\.(pdf|png|jpe?g|webp)$'$b$
  );
  if novo = d then
    raise exception 'Trecho da funcao nao encontrado: nada foi alterado';
  end if;
  execute novo;
end
$do$;

commit;
