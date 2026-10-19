-- ============================================================
-- V2 · ETAPA 7 — "Evolução das compras" do portal passa a mostrar o ESTIMADO da proposta
-- (em vez do Orçado). A função build_project_json passa a enviar, em cada compra:
--   proposal_item_id, item_description, item_estimated (quantidade x custo estimado do item).
-- Mexe só nesse trecho da função atual (substituição de texto), com backup antes.
-- Rode INTEIRO no SQL Editor do Supabase. Transação.
-- Ao aparecer "Potential issue detected", escolha "Run and enable RLS".
-- ============================================================

begin;

create table if not exists bak_20261018c_build_project_json as
  select now() as saved_at, pg_get_functiondef('build_project_json(uuid)'::regprocedure) as definition;

do $do$
declare
  d text;
  novo text;
begin
  d := pg_get_functiondef('build_project_json(uuid)'::regprocedure);
  novo := replace(
    d,
    $a$'description', pu.description, 'budgeted_cost', pu.budgeted_cost,$a$,
    $b$'description', pu.description, 'proposal_item_id', pu.proposal_item_id,
        'item_description', (select pi3.description from proposal_items pi3 where pi3.id = pu.proposal_item_id),
        'item_estimated', (select coalesce(pi3.quantity, 0) * coalesce(pi3.estimated_unit_cost, 0) from proposal_items pi3 where pi3.id = pu.proposal_item_id),
        'budgeted_cost', pu.budgeted_cost,$b$
  );
  if novo = d then
    raise exception 'Trecho da funcao nao encontrado: nada foi alterado';
  end if;
  execute novo;
end
$do$;

commit;

-- Conferência (separado):
-- select build_project_json(id)->'purchases' from projects where name = 'Petropolis Loja';
