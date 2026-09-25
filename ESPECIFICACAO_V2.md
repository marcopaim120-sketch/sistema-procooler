# Especificação V2 — Sistema Pro Cooler (decidida com o Marco em 24/09/2026)

Documento vivo. Ainda **nada foi implementado**. Leia junto com `CONTEXTO.md`.

## Regras gerais
- Os 3 gestores (usuários do app interno) têm acesso total. O cliente só vê o **portal**.
- **Chave "Mostrar ao cliente"** em TODO lançamento de TODAS as abas (inclui cada PDF/imagem). Só existe no app interno. O filtro fica **no banco** (funções do portal), nunca só na tela. Novos lançamentos nascem **ocultos**; os já existentes continuam **visíveis**.
- Somar ao banco, **sem apagar nada**. Antes de qualquer alteração, criar cópia (`*_bak_YYYYMMDD`) das tabelas afetadas. O usuário roda o SQL no Supabase; o `git push` também é do usuário (o Claude Code bloqueia deploy).
- Cores de status (paleta da marca, aceitas): iniciado = azul-claro; em andamento = azul da marca `#0B5FA5`; concluído = verde; atrasado = vermelho `#C0272D` (automático: prazo vencido e não concluído).
- **Vários projetos**: cotações/compras podem servir 1, 2 ou 3 projetos ao mesmo tempo; o cliente vê os projetos separados ou juntos (escolha dele no acesso). Dashboard, etapas e demais abas aceitam mais de um projeto.

## Menu
Dashboard · Clientes · Fornecedores · Projetos & Propostas · Cotações · Compras · Etapas de Produção · Pagamentos · Recebimentos · Documentos · Visão do cliente. (Serviços terceirizados deixam de existir: tudo nasce em Cotações e vira Compra.)

## Fluxo
1. **Proposta comercial** fornece a cada cotação: Materiais orçados, Prioridade e Estimado (acompanham a proposta; só esses 3 campos sincronizam).
2. **Cotações**: demais campos vêm de PDF/imagem (leitura automática por IA, depois) ou digitação. Colunas: Prior., Projeto(s), Materiais orçados, Fornecedor, Estimado, Orçado, Fechado (antigo "Real"), Economia = Estimado − Fechado, Previsão de compra, Previsão de entrega, Data da compra, Data da entrega, Status. Botões: Cotações (PDF), Anexos (imagens), Editar, Excluir.
3. **Compras** = cotações com status "realizado" (visão, **sem copiar linha**). Guardam o pedido atualizado (último PDF/imagem) e anexos (comprovantes, desenhos). Têm condições de pagamento (ex.: 1+2 = entrada + 2 parcelas), campos de dias das parcelas contados da data da compra (ex.: 28 / 56; a entrada é no dia 0), cadastro de fornecedor (por PDF/imagem ou manual: razão social, CNPJ, inscrição estadual, e-mail, telefone — sistema sugere, usuário confirma) e botão **gerar pagamentos** (entrada e cada parcela viram pagamentos separados).
4. **Pagamentos** são alimentados pelas Compras.
5. **Etapas de Produção** (não ligadas automaticamente às Compras; a etapa "Compras" apenas mostra o trabalho de curadoria).
6. **Dashboard do cliente**: blocos ligáveis/desligáveis por projeto (economia, orçado × fechado, etapas, pagamentos, recebimentos…); os números contam só o que estiver visível.

## Etapas de Produção (nova tela)
- Tela por projeto, com coluna **Projeto** mantida (para o cliente ver outros projetos andando juntos).
- **Grupos** criados à mão (botão "Novo grupo"), numerados 1, 2, 3 (ex.: Exp Ferr, MDF ferr, Gab. Refrigerados). **Etapas dentro do grupo** criadas à mão, numeradas 1.1, 1.2… (ex.: Detalhamento e medidas, Compras, Produção, Montagem), editáveis, ordem obedece a sequência.
- Colunas fixas no cabeçalho: Sequência · Etapa · Prazo estimado (data de início, dias, data final **digitada**) · Recebimento/Entrega (data real + "ok" marcável). Todas as datas editáveis.
- **Sem** as colunas Cobrado? e Valor (dados antigos permanecem no banco, ocultos).

## Etapas de implementação (testar cada uma com o usuário antes de publicar)
1. Estrutura de Cotações (colunas novas, vínculo com material da proposta, multiprojeto).
2. Compras (visão de realizado, condições/parcelas, fornecedor, gerar pagamentos).
3. Etapas de Produção (grupos/etapas).
4. Chave "Mostrar ao cliente" em todas as tabelas + filtro nas funções do portal.
5. Portal do cliente: acesso a vários projetos, separado/junto, e Dashboard com blocos escolhíveis.
6. Leitura automática de PDF/imagem (função no Supabase + chave da Anthropic guardada como segredo; sugere campos, usuário confirma), aba por aba, por último.

## Decisões finais (24/09/2026)
- **Rateio entre projetos:** cada lançamento tem uma opção "ler documento (preenchimento automático) ou não". Quando a compra atende 2–3 projetos, o usuário faz o lançamento **manual**, informando o **valor ou o % de cada projeto** (sempre começando pelo projeto X). O documento anexado tem o valor total (maior); cada projeto recebe a sua parte; **o pagamento é único**, no valor total e na data do pedido original. Tabela `purchase_allocations` (compra × projeto × item da proposta × valor × %). A economia e o "orçado × fechado" de cada projeto usam a parte dele.
- **Acesso do cliente:** um acesso único por cliente, com os projetos que o gestor liberar; o cliente escolhe ver os projetos separados ou juntos. Todos os projetos vistos juntos são do mesmo cliente.

## Pontos ainda em aberto
- Nenhum de desenho. Conferir na prática: validação "soma do rateio = total do documento" (aviso, não bloqueio).
