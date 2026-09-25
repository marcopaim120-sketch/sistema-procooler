-- ============================================================
-- V2 · ETAPA 1 — Estrutura de Cotações (multiprojeto)
-- Rode este arquivo INTEIRO no SQL Editor do Supabase (uma vez).
--
-- Só ACRESCENTA: nenhuma coluna ou tabela existente é apagada ou alterada
-- de forma incompatível, então a versão atual do sistema continua
-- funcionando. Tudo roda numa transação: se der erro, nada é gravado.
-- ============================================================

begin;

-- ---------- 0. Cópias de segurança (dentro do próprio banco) ----------
create table if not exists bak_20260924_purchases       as select * from purchases;
create table if not exists bak_20260924_purchase_quotes as select * from purchase_quotes;
create table if not exists bak_20260924_proposal_items  as select * from proposal_items;

-- ---------- 1. Novas colunas em purchases (Cotações / Compras) ----------
-- Valor total do documento (pedido/cotação anexado). Pode ser maior que o
-- "fechado" de um projeto quando a compra atende vários projetos.
alter table purchases add column if not exists document_total        numeric(12,2);
-- Previsão de entrega (planejada) e data da entrega (real).
alter table purchases add column if not exists expected_delivery_date date;
alter table purchases add column if not exists delivery_date          date;
-- Opção por lançamento: true = campos preenchidos pela leitura do
-- PDF/imagem; false = lançamento manual (padrão).
alter table purchases add column if not exists read_from_document     boolean not null default false;

-- ---------- 2. Rateio da compra entre projetos ----------
-- Uma cotação/compra pode atender 1, 2 ou 3 projetos. Cada linha abaixo diz
-- quanto (em valor e em %) da compra pertence a cada projeto, e qual
-- material da proposta daquele projeto ela atende (Materiais orçados).
-- A soma dos valores deve fechar com document_total; o pagamento continua
-- sendo um só, do valor total do documento.
create table if not exists purchase_allocations (
  id               uuid primary key default gen_random_uuid(),
  purchase_id      uuid not null references purchases(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  proposal_item_id uuid references proposal_items(id) on delete set null,
  amount           numeric(12,2) not null default 0,
  pct              numeric(6,3),
  created_at       timestamptz not null default now(),
  unique (purchase_id, project_id)
);

create index if not exists purchase_allocations_purchase_idx on purchase_allocations(purchase_id);
create index if not exists purchase_allocations_project_idx  on purchase_allocations(project_id);

alter table purchase_allocations enable row level security;

drop policy if exists "staff full access" on purchase_allocations;
create policy "staff full access" on purchase_allocations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- A partir de 30/10/2026 o Supabase exige GRANT explícito em tabelas novas.
grant select, insert, update, delete on purchase_allocations to authenticated;
grant select, insert, update, delete on purchase_allocations to service_role;

-- ---------- 3. Preenche o rateio das compras que já existem ----------
-- Cada compra atual vira uma linha de rateio de 100% para o seu projeto.
insert into purchase_allocations (purchase_id, project_id, proposal_item_id, amount, pct)
select p.id, p.project_id, p.proposal_item_id, coalesce(p.actual_cost, 0), 100
from purchases p
on conflict (purchase_id, project_id) do nothing;

-- Valor total do documento das compras existentes = valor fechado atual.
update purchases set document_total = actual_cost where document_total is null;

commit;

-- ---------- Conferência (rode depois, separado) ----------
-- select count(*) from purchases;              -- quantas compras
-- select count(*) from purchase_allocations;   -- deve ser igual
-- select * from purchase_allocations limit 5;
