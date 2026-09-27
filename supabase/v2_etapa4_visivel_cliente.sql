-- ============================================================
-- V2 · ETAPA 4 — Chave "Mostrar ao cliente" em Cotações, Compras,
-- Cotações de fornecedor, Pagamentos e Recebimentos, com o filtro
-- aplicado NO BANCO (na função que alimenta o portal do cliente).
-- (Etapas de Produção e Documentos já têm essa chave — ver
-- v2_etapa3_etapas.sql e a tabela documents.)
--
-- RODE ANTES o v2_etapa3_etapas.sql (esta função já usa os grupos de etapas).
-- Rode este arquivo INTEIRO no SQL Editor do Supabase (uma vez).
-- Só ACRESCENTA. Roda numa transação: se der erro, nada é gravado.
-- Ao aparecer "Potential issues detected", escolha "Run and enable RLS".
-- ============================================================

begin;

-- ---------- 0. Cópias de segurança ----------
create table if not exists bak_20260927_purchases       as select * from purchases;
create table if not exists bak_20260927_purchase_quotes as select * from purchase_quotes;
create table if not exists bak_20260927_payments        as select * from payments;
create table if not exists bak_20260927_receivables     as select * from receivables;

-- ---------- 1. Nova coluna, nasce oculta para lançamentos futuros ----------
alter table purchases       add column if not exists visible_to_client boolean not null default false;
alter table purchase_quotes add column if not exists visible_to_client boolean not null default false;
alter table payments        add column if not exists visible_to_client boolean not null default false;
alter table receivables     add column if not exists visible_to_client boolean not null default false;

-- ---------- 2. Lançamentos que já existiam ficam visíveis ----------
-- (neste ponto da migração só existem os lançamentos antigos; os novos,
-- criados depois de rodar este script, usam o padrão da coluna = oculto)
update purchases       set visible_to_client = true;
update purchase_quotes set visible_to_client = true;
update payments        set visible_to_client = true;
update receivables     set visible_to_client = true;

-- ---------- 3. build_project_json: filtro de visibilidade aplicado no banco ----------
-- Mesma função de sempre; só mudou o bloco de purchases/stages/purchase_quotes/
-- payments/receivables (filtro "and ...visible_to_client = true" e o novo
-- formato de etapas em grupos). O resto (proposal, outsourced_services,
-- service_quotes, documents) fica exatamente como estava.
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
        'id', pr.id, 'labor_cost', pr.labor_cost, 'discount', pr.discount,
        'old_model_price', pr.old_model_price, 'commission_pct', pr.commission_pct,
        'status', pr.status, 'notes', pr.notes,
        'items', (
          select coalesce(json_agg(json_build_object(
            'description', pi.description, 'unit', pi.unit,
            'quantity', pi.quantity, 'estimated_unit_cost', pi.estimated_unit_cost
          )), '[]'::json)
          from proposal_items pi where pi.proposal_id = pr.id
        ),
        'competitors', (
          select coalesce(json_agg(json_build_object(
            'name', cq.competitor_name, 'price', cq.price
          )), '[]'::json)
          from competitor_quotes cq where cq.proposal_id = pr.id
        )
      )
      from proposals pr
      where pr.project_id = p_project_id
      order by pr.version desc
      limit 1
    ),
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
      from purchases pu where pu.project_id = p_project_id and pu.visible_to_client = true
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
      where g.project_id = p_project_id and st.visible_to_client = true
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
      where pu2.project_id = p_project_id and pq.visible_to_client = true
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
      from outsourced_services os where os.project_id = p_project_id
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
      where os2.project_id = p_project_id and os2.billable_to_client = true
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
      where pay.project_id = p_project_id and pay.visible_to_client = true
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
      from receivables r where r.project_id = p_project_id and r.visible_to_client = true
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
    )
  );
$$;

commit;

-- ---------- Conferência (rode depois, separado) ----------
-- select count(*) from purchases where visible_to_client;         -- deve ser igual ao total de compras
-- select count(*) from payments where visible_to_client;          -- deve ser igual ao total de pagamentos
-- select build_project_json(id) from projects limit 1;            -- confere se a função ainda roda sem erro
