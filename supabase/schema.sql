-- ============================================================
-- Sistema Web Marcenaria — schema Supabase
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  notes text,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  name text not null,
  status text not null default 'orcamento'
    check (status in ('orcamento','aprovado','em_producao','em_instalacao','concluido','cancelado')),
  share_token uuid not null default gen_random_uuid() unique,
  access_password_hash text,
  nf_status text not null default 'pendente'
    check (nf_status in ('pendente','emitida','nao_aplicavel')),
  nf_number text,
  nf_date date,
  created_at timestamptz not null default now()
);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version int not null default 1,
  status text not null default 'rascunho'
    check (status in ('rascunho','enviada','aprovada','recusada')),
  labor_cost numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  -- Preço "se fosse pelo modelo antigo" (Pro Cooler fabricando e vendendo
  -- tudo direto, como um concorrente tradicional) — referência para
  -- mostrar ao cliente o quanto o modelo de assessoria é mais vantajoso.
  old_model_price numeric(12,2),
  -- % cobrado sobre a economia gerada (orçado - real) nas compras.
  commission_pct numeric(5,2) not null default 20,
  notes text,
  sent_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  description text not null,
  unit text default 'un',
  quantity numeric(12,3) not null default 1,
  estimated_unit_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table competitor_quotes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  competitor_name text not null,
  price numeric(12,2),
  notes text
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  proposal_item_id uuid references proposal_items(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  description text not null,
  priority int not null default 0,
  budgeted_cost numeric(12,2) not null default 0,
  actual_cost numeric(12,2) not null default 0,
  data_prevista_cotacao date,
  data_prevista_compra date,
  purchase_date date,
  closing_date date,
  forma_pagamento text,
  notes text,
  status text not null default 'a_cotar'
    check (status in ('a_cotar','cotado','preparacao','andamento','realizado','cancelado')),
  created_at timestamptz not null default now()
);

-- Cotações de fornecedores concorrentes para uma mesma compra (material).
-- Permite comparar 2, 3 ou mais propostas antes de decidir qual fornecedor
-- vence. Quando uma cotação é marcada "escolhida", seus dados (fornecedor,
-- preço, prazo, forma de pagamento) alimentam os campos definitivos da
-- compra correspondente (isso é feito pelo app, não automaticamente aqui).
create table purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  price numeric(12,2),
  down_payment numeric(12,2),
  installments text,
  delivery_date date,
  status text not null default 'aguardando_proposta'
    check (status in ('aguardando_proposta','recebida','em_analise','escolhida','recusada')),
  notes text,
  created_at timestamptz not null default now()
);

-- Serviços TERCEIRIZADOS (pintura, corte, laminação etc. feitos por
-- prestadores externos) — mesmo fluxo de cotações múltiplas das compras
-- de material, mas para serviços. billable_to_client controla se esse
-- custo é repassado ao cliente (visível com valor) ou absorvido pela
-- Pro Cooler (visível só como etapa, sem valor).
create table outsourced_services (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  name text not null,
  priority int not null default 0,
  billable_to_client boolean not null default false,
  budgeted_cost numeric(12,2) not null default 0,
  actual_cost numeric(12,2) not null default 0,
  data_prevista_cotacao date,
  closing_date date,
  data_prevista_conclusao date,
  completion_date date,
  forma_pagamento text,
  notes text,
  status text not null default 'a_cotar'
    check (status in ('a_cotar','cotado','preparacao','andamento','realizado','cancelado')),
  created_at timestamptz not null default now()
);

-- Cotações de prestadores concorrentes para um mesmo serviço terceirizado.
create table service_quotes (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references outsourced_services(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  price numeric(12,2),
  down_payment numeric(12,2),
  installments text,
  completion_date date,
  status text not null default 'aguardando_proposta'
    check (status in ('aguardando_proposta','recebida','em_analise','escolhida','recusada')),
  notes text,
  created_at timestamptz not null default now()
);

-- Etapas de produção do projeto (serviços), em sequência, separadas dos
-- materiais. Nem toda etapa é cobrada do cliente — quando não é, o
-- portal do cliente mostra só o nome e o status, sem valor nem detalhe
-- (billable_to_client controla isso na função pública mais abaixo).
create table project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  sequence int not null default 0,
  start_date date,
  due_date date,
  end_date date,
  status text not null default 'iniciada'
    check (status in ('iniciada','andamento','concluida')),
  billable_to_client boolean not null default false,
  cost numeric(12,2),
  payment_terms text,
  notes text,
  created_at timestamptz not null default now()
);

-- Pagamentos do CLIENTE ao FORNECEDOR (a Pro Cooler não intermedia esse
-- dinheiro — só acompanha e organiza, como parte da assessoria de compras).
create table payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references purchases(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  amount numeric(12,2) not null,
  due_date date,
  paid_date date,
  status text not null default 'previsto'
    check (status in ('previsto','pago','atrasado','cancelado')),
  method text,
  notes text
);

-- Recebimentos do CLIENTE para a PRO COOLER (a receita de verdade da
-- empresa: a mão de obra / taxa de assessoria cobrada no projeto).
create table receivables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  amount numeric(12,2) not null,
  due_date date,
  paid_date date,
  status text not null default 'previsto'
    check (status in ('previsto','pago','atrasado','cancelado')),
  method text,
  notes text
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- Se ligado a uma compra, cotação, serviço, pagamento ou recebimento
  -- específico, o anexo aparece junto daquele item (no painel interno e
  -- no portal do cliente), não na lista geral de Documentos. Deixe todos
  -- nulos para um documento geral do projeto (proposta detalhada, pedido
  -- de compra, contrato, NF, planta baixa/projeto técnico etc.).
  purchase_id uuid references purchases(id) on delete cascade,
  service_id uuid references outsourced_services(id) on delete cascade,
  purchase_quote_id uuid references purchase_quotes(id) on delete cascade,
  service_quote_id uuid references service_quotes(id) on delete cascade,
  payment_id uuid references payments(id) on delete cascade,
  receivable_id uuid references receivables(id) on delete cascade,
  category text not null default 'outro'
    check (category in ('proposta','pedido_compra','contrato','nf','comprovante','projeto_tecnico','outro')),
  file_name text not null,
  storage_path text not null,
  visible_to_client boolean not null default true,
  uploaded_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
-- Regra simples: qualquer usuário autenticado (sua equipe) tem acesso total.
-- O público (anon) não acessa as tabelas diretamente — só via a função
-- get_project_public() abaixo, que expõe apenas o projeto do token informado.

alter table clients enable row level security;
alter table suppliers enable row level security;
alter table projects enable row level security;
alter table proposals enable row level security;
alter table proposal_items enable row level security;
alter table competitor_quotes enable row level security;
alter table purchases enable row level security;
alter table purchase_quotes enable row level security;
alter table outsourced_services enable row level security;
alter table service_quotes enable row level security;
alter table project_stages enable row level security;
alter table payments enable row level security;
alter table receivables enable row level security;
alter table documents enable row level security;

create policy "staff full access" on clients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on suppliers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on projects for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on proposals for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on proposal_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on competitor_quotes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on purchases for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on purchase_quotes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on outsourced_services for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on service_quotes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on project_stages for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on payments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on receivables for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on documents for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- Senha de acesso do portal do cliente ----------
-- Só a equipe (autenticada) pode definir/trocar a senha de um projeto.
-- A senha nunca é armazenada em texto puro, só o hash (bcrypt via pgcrypto).

create or replace function set_project_access_password(p_project_id uuid, p_password text)
returns void
language sql
security definer
set search_path = public
as $$
  update projects
  set access_password_hash = crypt(p_password, gen_salt('bf'))
  where id = p_project_id;
$$;

grant execute on function set_project_access_password(uuid, text) to authenticated;

-- ---------- Função pública para o portal do cliente ----------
-- Recebe o token único do projeto (share_token) e a senha definida pela
-- equipe, e só devolve os dados se as duas coisas baterem. SECURITY
-- DEFINER contorna o RLS acima de forma controlada, pois o filtro por
-- token + senha está embutido na função.

create or replace function get_project_public(p_token uuid, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
  v_hash text;
begin
  select access_password_hash into v_hash from projects where share_token = p_token;

  if v_hash is null then
    return json_build_object('error', 'invalid_token');
  end if;

  if p_password is null or crypt(p_password, v_hash) <> v_hash then
    return json_build_object('error', 'invalid_password');
  end if;

  select json_build_object(
    'project', (
      select json_build_object(
        'id', p.id, 'name', p.name, 'status', p.status,
        'nf_status', p.nf_status, 'nf_number', p.nf_number, 'nf_date', p.nf_date,
        'created_at', p.created_at, 'client_name', c.name
      )
      from projects p join clients c on c.id = p.client_id
      where p.share_token = p_token
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
      join projects p2 on p2.id = pr.project_id
      where p2.share_token = p_token
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
      from purchases pu join projects p3 on p3.id = pu.project_id
      where p3.share_token = p_token
    ),
    'stages', (
      select coalesce(json_agg(json_build_object(
        'name', st.name, 'status', st.status,
        'start_date', st.start_date, 'due_date', st.due_date, 'end_date', st.end_date,
        'cost', case when st.billable_to_client then st.cost else null end,
        'payment_terms', case when st.billable_to_client then st.payment_terms else null end,
        'billable_to_client', st.billable_to_client
      ) order by st.sequence), '[]'::json)
      from project_stages st join projects p7 on p7.id = st.project_id
      where p7.share_token = p_token
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
      join projects p8 on p8.id = pu2.project_id
      left join suppliers sup2 on sup2.id = pq.supplier_id
      where p8.share_token = p_token
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
      from outsourced_services os join projects p9 on p9.id = os.project_id
      where p9.share_token = p_token
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
      join projects p10 on p10.id = os2.project_id
      left join suppliers sup3 on sup3.id = sq.supplier_id
      where p10.share_token = p_token and os2.billable_to_client = true
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
      join projects p4 on p4.id = pay.project_id
      left join suppliers sup on sup.id = pay.supplier_id
      where p4.share_token = p_token
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
      from receivables r join projects p6 on p6.id = r.project_id
      where p6.share_token = p_token
    ),
    'documents', (
      select coalesce(json_agg(json_build_object(
        'file_name', d.file_name, 'storage_path', d.storage_path,
        'category', d.category, 'uploaded_at', d.uploaded_at
      )), '[]'::json)
      from documents d join projects p5 on p5.id = d.project_id
      where p5.share_token = p_token and d.visible_to_client = true
        and d.purchase_id is null and d.service_id is null
        and d.purchase_quote_id is null and d.service_quote_id is null
        and d.payment_id is null and d.receivable_id is null
    )
  ) into result;

  return result;
end;
$$;

grant execute on function get_project_public(uuid, text) to anon;

-- ---------- Storage ----------
-- Crie manualmente, no painel Supabase > Storage, um bucket chamado
-- "documents" marcado como público (leitura pública). A gravação
-- (upload) continua restrita à equipe pelas policies padrão de Storage
-- (autenticado only), que você configura na aba Policies do bucket.
