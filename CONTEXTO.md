# Contexto do projeto — Sistema Pro Cooler

Resumo pra retomar o trabalho em outra estação (ou com uma sessão nova do Claude Code). Leia isto antes de continuar.

## O negócio

**Pro Cooler Soluções Comerciais** (RS) fabrica equipamentos de refrigeração comercial sob medida (vitrines, balcões, câmaras frigoríficas, confeitaria) para açougues, padarias e mercados.

Modelo de negócio real (importante — não é uma loja tradicional):
- A Pro Cooler atua como **assessora de compras**. O cliente paga os fornecedores **direto** — a Pro Cooler não intermedia esse dinheiro.
- A Pro Cooler cobra só pela **mão de obra / assessoria** (negociação, gestão do projeto).
- Isso permite negociar preços melhores que o modelo tradicional ("nós fabricamos e vendemos tudo") e mostrar a economia gerada pro cliente — inclusive cobrando uma comissão (% configurável, hoje 20%) sobre essa economia.
- Marca: vermelho `#C0272D` (badge "PRO") + azul `#0B5FA5` (badge "COOLER") + preto quase puro `#1A1A1A`. Fonte da paleta: `D:\Biblioteca Digital\Memorando_ProCooler_14ago2026.md` e o site institucional em `C:\Users\Marco Tulio\Downloads\Diversos\procooler-pagina-principal-v1.html`.

## O que foi construído

Sistema web completo: painel interno (equipe) + portal do cliente, com backend real no Supabase.

**Stack**: HTML/CSS/JS puro (sem build), Supabase (Postgres + Auth + Storage + RLS + RPC), deploy automático via GitHub → Vercel.

- **Repo**: `github.com/marcopaim120-sketch/sistema-procooler` (público)
- **Site ao vivo**: `https://sistema-procooler.vercel.app`
- **Projeto Supabase**: `fjvzdbgtfjirnaacshch` (org "Pro Cooler" / "Refrigerador profissional", plano Free)

### Módulos do painel interno (`index.html` + `js/app.js`)
Dashboard, Clientes, Fornecedores, Projetos & Propostas (com proposta comercial, comparação 3 vias: nossa proposta × modelo antigo × concorrentes), Compras (com cotações de múltiplos fornecedores comparadas — quem "vence" alimenta a compra automaticamente), Serviços Terceirizados (mesmo padrão de cotações, com flag `billable_to_client`), Etapas de Produção, Pagamentos (cliente→fornecedor), Recebimentos (cliente→Pro Cooler), Documentos, e **"👁 Visão do cliente"** (item de menu fixo + botão por projeto — deixa a equipe pré-visualizar o portal exatamente como o cliente vê, sem precisar da senha).

### Portal do cliente (`client-portal.html` + `js/client-portal.js`)
Acesso público via link único (`?token=...`) + senha (definida pela equipe, hash bcrypt). Mostra: status/NF, caixa de economia ("ECONOMIA COMPROVADA"), proposta comercial com **copy de vendas** + comparação visual em barras (nosso modelo vs. tradicional, com % de economia em destaque), cotações de fornecedores comparadas, evolução das compras, cotações de serviços, serviços terceirizados, etapas, pagamentos (com resumo mensal), recebimentos, documentos agrupados por categoria. Cada bloco tem ícone + faixa de cor (accent-blue/green/amber) e badges de status coloridos (verde=concluído/pago, azul=andamento, âmbar=pendente, vermelho=atrasado/cancelado — função `statusColor()` em `client-portal.js`).

Anexos são **por registro específico** (compra, cotação, serviço, pagamento, recebimento), não um painel genérico — isso foi uma correção explícita pedida pelo usuário (ver histórico de decisões abaixo).

### Banco de dados (`supabase/schema.sql`)
Tabelas: `clients`, `suppliers`, `projects` (tem `share_token`, `access_password_hash`), `proposals` (tem `old_model_price`, `commission_pct`), `proposal_items`, `competitor_quotes`, `purchases`, `purchase_quotes`, `outsourced_services`, `service_quotes`, `project_stages`, `payments`, `receivables`, `documents` (várias FKs nullable pra anexar em qualquer registro específico).

RLS: equipe autenticada tem acesso total; público (anon) só acessa via RPC `get_project_public(token, senha)`. Também existe `get_project_public_by_id(project_id)`, restrita a `authenticated`, usada pelo botão "Visão do cliente" (não exige senha).

**Cuidado conhecido**: o Supabase instala `pgcrypto` no schema `extensions`, não `public` — por isso as funções usam `set search_path = public, extensions`.

## Decisões importantes (não óbvias)

1. **Anexos são individuais por registro**, nunca um painel genérico — o usuário corrigiu isso explicitamente quando tentei consolidar.
2. **Cores**: usar a paleta oficial da marca (azul/vermelho) só nos elementos estruturais (botões, links, totais, header), mantendo o **código de cores contábil universal** nos status (verde=positivo, vermelho=alerta, âmbar=pendente) — não substituir tudo pela cor da marca.
3. **"Visão do cliente"**: recurso pra equipe simular o portal sem senha, com faixa de aviso "Modo pré-visualização" e botão de saída (topo e rodapé).
4. **Convites de equipe**: sempre usar "Send invitation" no Supabase Auth (nunca "Create new user" com senha) pra outras pessoas — assim elas definem a própria senha, sem eu manipular credenciais.

## Problema recente já resolvido

O projeto Supabase **pausou por inatividade** (comum no plano Free) e isso quebrou tudo (login, portal). Foi resolvido clicando em "Resume project" no dashboard do Supabase. Também corrigimos a **Configuração de URL** do Auth (estava com `Site URL = http://localhost:3000`, o que quebrava todo link de e-mail — recuperação de senha, convite). Já corrigido para `https://sistema-procooler.vercel.app`, com `https://sistema-procooler.vercel.app/**` na lista de redirect URLs permitidas.

**Se isso acontecer de novo**: `supabase.com/dashboard/project/fjvzdbgtfjirnaacshch` → botão de retomar projeto.

## Acessos de equipe (admin, todos com mesmo nível de acesso)

- `marcopaim120@gmail.com` (dono)
- `tuliogolinpaim@gmail.com` (convite enviado)
- `paim.brunopro@gmail.com` (convite enviado)

## Pendências / próximos passos

- **Reordenar os itens do menu lateral** (`index.html`, dentro de `.sidebar nav`) — usuário confirmou que os 4 primeiros (Dashboard, Clientes, Fornecedores, Projetos & Propostas) estão certos na ordem atual, mas ainda não definiu a ordem dos demais.
- **Renomear o endereço** `sistema-procooler.vercel.app` para algo definitivo — decisão de nome ainda em aberto (parado nessa escolha).
- **2FA na conta Vercel** — lembrete do próprio usuário, ainda não configurado.
- **Projeto real "Padaria Petrópolis"**: existe como projeto de teste/demo no banco (nome do cliente, compras de exemplo como "Câmara fria" e "Balcão refrigerado" foram criadas pra testar o fluxo) — precisa revisar/limpar dados de teste antes de usar pra valer.
- Seed original em `supabase/seed_petropolis.sql` tem placeholder `'Cliente Petrópolis (AJUSTAR NOME REAL)'` — ainda não corrigido pro nome real do cliente.

## Como retomar

```bash
git clone https://github.com/marcopaim120-sketch/sistema-procooler.git
```

O site, banco e deploy já funcionam de qualquer lugar (nuvem) — só o histórico desta conversa fica pra trás. Se me perguntar sobre algo aqui, já leio este arquivo primeiro.
