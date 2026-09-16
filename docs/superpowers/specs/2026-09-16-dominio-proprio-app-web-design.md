# Domínio próprio para o app-web — Design

## Contexto e motivação

O `app-web` (produto pago: Supabase Auth + RevenueCat Web Billing + "Salvar/reabrir prescrição") hoje vive em `barbsfelipe.github.io/npp-calculator/app-web/`. Essa URL carrega o nome de usuário pessoal do GitHub e o padrão `github.io`, o que reduz a credibilidade percebida por um cliente (médico) no momento de decidir assinar. Um domínio próprio resolve isso: mais confiança na hora da conversão, mais "falável" pra boca a boca entre colegas, possibilita email profissional, e desacopla o produto da identidade pessoal no GitHub. Custo é baixo (~R$40–100/ano) frente ao ganho esperado em conversão.

Discussão anterior (ver `docs/superpowers/specs` — memória `project-dominio-app-web`, pausada em 2026-09-16) já havia cogitado mover `app-web` para a raiz do domínio e a calculadora PWA grátis para um subcaminho. Esta sessão resolve as decisões pendentes: nome do domínio, se a calculadora grátis também muda de lugar, e como implementar sem quebrar nada.

## Decisões já tomadas nesta conversa

- **Nome do domínio:** `nppcalc.com.br` (registrar também `nppcalc.com`, redirecionando para o `.com.br`).
- **Base instalada do PWA grátis hoje:** apenas o próprio usuário (instalação de teste). Risco de quebrar instalações de terceiros é praticamente nulo — isso elimina a necessidade de qualquer estratégia de compatibilidade/redirect complexa para o PWA existente.
- **A calculadora PWA grátis não entra no domínio novo.** Continua exclusivamente em `barbsfelipe.github.io/npp-calculator/calculadora_npp_v0_5_8-2.html`, sem nenhuma alteração.
- **`app-web` deve abrir na raiz do domínio novo** (`nppcalc.com.br/`), não em um subcaminho.

## Restrição técnica descoberta (determina a arquitetura)

Confirmado via `gh api repos/barbsfelipe/npp-calculator/pages`: o GitHub Pages deste repositório é do tipo "Project Pages" clássico (`build_type: legacy`, source `main:/`), sem domínio customizado configurado (`cname: null`) hoje.

Um repositório GitHub só pode ter **um** domínio customizado, mapeado à raiz do repositório inteiro. Assim que um domínio customizado é configurado, o GitHub Pages passa a redirecionar automaticamente (301) *toda* URL antiga em `usuario.github.io/repo/...` para o domínio novo, path a path — não é possível manter o `github.io` respondendo com o conteúdo antigo enquanto o domínio novo aponta pra outra coisa, dentro do mesmo repositório.

Isso torna impossível satisfazer as duas decisões acima ("PWA grátis intocado no `github.io` antigo" + "`app-web` na raiz do domínio novo") dentro de um único repositório. **A solução é usar dois repositórios/sites GitHub Pages separados.**

## Arquitetura

- **`npp-calculator`** (repositório atual): nenhuma mudança de infraestrutura. Continua servindo em `barbsfelipe.github.io/npp-calculator/` sem domínio customizado. A calculadora PWA grátis (`calculadora_npp_v0_5_8-2.html`, `manifest.json`, `sw.js`, `icons/`) permanece exatamente como está.
- **`nppcalc-web`** (repositório novo): contém uma cópia de `app-web/index.html` e `app-web/config.js`, mais um arquivo `CNAME` (conteúdo: `nppcalc.com.br`). GitHub Pages habilitado (branch `main`, path `/`), domínio customizado `nppcalc.com.br` configurado ali.

### Sincronização `app-web/` → `nppcalc-web`

Para não criar um quinto ponto de código fácil de esquecer sincronizar (o CLAUDE.md já registra um incidente real disso acontecer com as 4 implementações existentes), a cópia publicada em `nppcalc-web` é mantida automaticamente por um workflow do GitHub Actions no repositório atual:

- Novo arquivo: `.github/workflows/sync-app-web.yml`.
- Disparo: `push` no branch `main` que altere qualquer arquivo em `app-web/**`.
- Ação: faz checkout do `nppcalc-web`, copia `app-web/index.html` → `index.html` e `app-web/config.js` → `config.js` na raiz dele, commita e dá push (usando um GitHub Personal Access Token com escopo restrito ao repositório `nppcalc-web`, salvo como secret `NPPCALC_WEB_DEPLOY_TOKEN` no repositório `npp-calculator`).
- O fluxo de edição do desenvolvedor não muda: continua editando `app-web/index.html` neste repositório como hoje; o deploy no domínio novo acontece sozinho ~1 minuto depois do push no `main`.
- Se o workflow falhar (ex.: token expirado), a falha aparece na aba Actions do GitHub — não há fallback silencioso, o que é aceitável dado que o `npp-calculator` já tem precedente de CI (`.github/workflows/app-mobile-tests.yml`) sendo observado manualmente.

## Passos de implementação (visão geral — detalhados no plano de execução)

1. **Registro de domínio** (ação manual do usuário, fora do repositório): `nppcalc.com.br` via Registro.br; `nppcalc.com` via Cloudflare Registrar/Namecheap configurado para redirecionar ao `.com.br`.
2. **Criar o repositório `nppcalc-web`**, com `CNAME`, cópia inicial de `index.html`/`config.js`, GitHub Pages habilitado.
3. **Configurar DNS**: registros `A` do domínio apex para os 4 IPs do GitHub Pages (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`), `CNAME` de `www` para `barbsfelipe.github.io`.
4. **Criar o workflow de sincronização** `sync-app-web.yml` no `npp-calculator`, gerar o PAT com escopo restrito e salvá-lo como secret.
5. **Atualizar configuração externa** para aceitar o domínio novo:
   - Supabase Auth → adicionar `https://nppcalc.com.br` (e `https://www.nppcalc.com.br` se aplicável) à lista de Redirect URLs permitidas.
   - RevenueCat Web Billing → adicionar `nppcalc.com.br` às origens permitidas.
6. **Verificação end-to-end** no domínio novo: abrir `nppcalc.com.br`, testar login, testar uma prescrição de ponta a ponta, testar checkout sandbox do RevenueCat. Confirmar que `barbsfelipe.github.io/npp-calculator/` continua respondendo sem alteração.

## Fora de escopo

- Mover a calculadora PWA grátis para qualquer subcaminho do domínio novo (decisão explícita do usuário: ela não entra no domínio novo).
- Qualquer redesign visual do `app-web` motivado pelo domínio novo.
- Email profissional (`contato@nppcalc.com.br`) — mencionado como benefício futuro do domínio, não implementado nesta rodada.
- Publicar o app mobile (`app-mobile`) com o campo "Developer website" apontando pro domínio novo — pertence ao trabalho já em andamento de lançamento na App Store, tratado separadamente.
