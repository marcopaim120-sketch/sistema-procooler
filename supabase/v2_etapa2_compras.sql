-- ============================================================
-- V2 · ETAPA 2 — Compras: fornecedor completo + parcelas
-- Rode este arquivo INTEIRO no SQL Editor do Supabase (uma vez).
-- (Rode antes o v2_etapa1_cotacoes.sql, se ainda não rodou.)
--
-- Só ACRESCENTA. Roda numa transação: se der erro, nada é gravado.
-- Ao aparecer o aviso "Potential issues detected", escolha
-- "Run and enable RLS" (as cópias de segurança ficam protegidas).
-- ============================================================

begin;

-- ---------- 0. Cópias de segurança ----------
create table if not exists bak_20260925_suppliers as select * from suppliers;
create table if not exists bak_20260925_payments  as select * from payments;

-- ---------- 1. Fornecedor completo ----------
-- name continua sendo o nome usado no dia a dia (fantasia); os demais são
-- os dados cadastrais que o documento (PDF/imagem) também poderá preencher.
alter table suppliers add column if not exists legal_name         text;  -- razão social
alter table suppliers add column if not exists cnpj               text;
alter table suppliers add column if not exists state_registration text;  -- inscrição estadual
alter table suppliers add column if not exists email              text;
alter table suppliers add column if not exists phone              text;

-- ---------- 2. Parcelas de cada compra ----------
-- seq 0 = entrada (paga na data da compra, dia 0); seq 1..n = parcelas,
-- com os dias contados a partir da data da compra (ex.: 28, 56).
-- payment_id liga a parcela ao lançamento criado em Pagamentos
-- ("gerar pagamentos"), evitando gerar duas vezes.
create table if not exists purchase_installments (
  id                  uuid primary key default gen_random_uuid(),
  purchase_id         uuid not null references purchases(id) on delete cascade,
  seq                 int  not null,
  days_after_purchase int  not null default 0,
  amount              numeric(12,2) not null default 0,
  payment_id          uuid references payments(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (purchase_id, seq)
);

create index if not exists purchase_installments_purchase_idx on purchase_installments(purchase_id);

alter table purchase_installments enable row level security;

drop policy if exists "staff full access" on purchase_installments;
create policy "staff full access" on purchase_installments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- A partir de 30/10/2026 o Supabase exige GRANT explícito em tabelas novas.
grant select, insert, update, delete on purchase_installments to authenticated;
grant select, insert, update, delete on purchase_installments to service_role;

commit;

-- ---------- Conferência (rode depois, separado) ----------
-- select column_name from information_schema.columns
--   where table_name = 'suppliers' order by ordinal_position;
-- select count(*) from purchase_installments;   -- 0 no começo
