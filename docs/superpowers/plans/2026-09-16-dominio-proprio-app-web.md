# Domínio próprio para o app-web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o `app-web` (produto pago) no ar em `https://nppcalc.com.br`, mantendo o `npp-calculator` repo e a calculadora PWA grátis em `barbsfelipe.github.io/npp-calculator/` completamente intocados.

**Architecture:** Dois repositórios GitHub Pages separados. `npp-calculator` (existente) não muda. Um repositório novo, `nppcalc-web`, hospeda uma cópia de `app-web/index.html` + `app-web/config.js` na raiz, com `nppcalc.com.br` como domínio customizado. Um workflow do GitHub Actions em `npp-calculator` mantém a cópia em `nppcalc-web` sincronizada automaticamente a cada push no `main` que altere `app-web/`.

**Tech Stack:** GitHub Pages (custom domain, DNS via Cloudflare — ver nota na Task 3 sobre a migração do DNS gratuito do Registro.br), GitHub Actions, `gh` CLI, Supabase Auth (dashboard), RevenueCat Web Billing / Stripe (dashboard).

## Global Constraints

- Domínio: `nppcalc.com.br` (Registro.br). `nppcalc.com` fica de fora desta rodada (decisão de 2026-09-16, ver Task 1) — pode ser registrado depois, sem impacto nas outras tasks.
- A calculadora PWA grátis (`calculadora_npp_v0_5_8-2.html`, `manifest.json`, `sw.js`, `icons/`) e o repositório `npp-calculator` **não sofrem nenhuma alteração de infraestrutura** (sem CNAME, sem domínio customizado, sem mudança de path).
- `app-web` deve abrir na **raiz** do domínio novo (`https://nppcalc.com.br/`), não em subcaminho.
- Repositório novo do GitHub: `barbsfelipe/nppcalc-web`, público, contendo só `index.html`, `config.js` e `CNAME` na raiz.
- Sincronização `app-web/` → `nppcalc-web` é automática via GitHub Actions — nenhum passo manual de cópia no fluxo de trabalho normal do desenvolvedor.
- Projeto Supabase usado pelo `app-web`: ref `tawlbzdzpovpfybljkwc` (URL `https://tawlbzdzpovpfybljkwc.supabase.co`, mesmo projeto do `app-mobile` — ver `app-web/config.js:5`).
- Spec de referência: `docs/superpowers/specs/2026-09-16-dominio-proprio-app-web-design.md`.

---

### Task 1: Registrar o domínio

**Decisão (2026-09-16):** registrar só `nppcalc.com.br` por agora. O `nppcalc.com` fica de fora nesta rodada — é puramente defensivo (evitar que terceiros registrem pra confundir clientes), não é necessário pro produto funcionar, e pode ser registrado depois se a marca crescer. Os passos originais de registro/redirect do `.com` (removidos abaixo) continuam válidos como referência se essa decisão mudar no futuro.

**Files:** nenhum (ação fora do repositório).

**Interfaces:**
- Produces: posse confirmada de `nppcalc.com.br`, acesso ao painel de DNS — necessário para a Task 3.

- [x] **Step 1: Registrar `nppcalc.com.br` no Registro.br**

Acesse `https://registro.br`, busque `nppcalc.com.br`, registre usando o CPF do usuário. Custo aproximado: R$40/ano. Guarde o acesso ao painel (usado na Task 3 para configurar DNS).

- [x] **Step 2: Verificar o registro**

```bash
whois nppcalc.com.br | head -5
```

Esperado: mostra um registrant/status diferente de "available"/"no match" (i.e., o domínio aparece como registrado).

---

### Task 2: Criar o repositório `nppcalc-web` com conteúdo inicial

**Files:**
- Create (novo repositório): `nppcalc-web/index.html` (cópia de `app-web/index.html`)
- Create (novo repositório): `nppcalc-web/config.js` (cópia de `app-web/config.js`)
- Create (novo repositório): `nppcalc-web/CNAME` (conteúdo: `nppcalc.com.br`)

**Interfaces:**
- Consumes: nenhuma dependência de código do `npp-calculator` além de copiar os dois arquivos existentes `app-web/index.html` e `app-web/config.js` como estão.
- Produces: repositório `barbsfelipe/nppcalc-web` no GitHub, com Pages habilitado e domínio customizado configurado — necessário para a Task 3 (DNS aponta pra ele) e Task 4 (o workflow de sync faz push nele).

- [x] **Step 1: Montar o diretório local do novo repositório**

```bash
mkdir -p /tmp/nppcalc-web
cd /tmp/nppcalc-web
git init -b main
cp "/Users/felipebarbosa/Desktop/Claude/NPP Calculator/app-web/index.html" .
cp "/Users/felipebarbosa/Desktop/Claude/NPP Calculator/app-web/config.js" .
echo "nppcalc.com.br" > CNAME
```

- [x] **Step 2: Commit inicial**

```bash
git add -A
git commit -m "Import inicial de app-web/ do repositório npp-calculator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [x] **Step 3: Criar o repositório no GitHub e fazer push**

```bash
gh repo create barbsfelipe/nppcalc-web --public --source=. --remote=origin --push
```

Expected: comando termina sem erro e imprime a URL `https://github.com/barbsfelipe/nppcalc-web`.

- [x] **Step 4: Habilitar GitHub Pages com domínio customizado**

```bash
gh api -X POST repos/barbsfelipe/nppcalc-web/pages \
  -f "source[branch]=main" \
  -f "source[path]=/" \
  -f "cname=nppcalc.com.br"
```

Se a API retornar erro reclamando que `cname` não é aceito nesse POST, rode em duas etapas:

```bash
gh api -X POST repos/barbsfelipe/nppcalc-web/pages -f "source[branch]=main" -f "source[path]=/"
gh api -X PUT repos/barbsfelipe/nppcalc-web/pages -f "cname=nppcalc.com.br"
```

- [x] **Step 5: Verificar a configuração do Pages**

```bash
gh api repos/barbsfelipe/nppcalc-web/pages
```

Expected: JSON com `"cname":"nppcalc.com.br"` e `"source":{"branch":"main","path":"/"}`. O campo `"status"` pode aparecer como `null` ou `"building"` até a Task 3 (DNS) estar propagada — isso é esperado nesta etapa, não é falha.

---

### Task 3: Configurar DNS

**Files:** nenhum (configuração no painel do Registro.br).

**Interfaces:**
- Consumes: acesso ao painel de DNS do `nppcalc.com.br` (Task 1), repositório `nppcalc-web` com Pages habilitado (Task 2).
- Produces: `nppcalc.com.br` resolvendo para o GitHub Pages, com HTTPS válido — necessário para a Task 5 (Supabase/RevenueCat) e Task 6 (verificação end-to-end) fazerem sentido.

**Nota de execução (2026-09-16):** o DNS gratuito do Registro.br (`a.auto.dns.br`/`b.auto.dns.br`) apresentou um problema real — os registros ficavam salvos no painel mas nunca eram servidos pelo nameserver autoritativo (confirmado via `dig` direto nele, múltiplas vezes, com o serial da zona mudando sem incluir os registros novos). Migramos o DNS pro **Cloudflare** (nameservers do Cloudflare configurados no Registro.br via "Alterar servidores DNS"), e os registros abaixo foram cadastrados lá em vez de no painel do Registro.br. Mantido como referência de quais registros são necessários, independente do provedor.

- [x] **Step 1: Adicionar os registros A do domínio apex**

No painel de DNS (Cloudflare, `@`, nuvem cinza/"DNS only"), adicione 4 registros tipo `A` para `nppcalc.com.br`, um pra cada IP:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

- [x] **Step 2: Adicionar o registro CNAME de `www`**

Registro tipo `CNAME`, hostname `www`, valor `barbsfelipe.github.io`, nuvem cinza/"DNS only".

- [x] **Step 3: Aguardar propagação e verificar**

```bash
dig nppcalc.com.br +short
```

Expected: retorna os 4 IPs do Step 1 (pode levar de minutos a ~24h para propagar completamente).

- [x] **Step 4: Verificar o certificado HTTPS emitido pelo GitHub**

```bash
gh api repos/barbsfelipe/nppcalc-web/pages | grep -i https
curl -Is https://nppcalc.com.br | head -1
```

Expected: `"https_enforced":true` (pode levar algumas horas depois da propagação de DNS para o GitHub emitir o certificado) e o `curl` retornando `HTTP/2 200`. Se o `curl` retornar erro de certificado, aguarde mais algumas horas e tente novamente antes de investigar mais a fundo.

---

### Task 4: Workflow de sincronização automática `app-web/` → `nppcalc-web`

**Files:**
- Create: `.github/workflows/sync-app-web.yml` (no repositório `npp-calculator`)

**Interfaces:**
- Consumes: repositório `barbsfelipe/nppcalc-web` já existente (Task 2); secret `NPPCALC_WEB_DEPLOY_TOKEN` no repositório `npp-calculator`.
- Produces: a cada push em `main` que altere `app-web/index.html` ou `app-web/config.js`, o conteúdo correspondente em `nppcalc-web` é atualizado e commitado automaticamente — é o mecanismo que a Task 6 usa para validar que uma mudança em `app-web/` aparece no domínio novo sem passo manual.

- [x] **Step 1: Gerar o Personal Access Token (ação manual no GitHub)**

Acesse `https://github.com/settings/personal-access-tokens/new`. Crie um **fine-grained token**:
- Repository access: "Only select repositories" → `barbsfelipe/nppcalc-web`.
- Permissions: "Contents" → "Read and write".
- Expiration: 1 ano (anote a data para renovar depois).

Copie o token gerado (só é exibido uma vez).

- [x] **Step 2: Salvar o token como secret no repositório `npp-calculator`**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
gh secret set NPPCALC_WEB_DEPLOY_TOKEN --repo barbsfelipe/npp-calculator
```

Cole o token quando solicitado.

- [x] **Step 3: Escrever o workflow**

Criar `.github/workflows/sync-app-web.yml`:

```yaml
name: Sync app-web to nppcalc-web

on:
  push:
    branches: [main]
    paths:
      - 'app-web/index.html'
      - 'app-web/config.js'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout npp-calculator (source files)
        uses: actions/checkout@v4
        with:
          sparse-checkout: |
            app-web/index.html
            app-web/config.js
          sparse-checkout-cone-mode: false

      - name: Checkout nppcalc-web (deploy target)
        uses: actions/checkout@v4
        with:
          repository: barbsfelipe/nppcalc-web
          token: ${{ secrets.NPPCALC_WEB_DEPLOY_TOKEN }}
          path: nppcalc-web

      - name: Copy updated files
        run: |
          cp app-web/index.html nppcalc-web/index.html
          cp app-web/config.js nppcalc-web/config.js

      - name: Commit and push if changed
        working-directory: nppcalc-web
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add index.html config.js
          if git diff --cached --quiet; then
            echo "No changes to sync."
            exit 0
          fi
          git commit -m "Sync app-web from npp-calculator (${GITHUB_SHA})"
          git push
```

- [x] **Step 4: Commitar e enviar o workflow**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
git add .github/workflows/sync-app-web.yml
git commit -m "Adiciona workflow de sincronização automática app-web → nppcalc-web

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

- [x] **Step 5: Testar o workflow com uma alteração trivial**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
echo "<!-- sync test $(date -u +%FT%TZ) -->" >> app-web/index.html
git add app-web/index.html
git commit -m "Teste do workflow de sincronização"
git push
```

- [x] **Step 6: Verificar que o workflow rodou com sucesso**

```bash
sleep 30
gh run list --repo barbsfelipe/npp-calculator --workflow=sync-app-web.yml --limit 1
```

Expected: a linha mais recente mostra `completed` / `success`.

- [x] **Step 7: Verificar que o arquivo mudou em `nppcalc-web` e remover o comentário de teste**

```bash
gh api repos/barbsfelipe/nppcalc-web/contents/index.html --jq '.content' | base64 -d | tail -3
```

Expected: a última linha mostra o comentário `<!-- sync test ... -->` adicionado no Step 5, confirmando que a sincronização funcionou. Depois, reverta o comentário de teste do `app-web/index.html` no `npp-calculator`:

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
git revert --no-edit HEAD
git push
```

Aguarde o workflow rodar de novo (repita o Step 6) para confirmar que a remoção também sincronizou.

---

### Task 5: Atualizar Supabase Auth e RevenueCat Web Billing

**Files:** nenhum (configuração em dashboards externos).

**Interfaces:**
- Consumes: `nppcalc.com.br` já resolvendo com HTTPS válido (Task 3).
- Produces: login e checkout funcionando a partir da origem `https://nppcalc.com.br` — necessário para a Task 6.

- [x] **Step 1: Adicionar o domínio novo nas Redirect URLs do Supabase Auth**

Acesse `https://supabase.com/dashboard/project/tawlbzdzpovpfybljkwc/auth/url-configuration`. Em "Redirect URLs", adicione:

```
https://nppcalc.com.br
https://nppcalc.com.br/**
```

Mantenha as URLs existentes do `github.io` (não remover). Salve.

- [x] **Step 2: Adicionar o domínio novo nas origens autorizadas do RevenueCat Web Billing**

Correção de execução (2026-09-16): esse cadastro não fica no painel da RevenueCat, fica no **Stripe** (que processa o pagamento por trás do Web Billing) — `https://dashboard.stripe.com/settings/payment_method_domains`, modo Test, "Add a new domain" → `nppcalc.com.br`. Feito e confirmado ("Enabled").

- [x] **Step 3: Verificar as duas configurações**

Não há comando de verificação automatizável aqui — a verificação real acontece na Task 6 (login e checkout end-to-end). Confirme visualmente, antes de prosseguir, que ambas as listas mostram `nppcalc.com.br` salvo.

---

### Task 6: Verificação end-to-end e checklist final

**Files:** nenhum.

**Interfaces:**
- Consumes: todas as tasks anteriores completas.
- Produces: confirmação de que o domínio novo está pronto pra uso real, e de que o `npp-calculator`/calculadora grátis não foram afetados.

- [x] **Step 1: Testar login no domínio novo**

Abra `https://nppcalc.com.br` num navegador, faça login com uma conta de teste existente. Expected: login funciona sem erro de redirect/CORS.

- [x] **Step 2: Testar uma prescrição de ponta a ponta**

Preencha uma prescrição de teste, use "Salvar prescrição", reabra pela busca por nome. Expected: comportamento idêntico ao já validado em `barbsfelipe.github.io/npp-calculator/app-web/`.

- [x] **Step 3: Testar o checkout sandbox do RevenueCat**

Dispare o fluxo de assinatura/paywall e complete um checkout de teste (chave `rcb_sb_...` = sandbox, conforme `app-web/config.js:10` — não é cobrança real). Expected: checkout completa e o app reconhece o acesso liberado.

- [x] **Step 4: Confirmar que o `npp-calculator` original não mudou**

```bash
curl -Is https://barbsfelipe.github.io/npp-calculator/calculadora_npp_v0_5_8-2.html | head -1
curl -Is https://barbsfelipe.github.io/npp-calculator/app-web/ | head -1
```

Expected: ambos retornam `HTTP/2 200`, exatamente como antes desta mudança — nenhum redirecionamento pro domínio novo.

- [x] **Step 5: Atualizar a memória do projeto**

Depois de tudo verificado, atualizar (não recriar) o arquivo de memória `project_dominio-app-web.md` marcando a migração como concluída, com a URL final e a data.

---

## Fora de escopo (repetido da spec, não criar tasks pra isso)

- Mover a calculadora PWA grátis para o domínio novo.
- Redesign visual do `app-web`.
- Email profissional (`contato@nppcalc.com.br`).
- Campo "Developer Website" da App Store Connect (pertence ao trabalho de lançamento na App Store, já em andamento separadamente).
