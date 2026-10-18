-- ============================================================
-- V2 · ETAPA 5 — Chaves "O que o cliente vê" POR PROJETO e POR SEÇÃO
-- do portal do cliente, com o filtro aplicado NO BANCO.
--
-- Cada projeto ganha a coluna projects.client_sections (jsonb) com uma
-- chave por seção. Chave ausente = seção OCULTA (tudo nasce desligado,
-- inclusive nos projetos que já existem). true = mostra.
-- Chaves: proposta, materiais, comparativo_antigo, concorrentes, economia,
-- taxa, cotacoes, compras, servicos, etapas, pagamentos, recebimentos,
-- documentos.
-- Os botões 👁 por linha (visible_to_client) continuam valendo: para um
-- item aparecer, a seção precisa estar ligada E o item marcado.
--
-- Rode este arquivo INTEIRO no SQL Editor do Supabase (uma vez).
-- Roda numa transação: se der erro, nada é gravado.
-- Ao aparecer "Potential issues detected", escolha "Run and enable RLS".
-- ============================================================

begin;

-- ---------- 0. Cópia de segurança da função atual ----------
create table if not exists bak_20261018_build_project_json as
  select now() as saved_at, pg_get_functiondef('build_project_json(uuid)'::regprocedure) as definition;

-- ---------- 1. Coluna nova: tudo desligado ----------
alter table projects add column if not exists client_sections jsonb not null default '{}'::jsonb;

-- ---------- 2. Auxiliar: a seção está ligada neste projeto? ----------
create or replace function client_section_on(p_project_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((select (client_sections ->> p_key)::boolean from projects where id = p_project_id), false);
$$;

revoke execute on function client_section_on(uuid, text) from public, anon;

-- ---------- 3. build_project_json com as chaves de seção ----------
create or replace function build_project_json(p_project_id uuid)
returns json
language sql
security definer
set search_path = public, extensions
as $$
  select json_build_object(
    'project', (
      select json_build_object(
        'id', p.id, 'name', p.name, 'status', p.status,
        'nf_status', p.nf_status, 'nf_number', p.nf_number, 'nf_date', p.nf_date,
        'created_at', p.created_at, 'client_name', c.name
      )
      from projects p join clients c on c.id = p.client_id
      where p.id = p_project_id
    ),
    'proposal', (
      select json_build_object(
        -- totais da proposta (chave "proposta")
        'material_total', case when client_section_on(p_project_id, 'proposta') then mt.v end,
        'labor_cost',     case when client_section_on(p_project_id, 'proposta') then pr.labor_cost end,
        'discount',       case when client_section_on(p_project_id, 'proposta') then pr.discount end,
        -- o total também é necessário para as barras do comparativo com o modelo antigo
        'proposal_total', case when client_section_on(p_project_id, 'proposta')
                                 or client_section_on(p_project_id, 'comparativo_antigo')
                               then mt.v + coalesce(pr.labor_cost, 0) - coalesce(pr.discount, 0) end,
        'old_model_price', case when client_section_on(p_project_id, 'comparativo_antigo') then pr.old_model_price end,
        'commission_pct',  case when client_section_on(p_project_id, 'taxa') then pr.commission_pct end,
        'items', case when client_section_on(p_project_id, 'materiais') then (
          select coalesce(json_agg(json_build_object(
            'description', pi.description, 'unit', pi.unit,
            'quantity', pi.quantity, 'estimated_unit_cost', pi.estimated_unit_cost
          )), '[]'::json)
          from proposal_items pi where pi.proposal_id = pr.id
        ) else '[]'::json end,
        'competitors', case when client_section_on(p_project_id, 'concorrentes') then (
          select coalesce(json_agg(json_build_object(
            'name', cq.competitor_name, 'price', cq.price
          )), '[]'::json)
          from competitor_quotes cq where cq.proposal_id = pr.id
        ) else '[]'::json end
      )
      from proposals pr
      cross join lateral (
        select coalesce(sum(coalesce(pi2.quantity, 0) * coalesce(pi2.estimated_unit_cost, 0)), 0) as v
        from proposal_items pi2 where pi2.proposal_id = pr.id
      ) mt
      where pr.project_id = p_project_id
      order by pr.version desc
      limit 1
    ),
    -- Economia comprovada (chave "economia"): soma das compras visíveis, sem listar as compras
    'economy', case when client_section_on(p_project_id, 'economia') then (
      select json_build_object(
        'budgeted', coalesce(sum(pu0.budgeted_cost), 0),
        'actual',   coalesce(sum(pu0.actual_cost), 0),
        'count',    count(*)
      )
      from purchases pu0 where pu0.project_id = p_project_id and pu0.visible_to_client = true
    ) end,
    -- quais seções o portal deve mostrar (o que não está ligado fica oculto)
    'sections', (select coalesce(client_sections, '{}'::jsonb) from projects where id = p_project_id),
    'purchases', (
      select coalesce(json_agg(json_build_object(
        'description', pu.description, 'budgeted_cost', pu.budgeted_cost,
        'actual_cost', pu.actual_cost, 'status', pu.status,
        'data_prevista_cotacao', pu.data_prevista_cotacao,
        'closing_date', pu.closing_date,
        'data_prevista_compra', pu.data_prevista_compra,
        'forma_pagamento', pu.forma_pagamento,
        'purchase_date', pu.purchase_date,
        'documents', (
          select coalesce(json_agg(json_build_object(
            'file_name', d.file_name, 'storage_path', d.storage_path
          )), '[]'::json)
          from documents d where d.purchase_id = pu.id and d.visible_to_client = true
        )
      ) order by pu.priority), '[]'::json)
      from purchases pu where pu.project_id = p_project_id and pu.visible_to_client = true and client_section_on(p_project_id, 'compras')
    ),
    'stages', (
      select coalesce(json_agg(json_build_object(
        'group_name', g.name, 'group_seq', g.seq,
        'seq', st.seq, 'name', st.name, 'status', st.status,
        'start_date', st.start_date, 'estimated_days', st.estimated_days,
        'due_date', st.due_date, 'end_date', st.end_date, 'received_ok', st.received_ok
      ) order by g.seq, st.seq), '[]'::json)
      from project_stages st
      join project_stage_groups g on g.id = st.group_id
      where g.project_id = p_project_id and st.visible_to_client = true and client_section_on(p_project_id, 'etapas')
    ),
    'purchase_quotes', (
      select coalesce(json_agg(json_build_object(
        'purchase_description', pu2.description,
        'supplier_name', sup2.name,
        'price', pq.price, 'down_payment', pq.down_payment,
        'installments', pq.installments, 'delivery_date', pq.delivery_date,
        'status', pq.status,
        'documents', (
          select coalesce(json_agg(json_build_object(
            'file_name', d.file_name, 'storage_path', d.storage_path
          )), '[]'::json)
          from documents d where d.purchase_quote_id = pq.id and d.visible_to_client = true
        )
      ) order by pu2.priority, pq.price), '[]'::json)
      from purchase_quotes pq
      join purchases pu2 on pu2.id = pq.purchase_id
      left join suppliers sup2 on sup2.id = pq.supplier_id
      where pu2.project_id = p_project_id and pq.visible_to_client = true and client_section_on(p_project_id, 'cotacoes')
    ),
    'outsourced_services', (
      select coalesce(json_agg(json_build_object(
        'name', os.name, 'status', os.status, 'billable_to_client', os.billable_to_client,
        'budgeted_cost', case when os.billable_to_client then os.budgeted_cost else null end,
        'actual_cost', case when os.billable_to_client then os.actual_cost else null end,
        'forma_pagamento', case when os.billable_to_client then os.forma_pagamento else null end,
        'data_prevista_conclusao', os.data_prevista_conclusao,
        'completion_date', os.completion_date,
        'documents', (
          select coalesce(json_agg(json_build_object(
            'file_name', d.file_name, 'storage_path', d.storage_path
          )), '[]'::json)
          from documents d where d.service_id = os.id and d.visible_to_client = true
        )
      ) order by os.priority), '[]'::json)
      from outsourced_services os where os.project_id = p_project_id and client_section_on(p_project_id, 'servicos')
    ),
    'service_quotes', (
      select coalesce(json_agg(json_build_object(
        'service_name', os2.name, 'supplier_name', sup3.name,
        'price', sq.price, 'down_payment', sq.down_payment,
        'installments', sq.installments, 'completion_date', sq.completion_date,
        'status', sq.status,
        'documents', (
          select coalesce(json_agg(json_build_object(
            'file_name', d.file_name, 'storage_path', d.storage_path
          )), '[]'::json)
          from documents d where d.service_quote_id = sq.id and d.visible_to_client = true
        )
      ) order by os2.priority, sq.price), '[]'::json)
      from service_quotes sq
      join outsourced_services os2 on os2.id = sq.service_id
      left join suppliers sup3 on sup3.id = sq.supplier_id
      where os2.project_id = p_project_id and os2.billable_to_client = true and client_section_on(p_project_id, 'servicos')
    ),
    'payments', (
      select coalesce(json_agg(json_build_object(
        'amount', pay.amount, 'due_date', pay.due_date,
        'paid_date', pay.paid_date, 'status', pay.status,
        'method', pay.method, 'supplier_name', sup.name,
        'documents', (
          select coalesce(json_agg(json_build_object(
            'file_name', d.file_name, 'storage_path', d.storage_path
          )), '[]'::json)
          from documents d where d.payment_id = pay.id and d.visible_to_client = true
        )
      ) order by pay.due_date), '[]'::json)
      from payments pay
      left join suppliers sup on sup.id = pay.supplier_id
      where pay.project_id = p_project_id and pay.visible_to_client = true and client_section_on(p_project_id, 'pagamentos')
    ),
    'receivables', (
      select coalesce(json_agg(json_build_object(
        'amount', r.amount, 'due_date', r.due_date,
        'paid_date', r.paid_date, 'status', r.status,
        'documents', (
          select coalesce(json_agg(json_build_object(
            'file_name', d.file_name, 'storage_path', d.storage_path
          )), '[]'::json)
          from documents d where d.receivable_id = r.id and d.visible_to_client = true
        )
      )), '[]'::json)
      from receivables r where r.project_id = p_project_id and r.visible_to_client = true and client_section_on(p_project_id, 'recebimentos')
    ),
    'documents', (
      select coalesce(json_agg(json_build_object(
        'file_name', d.file_name, 'storage_path', d.storage_path,
        'category', d.category, 'uploaded_at', d.uploaded_at
      )), '[]'::json)
      from documents d
      where d.project_id = p_project_id and d.visible_to_client = true
        and d.purchase_id is null and d.service_id is null
        and d.purchase_quote_id is null and d.service_quote_id is null
        and d.payment_id is null and d.receivable_id is null
        and client_section_on(p_project_id, 'documentos')
    )
  );
$$;

commit;

-- ---------- Conferência (rode depois, separado) ----------
-- select id, name, client_sections from projects;           -- todos '{}' (tudo oculto)
-- select build_project_json(id) from projects limit 1;      -- roda sem erro; veja a chave "sections"
