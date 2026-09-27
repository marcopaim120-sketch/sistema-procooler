-- ============================================================
-- V2 · ETAPA 3 — Etapas de Produção em grupos (1, 1.1, 1.2...)
-- Rode este arquivo INTEIRO no SQL Editor do Supabase (uma vez).
-- Só ACRESCENTA. Roda numa transação: se der erro, nada é gravado.
-- Ao aparecer "Potential issues detected", escolha "Run and enable RLS".
-- ============================================================

begin;

-- ---------- 0. Cópia de segurança ----------
create table if not exists bak_20260927_project_stages as select * from project_stages;

-- ---------- 1. Grupos (ex.: 1 Exp Ferr, 2 MDF ferr, 3 Gab. Refrigerados) ----------
create table if not exists project_stage_groups (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  seq        int  not null default 0,
  name       text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_stage_groups_project_idx on project_stage_groups(project_id);

alter table project_stage_groups enable row level security;
drop policy if exists "staff full access" on project_stage_groups;
create policy "staff full access" on project_stage_groups
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select, insert, update, delete on project_stage_groups to authenticated;
grant select, insert, update, delete on project_stage_groups to service_role;

-- ---------- 2. Etapas: ligar ao grupo + campos novos ----------
alter table project_stages add column if not exists group_id uuid references project_stage_groups(id) on delete cascade;
-- Sub-sequência dentro do grupo (1.1, 1.2, 1.3...).
alter table project_stages add column if not exists seq int not null default 0;
-- Dias estimados (informativo, ao lado da data de início).
alter table project_stages add column if not exists estimated_days int;
-- "ok" do recebimento/entrega, marcável manualmente.
alter table project_stages add column if not exists received_ok boolean not null default false;
-- Chave "Mostrar ao cliente" (etapa 4 do plano) — nasce oculta; as etapas já
-- existentes ficam visíveis (ver passo 4 abaixo).
alter table project_stages add column if not exists visible_to_client boolean not null default false;

-- ---------- 3. Migra as etapas que já existiam para um grupo "Migradas" ----------
-- (preserva os dados; a partir de agora o usuário organiza em grupos próprios)
insert into project_stage_groups (project_id, seq, name)
select distinct project_id, 0, 'Migradas'
from project_stages
where group_id is null;

update project_stages ps
set group_id = g.id,
    seq = coalesce(ps.sequence, 0) + 1
from project_stage_groups g
where g.project_id = ps.project_id and g.name = 'Migradas' and ps.group_id is null;

-- ---------- 4. Etapas que já existiam ficam visíveis ao cliente ----------
-- (regra do plano: "novos lançamentos nascem ocultos; os já existentes continuam visíveis")
update project_stages set visible_to_client = true;

commit;

-- ---------- Conferência (rode depois, separado) ----------
-- select count(*) from project_stage_groups;
-- select g.name as grupo, s.seq, s.name as etapa, s.visible_to_client
--   from project_stages s join project_stage_groups g on g.id = s.group_id
--   order by g.project_id, g.seq, s.seq;
