# Seletor de marca — Polivitamínico e Oligoelementos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o cálculo fixo do Polivitamínico (hoje travado na fórmula do Trezevit AB) e adicionar seletor de marca no Oligoelemento, nas três implementações da calculadora, com persistência da última marca escolhida.

**Architecture:** Duas tabelas de dados por marca (`MVI_BRANDS`, `TE_BRANDS`) + uma função `calcMVIVol(P, brandKey)` por implementação (sem módulo compartilhado — cada um dos 3 arquivos HTML é autocontido, seguindo o padrão já existente no projeto). Dois `<select>` novos disparam recálculo e gravam a escolha em armazenamento local (Capacitor Preferences no app-mobile, `localStorage` puro nos outros dois).

**Tech Stack:** HTML/CSS/JS vanilla, sem build step. Playwright (`playwright-core`) só no app-mobile, via `app-mobile/tests/calc-parity.mjs`.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-09-15-marcas-polivitaminico-oligoelementos-design.md` — todo valor numérico usado aqui vem de lá.
- Seletores de marca/fonte usam `span-12`, nunca `span-3` (grid quebra em coluna estreita — problema conhecido neste projeto).
- Rotear toda formatação numérica por `formatNumberBR`/`f2`/`formatML` já existentes — nunca `toFixed`/`parseFloat` direto.
- `app/` (Electron) é gitignored localmente (`.gitignore:1:/app/`) — editar o arquivo normalmente, mas não faz parte de nenhum commit.
- Marcas excluídas (não implementar): MVI-12/Opoplex, Cerne-12, Frutovitam, Tracitrans Plus.

---

### Task 1: app-mobile — implementação + teste de paridade

**Files:**
- Modify: `app-mobile/www/index.html`
- Modify: `app-mobile/tests/calc-parity.mjs`
- Modify: `app-mobile/tests/expected-outputs.json`

**Interfaces:**
- Produces: `MVI_BRANDS` (objeto `{chave: {label, tier?, factor?, cap?}}`), `TE_BRANDS` (objeto `{chave: {label, dose, notice?}}`), `calcMVIVol(P, brandKey)` → número em mL, `applyTEBrandDefaults()` → void (lê `srcTESelect.value`, escreve `doseTE.value` e `avisoAdElement.style.display`). Os elementos `#srcMVISelect` e `#srcTESelect` (novos `<select>`) e `#avisoAdElement` (novo `<small>`) — usados pelos Tasks 2 e 3 como referência de nomes (cada arquivo tem sua própria cópia, sem import).

- [ ] **Step 1: Escrever o teste que falha**

Abra `app-mobile/tests/calc-parity.mjs`. Substitua o objeto `SELECTS` (linha 23) para incluir os dois seletores novos, escolhendo marcas que NÃO são o default (prova que a seleção realmente aciona a fórmula certa, não só o valor que já seria o padrão):

```js
const SELECTS = {
  '#srcNaClSelect': '10',
  '#srcKClSelect': '10',
  '#srcPSelect': 'gly',
  '#srcMVISelect': 'polivitb',
  '#srcTESelect': 'oliped4',
};
```

Logo abaixo da função `readOutputs`, adicione uma nova função que confere o pré-preenchimento da dose de Oligoelementos ao trocar de marca (comportamento que `readOutputs` não exercita, porque a fase `INPUTS` sempre sobrescreve `#doseTE` depois):

```js
async function checkTEPrefill(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  await page.selectOption('#srcTESelect', 'oliped4');
  const prefilled = await page.inputValue('#doseTE');
  await page.close();
  assert.equal(
    prefilled, '1,00',
    'Selecionar Oliped 4 deveria pré-preencher a dose em 1,00 mL/kg/dia'
  );
}
```

No final do arquivo, troque:

```js
const browser = await chromium.launch();
const portedValues = await readOutputs(browser, PORTED);
await browser.close();

assert.deepEqual(
  portedValues,
  expectedValues,
  'Campos calculados de app-mobile/www/index.html divergem do fixture tests/expected-outputs.json'
);
console.log('OK —', OUTPUT_FIELDS.length, 'campos calculados batem com o fixture golden.');
```

por:

```js
const browser = await chromium.launch();
const portedValues = await readOutputs(browser, PORTED);
await checkTEPrefill(browser, PORTED);
await browser.close();

assert.deepEqual(
  portedValues,
  expectedValues,
  'Campos calculados de app-mobile/www/index.html divergem do fixture tests/expected-outputs.json'
);
console.log('OK —', OUTPUT_FIELDS.length, 'campos calculados batem com o fixture golden, e o pré-preenchimento de Oligoelementos confere.');
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd app-mobile && node tests/calc-parity.mjs`
Expected: falha do Playwright tipo `Error: page.selectOption: ... waiting for locator("#srcMVISelect")` (elemento não existe ainda).

- [ ] **Step 3: Adicionar o HTML dos dois seletores novos**

Em `app-mobile/www/index.html`, dentro de `<section aria-label="Micronutrientes — Traços e Vitaminas">`, substitua o bloco (por volta da linha 400):

```html
        <div class="field span-3 unit-wrap">
          <label for="doseTE">Oligoelementos — dose</label>
          <input id="doseTE" type="text" placeholder="0,00" inputmode="decimal" />
          <span class="unit" aria-hidden="true">ml/kg/dia</span>
        </div>
        <div class="field span-3 unit-wrap">
          <label for="volTE">Oligoelementos — volume (auto)</label>
          <input id="volTE" type="text" placeholder="—" readonly />
          <span class="unit" aria-hidden="true">ml</span>
        </div>
        <div class="field span-12 unit-wrap">
          <label for="volMVI">Polivitamínicos — TrezevitAB (auto)</label>
          <input id="volMVI" type="text" placeholder="2 mL/kg, máx 10 mL" readonly />
          <span class="unit" aria-hidden="true">ml</span>
        </div>
```

por:

```html
        <div class="field span-12">
          <label for="srcTESelect">Oligoelementos — marca</label>
          <select id="srcTESelect">
            <option value="pedelement" selected>Ped-Element</option>
            <option value="adelement">Ad-Element</option>
            <option value="oliped4">Oliped 4</option>
            <option value="politrace4">Politrace 4</option>
          </select>
          <small class="notice" id="avisoAdElement" style="display:none">Mesmo com a dose ajustada, a oferta de manganês fica acima do recomendado.</small>
        </div>
        <div class="field span-3 unit-wrap">
          <label for="doseTE">Oligoelementos — dose</label>
          <input id="doseTE" type="text" placeholder="0,00" inputmode="decimal" />
          <span class="unit" aria-hidden="true">ml/kg/dia</span>
        </div>
        <div class="field span-3 unit-wrap">
          <label for="volTE">Oligoelementos — volume (auto)</label>
          <input id="volTE" type="text" placeholder="—" readonly />
          <span class="unit" aria-hidden="true">ml</span>
        </div>
        <div class="field span-12">
          <label for="srcMVISelect">Polivitamínico — marca</label>
          <select id="srcMVISelect">
            <option value="trezevit" selected>Trezevit AB</option>
            <option value="polivita">Polivit A Ped</option>
            <option value="polivitb">Polivit B Ped</option>
          </select>
        </div>
        <div class="field span-12 unit-wrap">
          <label for="volMVI">Polivitamínico (auto)</label>
          <input id="volMVI" type="text" placeholder="—" readonly />
          <span class="unit" aria-hidden="true">ml</span>
        </div>
```

- [ ] **Step 4: Referências de campo — adicionar os novos elementos**

Substitua (por volta da linha 670):

```js
    const doseTE = document.getElementById('doseTE'), volTE = document.getElementById('volTE');
    const volMVI = document.getElementById('volMVI');
```

por:

```js
    const srcTESelect = document.getElementById('srcTESelect');
    const avisoAdElement = document.getElementById('avisoAdElement');
    const doseTE = document.getElementById('doseTE'), volTE = document.getElementById('volTE');
    const srcMVISelect = document.getElementById('srcMVISelect');
    const volMVI = document.getElementById('volMVI');
```

- [ ] **Step 5: Dados por marca + função de cálculo do Polivitamínico**

Substitua a linha de constantes (por volta da linha 715):

```js
    const FACT_NACL10=1.7, FACT_NACL20=3.4, FACT_KCL10=1.34, FACT_KCL191=2.56, FACT_MG10=0.8, FACT_CAGLU10=0.5, FACT_MVI=2, FACT_ZN=230, FACT_SE=60, FACT_GLN=0.2, MG_PER_ML_P=31;
```

por:

```js
    const FACT_NACL10=1.7, FACT_NACL20=3.4, FACT_KCL10=1.34, FACT_KCL191=2.56, FACT_MG10=0.8, FACT_CAGLU10=0.5, FACT_ZN=230, FACT_SE=60, FACT_GLN=0.2, MG_PER_ML_P=31;
    // Polivitamínico e Oligoelementos — dados por marca, verificados contra
    // bulário ANVISA / literatura científica (ver
    // docs/superpowers/specs/2026-09-15-marcas-polivitaminico-oligoelementos-design.md).
    // MVI_BRANDS: 'tier: true' = degrau por faixa de peso (só Trezevit AB,
    // que é dose fixa por ampola em cada faixa, não fator x peso); as
    // demais usam 'factor' (mL/kg) x peso, com teto de 1 ampola ('cap').
    const MVI_BRANDS = {
      trezevit:  { label: 'Trezevit AB', tier: true },
      polivita:  { label: 'Polivit A Ped', factor: 4, cap: 10 },
      polivitb:  { label: 'Polivit B Ped', factor: 2, cap: 5 },
    };
    const TE_BRANDS = {
      pedelement: { label: 'Ped-Element', dose: 0.2 },
      adelement:  { label: 'Ad-Element', dose: 0.05, notice: true },
      oliped4:    { label: 'Oliped 4', dose: 1 },
      politrace4: { label: 'Politrace 4', dose: 0.1 },
    };
    function calcMVIVol(P, brandKey){
      const brand = MVI_BRANDS[brandKey] || MVI_BRANDS.trezevit;
      if(brand.tier){
        if(P < 1) return 1.5;
        if(P < 3) return 3.25;
        return 5;
      }
      return Math.min(P*brand.factor, brand.cap);
    }
    function applyTEBrandDefaults(){
      const brand = TE_BRANDS[srcTESelect.value];
      if(!brand) return;
      doseTE.value = f2(brand.dose);
      avisoAdElement.style.display = brand.notice ? '' : 'none';
    }
```

(`applyTEBrandDefaults` usa `f2`, já definido mais acima no arquivo — linha 633 — como `const f2 = (n)=>formatNumberBR(n,2);`.)

- [ ] **Step 6: Incluir os selects novos no bloqueio de peso ≥40kg**

Substitua (por volta da linha 724):

```js
    const selectFieldIds = ['srcPSelect','srcNaClSelect','srcKClSelect','srcLIPSelect','srcCaUnitSelect','srcPUnitSelect'];
```

por:

```js
    const selectFieldIds = ['srcPSelect','srcNaClSelect','srcKClSelect','srcLIPSelect','srcCaUnitSelect','srcPUnitSelect','srcMVISelect','srcTESelect'];
```

- [ ] **Step 7: Trocar a fórmula usada em `calcVolumes()`**

Substitua (por volta da linha 810):

```js
      const MVIVol=Math.min(P*FACT_MVI,10); volMVI.value=formatML(MVIVol);
```

por:

```js
      const MVIVol=calcMVIVol(P, srcMVISelect.value); volMVI.value=formatML(MVIVol);
```

- [ ] **Step 8: Listeners dos dois selects novos**

Substitua (por volta da linha 917):

```js
    srcLIPSelect.addEventListener('change', calcVolumes);
```

por:

```js
    srcLIPSelect.addEventListener('change', calcVolumes);
    srcMVISelect.addEventListener('change', () => {
      prefsSet('mviBrand', srcMVISelect.value).catch((e) => console.warn('Falha ao salvar marca do polivitamínico:', e));
      calcVolumes();
    });
    srcTESelect.addEventListener('change', () => {
      prefsSet('teBrand', srcTESelect.value).catch((e) => console.warn('Falha ao salvar marca do oligoelemento:', e));
      applyTEBrandDefaults();
      calcVolumes();
    });
```

(`prefsSet` é `function` declarada mais abaixo no arquivo — linha ~1030 — mas *function declarations* são hoisted em JS, então já está disponível aqui; só é chamada de verdade quando o usuário interage, momento em que o script inteiro já rodou.)

**Sobre o botão Limpar: nenhuma mudança necessária.** `btnLimpar` só zera elementos `<input>` (via `document.querySelectorAll('#editor input')`) e reseta *selects* explicitamente listados um a um — `srcMVISelect`/`srcTESelect` não estão nessa lista e não serão tocados, então continuam com o valor atual (que é sempre a última marca escolhida, já que cada troca grava imediatamente) — é exatamente o comportamento "lembrar a última marca" pedido na spec, sem precisar de código extra. Confirme isso no Step 12 (verificação manual), não como edição.

- [ ] **Step 9: Resumo impresso — nome da marca nas linhas de Oligoelementos/Polivitamínico**

Substitua (por volta da linha 969):

```js
      const comp = [
        ['Oferta hídrica (alvo)', volH2O.value, 'ml'],
        ['Aminoácidos 10%', volAA.value, 'ml'],
        [srcLIPSelect.value === 'smof' ? 'SMOFlipid 20%' : 'Lipídeos 20% (Intralipid)', volLIP.value, 'ml'],
        ['Glicose 50%', volG50.value, 'ml'],
        [srcNaClSelect.value === '20' ? 'Cloreto de sódio 20%' : 'Cloreto de sódio 10%', volNaCl10.value, 'ml'],
        [srcKClSelect.value === '191' ? 'Cloreto de potássio 19,1%' : 'Cloreto de potássio 10%', volKCl10.value, 'ml'],
        ['Sulfato de magnésio 10%', volMg10.value, 'ml'],
        ['Gluconato de cálcio 10%', volCaGlu10.value, 'ml'],
        [srcPSelect.value === 'gly' ? 'Glicerofosfato de sódio' : (srcPSelect.value === 'kphos' ? 'Fosfato de K (2 mEq/mL)' : 'Fósforo'), volP.value, 'ml'],
        ['Selênio', volSe.value, 'ml'],
        ['Zinco', volZn.value, 'ml'],
        ['Oligoelementos', volTE.value, 'ml'],
        ['Polivitamínicos — TrezevitAB', volMVI.value, 'ml'],
        ['Glutamina', volGln.value, 'ml'],
        ['Água destilada', aguaDestilada.value, 'ml'],
      ].filter(([_,v]) => nonEmptyVal(v));
```

por:

```js
      const teLabel = (TE_BRANDS[srcTESelect.value] || {}).label || 'Oligoelementos';
      const mviLines = srcMVISelect.value === 'trezevit'
        ? [['Trezevit A', volMVI.value, 'ml'], ['Trezevit B', volMVI.value, 'ml']]
        : [[(MVI_BRANDS[srcMVISelect.value] || {}).label || 'Polivitamínico', volMVI.value, 'ml']];
      const comp = [
        ['Oferta hídrica (alvo)', volH2O.value, 'ml'],
        ['Aminoácidos 10%', volAA.value, 'ml'],
        [srcLIPSelect.value === 'smof' ? 'SMOFlipid 20%' : 'Lipídeos 20% (Intralipid)', volLIP.value, 'ml'],
        ['Glicose 50%', volG50.value, 'ml'],
        [srcNaClSelect.value === '20' ? 'Cloreto de sódio 20%' : 'Cloreto de sódio 10%', volNaCl10.value, 'ml'],
        [srcKClSelect.value === '191' ? 'Cloreto de potássio 19,1%' : 'Cloreto de potássio 10%', volKCl10.value, 'ml'],
        ['Sulfato de magnésio 10%', volMg10.value, 'ml'],
        ['Gluconato de cálcio 10%', volCaGlu10.value, 'ml'],
        [srcPSelect.value === 'gly' ? 'Glicerofosfato de sódio' : (srcPSelect.value === 'kphos' ? 'Fosfato de K (2 mEq/mL)' : 'Fósforo'), volP.value, 'ml'],
        ['Selênio', volSe.value, 'ml'],
        ['Zinco', volZn.value, 'ml'],
        [teLabel, volTE.value, 'ml'],
        ...mviLines,
        ['Glutamina', volGln.value, 'ml'],
        ['Água destilada', aguaDestilada.value, 'ml'],
      ].filter(([_,v]) => nonEmptyVal(v));
```

- [ ] **Step 10: Carregar a última marca lembrada ao abrir o app**

Na IIFE `init` no final do arquivo, o trecho atual é:

```js
    (async function init(){
      if (!dataPrescricao.value) dataPrescricao.value = hojeISO();
      updatePUI();
      try {
        await updateAccountBar();
      } catch (e) {
        console.warn('Falha ao checar sessão do Supabase na abertura do app:', e);
      }
```

Insira quatro blocos novos (dois `try/catch` de leitura de preferência + a chamada de `applyTEBrandDefaults()`) entre `updatePUI();` e o `try { await updateAccountBar();` já existente — ou seja, faça um Edit cujo `old_string` é só a linha `updatePUI();` (única nesse trecho) e cujo `new_string` é:

```js
      updatePUI();
      try {
        const savedMVI = await prefsGet('mviBrand');
        if (savedMVI && MVI_BRANDS[savedMVI]) srcMVISelect.value = savedMVI;
      } catch (e) {
        console.warn('Falha ao carregar preferência de marca do polivitamínico:', e);
      }
      try {
        const savedTE = await prefsGet('teBrand');
        if (savedTE && TE_BRANDS[savedTE]) srcTESelect.value = savedTE;
      } catch (e) {
        console.warn('Falha ao carregar preferência de marca do oligoelemento:', e);
      }
      applyTEBrandDefaults();
```

O `try { await updateAccountBar(); ... }` que já vem logo depois no arquivo não muda — fica exatamente onde estava, agora precedido pelo bloco novo.

- [ ] **Step 11: Rodar o teste — deve falhar de novo, agora por divergência no fixture**

Run: `cd app-mobile && node tests/calc-parity.mjs`
Expected: passa a asserção de `checkTEPrefill` (doseTE = "1,00"), mas falha em `assert.deepEqual` porque `expected-outputs.json` ainda tem os valores antigos de `#volMVI`/`#somaComponentes`/`#aguaDestilada`.

- [ ] **Step 12: Regenerar o fixture e verificar os números na mão**

Com peso 8,5kg e Polivitamínico = Polivit B Ped (fator 2 mL/kg, teto 5mL): `min(8,5×2, 5) = 5,0 mL` (antes eram 10,0 mL da fórmula antiga do Trezevit) — uma queda de exatamente 5,0 mL na soma dos componentes.

Abra `app-mobile/tests/expected-outputs.json` e atualize só estas três linhas (as únicas que dependem de `volMVI`; nenhuma outra métrica do Informativo usa volume de polivitamínico/oligoelemento):

```json
  "#volMVI": "5,0",
  "#somaComponentes": "717,4",
  "#aguaDestilada": "557,6",
```

(de "10,0" / "722,4" / "552,6" — `717,4 = 722,4 − 5,0` e `557,6 = 552,6 + 5,0`, a mesma diferença exata de 5,0 mL propagada.)

- [ ] **Step 13: Rodar o teste — deve passar**

Run: `cd app-mobile && node tests/calc-parity.mjs`
Expected: `OK — 27 campos calculados batem com o fixture golden, e o pré-preenchimento de Oligoelementos confere.`

- [ ] **Step 14: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
git add app-mobile/www/index.html app-mobile/tests/calc-parity.mjs app-mobile/tests/expected-outputs.json
git commit -m "$(cat <<'EOF'
Adiciona seletor de marca pro Polivitamínico e Oligoelementos (app-mobile)

Substitui o cálculo fixo do Polivitamínico (fórmula do Trezevit AB
aplicada a qualquer marca) por um seletor real com fórmula por marca
(Trezevit AB por faixa de peso, Polivit A/B lineares com teto de 1
ampola). Oligoelementos ganha um seletor que pré-preenche a dose
mL/kg já existente, editável. Marca escolhida fica salva localmente
(Capacitor Preferences) e reaplicada na próxima abertura.

Dados verificados contra bulário ANVISA e literatura científica — ver
docs/superpowers/specs/2026-09-15-marcas-polivitaminico-oligoelementos-design.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `calculadora_npp_v0_5_8-2.html` — portar a mudança

**Files:**
- Modify: `calculadora_npp_v0_5_8-2.html`

**Interfaces:**
- Consumes: mesma estrutura de dados e função `calcMVIVol`/`applyTEBrandDefaults` do Task 1 (arquivo autocontido — sem import, o código é reescrito aqui, idêntico em espírito, só a persistência muda de `prefsGet`/`prefsSet` pra `localStorage` puro, já que este arquivo não tem o wrapper de Preferences do Capacitor).

Repita os Steps 3, 4, 5, 6, 7 e 9 do Task 1 **exatamente iguais** (mesmo HTML, mesmo JS — os dois arquivos têm essa seção idêntica), só ajustando os números de linha (aqui o bloco de Oligoelementos/Polivitamínico começa por volta da linha 367, as referências de campo por volta da 588, a linha de constantes por volta da 633, `selectFieldIds` por volta da 642, a linha de `calcVolumes` por volta da 728, e `buildResumo` por volta da 897 — confirme com `grep -n` antes de editar, pois o arquivo já pode ter mudado desde a escrita deste plano).

- [ ] **Step 1: HTML dos dois seletores** — mesmo bloco do Task 1 / Step 3, mas com indentação de 8 espaços (este arquivo usa `<div class="field ...">` com 8 espaços, não 10 como o app-mobile). Confira a indentação do bloco vizinho antes de colar.

- [ ] **Step 2: Referências de campo** — mesmo bloco do Task 1 / Step 4.

- [ ] **Step 3: Dados por marca + `calcMVIVol` + `applyTEBrandDefaults`** — mesmo bloco do Task 1 / Step 5, na íntegra (a função `f2` também já existe neste arquivo, mesma linha 633 região — confirme com `grep -n "const f2" calculadora_npp_v0_5_8-2.html`).

- [ ] **Step 4: `selectFieldIds`** — mesma troca do Task 1 / Step 6.

- [ ] **Step 5: `calcVolumes()`** — mesma troca do Task 1 / Step 7.

- [ ] **Step 6: Listeners — versão `localStorage` (sem Capacitor Preferences)**

Substitua (procure `srcLIPSelect.addEventListener('change', calcVolumes);`):

```js
    srcLIPSelect.addEventListener('change', calcVolumes);
```

por:

```js
    srcLIPSelect.addEventListener('change', calcVolumes);
    srcMVISelect.addEventListener('change', () => {
      try { localStorage.setItem('mviBrand', srcMVISelect.value); } catch(e) { console.warn('Falha ao salvar marca do polivitamínico:', e); }
      calcVolumes();
    });
    srcTESelect.addEventListener('change', () => {
      try { localStorage.setItem('teBrand', srcTESelect.value); } catch(e) { console.warn('Falha ao salvar marca do oligoelemento:', e); }
      applyTEBrandDefaults();
      calcVolumes();
    });
```

Botão Limpar: mesma observação do Task 1 — **nenhuma mudança necessária**, pelo mesmo motivo (`srcMVISelect`/`srcTESelect` não estão na lista de selects que o Limpar reseta).

- [ ] **Step 7: `buildResumo()`** — mesma troca do Task 1 / Step 9.

- [ ] **Step 8: Init — versão síncrona com `localStorage`**

Este arquivo usa uma IIFE síncrona (sem `async`), no final do `<script>`. Substitua:

```js
    (function init(){ if (!dataPrescricao.value) dataPrescricao.value = hojeISO(); updatePUI(); overlayDisclaimer.style.display = 'flex'; })();
```

por:

```js
    (function init(){
      if (!dataPrescricao.value) dataPrescricao.value = hojeISO();
      updatePUI();
      try {
        const savedMVI = localStorage.getItem('mviBrand');
        if (savedMVI && MVI_BRANDS[savedMVI]) srcMVISelect.value = savedMVI;
      } catch (e) { console.warn('Falha ao carregar preferência de marca do polivitamínico:', e); }
      try {
        const savedTE = localStorage.getItem('teBrand');
        if (savedTE && TE_BRANDS[savedTE]) srcTESelect.value = savedTE;
      } catch (e) { console.warn('Falha ao carregar preferência de marca do oligoelemento:', e); }
      applyTEBrandDefaults();
      overlayDisclaimer.style.display = 'flex';
    })();
```

- [ ] **Step 9: Verificação manual no navegador**

Run: `open "calculadora_npp_v0_5_8-2.html"` (macOS) — ou o arquivo já aberto numa aba, recarregar.

1. Feche o aviso de responsabilidade.
2. Peso = `8,5`.
3. Seção Traços & Vitaminas → "Polivitamínico — marca" = **Polivit B Ped**. Campo "Polivitamínico (auto)" deve mostrar **5,0** mL (não 10,0 — prova que saiu da fórmula fixa do Trezevit).
4. "Oligoelementos — marca" = **Oliped 4**. Campo "Oligoelementos — dose" deve pré-preencher **1,00** automaticamente.
5. Troque "Oligoelementos — marca" pra **Ad-Element** — deve aparecer o aviso "Mesmo com a dose ajustada, a oferta de manganês fica acima do recomendado." e a dose deve virar **0,05**.
6. Recarregue a página (F5) — os dois seletores devem continuar em **Polivit B Ped** / **Ad-Element** (persistência).
7. Clique **Limpar** — os campos do paciente somem, mas os dois seletores continuam em **Polivit B Ped** / **Ad-Element** (não voltam pro default).
8. Selecione "Polivitamínico — marca" = **Trezevit AB**, preencha peso = `2` (cai na faixa 1-3kg) → campo automático deve mostrar **3,25**. Clique "Resumo/Imprimir" → deve aparecer **duas linhas**: "Trezevit A" e "Trezevit B", ambas com 3,25 mL.
9. Troque de volta pra **Polivit A Ped**, gere o resumo de novo → deve aparecer **uma linha só**: "Polivit A Ped".

- [ ] **Step 10: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
git add calculadora_npp_v0_5_8-2.html
git commit -m "$(cat <<'EOF'
Adiciona seletor de marca pro Polivitamínico e Oligoelementos (original)

Mesma mudança do app-mobile (commit anterior), portada pro arquivo
standalone/PWA. Persistência via localStorage direto (sem o wrapper
de Capacitor Preferences, que só existe no app-mobile).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `app/src/index.html` (Electron) — portar a mudança

**Files:**
- Modify: `app/src/index.html` (gitignored — edita normalmente, mas não entra em nenhum commit)

**Interfaces:**
- Consumes: mesma estrutura do Task 2 (este arquivo também usa `localStorage` puro, sem Capacitor).

Repita todos os Steps do Task 2 (1 a 9), neste arquivo. Os pontos de inserção são os mesmos textos-âncora (`grep -n` pra confirmar as linhas atuais — por volta de: bloco HTML na 374-384, referências de campo na 595-596, constantes na 640, `selectFieldIds` na 649, `calcVolumes` na 735, listener do `srcLIPSelect` por volta da 850, `buildResumo` na 904-905, e a IIFE `init` na 941 — mesmo padrão síncrono do original).

- [ ] **Step 1 a 8**: idênticos aos Steps 1-8 do Task 2 (mesmo HTML, mesmo JS, mesma versão `localStorage`).

- [ ] **Step 9: Verificação manual no app Electron**

Run:
```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator/app"
npm start
```

Repita exatamente os 9 pontos de verificação do Task 2 / Step 9 dentro da janela do Electron.

Se preferir verificação scriptada em vez de clicar manualmente, use o skill do projeto em `app/.claude/skills/run-app/` (`driver.mjs`, Playwright) — mas a verificação manual dos 9 pontos acima já é suficiente pra este plano.

- [ ] **Step 10: Sem commit**

Este diretório é gitignored (`.gitignore:1:/app/`) — não há o que commitar aqui. Confirme que o app abre e calcula corretamente; isso encerra a tarefa.
