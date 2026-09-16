# Consulta de valores de referência (popovers "?") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 18 pontos de consulta rápida ("?") nos campos de dose/informativo das quatro implementações, cada um abrindo um popover com a tabela de referência daquele campo e destacando a linha/marca aplicável ao paciente atual quando possível.

**Architecture:** Um motor genérico por arquivo (sem módulo compartilhado, padrão já estabelecido no projeto): `parseIdadeDias()` (parser novo, converte o texto livre do campo Idade em dias aproximados), `REF_TABLES`/`getRefTable()` (dados das 8 tabelas — 6 estáticas + 2 que reaproveitam `MVI_BRANDS`/`TE_BRANDS` já existentes), `abrirPopoverRef()` (renderiza e posiciona o popover), e um único listener de clique delegado (`document.addEventListener('click', ...)` checando `.closest('.ref-btn')`) — **não precisa de um listener por botão**, o que reduz bastante o trabalho de "instalação" de cada um dos 18 pontos: eles são só um `<button class="ref-btn" data-ref="chave">?</button>` inserido no HTML, sem nenhuma linha de JS extra por campo.

**Simplificação deliberada em relação à spec:** os 6 popovers do "Informativo" (Tab.17) **não calculam automaticamente se o valor já preenchido está dentro/fora da faixa esperada** — mostram a tabela de referência estática, igual aos outros 12. A spec original previa esse destaque computado, mas dado o formato "1 : X" de duas das métricas (relação Ca:P e gN/Kcal, que exigiriam parsing/inversão de razão com risco real de erro de sinal) e o tempo disponível, a decisão foi manter os 18 popovers com o mesmo mecanismo simples (idade/peso/marca → destaca linha), sem essa camada extra. Documentar isso ao usuário ao final da implementação.

**Tech Stack:** HTML/CSS/JS vanilla, sem build step. Playwright (`playwright-core`) só no app-mobile, via `app-mobile/tests/calc-parity.mjs`.

## Global Constraints

- Specs de referência: `docs/superpowers/specs/2026-09-16-consulta-valores-referencia-design.md` (dados/UI) e `docs/superpowers/specs/2026-09-15-marcas-polivitaminico-oligoelementos-design.md` (`MVI_BRANDS`/`TE_BRANDS`, reaproveitados aqui, não duplicar os números).
- Todos os 18 botões usam a classe `.ref-btn` com `data-ref="<chave>"` — nenhum listener individual, só o delegado.
- `app/` (Electron) é gitignored localmente (`.gitignore:1:/app/`) — editar normalmente, mas não faz parte de nenhum commit.
- As chaves das 3 "faixas neonatais sem destaque" (linhas sem `matches`) ficam assim de propósito — não tentar inferir prematuridade/dia de vida a partir da Idade (decisão explícita, ver spec).
- Marcar os blocos novos de CSS/HTML/JS com comentários `<!-- REF-POPOVER:CSS:BEGIN -->`/`END`, `<!-- REF-POPOVER:DIV:BEGIN -->`/`END`, `// REF-POPOVER:JS:BEGIN`/`END` exatamente como no Task 1 — as Tasks 2-4 (portas) extraem esses blocos por `sed` usando esses marcadores, então eles têm que existir char-a-char iguais nas quatro cópias.

---

### Task 1: app-mobile — motor + 18 pontos de referência + testes

**Files:**
- Modify: `app-mobile/www/index.html`
- Modify: `app-mobile/tests/calc-parity.mjs`

**Interfaces:**
- Produces: `parseIdadeDias(texto)` → número de dias ou `NaN`; `getRefTable(key)` → `{titulo, fonte, colunas, linhas:[{label, valor, matches?, aviso?}]}`; `abrirPopoverRef(anchorEl, key)`/`fecharPopoverRef()`; elemento `#refPopover` no DOM; 18 `<button class="ref-btn" data-ref="...">` novos.

- [ ] **Step 1: CSS do popover e do botão**

Encontre o final do bloco de CSS existente (procure a regra `.notice b{color:...}` — logo depois dela, antes de `</style>`) e insira:

```css
    /* REF-POPOVER:CSS:BEGIN */
    .ref-btn{display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; margin-left:4px; border-radius:50%; border:1px solid var(--line); background:var(--surface); color:var(--muted); font-size:11px; line-height:1; cursor:pointer; padding:0; vertical-align:middle;}
    .ref-btn:hover{background:var(--accent-soft); color:var(--accent-strong); border-color:var(--accent);}
    #refPopover{display:none; position:fixed; z-index:60; max-width:420px; max-height:70vh; overflow-y:auto; background:var(--surface); border:1px solid var(--line); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.15); font-size:12px;}
    .ref-popover-head{display:flex; justify-content:space-between; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--surface);}
    .ref-fechar{border:none; background:none; font-size:16px; cursor:pointer; color:var(--muted); padding:0 4px; line-height:1;}
    .ref-popover-body{padding:8px 12px;}
    .ref-popover-body table{width:100%; border-collapse:collapse;}
    .ref-popover-body td{padding:4px 6px; border-bottom:1px solid var(--line); vertical-align:top;}
    .ref-highlight{background:var(--accent-soft);}
    .ref-aviso{margin-top:4px; font-size:11px; color:var(--muted); font-style:italic;}
    .ref-fonte{display:block; margin-top:8px; color:var(--muted); font-size:10.5px;}
    /* REF-POPOVER:CSS:END */
```

(Confirme com `grep -n "notice b{color"` que a âncora existe antes de editar.)

- [ ] **Step 2: `<div id="refPopover">` no HTML**

Encontre `</body>` e insira imediatamente antes:

```html
  <!-- REF-POPOVER:DIV:BEGIN -->
  <div id="refPopover" role="dialog" aria-label="Referência"></div>
  <!-- REF-POPOVER:DIV:END -->
```

- [ ] **Step 3: motor JS (parser, dados, popover, listener)**

Encontre `function addListeners(list){ list.forEach(el => el && el.addEventListener('input', calcVolumes)); }` (é a linha logo depois do fechamento de `calcVolumes()`) e insira **antes** dela:

```js
      // REF-POPOVER:JS:BEGIN
      // Consulta de valores de referência — popovers "?". Fonte dos dados:
      // ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Clinical Nutrition), verificado
      // contra as fontes primárias — ver
      // docs/superpowers/specs/2026-09-16-consulta-valores-referencia-design.md
      function parseIdadeDias(texto){
        if(!texto) return NaN;
        const re = /(\d+(?:[.,]\d+)?)\s*(dias?|d|meses|mes|m|anos?|ano|a)(?=[^a-z]|$)/gi;
        let total = 0, achou = false, m;
        while((m = re.exec(texto)) !== null){
          const n = parseFloat(m[1].replace(',', '.'));
          const u = m[2].toLowerCase();
          if(u.startsWith('d')) total += n;
          else if(u.startsWith('m')) total += n * 30;
          else if(u.startsWith('a')) total += n * 365;
          achou = true;
        }
        return achou ? total : NaN;
      }

      const REF_TABLES = {
        hidrica: {
          titulo: 'Oferta hídrica — referência por idade/peso',
          fonte: 'ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Jochum et al., Tabs. 1, 2, 4, 5)',
          linhas: [
            { label: 'RN a termo — dia 1 a 5 de vida', valor: '40–60 / 50–70 / 60–80 / 60–100 / 100–140 mL/kg/dia' },
            { label: 'RN pré-termo >1500g — dia 1 a 5', valor: '60–80 / 80–100 / 100–120 / 120–140 / 140–160 mL/kg/dia' },
            { label: 'RN pré-termo 1000-1500g — dia 1 a 5', valor: '70–90 / 90–110 / 110–130 / 130–150 / 160–180 mL/kg/dia' },
            { label: 'RN pré-termo <1000g — dia 1 a 5', valor: '80–100 / 100–120 / 120–140 / 140–160 / 160–180 mL/kg/dia' },
            { label: 'Fase intermediária — RN a termo', valor: '140–170 mL/kg/dia' },
            { label: 'Fase intermediária — RN pré-termo', valor: '140–160 mL/kg/dia' },
            { label: 'Holliday-Segar — primeiros 10kg', valor: '100 mL/kg/dia' },
            { label: 'Holliday-Segar — 10 a 20kg', valor: '+50 mL/kg extra/dia' },
            { label: 'Holliday-Segar — acima de 20kg', valor: '+25 mL/kg extra/dia' },
            { label: '1 mês – 1 ano', valor: '120–150 mL/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 30 && ctx.ageDays < 365 },
            { label: '1–2 anos', valor: '80–120 mL/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 365 && ctx.ageDays < 730 },
            { label: '3–5 anos', valor: '80–100 mL/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 1095 && ctx.ageDays < 2190 },
            { label: '6–12 anos', valor: '60–80 mL/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 2190 && ctx.ageDays < 4745 },
            { label: '13–18 anos', valor: '50–70 mL/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 4745 },
          ],
        },
        aminoacidos: {
          titulo: 'Aminoácidos — dose recomendada',
          fonte: 'ESPGHAN/ESPEN/ESPR/CSPEN 2018 (van Goudoever et al., Tab. 3)',
          linhas: [
            { label: 'Prematuro — 1º dia de vida', valor: '1,5 – 2,5 g/kg/dia' },
            { label: 'Prematuro — a partir do 2º dia', valor: '2,5 – 3,5 g/kg/dia',
              aviso: 'ASPEN 2023 (Robinson et al., JPEN 2023;47(7):830-858) recomenda não iniciar abaixo de 3 g/kg/dia em prematuros — mais conservadora que a ESPGHAN 2018 usada aqui, que permite iniciar em 1,5.' },
            { label: 'A termo', valor: '1,5 – 3,0 g/kg/dia' },
            { label: '2º mês – 3 anos', valor: '1,0 – 2,5 g/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 60 && ctx.ageDays < 1095 },
            { label: '3 – 18 anos', valor: '1,0 – 2,0 g/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 1095 },
          ],
        },
        glicose: {
          titulo: 'Glicose — Velocidade de Infusão (VIG)',
          fonte: 'ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Mesotten et al., R5.4/R5.6)',
          linhas: [
            { label: 'RN pré-termo — dia 1', valor: '4 – 8 mg/kg/min' },
            { label: 'RN pré-termo — dia 2 em diante', valor: 'meta 8–10 (mín 4, máx 12) mg/kg/min' },
            { label: 'RN a termo — dia 1', valor: '2,5 – 5 mg/kg/min' },
            { label: 'RN a termo — dia 2 em diante', valor: 'meta 5–10 (mín 2,5, máx 12) mg/kg/min' },
            { label: '28 dias – 10kg (aguda / estável / recuperação)', valor: '2–4 / 4–6 / 6–10 mg/kg/min', matches: (ctx) => Number.isFinite(ctx.pesoKg) && ctx.pesoKg <= 10 },
            { label: '11 – 30kg (aguda / estável / recuperação)', valor: '1,5–2,5 / 2–4 / 3–6 mg/kg/min', matches: (ctx) => Number.isFinite(ctx.pesoKg) && ctx.pesoKg > 10 && ctx.pesoKg <= 30 },
            { label: '31 – 45kg (aguda / estável / recuperação)', valor: '1–1,5 / 1,5–3 / 3–4 mg/kg/min', matches: (ctx) => Number.isFinite(ctx.pesoKg) && ctx.pesoKg > 30 && ctx.pesoKg <= 45 },
            { label: '>45kg (aguda / estável / recuperação)', valor: '0,5–1 / 1–2 / 2–3 mg/kg/min', matches: (ctx) => Number.isFinite(ctx.pesoKg) && ctx.pesoKg > 45 },
          ],
        },
        naK: {
          titulo: 'Sódio e Potássio — referência por dia de vida / idade',
          fonte: 'ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Jochum et al., Tabs. 1, 2, 5)',
          linhas: [
            { label: 'RN a termo — dias 1-5', valor: 'Na: 0–2/0–2/0–2/1–3/1–3 · K: 0–3 (d1-3), 2–3 (d4-5) mmol/kg/dia' },
            { label: 'RN pré-termo >1500g — dias 1-5', valor: 'Na: 0–2(3)/0–2(3)/0–3/2–5/2–5 · K: 0–3 (d1-3), 2–3 (d4-5) mmol/kg/dia' },
            { label: 'RN pré-termo <1500g — dias 1-5', valor: 'Na: 0–2(3)/0–2(3)/0–5(7)/2–5(7)/2–5(7) · K: 0–3 (d1-3), 2–3 (d4-5) mmol/kg/dia' },
            { label: 'Fase intermediária — a termo', valor: 'Na 2-3 · K 1–3 mmol/kg/dia' },
            { label: 'Fase intermediária — pré-termo', valor: 'Na 2-5(7) · K 1–3 mmol/kg/dia' },
            { label: '1 mês – 1 ano', valor: 'Na 2–3 · K 1–3 mmol/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 30 && ctx.ageDays < 365 },
            { label: '1–2 anos', valor: 'Na 1–3 · K 1–3 mmol/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 365 && ctx.ageDays < 730 },
            { label: '3–5 anos', valor: 'Na 1–3 · K 1–3 mmol/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 1095 && ctx.ageDays < 2190 },
            { label: '6–12 anos', valor: 'Na 1–3 · K 1–3 mmol/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 2190 && ctx.ageDays < 4745 },
            { label: '13–18 anos', valor: 'Na 1–3 · K 1–3 mmol/kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 4745 },
          ],
        },
        caPMg: {
          titulo: 'Cálcio, Fósforo e Magnésio — referência por idade',
          fonte: 'ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Mihatsch et al., Tab. 1)',
          linhas: [
            { label: 'Prematuro — primeiros dias', valor: 'Ca 0,8–2,0 (32-80mg) · P 1,0–2,0 (31-62mg) · Mg 0,1–0,2 (2,5-5,0mg) /kg/dia' },
            { label: 'Prematuro — crescimento adequado', valor: 'Ca 1,6–3,5 (100-140mg) · P 1,6–3,5 (77-108mg) · Mg 0,2–0,3 (5,0-7,5mg) /kg/dia' },
            { label: '0–6 meses', valor: 'Ca 0,8–1,5 (30-60mg) · P 0,7–1,3 (20-40mg) · Mg 0,1–0,2 (2,4-5mg) /kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays < 180 },
            { label: '7–12 meses', valor: 'Ca 0,5 (20mg) · P 0,5 (15mg) · Mg 0,15 (4mg) /kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 180 && ctx.ageDays < 365 },
            { label: '1–18 anos', valor: 'Ca 0,25–0,4 (10-16mg) · P 0,2–0,7 (6-22mg) · Mg 0,1 (2,4mg) /kg/dia', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 365 },
          ],
        },
        tracos: {
          titulo: 'Oligoelementos — necessidade estimada por idade',
          fonte: 'ESPGHAN/ESPEN/ESPR 2018 (Domellöf et al., Tab. 1)',
          linhas: [
            { label: 'Prematuro', valor: 'Ferro 200-250 · Zinco 400-500 · Cobre 40 · Iodo 1-10 · Selênio 7 · Manganês ≤1 · Molibdênio 1 (µg/kg/dia)' },
            { label: '0–3 meses', valor: 'Ferro 50-100 · Zinco 250 · Cobre 20 · Iodo 1 · Selênio 2-3 · Manganês ≤1 · Molibdênio 0,25 (µg/kg/dia)', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays < 90 },
            { label: '3–12 meses', valor: 'Ferro 50-100 · Zinco 100 · Cobre 20 · Iodo 1 · Selênio 2-3 · Manganês ≤1 · Molibdênio 0,25 (µg/kg/dia)', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 90 && ctx.ageDays < 365 },
            { label: '1–18 anos', valor: 'Ferro 50-100 · Zinco 50 · Cobre 20 · Iodo 1 · Selênio 2-3 · Manganês ≤1 · Molibdênio 0,25 (µg/kg/dia)', matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays >= 365 },
            { label: 'Dose máxima/dia', valor: 'Ferro 5mg · Zinco 5mg · Cobre 0,5mg · Selênio 100µg · Manganês 50µg · Molibdênio 5µg · Cromo 5µg' },
          ],
        },
      };

      function getRefTable(key){
        if(key === 'oligoelementos_marca'){
          return {
            titulo: 'Oligoelementos — dose por marca',
            fonte: 'Verificado contra bulário ANVISA/literatura — ver docs/superpowers/specs/2026-09-15-marcas-polivitaminico-oligoelementos-design.md',
            linhas: Object.keys(TE_BRANDS).map(k => ({
              label: TE_BRANDS[k].label, valor: f2(TE_BRANDS[k].dose) + ' mL/kg/dia',
              matches: (ctx) => ctx.brandKey === k,
            })),
          };
        }
        if(key === 'polivitaminico_marca'){
          return {
            titulo: 'Polivitamínico — dose por marca',
            fonte: 'Verificado contra bulário ANVISA/literatura — ver docs/superpowers/specs/2026-09-15-marcas-polivitaminico-oligoelementos-design.md',
            linhas: Object.keys(MVI_BRANDS).map(k => ({
              label: MVI_BRANDS[k].label,
              valor: MVI_BRANDS[k].tier
                ? '<1kg: 1,5mL A + 1,5mL B · 1-3kg: 3,25+3,25 · ≥3kg: 5+5 (fixo por faixa)'
                : (MVI_BRANDS[k].factor + ' mL/kg, máx ' + MVI_BRANDS[k].cap + ' mL'),
              matches: (ctx) => ctx.brandKey === k,
            })),
          };
        }
        if(key === 'informativo'){
          return {
            titulo: 'Parâmetros de prescrição e acompanhamento',
            fonte: 'Material de referência do usuário — não são recomendações ESPGHAN/ESPEN de nutrição (são de farmacotécnica/compounding, ver nota na spec)',
            linhas: [
              { label: 'Cátions divalentes (Ca+Mg)', valor: '<16 mEq/L — acima disso, pode instabilizar a solução' },
              { label: 'Relação Ca:P', valor: '1,3:1 a 2:1 (mg) — próximo de 2:1 é melhor pra incorporação óssea' },
              { label: 'Osmolaridade estimada', valor: '<600 mOsm/L periférico · 600-900 periférico com cuidado · >900 obrigatório via central' },
              { label: 'Relação gN/Kcal não proteica', valor: '100/1–150/1 (estresse metabólico) · 150/1–250/1 (anabolismo). Escala: Hipermetabolismo (1/90) → Anabolismo (1/150) → (1/250).' },
              { label: 'Concentração de glicose', valor: '>12,5% não deve ser o único critério pra decidir a via periférica/central' },
              { label: 'Oferta calórica', valor: 'Conferir se as calorias totais/kg batem com a necessidade calculada do paciente' },
            ],
          };
        }
        return REF_TABLES[key];
      }

      const refPopoverEl = document.getElementById('refPopover');
      function fecharPopoverRef(){ refPopoverEl.style.display = 'none'; }
      function abrirPopoverRef(anchorEl, tableKey){
        const table = getRefTable(tableKey);
        if(!table) return;
        const ctx = {
          ageDays: parseIdadeDias(idade.value),
          pesoKg: parseNumberBR(pesoEl.value),
          brandKey: tableKey === 'oligoelementos_marca' ? srcTESelect.value : (tableKey === 'polivitaminico_marca' ? srcMVISelect.value : ''),
        };
        const linhasHtml = table.linhas.map(l => {
          const hit = typeof l.matches === 'function' && l.matches(ctx);
          const cls = hit ? ' class="ref-highlight"' : '';
          const avisoRow = l.aviso ? `<tr${cls}><td colspan="2"><div class="ref-aviso">${l.aviso}</div></td></tr>` : '';
          return `<tr${cls}><td>${l.label}</td><td>${l.valor}</td></tr>${avisoRow}`;
        }).join('');
        refPopoverEl.innerHTML = `
          <div class="ref-popover-head">
            <b>${table.titulo}</b>
            <button type="button" class="ref-fechar" aria-label="Fechar">×</button>
          </div>
          <div class="ref-popover-body">
            <table>${linhasHtml}</table>
            <small class="ref-fonte">Fonte: ${table.fonte}</small>
          </div>`;
        refPopoverEl.querySelector('.ref-fechar').addEventListener('click', fecharPopoverRef);
        refPopoverEl.style.display = 'block';
        const r = anchorEl.getBoundingClientRect();
        const popRect = refPopoverEl.getBoundingClientRect();
        let top = r.bottom + 6, left = r.left;
        if(left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
        if(top + popRect.height > window.innerHeight - 8) top = r.top - popRect.height - 6;
        refPopoverEl.style.top = Math.max(8, top) + 'px';
        refPopoverEl.style.left = Math.max(8, left) + 'px';
      }
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.ref-btn');
        if(btn){ e.preventDefault(); abrirPopoverRef(btn, btn.dataset.ref); return; }
        if(!e.target.closest('#refPopover')) fecharPopoverRef();
      });
      document.addEventListener('keydown', (e) => { if(e.key === 'Escape') fecharPopoverRef(); });
      // REF-POPOVER:JS:END

```

(`f2`, `parseNumberBR`, `idade`, `pesoEl`, `srcTESelect`, `srcMVISelect`, `TE_BRANDS`, `MVI_BRANDS` já existem no arquivo — não redefinir, só confirmar via `grep -n` que os nomes batem antes de colar.)

- [ ] **Step 4: os 18 botões — encontre cada `<label for="ID">Texto</label>` e insira o botão antes do `</label>`**

| # | `for=` do label a encontrar | `data-ref` do botão |
|---|---|---|
| 1 | `doseH2O` | `hidrica` |
| 2 | `doseAA` | `aminoacidos` |
| 3 | `doseG50` | `glicose` |
| 4 | `doseNaCl10` | `naK` |
| 5 | `doseKCl10` | `naK` |
| 6 | `doseMg10` | `caPMg` |
| 7 | `doseCaGlu10` | `caPMg` |
| 8 | `dosePmgkg` | `caPMg` |
| 9 | `doseSe` | `tracos` |
| 10 | `doseZn` | `tracos` |
| 11 | `srcTESelect` | `oligoelementos_marca` |
| 12 | `srcMVISelect` | `polivitaminico_marca` |
| 13 | `kcalTotais` | `informativo` |
| 14 | `catDiva` | `informativo` |
| 15 | `osmolaridade` | `informativo` |
| 16 | `concSolucao` | `informativo` |
| 17 | `relCaP` | `informativo` |
| 18 | `relGNKcalNP` | `informativo` |

Exemplo concreto (linha 1 da tabela — repita o mesmo padrão pras outras 17, trocando só o `for=`/texto do label e o `data-ref`):

Encontre:
```html
          <label for="doseH2O">Oferta hídrica (dose)</label>
```
Substitua por:
```html
          <label for="doseH2O">Oferta hídrica (dose) <button type="button" class="ref-btn" data-ref="hidrica" aria-label="Ver referência">?</button></label>
```

Use `grep -n 'for="ID"'` pra achar a linha exata de cada uma das 18 antes de editar (alguns labels têm texto composto, ex. `for="dosePmgkg"` → `<label for="dosePmgkg">Fósforo — dose</label>`, `for="relCaP"` → `<label for="relCaP">Relação Cálcio:Fósforo (auto)</label>` — preserve o texto original do label, só acrescente o botão antes do `</label>`).

- [ ] **Step 5: escrever os testes (parser + 2 popovers)**

Abra `app-mobile/tests/calc-parity.mjs`. Adicione, seguindo o padrão das funções `check*` já existentes (`checkTEPrefill`, `checkTrezevitTiers`, `checkAdElementNotice`):

```js
async function checkParseIdadeDias(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  const casos = [
    ['15 dias', 15], ['3 m', 90], ['2 a', 730], ['2a3m', 820], ['', NaN], ['abc', NaN],
  ];
  for (const [texto, esperado] of casos) {
    const resultado = await page.evaluate((t) => parseIdadeDias(t), texto);
    if (Number.isNaN(esperado)) {
      assert.ok(Number.isNaN(resultado), `parseIdadeDias(${JSON.stringify(texto)}) deveria ser NaN, veio ${resultado}`);
    } else {
      assert.equal(resultado, esperado, `parseIdadeDias(${JSON.stringify(texto)}) deveria ser ${esperado}, veio ${resultado}`);
    }
  }
  await page.close();
}

async function checkRefPopoverAminoacidos(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  await page.fill('#idade', '2 a');
  await page.click('[data-ref="aminoacidos"]');
  const highlighted = await page.locator('#refPopover .ref-highlight td').first().innerText();
  assert.equal(highlighted, '2º mês – 3 anos', `Idade "2 a" deveria destacar a linha "2º mês – 3 anos", destacou "${highlighted}"`);
  await page.close();
}

async function checkRefPopoverMarca(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  await page.selectOption('#srcTESelect', 'adelement');
  await page.click('[data-ref="oligoelementos_marca"]');
  const highlighted = await page.locator('#refPopover .ref-highlight td').first().innerText();
  assert.equal(highlighted, 'Ad-Element', `Marca "adelement" selecionada deveria destacar a linha "Ad-Element", destacou "${highlighted}"`);
  await page.close();
}
```

No final do arquivo, adicione as três chamadas ao mesmo `browser` já aberto (antes de `await browser.close();`, junto com as chamadas já existentes de `checkTEPrefill`/`checkTrezevitTiers`/`checkAdElementNotice`):

```js
await checkParseIdadeDias(browser, PORTED);
await checkRefPopoverAminoacidos(browser, PORTED);
await checkRefPopoverMarca(browser, PORTED);
```

E atualize a mensagem final de sucesso (`console.log(...)`) pra mencionar essas novas checagens.

- [ ] **Step 6: rodar e confirmar**

Run: `cd app-mobile && node tests/calc-parity.mjs`
Expected: todas as checagens (a golden-fixture original + as novas) passam, sem warnings.

- [ ] **Step 7: verificação manual dos 18 popovers**

Abrir cada um dos 18 botões "?" no navegador (ou reusar Playwright ad-hoc) e confirmar: (a) o popover abre ancorado perto do botão, sem sair da tela; (b) fecha ao clicar fora, no "×", ou Esc; (c) com Idade/Peso/marca preenchidos, a linha certa aparece destacada; (d) com Idade vazia, nenhuma linha destaca (mas a tabela aparece inteira); (e) o aviso da ASPEN 2023 aparece nas duas linhas de "Prematuro" do popover de Aminoácidos.

- [ ] **Step 8: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
git add app-mobile/www/index.html app-mobile/tests/calc-parity.mjs
git commit -m "$(cat <<'EOF'
Adiciona consulta de valores de referência (popovers "?") — app-mobile

18 pontos de referência rápida nos campos de dose e no Informativo,
cada um abrindo um popover ancorado com a tabela aplicável e
destacando a linha por idade/peso/marca quando possível. Parser novo
(parseIdadeDias) interpreta o campo Idade em texto livre. Dados
verificados contra ESPGHAN/ESPEN/ESPR/CSPEN 2018 (fontes primárias) —
ver docs/superpowers/specs/2026-09-16-consulta-valores-referencia-design.md.

Simplificação em relação à spec original: os 6 popovers do
Informativo (Tab.17) não calculam automaticamente se o valor já
preenchido está dentro/fora da faixa — mostram a referência estática,
mesmo mecanismo dos outros 12 (decisão de escopo, ver plano).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `calculadora_npp_v0_5_8-2.html` — portar a mudança

**Files:**
- Modify: `calculadora_npp_v0_5_8-2.html`

**Interfaces:**
- Consumes: os blocos `REF-POPOVER:CSS`, `REF-POPOVER:DIV`, `REF-POPOVER:JS` do Task 1, extraídos por `sed` do arquivo já pronto/revisado (não retranscritos à mão — evita erro de transcrição num bloco grande).

- [ ] **Step 1: extrair e colar os 3 blocos marcados**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
sed -n '/REF-POPOVER:CSS:BEGIN/,/REF-POPOVER:CSS:END/p' app-mobile/www/index.html > /tmp/ref-css.txt
sed -n '/REF-POPOVER:DIV:BEGIN/,/REF-POPOVER:DIV:END/p' app-mobile/www/index.html > /tmp/ref-div.txt
sed -n '/REF-POPOVER:JS:BEGIN/,/REF-POPOVER:JS:END/p' app-mobile/www/index.html > /tmp/ref-js.txt
```

Insira o conteúdo de `/tmp/ref-css.txt` no mesmo tipo de âncora usada no Task 1 (final do bloco de CSS — procure a regra `.notice b{color:...}` neste arquivo; **atenção**: no original e na app-web essa regra é `.notice b{color:#333}`, não `.notice b{color:var(--fg)}` como no app-mobile/Electron — é a mesma âncora estrutural, só o valor da cor difere entre implementações, confirme com `grep -n "notice b{color"` em vez de procurar o texto exato do app-mobile), `/tmp/ref-div.txt` antes de `</body>`, e `/tmp/ref-js.txt` antes de `function addListeners(list){ list.forEach(el => el && el.addEventListener('input', calcVolumes)); }`. Confirme cada âncora com `grep -n` antes de colar — pode estar em linha diferente do app-mobile.

Depois de colar, rode a checagem de igualdade (deve dar `0` diferenças em cada um dos 3 blocos, comparando contra o app-mobile já revisado):

```bash
diff <(sed -n '/REF-POPOVER:CSS:BEGIN/,/REF-POPOVER:CSS:END/p' calculadora_npp_v0_5_8-2.html) /tmp/ref-css.txt
diff <(sed -n '/REF-POPOVER:DIV:BEGIN/,/REF-POPOVER:DIV:END/p' calculadora_npp_v0_5_8-2.html) /tmp/ref-div.txt
diff <(sed -n '/REF-POPOVER:JS:BEGIN/,/REF-POPOVER:JS:END/p' calculadora_npp_v0_5_8-2.html) /tmp/ref-js.txt
```

- [ ] **Step 2: os 18 botões**

Repita a mesma tabela do Task 1 / Step 4 neste arquivo (mesmos 18 `for=`, mesmos `data-ref` — os labels são idênticos entre as duas implementações, confirmado desde o plano do seletor de marca). Use `grep -n 'for="ID"'` pra achar cada linha antes de editar.

- [ ] **Step 3: verificação manual**

Não há teste automatizado pra este arquivo. Repita os pontos (a)-(e) do Task 1 / Step 7 no navegador (`open "calculadora_npp_v0_5_8-2.html"`).

- [ ] **Step 4: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
git add calculadora_npp_v0_5_8-2.html
git commit -m "$(cat <<'EOF'
Adiciona consulta de valores de referência (popovers "?") — original

Mesma mudança do app-mobile (commit anterior), portada pro arquivo
standalone/PWA. Blocos de CSS/HTML/JS extraídos via sed do arquivo já
revisado, hash/diff-verificados iguais — sem retranscrição manual.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `app/src/index.html` (Electron) — portar a mudança

**Files:**
- Modify: `app/src/index.html` (gitignored — edita normalmente, mas não entra em nenhum commit)

Repita os Steps 1-3 do Task 2 neste arquivo (mesma técnica de extração por `sed` a partir do app-mobile, mesma tabela de 18 botões). Verificação manual: pode usar Playwright ad-hoc contra o arquivo direto (`file://`) como nas tasks anteriores do seletor de marca, sem precisar abrir o Electron.

- [ ] **Step 4: Sem commit** — `app/` é gitignored, confirme que `git status` não mostra nada pra commitar aqui.

---

### Task 4: `app-web/index.html` — portar a mudança

**Files:**
- Modify: `app-web/index.html`

**Interfaces:**
- Consumes: mesmos 3 blocos extraídos por `sed`, mais atenção aos nomes de campo (`idade`, `pesoEl` ou equivalente, `srcTESelect`, `srcMVISelect`, `f2`, `parseNumberBR`, `TE_BRANDS`, `MVI_BRANDS`) — confirme que todos existem neste arquivo com os mesmos nomes antes de colar o bloco JS (app-web já tem `MVI_BRANDS`/`TE_BRANDS` desde a Task 4 do plano do seletor de marca).

Repita os Steps 1-2 do Task 2 (extração por sed + os 18 botões) e o Step 3 (verificação manual — pode usar Playwright ad-hoc contra o arquivo, os 18 popovers não dependem de login/Supabase).

- [ ] **Step 3: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
git add app-web/index.html
git commit -m "$(cat <<'EOF'
Adiciona consulta de valores de referência (popovers "?") — app-web

Quarta e última implementação da mesma mudança (app-mobile, original
e Electron já feitos). Blocos extraídos via sed, diff-verificados
iguais ao app-mobile.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
