-- ============================================================
-- V2 · ETAPA 10 — Total de gastos com SALDO: o 'spending' passa a enviar também
--   material_estimated (soma dos materiais da proposta mais recente) e
--   labor_contracted   (mão de obra da proposta mais recente),
-- do projeto e de cada um dos outros projetos do mesmo cliente.
-- Substituição de texto na função atual, com backup antes. Rode INTEIRO no SQL Editor. Transação.
-- Ao aparecer "Potential issue detected", escolha "Run and enable RLS".
-- ============================================================

begin;

create table if not exists bak_20261018f_build_project_json as
  select now() as saved_at, pg_get_functiondef('build_project_json(uuid)'::regprocedure) as definition;

do $do$
declare
  d text;
  novo text;
begin
  d := pg_get_functiondef('build_project_json(uuid)'::regprocedure);

  -- projeto atual
  novo := replace(
    d,
    $a$'purchases_total', (select coalesce(sum(pu1.actual_cost), 0) from purchases pu1$a$,
    $b$'material_estimated', (select coalesce(sum(coalesce(pi4.quantity, 0) * coalesce(pi4.estimated_unit_cost, 0)), 0)
                              from proposal_items pi4
                              where pi4.proposal_id = (select pr4.id from proposals pr4 where pr4.project_id = p_project_id order by pr4.version desc limit 1)),
      'labor_contracted', (select coalesce(pr5.labor_cost, 0) from proposals pr5 where pr5.project_id = p_project_id order by pr5.version desc limit 1),
      'purchases_total', (select coalesce(sum(pu1.actual_cost), 0) from purchases pu1$b$
  );
  if novo = d then
    raise exception 'Trecho (projeto) nao encontrado: nada foi alterado';
  end if;
  d := novo;

  -- outros projetos do mesmo cliente
  novo := replace(
    d,
    $c$'purchases_total', (select coalesce(sum(pu2.actual_cost), 0) from purchases pu2$c$,
    $e$'material_estimated', (select coalesce(sum(coalesce(pi6.quantity, 0) * coalesce(pi6.estimated_unit_cost, 0)), 0)
                                  from proposal_items pi6
                                  where pi6.proposal_id = (select pr6.id from proposals pr6 where pr6.project_id = pj.id order by pr6.version desc limit 1)),
          'labor_contracted', (select coalesce(pr7.labor_cost, 0) from proposals pr7 where pr7.project_id = pj.id order by pr7.version desc limit 1),
          'purchases_total', (select coalesce(sum(pu2.actual_cost), 0) from purchases pu2$e$
  );
  if novo = d then
    raise exception 'Trecho (outros projetos) nao encontrado: nada foi alterado';
  end if;

  execute novo;
end
$do$;

commit;
