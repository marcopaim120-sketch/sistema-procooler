-- ============================================================
-- V2 · ETAPA 8 — "A receber" nos Recebimentos = mão de obra contratada - recebido.
-- A função build_project_json passa a enviar 'labor_total' (mão de obra da proposta mais
-- recente) quando a chave "recebimentos" do projeto está ligada. Substituição de texto
-- na função atual, com backup antes. Rode INTEIRO no SQL Editor do Supabase. Transação.
-- Ao aparecer "Potential issue detected", escolha "Run and enable RLS".
-- ============================================================

begin;

create table if not exists bak_20261018d_build_project_json as
  select now() as saved_at, pg_get_functiondef('build_project_json(uuid)'::regprocedure) as definition;

do $do$
declare
  d text;
  novo text;
begin
  d := pg_get_functiondef('build_project_json(uuid)'::regprocedure);
  novo := replace(
    d,
    $a$'sections', (select coalesce(client_sections, '{}'::jsonb) from projects where id = p_project_id),$a$,
    $b$'labor_total', case when client_section_on(p_project_id, 'recebimentos') then (
      select pl.labor_cost from proposals pl where pl.project_id = p_project_id order by pl.version desc limit 1
    ) end,
    'sections', (select coalesce(client_sections, '{}'::jsonb) from projects where id = p_project_id),$b$
  );
  if novo = d then
    raise exception 'Trecho da funcao nao encontrado: nada foi alterado';
  end if;
  execute novo;
end
$do$;

commit;
