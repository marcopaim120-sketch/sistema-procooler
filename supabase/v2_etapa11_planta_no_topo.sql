-- ============================================================
-- V2 · ETAPA 11 — Seção "Planta do projeto + proposta (PDF)" no topo do portal (chave "planta").
-- A função build_project_json passa a enviar, só quando a chave "planta" do projeto está ligada:
--   'plan'          = imagens (png/jpg/webp/gif) de documentos do projeto na categoria 'projeto_tecnico' e visíveis
--   'proposal_docs' = PDFs de documentos do projeto na categoria 'proposta' e visíveis
-- (somente documentos do projeto em si, não anexos de compras/pagamentos etc.).
-- Substituição de texto na função atual, com backup antes. Rode INTEIRO no SQL Editor. Transação.
-- Ao aparecer "Potential issue detected", escolha "Run and enable RLS".
-- ============================================================

begin;

create table if not exists bak_20261019_build_project_json as
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
    $b$'plan', case when client_section_on(p_project_id, 'planta') then (
      select coalesce(json_agg(json_build_object('file_name', dp.file_name, 'storage_path', dp.storage_path) order by dp.uploaded_at), '[]'::json)
      from documents dp
      where dp.project_id = p_project_id and dp.visible_to_client = true and dp.category = 'projeto_tecnico'
        and dp.storage_path ~* '\.(png|jpe?g|webp|gif)$'
        and dp.purchase_id is null and dp.service_id is null and dp.purchase_quote_id is null
        and dp.service_quote_id is null and dp.payment_id is null and dp.receivable_id is null
    ) end,
    'proposal_docs', case when client_section_on(p_project_id, 'planta') then (
      select coalesce(json_agg(json_build_object('file_name', dq.file_name, 'storage_path', dq.storage_path) order by dq.uploaded_at desc), '[]'::json)
      from documents dq
      where dq.project_id = p_project_id and dq.visible_to_client = true and dq.category = 'proposta'
        and dq.storage_path ~* '\.pdf$'
        and dq.purchase_id is null and dq.service_id is null and dq.purchase_quote_id is null
        and dq.service_quote_id is null and dq.payment_id is null and dq.receivable_id is null
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
