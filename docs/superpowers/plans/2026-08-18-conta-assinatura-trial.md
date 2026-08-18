# Conta, Assinatura e Trial Gratuito (Plano 2 de 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao app mobile (`app-mobile/`) o trial gratuito de 3 prescrições, conta de usuário (Supabase Auth) e assinatura mensal/anual (RevenueCat) que libera o uso sem limite — a mesma conta valendo depois para a versão web (Plano 3).

**Architecture:** Tudo dentro do `<script>` único de `app-mobile/www/index.html` (mesmo padrão do resto do arquivo — sem bundler). Um wrapper `prefsGet`/`prefsSet` usa `@capacitor/preferences` no app nativo e cai para `localStorage` fora dele (torna tudo testável em Chromium puro via Playwright, sem precisar do runtime nativo). Supabase Auth via CDN (`@supabase/supabase-js` UMD) cuida de conta/login. RevenueCat (`@revenuecat/purchases-capacitor`) é a fonte de verdade da assinatura; fora do runtime nativo, `hasActiveSubscription()` sempre resolve `false` (mesmo comportamento em teste que em produção antes de logar/comprar).

**Tech Stack:** `@capacitor/preferences`, `@supabase/supabase-js` (via CDN, sem npm install — sem bundler no projeto), `@revenuecat/purchases-capacitor`, `playwright-core` (já instalado, testes contra o HTML direto).

## Global Constraints

- `appId` do Capacitor: `com.npp.calculadora` (inalterado).
- Nenhuma fórmula ou constante de cálculo pode ser alterada — este plano não toca em `calcVolumes()`/`calcularPesoCalorico()`.
- Trial: 3 prescrições grátis, contando a tela inicial (1ª abertura do app) como uso 1; cada clique em "Limpar/Nova" soma mais um. Na 4ª tentativa, bloqueia e mostra o paywall (não deixa ver os campos).
- Preços exatos: mensal **R$49,90**, anual **R$298,80** (= R$24,90/mês).
- Contador de trial é só local (`@capacitor/preferences`/`localStorage`) — sem servidor, sem sincronizar com conta. Reinstalar o app reseta o trial (risco aceito, já registrado no spec).
- Sem backend customizado — só serviços gerenciados (Supabase, RevenueCat). Nenhuma task deste plano deve introduzir um servidor próprio.
- Conta é criada no momento da assinatura (ao clicar num plano no paywall), não antes.

---

### Task 1: Contas Supabase e RevenueCat + arquivo de configuração

**Files:**
- Create: `app-mobile/www/config.js`

**Interfaces:**
- Produces: `window.NPP_CONFIG = { supabaseUrl, supabaseAnonKey, revenueCatApiKeyIOS, revenueCatApiKeyAndroid }` — usado por todas as tasks seguintes (Supabase client na Task 3, RevenueCat na Task 4).

Esta task é majoritariamente manual — precisa de contas em dois serviços externos que só o usuário consegue criar (e-mail/pagamento próprios). Pare neste ponto e peça ao usuário os 4 valores antes de continuar — não adivinhe nem invente valores de exemplo no `config.js` final.

- [ ] **Step 1: Criar o projeto no Supabase**

Peça ao usuário para:
1. Criar conta em https://supabase.com (plano gratuito serve).
2. Criar um novo projeto (nome sugerido: "npp-calculadora").
3. Em **Authentication → Providers → Email**, deixar "Email" habilitado e **desativar "Confirm email"** (senão `signUp` não retorna sessão imediata — sem isso a Task 3 não funciona sem um passo extra de confirmação por e-mail, fora do escopo deste plano).
4. Em **Project Settings → API**, copiar:
   - **Project URL** (formato `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public key** (uma string longa começando com `eyJ...`)

- [ ] **Step 2: Criar o projeto no RevenueCat**

Peça ao usuário para:
1. Criar conta em https://app.revenuecat.com (plano gratuito serve até ~US$2.500/mês de receita).
2. Criar um novo Project (nome sugerido: "Calculadora de NPP").
3. Dentro do projeto, em **Apps**, adicionar um app iOS (Bundle ID `com.npp.calculadora`) e um app Android (Package Name `com.npp.calculadora`).
4. Em cada app, copiar a **Public API Key** (formato `appl_xxxxxxxxxxxxxxxxxxxxxxxxxxx` para iOS, `goog_xxxxxxxxxxxxxxxxxxxxxxxxxxx` para Android).

Nota: os produtos de assinatura (mensal/anual) em si só podem ser cadastrados dentro do RevenueCat depois que existirem contas de desenvolvedor Apple/Google reais com produtos criados no App Store Connect/Play Console — isso é da seção "Configuração de lojas" do spec, fora do escopo deste plano. As Tasks 2-4 aqui constroem e testam toda a lógica em volta disso (trial, conta, chamadas ao SDK) sem depender dos produtos existirem ainda.

- [ ] **Step 3: Criar `app-mobile/www/config.js` com os 4 valores reais**

Depois de ter os 4 valores do usuário, crie o arquivo com este formato exato (substituindo pelos valores reais coletados):

```js
window.NPP_CONFIG = {
  supabaseUrl: 'https://xxxxxxxxxxxx.supabase.co',
  supabaseAnonKey: 'eyJ...',
  revenueCatApiKeyIOS: 'appl_...',
  revenueCatApiKeyAndroid: 'goog_...',
};
```

- [ ] **Step 4: Verificar**

```bash
cd "app-mobile" && node -e "
const fs = require('fs');
const content = fs.readFileSync('www/config.js', 'utf8');
if (!/supabaseUrl:\s*'https:\/\/.+\.supabase\.co'/.test(content)) throw new Error('supabaseUrl ausente/inválido');
if (!/supabaseAnonKey:\s*'eyJ/.test(content)) throw new Error('supabaseAnonKey ausente/inválido');
if (!/revenueCatApiKeyIOS:\s*'appl_/.test(content)) throw new Error('revenueCatApiKeyIOS ausente/inválido');
if (!/revenueCatApiKeyAndroid:\s*'goog_/.test(content)) throw new Error('revenueCatApiKeyAndroid ausente/inválido');
console.log('OK — config.js com os 4 valores no formato esperado.');
"
```

Expected: `OK — config.js com os 4 valores no formato esperado.`

- [ ] **Step 5: Commit**

```bash
cd "app-mobile" && git add www/config.js && git commit -m "Adiciona configuração do Supabase e RevenueCat"
```

---

### Task 2: Preferences local, persistência do aviso legal e gate do trial

**Files:**
- Modify: `app-mobile/package.json` (adiciona `@capacitor/preferences`)
- Modify: `app-mobile/www/index.html`
- Create: `app-mobile/tests/trial-gate.mjs`

**Interfaces:**
- Consumes: nada de tasks anteriores deste plano.
- Produces: `prefsGet(key): Promise<string|null>`, `prefsSet(key, value): Promise<void>`, `isNativePlatform(): boolean`, `window.hasActiveSubscription(): Promise<boolean>` (stub, sempre `false` — Task 4 substitui o corpo), `tryStartPrescription(): Promise<boolean>`, `overlayPaywall` (elemento DOM, id `overlayPaywall`), `#btnAssinar` (botão sem listener ainda — Task 3 adiciona o primeiro).

- [ ] **Step 1: Instalar `@capacitor/preferences`**

```bash
cd "app-mobile" && npm install @capacitor/preferences && npx cap sync
```

Expected: `package.json` passa a listar `@capacitor/preferences` em `dependencies`; `cap sync` termina com sucesso.

- [ ] **Step 2: Escrever o teste (falhando, pois o gate ainda não existe)**

Crie `app-mobile/tests/trial-gate.mjs`:

```js
#!/usr/bin/env node
// Testa o contador de trial local (3 prescrições grátis), a persistência
// do aviso legal e o gate que bloqueia a 4ª tentativa mostrando o
// paywall — tudo local, sem depender de Supabase/RevenueCat (Tasks 3/4).
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(__dirname, '../www/index.html');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + PAGE);

// 1) Primeira abertura: disclaimer visível, contador de trial vira 1.
await page.waitForSelector('#overlayDisclaimer', { state: 'visible' });
let count = await page.evaluate(() => window.localStorage.getItem('trialUsageCount'));
assert.equal(count, '1', 'contador deveria ser 1 após a tela inicial');

await page.click('#btnFecharDisclaimer');
await page.waitForSelector('#overlayDisclaimer', { state: 'hidden' });
const disclaimerFlag = await page.evaluate(() => window.localStorage.getItem('disclaimerAccepted'));
assert.equal(disclaimerFlag, '1', 'aviso legal deveria ficar marcado como aceito');

// 2) Limpar #1 (uso 2) — permitido, paywall não aparece, campo é limpo.
await page.fill('#peso', '8,5');
await page.click('#btnLimpar');
count = await page.evaluate(() => window.localStorage.getItem('trialUsageCount'));
assert.equal(count, '2');
assert.equal(await page.inputValue('#peso'), '', 'campo peso deveria ter sido limpo');
assert.equal(await page.isVisible('#overlayPaywall'), false);

// 3) Limpar #2 (uso 3) — ainda permitido.
await page.click('#btnLimpar');
count = await page.evaluate(() => window.localStorage.getItem('trialUsageCount'));
assert.equal(count, '3');
assert.equal(await page.isVisible('#overlayPaywall'), false);

// 4) Limpar #3 (tentativa de uso 4) — bloqueado: paywall aparece, contador
//    não sobe de 3, campo não é limpo.
await page.fill('#peso', '9,0');
await page.click('#btnLimpar');
await page.waitForSelector('#overlayPaywall', { state: 'visible' });
count = await page.evaluate(() => window.localStorage.getItem('trialUsageCount'));
assert.equal(count, '3', 'contador não deveria passar de 3 quando bloqueado');
assert.equal(await page.inputValue('#peso'), '9,0', 'campo peso não deveria ter sido limpo quando bloqueado');

// 5) Assinante ativo (mock) ignora o contador mesmo com trial esgotado.
await page.evaluate(() => { window.hasActiveSubscription = async () => true; });
await page.click('#btnLimpar');
assert.equal(await page.isVisible('#overlayPaywall'), false, 'assinante ativo não deveria ver o paywall');

await browser.close();
console.log('OK — contador de trial, persistência do aviso legal e gate de paywall funcionando.');
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
cd "app-mobile" && node tests/trial-gate.mjs
```

Expected: FAIL — `#overlayPaywall` não existe (o elemento ainda não foi criado), erro de seletor não encontrado no `page.waitForSelector`/`page.isVisible`.

- [ ] **Step 4: Adicionar o CSS dos overlays**

Em `app-mobile/www/index.html`, aplique esta substituição exata:

Old string:
```html
    #overlayResumo, #overlayDisclaimer{
      position: fixed; inset: 0; background: rgba(30,40,40,.32);
      display:none; align-items: center; justify-content: center; padding: 24px;
      z-index: 9999;
    }
    #resumoCard, #disclaimerCard{
      width: 210mm; max-width: 100%; background: #fff; border-radius: 14px; box-shadow:0 20px 60px rgba(20,30,30,.25);
      padding: 18mm; max-height: 90vh; overflow: auto;
    }
    #disclaimerCard{width:120mm}
    #resumoCard h2, #disclaimerCard h2{margin:0 0 8px 0; font-size:18px; color:var(--fg);}
```

New string:
```html
    #overlayResumo, #overlayDisclaimer, #overlayPaywall{
      position: fixed; inset: 0; background: rgba(30,40,40,.32);
      display:none; align-items: center; justify-content: center; padding: 24px;
      z-index: 9999;
    }
    #resumoCard, #disclaimerCard, #paywallCard{
      width: 210mm; max-width: 100%; background: #fff; border-radius: 14px; box-shadow:0 20px 60px rgba(20,30,30,.25);
      padding: 18mm; max-height: 90vh; overflow: auto;
    }
    #disclaimerCard, #paywallCard{width:120mm}
    #resumoCard h2, #disclaimerCard h2, #paywallCard h2{margin:0 0 8px 0; font-size:18px; color:var(--fg);}
```

- [ ] **Step 5: Adicionar a marcação HTML do paywall**

Aplique esta substituição exata (insere o overlay do paywall logo depois do overlay do aviso legal):

Old string:
```html
  <!-- Overlay Aviso de responsabilidade -->
  <div id="overlayDisclaimer" role="dialog" aria-modal="true" aria-labelledby="disclaimerTitulo">
    <div id="disclaimerCard">
      <h2 id="disclaimerTitulo">Aviso importante</h2>
      <p>Esta calculadora é uma ferramenta de apoio ao cálculo de Nutrição Parenteral e <b>não substitui o raciocínio clínico</b>. A responsabilidade pela prescrição, pelas doses e pela conduta terapêutica é exclusivamente do médico prescritor.</p>
      <div class="resumo-actions">
        <button type="button" id="btnFecharDisclaimer">Entendi</button>
      </div>
    </div>
  </div>
```

New string:
```html
  <!-- Overlay Aviso de responsabilidade -->
  <div id="overlayDisclaimer" role="dialog" aria-modal="true" aria-labelledby="disclaimerTitulo">
    <div id="disclaimerCard">
      <h2 id="disclaimerTitulo">Aviso importante</h2>
      <p>Esta calculadora é uma ferramenta de apoio ao cálculo de Nutrição Parenteral e <b>não substitui o raciocínio clínico</b>. A responsabilidade pela prescrição, pelas doses e pela conduta terapêutica é exclusivamente do médico prescritor.</p>
      <div class="resumo-actions">
        <button type="button" id="btnFecharDisclaimer">Entendi</button>
      </div>
    </div>
  </div>

  <!-- Overlay Paywall (trial esgotado / sem assinatura) -->
  <div id="overlayPaywall" role="dialog" aria-modal="true" aria-labelledby="paywallTitulo">
    <div id="paywallCard">
      <h2 id="paywallTitulo">Seu período gratuito acabou</h2>
      <p>Você já usou as 3 prescrições grátis. Assine para continuar usando a calculadora sem limites.</p>
      <div class="resumo-actions">
        <button type="button" id="btnAssinar">Assinar</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 6: Substituir o handler do botão "Limpar"**

Aplique esta substituição exata:

Old string:
```html
    btnLimpar.addEventListener('click', () => {
      document.querySelectorAll('#editor input').forEach(inp => { if(!inp.readOnly) inp.value=''; else inp.value=''; });
      document.getElementById('srcPSelect').value = '';
      document.getElementById('srcNaClSelect').value = '10';
      document.getElementById('srcKClSelect').value = '10';
      calcVolumes(); atualizarPesoCalorico();
    });
```

New string:
```html
    btnLimpar.addEventListener('click', async () => {
      const allowed = await tryStartPrescription();
      if (!allowed) return;
      document.querySelectorAll('#editor input').forEach(inp => { if(!inp.readOnly) inp.value=''; else inp.value=''; });
      document.getElementById('srcPSelect').value = '';
      document.getElementById('srcNaClSelect').value = '10';
      document.getElementById('srcKClSelect').value = '10';
      calcVolumes(); atualizarPesoCalorico();
    });
```

- [ ] **Step 7: Substituir o bloco do aviso legal e do `init()`**

Aplique esta substituição exata:

Old string:
```html
    // ===== Aviso de responsabilidade =====
    const overlayDisclaimer = document.getElementById('overlayDisclaimer');
    const btnFecharDisclaimer = document.getElementById('btnFecharDisclaimer');
    btnFecharDisclaimer.addEventListener('click', () => { overlayDisclaimer.style.display = 'none'; });

    (function init(){ updatePUI(); overlayDisclaimer.style.display = 'flex'; })();
  </script>
```

New string:
```html
    // ===== Preferences (local, com fallback pra localStorage fora do app nativo) =====
    function isNativePlatform() {
      return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }
    async function prefsGet(key) {
      if (isNativePlatform()) {
        const { value } = await window.Capacitor.Plugins.Preferences.get({ key });
        return value;
      }
      return window.localStorage.getItem(key);
    }
    async function prefsSet(key, value) {
      if (isNativePlatform()) {
        await window.Capacitor.Plugins.Preferences.set({ key, value: String(value) });
      } else {
        window.localStorage.setItem(key, String(value));
      }
    }

    // ===== Aviso de responsabilidade =====
    const overlayDisclaimer = document.getElementById('overlayDisclaimer');
    const btnFecharDisclaimer = document.getElementById('btnFecharDisclaimer');
    const DISCLAIMER_KEY = 'disclaimerAccepted';
    btnFecharDisclaimer.addEventListener('click', async () => {
      overlayDisclaimer.style.display = 'none';
      await prefsSet(DISCLAIMER_KEY, '1');
    });

    // ===== Trial gratuito (3 prescrições) =====
    const TRIAL_KEY = 'trialUsageCount';
    const TRIAL_LIMIT = 3;
    const overlayPaywall = document.getElementById('overlayPaywall');

    // Task 4 substitui o corpo desta função pela checagem real via RevenueCat.
    window.hasActiveSubscription = async function hasActiveSubscription() {
      return false;
    };

    async function getTrialCount() {
      const raw = await prefsGet(TRIAL_KEY);
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : 0;
    }

    async function tryStartPrescription() {
      if (await window.hasActiveSubscription()) return true;
      const count = await getTrialCount();
      if (count >= TRIAL_LIMIT) {
        overlayPaywall.style.display = 'flex';
        return false;
      }
      await prefsSet(TRIAL_KEY, count + 1);
      return true;
    }

    (async function init(){
      updatePUI();
      const allowed = await tryStartPrescription();
      if (allowed) {
        const accepted = await prefsGet(DISCLAIMER_KEY);
        if (accepted !== '1') { overlayDisclaimer.style.display = 'flex'; }
      }
    })();
  </script>
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

```bash
cd "app-mobile" && node tests/trial-gate.mjs
```

Expected: PASS — imprime `OK — contador de trial, persistência do aviso legal e gate de paywall funcionando.`

- [ ] **Step 9: Rodar o teste de paridade de cálculo (garante que nada quebrou)**

```bash
cd "app-mobile" && npm test
```

Expected: PASS — `OK — 27 campos calculados batem com o fixture golden.`

- [ ] **Step 10: Commit**

```bash
cd "app-mobile" && git add package.json package-lock.json www/index.html tests/trial-gate.mjs && git commit -m "Adiciona trial gratuito de 3 usos, persistência do aviso legal e gate de paywall"
```

---

### Task 3: Conta (Supabase Auth) — criar conta, login, logout

**Files:**
- Modify: `app-mobile/www/index.html`
- Create: `app-mobile/tests/auth-flow.mjs`

**Interfaces:**
- Consumes: `window.NPP_CONFIG` (Task 1), `prefsGet`/`prefsSet`/`isNativePlatform` (Task 2, não usados diretamente aqui mas no mesmo arquivo), `overlayPaywall`, `#btnAssinar` (Task 2).
- Produces: `supabaseClient` (instância do cliente Supabase, `const` de topo de script — acessível em `page.evaluate` pela mesma realm, sem precisar expor em `window`), `overlayAuth`, `setAuthMode(mode)`, `getCurrentSession(): Promise<Session|null>`. `#btnAssinar` passa a abrir `overlayAuth` (Task 4 substitui esse listener por dois botões de plano).

- [ ] **Step 1: Escrever o teste (falhando, pois a tela de conta ainda não existe)**

Crie `app-mobile/tests/auth-flow.mjs`:

```js
#!/usr/bin/env node
// Testa criar conta / logout / logar de novo contra um projeto Supabase
// real (credenciais de app-mobile/www/config.js, Task 1). O projeto de
// teste precisa estar com "Confirm email" desativado (Task 1, Step 1.3),
// senão signUp não retorna sessão imediata.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(__dirname, '../www/index.html');
const email = `teste+${Date.now()}@example.com`;
const password = 'senha-teste-123';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + PAGE);
await page.click('#btnFecharDisclaimer');

// Abre a tela de conta direto via JS pra testar só o fluxo de
// autenticação, isolado do gate de trial (coberto em trial-gate.mjs).
await page.evaluate(() => { document.getElementById('overlayAuth').style.display = 'flex'; });

// Criar conta (modo padrão ao abrir).
await page.fill('#authEmail', email);
await page.fill('#authPassword', password);
await page.click('#btnAuthSubmit');
await page.waitForSelector('#overlayAuth', { state: 'hidden' });

let session = await page.evaluate(async () => {
  const { data } = await supabaseClient.auth.getSession();
  return data.session ? data.session.user.email : null;
});
assert.equal(session, email, 'sessão deveria existir após criar conta');

// Logout.
await page.evaluate(async () => { await supabaseClient.auth.signOut(); });
session = await page.evaluate(async () => {
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
});
assert.equal(session, null, 'sessão deveria ser null após logout');

// Login de novo com a mesma conta.
await page.evaluate(() => { document.getElementById('overlayAuth').style.display = 'flex'; });
await page.click('#btnAuthToggle'); // muda pra modo "Entrar"
await page.fill('#authEmail', email);
await page.fill('#authPassword', password);
await page.click('#btnAuthSubmit');
await page.waitForSelector('#overlayAuth', { state: 'hidden' });
session = await page.evaluate(async () => {
  const { data } = await supabaseClient.auth.getSession();
  return data.session ? data.session.user.email : null;
});
assert.equal(session, email, 'deveria logar de novo com a mesma conta');

await browser.close();
console.log('OK — criar conta, logout e login de novo funcionando contra o Supabase real.');
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd "app-mobile" && node tests/auth-flow.mjs
```

Expected: FAIL — `#overlayAuth` não existe (erro de seletor/timeout no `page.evaluate`/`waitForSelector`).

- [ ] **Step 3: Adicionar `#overlayAuth`/`#authCard` ao CSS compartilhado dos overlays**

Aplique esta substituição exata:

Old string:
```html
    #overlayResumo, #overlayDisclaimer, #overlayPaywall{
      position: fixed; inset: 0; background: rgba(30,40,40,.32);
      display:none; align-items: center; justify-content: center; padding: 24px;
      z-index: 9999;
    }
    #resumoCard, #disclaimerCard, #paywallCard{
      width: 210mm; max-width: 100%; background: #fff; border-radius: 14px; box-shadow:0 20px 60px rgba(20,30,30,.25);
      padding: 18mm; max-height: 90vh; overflow: auto;
    }
    #disclaimerCard, #paywallCard{width:120mm}
    #resumoCard h2, #disclaimerCard h2, #paywallCard h2{margin:0 0 8px 0; font-size:18px; color:var(--fg);}
```

New string:
```html
    #overlayResumo, #overlayDisclaimer, #overlayPaywall, #overlayAuth{
      position: fixed; inset: 0; background: rgba(30,40,40,.32);
      display:none; align-items: center; justify-content: center; padding: 24px;
      z-index: 9999;
    }
    #resumoCard, #disclaimerCard, #paywallCard, #authCard{
      width: 210mm; max-width: 100%; background: #fff; border-radius: 14px; box-shadow:0 20px 60px rgba(20,30,30,.25);
      padding: 18mm; max-height: 90vh; overflow: auto;
    }
    #disclaimerCard, #paywallCard, #authCard{width:120mm}
    #resumoCard h2, #disclaimerCard h2, #paywallCard h2, #authCard h2{margin:0 0 8px 0; font-size:18px; color:var(--fg);}
```

- [ ] **Step 4: Adicionar a marcação HTML da tela de conta**

Aplique esta substituição exata (insere o overlay de conta logo depois do overlay do paywall — a linha final `</div>` do paywall já existe da Task 2):

Old string:
```html
  <!-- Overlay Paywall (trial esgotado / sem assinatura) -->
  <div id="overlayPaywall" role="dialog" aria-modal="true" aria-labelledby="paywallTitulo">
    <div id="paywallCard">
      <h2 id="paywallTitulo">Seu período gratuito acabou</h2>
      <p>Você já usou as 3 prescrições grátis. Assine para continuar usando a calculadora sem limites.</p>
      <div class="resumo-actions">
        <button type="button" id="btnAssinar">Assinar</button>
      </div>
    </div>
  </div>
```

New string:
```html
  <!-- Overlay Paywall (trial esgotado / sem assinatura) -->
  <div id="overlayPaywall" role="dialog" aria-modal="true" aria-labelledby="paywallTitulo">
    <div id="paywallCard">
      <h2 id="paywallTitulo">Seu período gratuito acabou</h2>
      <p>Você já usou as 3 prescrições grátis. Assine para continuar usando a calculadora sem limites.</p>
      <div class="resumo-actions">
        <button type="button" id="btnAssinar">Assinar</button>
      </div>
    </div>
  </div>

  <!-- Overlay Conta (criar conta / entrar) -->
  <div id="overlayAuth" role="dialog" aria-modal="true" aria-labelledby="authTitulo">
    <div id="authCard">
      <h2 id="authTitulo">Criar conta</h2>
      <p class="sub">Sua conta libera o acesso no celular e no computador com a mesma assinatura.</p>
      <div class="grid row">
        <div class="field span-12">
          <label for="authEmail">E-mail</label>
          <input id="authEmail" type="email" placeholder="voce@exemplo.com" />
        </div>
      </div>
      <div class="grid row">
        <div class="field span-12">
          <label for="authPassword">Senha</label>
          <input id="authPassword" type="password" placeholder="mínimo 6 caracteres" />
        </div>
      </div>
      <div id="authError" class="sub" style="color:var(--danger); display:none"></div>
      <div class="resumo-actions">
        <button type="button" class="secondary" id="btnAuthToggle">Já tenho conta</button>
        <button type="button" id="btnAuthSubmit">Criar conta</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 5: Adicionar o script do Supabase e o `config.js` no `<head>`**

Aplique esta substituição exata:

Old string:
```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Calculadora de NPP — Prescrição</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;}
```

New string:
```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Calculadora de NPP — Prescrição</title>
  <script src="config.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
  <style>
    *,*::before,*::after{box-sizing:border-box;}
```

- [ ] **Step 6: Adicionar a lógica de autenticação e ligar o botão "Assinar" a ela**

Aplique esta substituição exata (adiciona o bloco de conta logo antes do bloco de trial já existente):

Old string:
```html
    // ===== Trial gratuito (3 prescrições) =====
    const TRIAL_KEY = 'trialUsageCount';
```

New string:
```html
    // ===== Conta (Supabase Auth) =====
    const supabaseClient = window.supabase.createClient(window.NPP_CONFIG.supabaseUrl, window.NPP_CONFIG.supabaseAnonKey);
    const overlayAuth = document.getElementById('overlayAuth');
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    const authError = document.getElementById('authError');
    const authTitulo = document.getElementById('authTitulo');
    const btnAuthSubmit = document.getElementById('btnAuthSubmit');
    const btnAuthToggle = document.getElementById('btnAuthToggle');
    let authMode = 'signup';

    function setAuthMode(mode) {
      authMode = mode;
      authTitulo.textContent = mode === 'signup' ? 'Criar conta' : 'Entrar';
      btnAuthSubmit.textContent = mode === 'signup' ? 'Criar conta' : 'Entrar';
      btnAuthToggle.textContent = mode === 'signup' ? 'Já tenho conta' : 'Criar conta nova';
      authError.style.display = 'none';
    }
    btnAuthToggle.addEventListener('click', () => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); });

    async function getCurrentSession() {
      const { data } = await supabaseClient.auth.getSession();
      return data.session;
    }

    btnAuthSubmit.addEventListener('click', async () => {
      authError.style.display = 'none';
      const email = authEmail.value.trim();
      const password = authPassword.value;
      const { data, error } = authMode === 'signup'
        ? await supabaseClient.auth.signUp({ email, password })
        : await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        authError.textContent = error.message;
        authError.style.display = 'block';
        return;
      }
      if (!data.session) {
        authError.textContent = 'Confirme seu e-mail antes de entrar.';
        authError.style.display = 'block';
        return;
      }
      overlayAuth.style.display = 'none';
    });

    document.getElementById('btnAssinar').addEventListener('click', () => {
      overlayAuth.style.display = 'flex';
      setAuthMode('signup');
    });

    // ===== Trial gratuito (3 prescrições) =====
    const TRIAL_KEY = 'trialUsageCount';
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
cd "app-mobile" && node tests/auth-flow.mjs
```

Expected: PASS — imprime `OK — criar conta, logout e login de novo funcionando contra o Supabase real.`

Se falhar com uma mensagem tipo "Email not confirmed" ou sessão vindo `null` mesmo sem erro, volte ao painel do Supabase (Task 1, Step 1.3) e confirme que "Confirm email" está desativado no projeto.

- [ ] **Step 8: Rodar o teste de paridade de cálculo e o de trial (garante que nada quebrou)**

```bash
cd "app-mobile" && npm test && node tests/trial-gate.mjs
```

Expected: ambos PASS.

- [ ] **Step 9: Commit**

```bash
cd "app-mobile" && git add www/index.html tests/auth-flow.mjs && git commit -m "Adiciona conta de usuário (Supabase Auth): criar conta, login, logout"
```

---

### Task 4: Assinatura (RevenueCat) e paywall com os dois planos

**Files:**
- Modify: `app-mobile/package.json` (adiciona `@revenuecat/purchases-capacitor`)
- Modify: `app-mobile/www/index.html`
- Create: `app-mobile/tests/paywall.mjs`

**Interfaces:**
- Consumes: `window.NPP_CONFIG` (Task 1), `isNativePlatform` / `overlayPaywall` / `tryStartPrescription` / `window.hasActiveSubscription` (Task 2), `supabaseClient` / `overlayAuth` / `setAuthMode` / `btnAuthSubmit` (Task 3).
- Produces: `configurePurchases(): Promise<void>`, `revenueCatLogIn(userId): Promise<void>`, `purchaseSelectedPlan(): Promise<void>` — nenhuma task futura deste plano consome isso (Plano 3 é um projeto separado e vai reler este arquivo, não importar destas funções diretamente).

- [ ] **Step 1: Instalar `@revenuecat/purchases-capacitor`**

```bash
cd "app-mobile" && npm install @revenuecat/purchases-capacitor && npx cap sync
```

Expected: `package.json` passa a listar `@revenuecat/purchases-capacitor` em `dependencies`; `cap sync` termina com sucesso.

- [ ] **Step 2: Escrever o teste (falhando, pois os dois botões de plano ainda não existem)**

Crie `app-mobile/tests/paywall.mjs`:

```js
#!/usr/bin/env node
// Testa a UI do paywall (preços, abrir conta pro plano escolhido) e a
// integração com hasActiveSubscription fora do runtime nativo. Compra de
// verdade só é testável em simulador/emulador com conta sandbox — ver a
// seção "Testes antes de publicar" do spec.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(__dirname, '../www/index.html');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + PAGE);
await page.click('#btnFecharDisclaimer');

// Esgota o trial pra forçar o paywall aparecer.
await page.click('#btnLimpar');
await page.click('#btnLimpar');
await page.click('#btnLimpar');
await page.waitForSelector('#overlayPaywall', { state: 'visible' });

const mensalText = await page.textContent('#btnPlanoMensal');
const anualText = await page.textContent('#btnPlanoAnual');
assert.match(mensalText, /R\$49,90/, 'botão mensal deveria mostrar R$49,90');
assert.match(anualText, /R\$298,80/, 'botão anual deveria mostrar R$298,80');

// Fora do runtime nativo, checagem de assinatura resolve false sem lançar erro.
const subscribedInBrowser = await page.evaluate(() => window.hasActiveSubscription());
assert.equal(subscribedInBrowser, false);

// Restaurar compra fora do nativo não deve lançar erro (só não faz nada).
await page.click('#btnRestaurarCompra');

// Escolher um plano abre a tela de criar conta.
await page.click('#btnPlanoMensal');
await page.waitForSelector('#overlayAuth', { state: 'visible' });
assert.equal(await page.textContent('#authTitulo'), 'Criar conta');

// Fecha a tela de conta (sem completar login) pra voltar a um estado limpo.
await page.evaluate(() => { document.getElementById('overlayAuth').style.display = 'none'; });

// Simula assinatura ativa (compra concluída) e confirma que o paywall fecha.
await page.evaluate(() => { window.hasActiveSubscription = async () => true; });
await page.evaluate(async () => { await tryStartPrescription(); });
assert.equal(await page.isVisible('#overlayPaywall'), false, 'paywall deveria fechar quando assinatura fica ativa');

await browser.close();
console.log('OK — paywall mostra os preços certos, abre conta pro plano escolhido, e libera quando assinante.');
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
cd "app-mobile" && node tests/paywall.mjs
```

Expected: FAIL — `#btnPlanoMensal` não existe (o paywall da Task 2 só tem o botão genérico `#btnAssinar`).

- [ ] **Step 4: Trocar o botão único do paywall pelos dois planos**

Aplique esta substituição exata:

Old string:
```html
      <p>Você já usou as 3 prescrições grátis. Assine para continuar usando a calculadora sem limites.</p>
      <div class="resumo-actions">
        <button type="button" id="btnAssinar">Assinar</button>
      </div>
```

New string:
```html
      <p>Você já usou as 3 prescrições grátis. Escolha um plano para continuar usando a calculadora sem limites.</p>
      <div class="grid row">
        <div class="field span-6">
          <button type="button" id="btnPlanoMensal" style="width:100%">Mensal — R$49,90/mês</button>
        </div>
        <div class="field span-6">
          <button type="button" id="btnPlanoAnual" style="width:100%">Anual — R$298,80/ano (R$24,90/mês)</button>
        </div>
      </div>
      <div class="resumo-actions">
        <button type="button" class="secondary" id="btnRestaurarCompra">Restaurar compra</button>
        <button type="button" class="secondary" id="btnJaTenhoConta">Já tenho conta</button>
      </div>
```

- [ ] **Step 5: Trocar o listener do `#btnAssinar` (Task 3) pelos listeners dos planos + adicionar a integração RevenueCat**

Aplique esta substituição exata:

Old string:
```html
    document.getElementById('btnAssinar').addEventListener('click', () => {
      overlayAuth.style.display = 'flex';
      setAuthMode('signup');
    });

    // ===== Trial gratuito (3 prescrições) =====
```

New string:
```html
    let selectedPlan = null; // 'monthly' | 'annual'
    function openAuthForPlan(plan) {
      selectedPlan = plan;
      overlayAuth.style.display = 'flex';
      setAuthMode('signup');
    }
    document.getElementById('btnPlanoMensal').addEventListener('click', () => openAuthForPlan('monthly'));
    document.getElementById('btnPlanoAnual').addEventListener('click', () => openAuthForPlan('annual'));
    document.getElementById('btnJaTenhoConta').addEventListener('click', () => { overlayAuth.style.display = 'flex'; setAuthMode('login'); });

    // ===== Assinatura (RevenueCat) =====
    function purchasesPlugin() {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorPurchases;
    }
    async function configurePurchases() {
      if (!isNativePlatform()) return;
      const platform = window.Capacitor.getPlatform();
      const apiKey = platform === 'ios' ? window.NPP_CONFIG.revenueCatApiKeyIOS : window.NPP_CONFIG.revenueCatApiKeyAndroid;
      await purchasesPlugin().configure({ apiKey });
    }
    async function revenueCatLogIn(userId) {
      if (!isNativePlatform()) return;
      await purchasesPlugin().logIn({ appUserID: userId });
    }
    async function purchaseSelectedPlan() {
      if (!isNativePlatform() || !selectedPlan) return;
      const { current } = await purchasesPlugin().getOfferings();
      if (!current) return;
      const pkg = selectedPlan === 'monthly' ? current.monthly : current.annual;
      if (!pkg) return;
      await purchasesPlugin().purchasePackage({ aPackage: pkg });
      selectedPlan = null;
      overlayPaywall.style.display = 'none';
    }
    document.getElementById('btnRestaurarCompra').addEventListener('click', async () => {
      if (!isNativePlatform()) return;
      await purchasesPlugin().restorePurchases();
      if (await window.hasActiveSubscription()) { overlayPaywall.style.display = 'none'; }
    });

    // ===== Trial gratuito (3 prescrições) =====
```

- [ ] **Step 6: Ligar login/criar conta bem-sucedidos ao RevenueCat e à compra**

Aplique esta substituição exata:

Old string:
```html
      if (!data.session) {
        authError.textContent = 'Confirme seu e-mail antes de entrar.';
        authError.style.display = 'block';
        return;
      }
      overlayAuth.style.display = 'none';
    });
```

New string:
```html
      if (!data.session) {
        authError.textContent = 'Confirme seu e-mail antes de entrar.';
        authError.style.display = 'block';
        return;
      }
      overlayAuth.style.display = 'none';
      await revenueCatLogIn(data.session.user.id);
      await purchaseSelectedPlan();
    });
```

- [ ] **Step 7: Substituir o stub de `hasActiveSubscription` pela checagem real via RevenueCat**

Aplique esta substituição exata:

Old string:
```html
    // Task 4 substitui o corpo desta função pela checagem real via RevenueCat.
    window.hasActiveSubscription = async function hasActiveSubscription() {
      return false;
    };
```

New string:
```html
    window.hasActiveSubscription = async function hasActiveSubscription() {
      if (!isNativePlatform()) return false;
      const { customerInfo } = await purchasesPlugin().getCustomerInfo();
      return Object.keys(customerInfo.entitlements.active).length > 0;
    };
```

- [ ] **Step 8: Fechar o paywall quando `tryStartPrescription` reconhece assinante ativo**

Aplique esta substituição exata:

Old string:
```html
    async function tryStartPrescription() {
      if (await window.hasActiveSubscription()) return true;
```

New string:
```html
    async function tryStartPrescription() {
      if (await window.hasActiveSubscription()) { overlayPaywall.style.display = 'none'; return true; }
```

- [ ] **Step 9: Chamar `configurePurchases()` na inicialização**

Aplique esta substituição exata:

Old string:
```html
    (async function init(){
      updatePUI();
      const allowed = await tryStartPrescription();
```

New string:
```html
    (async function init(){
      updatePUI();
      await configurePurchases();
      const allowed = await tryStartPrescription();
```

- [ ] **Step 10: Rodar o teste e confirmar que passa**

```bash
cd "app-mobile" && node tests/paywall.mjs
```

Expected: PASS — imprime `OK — paywall mostra os preços certos, abre conta pro plano escolhido, e libera quando assinante.`

- [ ] **Step 11: Rodar toda a suíte de testes do projeto (garante que nada quebrou)**

```bash
cd "app-mobile" && npm test && node tests/trial-gate.mjs && node tests/auth-flow.mjs
```

Expected: os três PASS.

- [ ] **Step 12: Commit**

```bash
cd "app-mobile" && git add package.json package-lock.json www/index.html tests/paywall.mjs && git commit -m "Adiciona assinatura via RevenueCat (mensal/anual) e paywall completo"
```

---

## Testes que ficam pendentes (fora do escopo automatizável deste plano)

- Compra de verdade em sandbox da Apple / license tester do Google — precisa de conta de desenvolvedor real e produtos cadastrados no App Store Connect/Play Console (seção "Configuração de lojas" do spec, não construída ainda).
- Verificação visual em simulador/emulador real do fluxo completo (trial → paywall → criar conta → comprar) — mesma limitação de ambiente já registrada no Plano 1 (`app-mobile/README.md`).
