-- ============================================================
-- V2 · ETAPA 9 — Seção "Total de gastos" do portal do cliente (chave "gastos").
-- A função build_project_json passa a enviar 'spending':
--   purchases_total  = soma das compras REALIZADAS e marcadas como visíveis (actual_cost)
--   labor_received   = soma dos recebimentos PAGOS e visíveis (mão de obra Pro Cooler)
--   others           = outros projetos do MESMO cliente que também tenham a chave "gastos" ligada
-- Só aparece se a chave "gastos" do projeto estiver ligada. Substituição de texto na função
-- atual, com backup antes. Rode INTEIRO no SQL Editor do Supabase. Transação.
-- Ao aparecer "Potential issue detected", escolha "Run and enable RLS".
-- ============================================================

begin;

create table if not exists bak_20261018e_build_project_json as
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
    $b$'spending', case when client_section_on(p_project_id, 'gastos') then json_build_object(
      'purchases_total', (select coalesce(sum(pu1.actual_cost), 0) from purchases pu1
                          where pu1.project_id = p_project_id and pu1.status = 'realizado' and pu1.visible_to_client = true),
      'labor_received',  (select coalesce(sum(r1.amount), 0) from receivables r1
                          where r1.project_id = p_project_id and r1.visible_to_client = true
                            and (r1.paid_date is not null or r1.status = 'pago')),
      'others', (
        select coalesce(json_agg(json_build_object(
          'name', pj.name,
          'purchases_total', (select coalesce(sum(pu2.actual_cost), 0) from purchases pu2
                              where pu2.project_id = pj.id and pu2.status = 'realizado' and pu2.visible_to_client = true),
          'labor_received',  (select coalesce(sum(r2.amount), 0) from receivables r2
                              where r2.project_id = pj.id and r2.visible_to_client = true
                                and (r2.paid_date is not null or r2.status = 'pago'))
        ) order by pj.created_at), '[]'::json)
        from projects pj
        where pj.client_id = (select client_id from projects where id = p_project_id)
          and pj.id <> p_project_id
          and client_section_on(pj.id, 'gastos')
      )
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
