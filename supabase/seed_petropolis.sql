-- ============================================================
-- Seed de exemplo: projeto real "Petrópolis"
-- ============================================================
-- Loja completa com 33 peças sob medida (vitrines refrigeradas,
-- confeitaria, balcões de serviço, caixa, gôndolas, floreiras,
-- túlia de pães, área de mesas/booths), conforme o projeto técnico
-- da ArtDuo (PETRÓPOLIS_M1-A2, r01, 30.07.2026).
--
-- Este script recria:
--   1. Os 33 itens do projeto técnico como itens da proposta
--      (quantidade real, custo unitário zerado — preencha depois).
--   2. As categorias de compra e o status que você já vinha
--      controlando na planilha "Cronograma de Compras e
--      Pagamentos", para substituir aquele controle solto por um
--      lugar único e visível ao cliente.
--
-- AJUSTE antes de rodar:
--   1. O nome do cliente logo abaixo (está como placeholder).
--   2. Os custos unitários dos itens e os valores orçados das
--      compras — não vieram no material de origem, então entram
--      como 0 até você preencher os valores reais.
--
-- DEPOIS de rodar: o portal do cliente agora exige senha. Abra o projeto
-- no painel interno e defina uma senha em "Senha de acesso do cliente" —
-- sem isso, o link do portal não abre para ninguém.
-- ============================================================

with novo_cliente as (
  insert into clients (name, notes)
  values (
    'Cliente Petrópolis (AJUSTAR NOME REAL)',
    'Loja completa: vitrines refrigeradas, confeitaria, balcões de serviço, caixa, gôndolas, floreiras, túlia de pães e área de mesas/booths (33 itens). Projeto técnico ArtDuo, r01, 30.07.2026.'
  )
  returning id
),
novo_projeto as (
  insert into projects (client_id, name, status)
  select id, 'Petrópolis — Loja completa (33 itens)', 'em_producao'
  from novo_cliente
  returning id
),
nova_proposta as (
  insert into proposals (project_id, status, labor_cost, notes)
  select id, 'aprovada', 0, 'Baseada no projeto técnico ArtDuo PETRÓPOLIS_M1-A2 (r01, 30.07.2026). Custos unitários a preencher.'
  from novo_projeto
  returning id, project_id
),
itens as (
  insert into proposal_items (proposal_id, description, unit, quantity, estimated_unit_cost)
  select nova_proposta.id, i.descricao, 'un', i.qtd, 0
  from nova_proposta, (values
    ('01. Vitrine laticínios (3 portas)', 1),
    ('02. Vitrine bebidas/cerveja (2+1 portas)', 1),
    ('03. Confeitaria refrigerado em "L"', 1),
    ('04. Confeitaria refrigerado alto', 1),
    ('05. Confeitaria refrigerado', 1),
    ('06. Confeitaria estufa', 1),
    ('07. Buffet', 1),
    ('08. Apoio balança', 1),
    ('09. Porta vai-vem', 1),
    ('10. Balcão de serviço refrigerado/congelado', 1),
    ('11. Mesa estufa', 1),
    ('12. Fruteira', 1),
    ('13. Auto-serviço seco', 1),
    ('14. Balcão serviço c/ cuba', 1),
    ('15. Balcão serviço embalagens', 1),
    ('16. Balcão serviço', 1),
    ('17. Expositor central embalados', 1),
    ('18. Caixa', 1),
    ('19. Apoio caixa', 1),
    ('20. Aéreo caixa', 2),
    ('21. Expositor vinhos', 3),
    ('22. Lixeira', 1),
    ('23. Gôndola baixa', 7),
    ('24. Floreira 1', 7),
    ('25. Floreira 2', 3),
    ('26. Floreira 3', 3),
    ('27. Túlia pães', 1),
    ('28. Aéreo pães', 1),
    ('29. Aéreo 1', 1),
    ('30. Aéreo 2', 1),
    ('31. Booth', 15),
    ('32. Booth em "U"', 1),
    ('33. Mesas (120x70, 70x70, 60x70, Ø70cm)', 24)
  ) as i(descricao, qtd)
  returning proposal_id
)
insert into purchases (
  project_id, description, status, budgeted_cost, actual_cost,
  data_prevista_cotacao, data_prevista_compra, forma_pagamento, notes
)
select
  novo_projeto.id, c.categoria, c.status, 0, 0,
  c.data_cotacao::date, c.data_compra::date, c.forma_pagamento, c.observacoes
from novo_projeto, (values
  ('Ferro / Estrutura metálica',                   'andamento',   '2026-08-24', '2026-08-31', '1+3',     'aguardando aprovação fornecedor'),
  ('Vidro duplo',                                   'preparacao',  null,         null,         null,      null),
  ('Vidro simples',                                 'a_cotar',     null,         null,         null,      null),
  ('Portas',                                        'preparacao',  null,         null,         null,      null),
  ('Material elétrico / Mecânico',                  'cotado',      '2026-08-26', null,         null,      null),
  ('LEDs',                                          'a_cotar',     null,         null,         null,      null),
  ('Evaporador / Refrigeração',                     'preparacao',  null,         null,         null,      null),
  ('Aço (inox / chapa)',                            'a_cotar',     null,         null,         null,      null),
  ('MDF e ferragens',                               'preparacao',  null,         null,         null,      null),
  ('Painel em PU',                                  'realizado',   '2026-08-20', '2026-08-21', '1+28',    '20% + saldo 28 dias'),
  ('Granito (Verde Ubatuba / Preto São Gabriel)',   'cotado',      '2026-08-21', null,         '1+30/60', null),
  ('Estofados',                                     'a_cotar',     null,         null,         null,      null),
  ('Outros / a definir',                            'a_cotar',     null,         null,         null,      null)
) as c(categoria, status, data_cotacao, data_compra, forma_pagamento, observacoes);
