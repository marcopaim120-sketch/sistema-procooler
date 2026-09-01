# Sistema Web — Pro Cooler Soluções Comerciais

Sistema para controlar propostas comerciais, compras, pagamentos a
fornecedores e dar transparência ao cliente sobre a evolução do projeto
(incluindo a economia gerada pela assessoria de compras). Pensado para o
fluxo real da Pro Cooler: projetos de fabricação sob medida de equipamentos
e estruturas comerciais (vitrines refrigeradas, balcões, confeitaria,
câmaras frigoríficas etc.) para açougues, padarias e mercados.

## Estrutura

- `index.html` — painel interno da equipe (login necessário).
- `client-portal.html` — página pública que o cliente acessa por um link
  único, sem precisar de login.
- `js/app.js` — lógica do painel interno.
- `js/client-portal.js` — lógica do portal do cliente.
- `js/supabaseClient.js` — configuração de conexão com o Supabase (você
  precisa preencher).
- `supabase/schema.sql` — script para criar todas as tabelas, permissões e
  a função pública usada pelo portal do cliente.
- `supabase/seed_petropolis.sql` — dados de exemplo com o projeto real
  "Petrópolis" (33 itens sob medida), já no formato do sistema, para
  substituir o controle solto que era feito em planilha Excel.

## Passo 1 — Criar o projeto no Supabase

1. Crie uma conta e um novo projeto em https://supabase.com.
2. No painel do projeto, vá em **SQL Editor**, cole todo o conteúdo de
   `supabase/schema.sql` e execute. Isso cria as tabelas, as regras de
   segurança (RLS) e a função `get_project_public` usada pelo portal do
   cliente.
3. Vá em **Storage** e crie um bucket chamado `documents`, marcado como
   **público** (leitura pública). É nele que ficam os anexos/documentos
   dos projetos.
   - Em **Storage > Policies** do bucket `documents`, adicione uma policy
     de **INSERT/UPDATE/DELETE** restrita a `authenticated` (só a equipe
     pode enviar/apagar arquivos). A leitura pública já vem do bucket
     público.
   - (Opcional) Depois de rodar o `schema.sql`, rode também
     `supabase/seed_petropolis.sql` no SQL Editor para já entrar com o
     projeto real "Petrópolis" cadastrado — ajuste o nome do cliente e os
     valores de custo direto no script antes de rodar.
4. Vá em **Authentication > Users** e crie um usuário (e-mail/senha) para
   cada pessoa da equipe que vai usar o painel interno. Não existe
   cadastro público — o acesso interno é só por convite manual.
5. Vá em **Project Settings > API** e copie a **Project URL** e a chave
   **anon public**.

## Passo 2 — Configurar o app

Abra `js/supabaseClient.js` e substitua:

```js
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "SUA_CHAVE_ANON_AQUI";
```

pelos valores copiados no passo anterior.

## Passo 3 — Testar localmente

Não precisa de build. Basta servir a pasta como arquivos estáticos, por
exemplo:

```bash
python -m http.server 5173
```

E abrir `http://localhost:5173`.

## Passo 4 — Publicar (hospedagem pública)

Como é só HTML/CSS/JS estático, qualquer um destes serve:

- **Vercel** ou **Netlify**: arraste a pasta do projeto (ou conecte um
  repositório Git) — deploy automático, com HTTPS e domínio gratuito.
- **GitHub Pages**: suba os arquivos num repositório e ative o Pages.

Depois de publicado, o link do portal do cliente será algo como:
`https://seu-dominio.com/client-portal.html?token=xxxxxxxx`
(o token é gerado automaticamente por projeto e aparece no painel interno,
na tela de cada projeto, com um botão "Copiar").

**O link sozinho não abre o portal** — o cliente também precisa de uma
**senha**, definida por vocês na tela do projeto ("Senha de acesso do
cliente" + botão "Salvar senha"). Combine essa senha com o cliente por um
canal separado do link (ligação, WhatsApp), nunca no mesmo e-mail/mensagem
onde vai o link.

## Como funciona o fluxo

1. Cadastre o **cliente** e crie um **projeto** para ele.
2. Abra o projeto e monte a **proposta comercial**: adicione os itens de
   material orçado (descrição, quantidade, custo unitário), a **mão de
   obra**, e opcionalmente preços de **concorrentes** para comparativo.
3. Envie ao cliente o **link do portal** (botão "Copiar" na tela do
   projeto). Ele acompanha tudo por ali, sem precisar de login.
4. Conforme a assessoria de compras avança, registre cada **compra** em
   "Compras" — por categoria de material (ferro/estrutura metálica, vidro,
   portas, elétrico, LEDs, evaporador/refrigeração, aço inox/chapa, MDF e
   ferragens, painel em PU, granito, estofados etc.) ou vinculada a um
   item específico da proposta, o que fizer mais sentido no projeto. O
   status de cada compra segue o fluxo real: **a cotar → cotado →
   preparação → andamento → realizado** (ou cancelado), com datas
   previstas de cotação e de compra/pagamento, forma de pagamento (ex:
   "1+28", "1+30/60") e observações — o mesmo controle que antes era feito
   numa planilha solta, agora num só lugar e visível ao cliente. O sistema
   calcula automaticamente a **economia gerada** (orçado − real) e mostra
   isso tanto no dashboard interno quanto no portal do cliente.
5. **Importante sobre o dinheiro**: quem paga o fornecedor é o **cliente**,
   diretamente — a Pro Cooler não intermedia essa grana, só assessora. Por
   isso existem duas seções separadas:
   - **"Pagamentos"**: o cronograma do que o cliente paga aos
     fornecedores (você só acompanha e organiza).
   - **"Recebimentos"**: o que o cliente paga **para a Pro Cooler** —
     essa sim é a receita real da empresa (a mão de obra / taxa de
     assessoria da proposta).
   O cliente vê as duas coisas no portal, para transparência total.
6. Envie **documentos** (contrato, projeto técnico, comprovantes, NF) em
   "Documentos", marcando se cada um é visível ao cliente ou não.
7. O campo de **NF** no projeto guarda só o status (pendente/emitida) e o
   número/data — a emissão fiscal em si continua sendo feita no seu
   emissor de notas atual. Uma integração real de emissão de NF (via
   NFe.io, eNotas, etc.) exigiria certificado digital e CNPJ homologado —
   pode ser um passo futuro, se quiser.

## Segurança (importante)

- O painel interno (`index.html`) exige login (Supabase Auth) e qualquer
  usuário autenticado tem acesso total aos dados — não há hoje separação
  de permissões entre membros da equipe.
- O portal do cliente exige **duas coisas**: o link com o token (um UUID
  longo, não adivinhável) **e** a senha definida por vocês para aquele
  projeto. A senha fica salva como hash (bcrypt via `pgcrypto`), nunca em
  texto puro no banco. Ainda assim, trate o link e a senha como
  informação a compartilhar só com o cliente certo, de preferência por
  canais separados.
- Os documentos no bucket `documents` são publicamente legíveis por quem
  tiver a URL exata do arquivo (não listável, mas não é um segredo
  forte). Para dados muito sensíveis, isso pode ser evoluído depois para
  URLs assinadas com expiração.
