# Salvar/reabrir prescrição de NPP (app-web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in `app-web` user search a previously-prescribed patient by name, load their most recent (or a historical) prescription into the form, edit it, and save it back — without retyping everything from scratch.

**Architecture:** One new Supabase table (`npp_prescricoes_salvas`, RLS-scoped to `auth.uid()`) holds one JSON snapshot per (user, patient name, day). The frontend (`app-web/index.html`'s existing inline `<script>`) gets: payload build/restore helpers that operate on the DOM only (no network), a search-as-you-type box built into the existing "Nome completo" field, a "Salvar prescrição" button that upserts, and a small "Ver histórico" overlay listing saved dates for the currently-typed name.

**Tech Stack:** Vanilla JS (no framework, no build step — matches the rest of `app-web/index.html`), Supabase JS v2 (already loaded via CDN, already used for Auth), Supabase Postgres + Row Level Security.

## Global Constraints

- Scope is **`app-web/index.html` only** — do not touch `app-mobile`, the root standalone HTML, or `app/` (Electron). (Spec: "Escopo")
- Reuse the existing `supabaseClient` variable and `getCurrentSession()` helper already defined in `app-web/index.html` — do not create a second Supabase client. (Spec: "Modelo de dados" / existing code)
- One table, no separate "patients" table — group history by the literal `nome_paciente` string. (Spec: "Decisão: uma tabela agrupando por nome")
- Unique constraint on `(user_id, nome_paciente, data_prescricao)` — saving twice the same day for the same name **overwrites**, never duplicates. (Spec: "Modelo de dados")
- The payload holds only **editable** fields (header + doses + source/unit selects) — never the `(auto)`/readonly outputs, which are always recomputed on load. (Spec: "O que entra no payload salvo")
- Any Supabase failure (search or save) must show an inline message and never throw/block the rest of the app — matches the app's existing non-blocking-failure convention (see `configurePurchases`/`hasActiveSubscription`). (Spec: "Tratamento de erro")
- If the form already has data filled in, confirm before an overwrite-by-load. (Spec: "Proteção contra perda de dados")
- No build tooling exists for `app-web/` — every change is a direct edit to `app-web/index.html` (or a new plain `.sql` file), verified by loading the file in a browser (via a local static server) and driving it with Playwright, the same way earlier changes in this codebase were verified. There is no automated test framework to plug into.

---

## File Structure

- **Create** `supabase/npp_prescricoes_salvas.sql` — table + RLS policy, run manually once in the Supabase SQL Editor (Task 1).
- **Modify** `app-web/index.html` — all the frontend work (Tasks 2–6): new `<style>` rules, new markup in the header and near the action buttons, new overlay, and new inline `<script>` functions.

No new JS files: the whole app is one inline `<script>` in `app-web/index.html`, and this feature follows that existing convention rather than introducing a build step for a handful of functions.

---

## Before You Start: Local Test Server

Every verification step in this plan assumes a static server is running from the repo root:

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator" && (python3 -m http.server 8799 >/tmp/httpserver_plan.log 2>&1 &) && sleep 1 && curl -sI http://127.0.0.1:8799/app-web/index.html | head -1
```

Expected: `HTTP/1.0 200 OK`. Leave it running for the whole plan; kill it at the end of Task 7 with `pkill -f "http.server 8799"`.

Every verification also starts by hiding the login/paywall/disclaimer overlays so the form underneath is reachable, via Playwright's `browser_evaluate`:

```js
() => { document.querySelectorAll('[id^=overlay]').forEach(el => el.style.display='none'); const bar=document.getElementById('accountBar'); if (bar) bar.style.display='none'; }
```

Tasks 4–6 additionally need a **real logged-in Supabase session** (RLS requires `auth.uid()`). Ask the user for valid `app-web` login credentials (their own account) before starting those tasks — there is no way to fabricate a session locally. Sign in via the real login form in the browser (fill `#authEmail`/`#authPassword`, click `#btnAuthSubmit`) rather than hand-rolling Supabase auth calls, so the exact same code path the app's users go through is what's under test. Use an obviously-fake patient name prefix for all test data — `TESTE_AUTOMATIZADO_<timestamp>` — and delete every row your tests create (Task 7 has the cleanup step) so the developer's real Supabase table doesn't accumulate test junk.

---

### Task 1: Supabase table and RLS policy

**Files:**
- Create: `supabase/npp_prescricoes_salvas.sql`

**Interfaces:**
- Produces: a Postgres table `npp_prescricoes_salvas(id, user_id, nome_paciente, data_prescricao, hospital, setor, leito, payload, created_at, updated_at)` with RLS restricting all access to `auth.uid() = user_id`, and a unique constraint on `(user_id, nome_paciente, data_prescricao)` that Tasks 5–6 rely on for `upsert(..., { onConflict: 'user_id,nome_paciente,data_prescricao' })`.

- [ ] **Step 1: Write the SQL file**

```sql
-- supabase/npp_prescricoes_salvas.sql
-- Run once in the Supabase SQL Editor (dashboard) for the same project
-- app-web already uses for Auth (see app-web/config.js: supabaseUrl).
-- Design: docs/superpowers/specs/2026-09-02-npp-salvar-prescricao-design.md

create table if not exists npp_prescricoes_salvas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_paciente text not null,
  data_prescricao date not null,
  hospital text,
  setor text,
  leito text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, nome_paciente, data_prescricao)
);

alter table npp_prescricoes_salvas enable row level security;

create policy "usuario_so_ve_e_edita_as_proprias_prescricoes_salvas"
  on npp_prescricoes_salvas
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists npp_prescricoes_salvas_user_nome_idx
  on npp_prescricoes_salvas (user_id, nome_paciente);
```

- [ ] **Step 2: Run it against Supabase and verify**

This step is manual (no CLI/migration tool is configured for this project — matches how the rest of the Supabase setup for this project has been done). Ask the user to:
1. Open the Supabase dashboard for the project used by `app-web` (same `supabaseUrl` as in `app-web/config.js`).
2. Go to SQL Editor → New query, paste the contents of `supabase/npp_prescricoes_salvas.sql`, run it.
3. Confirm success: Table Editor should now list `npp_prescricoes_salvas` with the 10 columns above, and Authentication → Policies (or Database → Policies) should show the one RLS policy on it.

Do not proceed to Task 4 (or run any of its verification) until this step is confirmed done — Tasks 2–3 don't touch the database and can proceed first if needed.

- [ ] **Step 3: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator" && git add supabase/npp_prescricoes_salvas.sql && git commit -m "Adiciona tabela npp_prescricoes_salvas (salvar/reabrir prescrição)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Payload build/restore helpers (no network)

**Files:**
- Modify: `app-web/index.html`

**Interfaces:**
- Consumes: existing consts `hospital, nome, idade, pesoEl, setor, leito, registro` (header fields, defined ~line 667-672), `doseFieldIds` (existing array, ~line 697), `srcPSelect, srcNaClSelect, srcKClSelect, srcLIPSelect, srcCaUnitSelect, srcPUnitSelect, unitCaGlu10, unitDoseP, dosePmgkg` (existing selects/spans from earlier work this session), existing functions `updatePUI()`, `atualizarPesoCalorico()`, `calcVolumes()`.
- Produces (used by Tasks 3-6): `const camposSalvarIds` (array of field ids), `function getPayloadFromForm(): object`, `function preencherFormularioComPayload(payload: object): void`, `function formularioTemDadosPreenchidos(): boolean`, `function hojeISO(): string` (YYYY-MM-DD, local timezone), `function formatDataBR(iso: string): string` (DD/MM/YYYY), `let currentUserId` (string|null, set by `checkAccess()`).

- [ ] **Step 1: Add `currentUserId` state next to `supabaseClient`**

In `app-web/index.html`, find:

```js
    let supabaseClient = null;
    try {
      if (window.supabase) {
        supabaseClient = window.supabase.createClient(window.NPP_CONFIG.supabaseUrl, window.NPP_CONFIG.supabaseAnonKey);
      } else {
        console.warn('Supabase indisponível (biblioteca não carregou) — login fica desativado nesta sessão.');
      }
    } catch (e) {
      console.warn('Erro ao inicializar o Supabase:', e);
    }
```

Add right after it:

```js
    // Preenchido em checkAccess() assim que há uma sessão válida — usado
    // pelas funções de salvar/buscar prescrição (===== Salvar/reabrir
    // prescrição ===== mais abaixo) pra filtrar por dono via RLS.
    let currentUserId = null;
```

- [ ] **Step 2: Set `currentUserId` inside `checkAccess()`**

Find:

```js
      if (!session) {
        accountBar.style.display = 'none';
        overlayPaywall.style.display = 'none';
        overlayAuth.style.display = 'flex';
        return false;
      }
      overlayAuth.style.display = 'none';
      accountEmail.textContent = session.user.email || '';
```

Replace with:

```js
      if (!session) {
        accountBar.style.display = 'none';
        overlayPaywall.style.display = 'none';
        overlayAuth.style.display = 'flex';
        return false;
      }
      currentUserId = session.user.id;
      overlayAuth.style.display = 'none';
      accountEmail.textContent = session.user.email || '';
```

- [ ] **Step 3: Add the payload helpers**

Find (this is right before the async IIFE that boots the app):

```js
    (async function init(){
```

Insert immediately before it:

```js
    // ===== Salvar/reabrir prescrição =====
    // Lista de todos os campos EDITÁVEIS que entram no payload salvo —
    // cabeçalho + todas as doses + todos os seletores de fonte/unidade.
    // Os campos "(auto)" (volumes, calorias, etc.) ficam de fora de
    // propósito: são sempre recalculados ao carregar, então salvá-los
    // só arriscaria restaurar um valor desatualizado.
    const headerFieldIds = ['hospital','nome','idade','peso','setor','leito','registro'];
    const camposSalvarIds = [...headerFieldIds, ...doseFieldIds, 'srcPSelect','srcNaClSelect','srcKClSelect','srcLIPSelect','srcCaUnitSelect','srcPUnitSelect'];

    function getPayloadFromForm(){
      const payload = {};
      camposSalvarIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) payload[id] = el.value;
      });
      return payload;
    }

    // Preenche cada campo com o valor salvo e força um recálculo geral —
    // reusa o mesmo motor que já roda a cada tecla digitada, então não
    // existe lógica de cálculo nova aqui. Os 3 selects que têm um span de
    // unidade dinâmico (Ca e P) não disparam 'change' ao setar .value via
    // JS, então replicamos manualmente a mesma atualização de texto que
    // os listeners de 'change' já fazem (ver addEventListener de
    // srcCaUnitSelect/srcPUnitSelect, seção de eletrólitos/fósforo).
    function preencherFormularioComPayload(payload){
      camposSalvarIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && Object.prototype.hasOwnProperty.call(payload, id)) el.value = payload[id];
      });
      updatePUI();
      unitCaGlu10.textContent = srcCaUnitSelect.value === 'ml' ? 'mL/kg/dia' : 'mEq/kg/dia';
      const isMmolP = srcPUnitSelect.value === 'mmol';
      unitDoseP.textContent = isMmolP ? 'mmol/kg/dia' : 'mg/kg/dia';
      dosePmgkg.inputMode = isMmolP ? 'decimal' : 'numeric';
      atualizarPesoCalorico();
      calcVolumes();
    }

    function formularioTemDadosPreenchidos(){
      return camposSalvarIds.some(id => {
        const el = document.getElementById(id);
        return el && el.value && el.value.trim() !== '';
      });
    }

    // Data local (não UTC — new Date().toISOString() erraria o dia perto
    // da meia-noite no fuso do Brasil).
    function hojeISO(){
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function formatDataBR(iso){
      const [y,m,d] = iso.split('-');
      return `${d}/${m}/${y}`;
    }

```

- [ ] **Step 4: Verify with Playwright — payload round-trips through the form, no network involved**

```js
() => {
  document.querySelectorAll('[id^=overlay]').forEach(el => el.style.display='none');
  const set = (id,val) => { const el=document.getElementById(id); el.value=val; };
  set('nome','TESTE_AUTOMATIZADO_payload');
  set('hospital','Hospital X');
  set('peso','3,2');
  set('doseCaGlu10','5');
  document.getElementById('srcCaUnitSelect').value = 'ml';
  const payload = getPayloadFromForm();
  const beforeUnit = document.getElementById('unitCaGlu10').textContent;
  // limpa tudo, depois restaura a partir do payload capturado
  camposSalvarIds.forEach(id => { document.getElementById(id).value = ''; });
  preencherFormularioComPayload(payload);
  return {
    payloadNome: payload.nome,
    payloadCaUnit: payload.srcCaUnitSelect,
    restauradoNome: document.getElementById('nome').value,
    restauradoPeso: document.getElementById('peso').value,
    restauradoCaDose: document.getElementById('doseCaGlu10').value,
    unitAntes: beforeUnit,
    unitDepois: document.getElementById('unitCaGlu10').textContent,
    formularioVazio: (() => { camposSalvarIds.forEach(id => { document.getElementById(id).value=''; }); return formularioTemDadosPreenchidos(); })(),
    hojeISOFormato: /^\d{4}-\d{2}-\d{2}$/.test(hojeISO()),
    formatDataBRExemplo: formatDataBR('2026-08-25'),
  };
}
```

Expected result: `payloadNome: "TESTE_AUTOMATIZADO_payload"`, `payloadCaUnit: "ml"`, `restauradoNome` and `restauradoPeso` and `restauradoCaDose` matching what was set, `unitAntes === unitDepois === "mL/kg/dia"`, `formularioVazio: false` (⚠ if it's `true`, the clear-then-check step has a bug — every field must actually be empty for this to read `false`... actually expected `false` is wrong: after clearing all fields in that last IIFE, the form IS empty, so `formularioTemDadosPreenchidos()` must return `false`. Re-read the returned value: expect `formularioVazio: false`), `hojeISOFormato: true`, `formatDataBRExemplo: "25/08/2026"`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator" && git add app-web/index.html && git commit -m "Adiciona helpers de payload pra salvar/reabrir prescrição (sem rede ainda)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: New UI markup and CSS (structural only, no behavior yet)

**Files:**
- Modify: `app-web/index.html`

**Interfaces:**
- Consumes: existing `.field`, `.busca-wrap` (new), `.link-btn`, `.actions`, `.secondary`, overlay pattern (`#overlayResumo`/`#resumoCard` CSS group).
- Produces (used by Task 4-6): DOM nodes `#campoNome` (wrapper), `#buscaDropdown`, `#btnVerHistorico`, `#btnSalvarPrescricao`, `#salvarStatus`, `#overlayHistorico`, `#historicoCard`, `#historicoLista`, `#btnFecharHistorico`.

- [ ] **Step 1: Wrap the "Nome completo" field and add the dropdown + histórico link**

Find:

```html
        <div class="field span-12">
          <label for="nome">Nome completo</label>
          <input id="nome" name="nome" type="text" placeholder="Nome do paciente" autocomplete="name" />
        </div>
```

Replace with:

```html
        <div class="field span-12 busca-wrap" id="campoNome">
          <label for="nome">Nome completo</label>
          <input id="nome" name="nome" type="text" placeholder="Nome do paciente" autocomplete="off" />
          <div id="buscaDropdown" class="busca-dropdown" style="display:none"></div>
          <button type="button" class="link-btn" id="btnVerHistorico" style="display:none; margin-top:4px;">Ver histórico</button>
        </div>
```

(`autocomplete` changes from `"name"` to `"off"` on purpose: the browser's own autofill suggestion list would visually collide with our custom search dropdown right below the field.)

- [ ] **Step 2: Add the "Salvar prescrição" button and status line**

Find:

```html
      <div class="meta">
        <small>Use vírgula ou ponto — a calculadora entende ambos.</small>
        <div class="actions">
          <button type="button" class="secondary" id="btnLimpar">Limpar</button>
        </div>
      </div>
```

Replace with:

```html
      <div class="meta">
        <small>Use vírgula ou ponto — a calculadora entende ambos.</small>
        <div class="actions">
          <button type="button" class="secondary" id="btnLimpar">Limpar</button>
          <button type="button" id="btnSalvarPrescricao">Salvar prescrição</button>
        </div>
      </div>
      <div id="salvarStatus" class="sub" style="display:none; margin-top:6px;"></div>
```

- [ ] **Step 3: Add the histórico overlay**

Find:

```html
  <!-- Overlay Aviso de responsabilidade -->
  <div id="overlayDisclaimer" role="dialog" aria-modal="true" aria-labelledby="disclaimerTitulo">
```

Insert immediately before it:

```html
  <!-- Overlay Histórico do paciente -->
  <div id="overlayHistorico" role="dialog" aria-modal="true" aria-labelledby="historicoTitulo">
    <div id="historicoCard">
      <h2 id="historicoTitulo">Histórico de prescrições</h2>
      <div class="muted">Escolha uma data pra carregar</div>
      <div id="historicoLista" style="margin-top:14px"></div>
      <div class="resumo-actions">
        <button type="button" class="secondary" id="btnFecharHistorico">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Overlay Aviso de responsabilidade -->
  <div id="overlayDisclaimer" role="dialog" aria-modal="true" aria-labelledby="disclaimerTitulo">
```

- [ ] **Step 4: Add `#overlayHistorico` to the shared overlay CSS groups**

Find:

```css
    #overlayResumo, #overlayDisclaimer, #overlayAuth, #overlayPaywall{
      position: fixed; inset: 0; background: rgba(0,0,0,.35);
      display:none; align-items: center; justify-content: center; padding: 24px;
      z-index: 9999;
    }
    #resumoCard, #disclaimerCard, #authCard, #paywallCard{
      width: 210mm; max-width: 100%; background: #fff; border-radius: 14px; box-shadow:0 20px 60px rgba(0,0,0,.25);
      padding: 18mm; max-height: 90vh; overflow: auto;
    }
    #disclaimerCard, #authCard, #paywallCard{width:120mm}
    #resumoCard h2, #disclaimerCard h2, #authCard h2, #paywallCard h2{margin:0 0 8px 0; font-size:18px}
```

Replace with:

```css
    #overlayResumo, #overlayDisclaimer, #overlayAuth, #overlayPaywall, #overlayHistorico{
      position: fixed; inset: 0; background: rgba(0,0,0,.35);
      display:none; align-items: center; justify-content: center; padding: 24px;
      z-index: 9999;
    }
    #resumoCard, #disclaimerCard, #authCard, #paywallCard, #historicoCard{
      width: 210mm; max-width: 100%; background: #fff; border-radius: 14px; box-shadow:0 20px 60px rgba(0,0,0,.25);
      padding: 18mm; max-height: 90vh; overflow: auto;
    }
    #disclaimerCard, #authCard, #paywallCard, #historicoCard{width:120mm}
    #resumoCard h2, #disclaimerCard h2, #authCard h2, #paywallCard h2, #historicoCard h2{margin:0 0 8px 0; font-size:18px}
```

(No change needed to the `@media print` rule — it already only reveals `#overlayResumo`'s contents by id, so `#overlayHistorico` stays hidden when printing automatically, same as the auth/paywall overlays already do.)

- [ ] **Step 5: Add the dropdown/histórico-list CSS**

Find:

```css
    .unit-wrap{position:relative; display:grid; grid-template-columns:minmax(0,1fr); grid-template-rows:auto auto;}
    .unit-wrap input{padding-right:56px; grid-row:2; grid-column:1;}
    .unit{position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#666; font-size:13px}
    .unit-wrap .unit{position:static; grid-row:2; grid-column:1; align-self:center; justify-self:end; margin-right:10px; transform:none;}
```

Insert immediately after it:

```css

    .busca-wrap{position:relative}
    .busca-dropdown{
      position:absolute; top:100%; left:0; right:0; margin-top:4px;
      background:#fff; border:1px solid var(--line); border-radius:8px;
      box-shadow:0 4px 16px rgba(0,0,0,.12); z-index:50; max-height:240px; overflow:auto;
    }
    .busca-item{padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--line)}
    .busca-item:last-child{border-bottom:none}
    .busca-item:hover{background:#eaf4ff}
    .busca-item-nome{font-size:14px; font-weight:600}
    .busca-item-detalhe{font-size:12px; color:var(--muted)}
    .historico-item{display:block; width:100%; text-align:left; margin-bottom:6px}
```

- [ ] **Step 6: Verify with Playwright — everything renders, nothing overlaps**

```js
() => {
  document.querySelectorAll('[id^=overlay]').forEach(el => el.style.display='none');
  const bar = document.getElementById('accountBar'); if (bar) bar.style.display='none';
  return {
    campoNomePosition: getComputedStyle(document.getElementById('campoNome')).position,
    dropdownExists: !!document.getElementById('buscaDropdown'),
    historicoBtnExists: !!document.getElementById('btnVerHistorico'),
    salvarBtnExists: !!document.getElementById('btnSalvarPrescricao'),
    salvarStatusExists: !!document.getElementById('salvarStatus'),
    overlayHistoricoExists: !!document.getElementById('overlayHistorico'),
    historicoListaExists: !!document.getElementById('historicoLista'),
  };
}
```

Expected: every `*Exists` key `true`, `campoNomePosition: "relative"`.

Then take a screenshot of the header area at a 390px-wide viewport (same convention used earlier this session for layout checks) and visually confirm the "Salvar prescrição" button sits next to "Limpar" without wrapping oddly, and that typing in "Nome completo" doesn't yet show a dropdown (no behavior wired up until Task 4 — that's expected at this point).

- [ ] **Step 7: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator" && git add app-web/index.html && git commit -m "Adiciona markup/CSS pra busca de paciente, botão salvar e histórico (sem lógica ainda)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Search-as-you-type + load (needs a real Supabase login)

**Files:**
- Modify: `app-web/index.html`

**Interfaces:**
- Consumes: `currentUserId`, `supabaseClient`, `camposSalvarIds`, `preencherFormularioComPayload`, `formularioTemDadosPreenchidos`, `formatDataBR`, DOM nodes from Task 3.
- Produces (used by Task 6): `async function carregarPrescricaoMaisRecente(nomePaciente: string): Promise<object|null>`, `function showSalvarStatus(text: string, isError=true): void`, `function hideSalvarStatus(): void`.

- [ ] **Step 1: Add the search/select/status functions**

In the `// ===== Salvar/reabrir prescrição =====` section added in Task 2, find the end of `formatDataBR`:

```js
    function formatDataBR(iso){
      const [y,m,d] = iso.split('-');
      return `${d}/${m}/${y}`;
    }

```

Insert immediately after it (still before `(async function init(){`):

```js
    const salvarStatus = document.getElementById('salvarStatus');
    function showSalvarStatus(text, isError = true) {
      salvarStatus.textContent = text;
      salvarStatus.style.color = isError ? 'var(--danger)' : 'var(--accent)';
      salvarStatus.style.display = 'block';
    }
    function hideSalvarStatus() { salvarStatus.style.display = 'none'; }

    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    // Busca até 200 linhas mais recentes que combinam com o termo, depois
    // reduz pro primeiro (mais recente, já que veio ordenado desc) de cada
    // nome distinto — evita precisar de uma view/RPC só pra "distinct on"
    // no Postgres, e o volume esperado por usuário é pequeno.
    // Toda chamada ao Supabase aqui embaixo passa por try/catch — o SDK
    // normalmente resolve com { error } em vez de rejeitar a promise, mas
    // uma falha de rede mais séria (ex.: DNS fora do ar) pode rejeitar de
    // verdade, e isso não pode virar uma exceção não tratada estourando
    // dentro de um listener assíncrono (mesma garantia de não travar o
    // app que o resto do arquivo já segue pro RevenueCat/Supabase Auth).
    async function buscarPacientesSalvos(termo){
      if (!supabaseClient || !currentUserId || !termo || termo.trim().length < 2) return [];
      try {
        const { data, error } = await supabaseClient
          .from('npp_prescricoes_salvas')
          .select('nome_paciente, hospital, setor, leito, data_prescricao')
          .eq('user_id', currentUserId)
          .ilike('nome_paciente', '%' + termo.trim() + '%')
          .order('data_prescricao', { ascending: false })
          .limit(200);
        if (error) { console.warn('Erro ao buscar pacientes salvos:', error); return []; }
        const vistos = new Set();
        const unicos = [];
        for (const row of data) {
          if (vistos.has(row.nome_paciente)) continue;
          vistos.add(row.nome_paciente);
          unicos.push(row);
        }
        return unicos.slice(0, 8);
      } catch (e) {
        console.warn('Falha de rede ao buscar pacientes salvos:', e);
        return [];
      }
    }

    async function carregarPrescricaoMaisRecente(nomePaciente){
      try {
        const { data, error } = await supabaseClient
          .from('npp_prescricoes_salvas')
          .select('payload')
          .eq('user_id', currentUserId)
          .eq('nome_paciente', nomePaciente)
          .order('data_prescricao', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !data) { console.warn('Erro ao carregar prescrição:', error); return null; }
        return data.payload;
      } catch (e) {
        console.warn('Falha de rede ao carregar prescrição:', e);
        return null;
      }
    }

    const buscaDropdown = document.getElementById('buscaDropdown');
    const btnVerHistorico = document.getElementById('btnVerHistorico');
    let buscaTimeout = null;
    let buscaResultadosCache = [];

    function esconderBuscaDropdown(){
      buscaDropdown.style.display = 'none';
      buscaDropdown.innerHTML = '';
    }

    function renderizarBuscaDropdown(resultados){
      if (!resultados.length) { esconderBuscaDropdown(); return; }
      buscaDropdown.innerHTML = resultados.map((r, i) => {
        const detalhe = [r.hospital, r.setor, r.leito].filter(Boolean).join(' · ');
        return `<div class="busca-item" data-idx="${i}">
          <div class="busca-item-nome">${escapeHtml(r.nome_paciente)}</div>
          <div class="busca-item-detalhe">${escapeHtml(detalhe)}${detalhe ? ' — ' : ''}${formatDataBR(r.data_prescricao)}</div>
        </div>`;
      }).join('');
      buscaDropdown.style.display = 'block';
      buscaDropdown.querySelectorAll('.busca-item').forEach(el => {
        el.addEventListener('click', () => selecionarPacienteDaBusca(buscaResultadosCache[Number(el.dataset.idx)]));
      });
    }

    async function selecionarPacienteDaBusca(resultado){
      esconderBuscaDropdown();
      if (formularioTemDadosPreenchidos() && !window.confirm('Isso vai substituir os dados atuais no formulário. Continuar?')) return;
      hideSalvarStatus();
      const payload = await carregarPrescricaoMaisRecente(resultado.nome_paciente);
      if (!payload) { showSalvarStatus('Não foi possível carregar essa prescrição.'); return; }
      preencherFormularioComPayload(payload);
      btnVerHistorico.style.display = 'inline';
    }

    nome.addEventListener('input', () => {
      btnVerHistorico.style.display = 'none';
      clearTimeout(buscaTimeout);
      const termo = nome.value;
      if (termo.trim().length < 2) { esconderBuscaDropdown(); return; }
      buscaTimeout = setTimeout(async () => {
        const resultados = await buscarPacientesSalvos(termo);
        buscaResultadosCache = resultados;
        renderizarBuscaDropdown(resultados);
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#campoNome')) esconderBuscaDropdown();
    });

```

- [ ] **Step 2: Verify with Playwright — requires a real login**

Start the app, sign in with the credentials provided for testing (fill `#authEmail`/`#authPassword`, click `#btnAuthSubmit`, wait for the paywall or main form to show — if the paywall overlay blocks the calculator, that's fine for this test, hide it directly since we only need `currentUserId` to be set, not an active subscription):

```js
() => {
  document.querySelectorAll('[id^=overlay]').forEach(el => el.style.display='none');
  return { currentUserId, loggedIn: !!currentUserId };
}
```

Expected: `loggedIn: true` and a real UUID in `currentUserId`. If `false`, the login step didn't complete — check for an error in `#authError`.

Then seed one test row directly via the Supabase client already on the page (no UI needed for the seed, keeps this step fast) and confirm the search finds it:

```js
async () => {
  const nomeTeste = 'TESTE_AUTOMATIZADO_busca_' + Date.now();
  const { error: upsertErr } = await supabaseClient.from('npp_prescricoes_salvas').upsert({
    user_id: currentUserId, nome_paciente: nomeTeste, data_prescricao: hojeISO(),
    hospital: 'Hospital Teste', setor: 'UTI', leito: '7',
    payload: { nome: nomeTeste, peso: '3,50', doseAA: '2,50' },
  }, { onConflict: 'user_id,nome_paciente,data_prescricao' });
  if (upsertErr) return { erroSeed: upsertErr.message };

  document.getElementById('nome').value = nomeTeste.slice(0, -3); // busca por prefixo parcial
  const resultados = await buscarPacientesSalvos(nomeTeste.slice(0, -3));
  const achou = resultados.some(r => r.nome_paciente === nomeTeste);

  renderizarBuscaDropdown(resultados);
  const dropdownVisivel = document.getElementById('buscaDropdown').style.display === 'block';
  const item = document.querySelector('.busca-item');
  item.click();
  await new Promise(r => setTimeout(r, 400)); // dá tempo pro await interno de selecionarPacienteDaBusca
  return {
    achouNaBusca: achou,
    dropdownVisivel,
    pesoCarregado: document.getElementById('peso').value,
    doseAACarregada: document.getElementById('doseAA').value,
    nomeTeste, // guarda pra limpar no Task 7
  };
}
```

Expected: `achouNaBusca: true`, `dropdownVisivel: true`, `pesoCarregado: "3,50"`, `doseAACarregada: "2,50"` (loaded straight from the seeded row's payload, no confirm dialog because the form started empty). Note the `nomeTeste` value returned — it needs deleting in Task 7's cleanup.

- [ ] **Step 3: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator" && git add app-web/index.html && git commit -m "Liga busca de paciente por nome (digitar e clicar carrega a prescrição)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Salvar prescrição (upsert)

**Files:**
- Modify: `app-web/index.html`

**Interfaces:**
- Consumes: `currentUserId`, `supabaseClient`, `getPayloadFromForm`, `hojeISO`, `showSalvarStatus`/`hideSalvarStatus` (Task 4), header field consts `hospital, setor, leito, nome`.
- Produces: `async function salvarPrescricaoAtual(): Promise<void>`, wired to `#btnSalvarPrescricao`.

- [ ] **Step 1: Add the save function and wire the button**

Find (end of the block added in Task 4):

```js
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#campoNome')) esconderBuscaDropdown();
    });

```

Insert immediately after it:

```js
    async function salvarPrescricaoAtual(){
      hideSalvarStatus();
      if (!supabaseClient || !currentUserId) {
        showSalvarStatus('Não foi possível salvar — faça login novamente.');
        return;
      }
      const nomePaciente = nome.value.trim();
      if (!nomePaciente) {
        showSalvarStatus('Preencha o nome do paciente antes de salvar.');
        return;
      }
      const row = {
        user_id: currentUserId,
        nome_paciente: nomePaciente,
        data_prescricao: hojeISO(),
        hospital: hospital.value.trim(),
        setor: setor.value.trim(),
        leito: leito.value.trim(),
        payload: getPayloadFromForm(),
        updated_at: new Date().toISOString(),
      };
      try {
        const { error } = await supabaseClient
          .from('npp_prescricoes_salvas')
          .upsert(row, { onConflict: 'user_id,nome_paciente,data_prescricao' });
        if (error) {
          console.warn('Erro ao salvar prescrição:', error);
          showSalvarStatus('Não foi possível salvar. Tente novamente.');
          return;
        }
        showSalvarStatus('Prescrição salva ✓', false);
      } catch (e) {
        console.warn('Falha de rede ao salvar prescrição:', e);
        showSalvarStatus('Não foi possível salvar. Tente novamente.');
      }
    }
    document.getElementById('btnSalvarPrescricao').addEventListener('click', salvarPrescricaoAtual);

```

- [ ] **Step 2: Verify with Playwright — save, then confirm same-day upsert doesn't duplicate**

Continuing in the same logged-in session as Task 4:

```js
async () => {
  const nomeTeste = 'TESTE_AUTOMATIZADO_salvar_' + Date.now();
  document.getElementById('nome').value = nomeTeste;
  document.getElementById('hospital').value = 'Hospital Teste';
  document.getElementById('peso').value = '4,10';
  document.getElementById('doseAA').value = '3,00';

  await salvarPrescricaoAtual();
  const statusAposPrimeiroSave = document.getElementById('salvarStatus').textContent;

  // muda uma dose e salva de novo NO MESMO DIA — deve sobrescrever, não duplicar
  document.getElementById('doseAA').value = '3,50';
  await salvarPrescricaoAtual();

  const { data, error } = await supabaseClient
    .from('npp_prescricoes_salvas')
    .select('payload')
    .eq('user_id', currentUserId)
    .eq('nome_paciente', nomeTeste);

  return {
    statusAposPrimeiroSave,
    erroConsulta: error ? error.message : null,
    quantasLinhas: data ? data.length : null,
    doseAASalva: data && data[0] ? data[0].payload.doseAA : null,
    nomeTeste,
  };
}
```

Expected: `statusAposPrimeiroSave: "Prescrição salva ✓"`, `erroConsulta: null`, `quantasLinhas: 1` (proves the second save overwrote instead of creating a second row for the same day), `doseAASalva: "3,50"` (the updated value, confirming the overwrite actually took the newer data). Note `nomeTeste` for Task 7's cleanup.

- [ ] **Step 3: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator" && git add app-web/index.html && git commit -m "Liga botão Salvar prescrição (upsert por usuário+nome+data)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Ver histórico (list dates, load a specific one)

**Files:**
- Modify: `app-web/index.html`

**Interfaces:**
- Consumes: `currentUserId`, `supabaseClient`, `formatDataBR`, `preencherFormularioComPayload`, `formularioTemDadosPreenchidos`, `showSalvarStatus`, DOM nodes `#overlayHistorico`, `#historicoLista`, `#btnFecharHistorico`, `#btnVerHistorico` (Task 3).
- Produces: `async function buscarHistoricoPaciente(nomePaciente: string): Promise<string[]>`, `async function carregarPrescricaoPorData(nomePaciente: string, dataISO: string): Promise<object|null>`.

- [ ] **Step 1: Add the history functions and wire the overlay**

Find (end of the block added in Task 5):

```js
    document.getElementById('btnSalvarPrescricao').addEventListener('click', salvarPrescricaoAtual);

```

Insert immediately after it:

```js
    async function buscarHistoricoPaciente(nomePaciente){
      try {
        const { data, error } = await supabaseClient
          .from('npp_prescricoes_salvas')
          .select('data_prescricao')
          .eq('user_id', currentUserId)
          .eq('nome_paciente', nomePaciente)
          .order('data_prescricao', { ascending: false });
        if (error) { console.warn('Erro ao buscar histórico:', error); return []; }
        return data.map(r => r.data_prescricao);
      } catch (e) {
        console.warn('Falha de rede ao buscar histórico:', e);
        return [];
      }
    }

    async function carregarPrescricaoPorData(nomePaciente, dataISO){
      try {
        const { data, error } = await supabaseClient
          .from('npp_prescricoes_salvas')
          .select('payload')
          .eq('user_id', currentUserId)
          .eq('nome_paciente', nomePaciente)
          .eq('data_prescricao', dataISO)
          .maybeSingle();
        if (error || !data) { console.warn('Erro ao carregar prescrição da data:', error); return null; }
        return data.payload;
      } catch (e) {
        console.warn('Falha de rede ao carregar prescrição da data:', e);
        return null;
      }
    }

    const overlayHistorico = document.getElementById('overlayHistorico');
    const historicoLista = document.getElementById('historicoLista');
    btnVerHistorico.addEventListener('click', async () => {
      const nomePaciente = nome.value.trim();
      if (!nomePaciente) return;
      const datas = await buscarHistoricoPaciente(nomePaciente);
      if (!datas.length) { showSalvarStatus('Nenhum histórico encontrado para esse nome.'); return; }
      historicoLista.innerHTML = datas.map(d => `<button type="button" class="secondary historico-item" data-data="${d}">${formatDataBR(d)}</button>`).join('');
      historicoLista.querySelectorAll('.historico-item').forEach(botao => {
        botao.addEventListener('click', async () => {
          overlayHistorico.style.display = 'none';
          if (formularioTemDadosPreenchidos() && !window.confirm('Isso vai substituir os dados atuais no formulário. Continuar?')) return;
          const payload = await carregarPrescricaoPorData(nomePaciente, botao.dataset.data);
          if (!payload) { showSalvarStatus('Não foi possível carregar essa data.'); return; }
          preencherFormularioComPayload(payload);
          btnVerHistorico.style.display = 'inline';
        });
      });
      overlayHistorico.style.display = 'flex';
    });
    document.getElementById('btnFecharHistorico').addEventListener('click', () => { overlayHistorico.style.display = 'none'; });

```

- [ ] **Step 2: Verify with Playwright — two dates saved, histórico lists both, loading an older one restores its own data**

Continuing in the same logged-in session:

```js
async () => {
  const nomeTeste = 'TESTE_AUTOMATIZADO_historico_' + Date.now();
  const ontem = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();

  await supabaseClient.from('npp_prescricoes_salvas').upsert([
    { user_id: currentUserId, nome_paciente: nomeTeste, data_prescricao: ontem, payload: { nome: nomeTeste, peso: '2,90' } },
    { user_id: currentUserId, nome_paciente: nomeTeste, data_prescricao: hojeISO(), payload: { nome: nomeTeste, peso: '3,00' } },
  ], { onConflict: 'user_id,nome_paciente,data_prescricao' });

  const datas = await buscarHistoricoPaciente(nomeTeste);

  document.getElementById('nome').value = nomeTeste;
  document.getElementById('peso').value = ''; // formulário "vazio" o bastante pra não pedir confirm — só peso setado a seguir pelo load
  const payloadOntem = await carregarPrescricaoPorData(nomeTeste, ontem);
  preencherFormularioComPayload(payloadOntem);

  return {
    quantasDatas: datas.length,
    datasEmOrdem: datas,
    pesoCarregadoDaDataAntiga: document.getElementById('peso').value,
    nomeTeste,
  };
}
```

Expected: `quantasDatas: 2`, `datasEmOrdem` with today's date before yesterday's (descending order), `pesoCarregadoDaDataAntiga: "2,90"` (proves it loaded the specific older date's payload, not the most recent one). Note `nomeTeste` for Task 7's cleanup.

Also do one interactive click-through check: type the test name into `#nome`, confirm the `#buscaDropdown` shows it, click it (or wait for `btnVerHistorico` to appear after a direct load), click `#btnVerHistorico`, confirm `#overlayHistorico` becomes visible with 2 buttons inside `#historicoLista`, click the older date's button, confirm the overlay closes and `#peso` shows `2,90` again.

- [ ] **Step 3: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator" && git add app-web/index.html && git commit -m "Adiciona overlay de histórico do paciente (escolher uma data salva pra carregar)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end smoke test, test-data cleanup, deploy

**Files:** none (verification + cleanup only)

- [ ] **Step 1: Full manual walkthrough in a real browser session**

With the local server still running and logged in with the test credentials:
1. Type a fresh test name (e.g. `TESTE_AUTOMATIZADO_e2e`) into "Nome completo", fill in a weight and a couple of doses, click "Salvar prescrição" — confirm "Prescrição salva ✓" appears.
2. Clear the form (`Limpar`), type the same name again — confirm the dropdown shows it, click it, confirm the form repopulates with the same values.
3. Edit one dose, save again — confirm no error.
4. Click "Ver histórico" — confirm exactly one date is listed (same-day overwrite from step 3, not two rows).
5. Change the weight to something else, click a patient result from the dropdown again without saving first — confirm the "Isso vai substituir..." browser confirm dialog appears (Playwright: `browser_handle_dialog` to accept/dismiss and verify the corresponding behavior).

- [ ] **Step 2: Delete every `TESTE_AUTOMATIZADO_*` row created while testing this plan**

```js
async () => {
  const { data, error } = await supabaseClient
    .from('npp_prescricoes_salvas')
    .delete()
    .eq('user_id', currentUserId)
    .like('nome_paciente', 'TESTE_AUTOMATIZADO_%')
    .select();
  return { erro: error ? error.message : null, linhasApagadas: data ? data.length : 0 };
}
```

Expected: `erro: null`, `linhasApagadas` matching the count of test rows created across Tasks 4-7 (at least 5: busca, salvar, historico×2, e2e).

- [ ] **Step 3: Stop the local test server**

```bash
pkill -f "http.server 8799"
```

- [ ] **Step 4: Push**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator" && git push
```

GitHub Pages will redeploy `app-web/` automatically (no service worker to cache-bust for this file — that only applies to the root standalone PWA, `calculadora_npp_v0_5_8-2.html`, which this plan does not touch).
