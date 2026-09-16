# Consulta de valores de referência (popovers "?")

**Data**: 2026-09-16
**Status**: aprovado, aguardando plano de implementação

## Contexto e objetivo

O clínico, ao prescrever cada componente da NPP (líquidos, aminoácidos, glicose, eletrólitos, traços, vitaminas), muitas vezes precisa consultar uma tabela de dose recomendada por faixa etária/peso — hoje isso significa sair do app e abrir um PDF/livro à parte. O usuário forneceu o material de referência completo (mesmo PDF já usado pro seletor de marca do Polivitamínico/Oligoelementos — ver `docs/superpowers/specs/2026-09-15-marcas-polivitaminico-oligoelementos-design.md`) e pediu uma forma de consultar isso **sem poluir a tela principal**.

Solução: um ícone/botão **"?"** discreto ao lado de cada campo relevante, que abre um **popover** pequeno ancorado ali mesmo, mostrando a tabela de referência daquele campo — com a linha aplicável ao paciente atual (idade/peso/marca/valor já calculado) **destacada visualmente**, quando der pra determinar.

## Escopo

Aplicar nas quatro implementações (`calculadora_npp_v0_5_8-2.html`, `app/src/index.html`, `app-mobile/www/index.html`, `app-web/index.html`) — mesmo padrão de duplicação sem módulo compartilhado já usado no resto do projeto.

## Fora de escopo

- Tab. 5 (equações de gasto energético basal) — não está amarrada a nenhum campo de dose específico.
- Adicionar campos novos no Cabeçalho (dia de vida, prematuridade/idade gestacional) — decidido explicitamente que a tabela de Oferta hídrica (e as porções neonatais de Na/K/Ca/P/Mg) aparecem **sem destaque automático** em vez disso.
- Qualquer aviso/cor no campo principal do formulário baseado em estar fora da faixa (Tab. 17) — o destaque fica só dentro do popover, não no campo em si.
- Splash screens, ícones, qualquer coisa não relacionada a esta feature.

## Arquitetura

### 1) Parser de idade (capacidade nova)

O campo `#idade` hoje é só texto livre (`placeholder="Ex.: 15 dias / 3 m / 2 a"`), nunca interpretado — confirmado que só é lido uma vez, pra exibição no Resumo (`['Idade', idade.value]`). Esta feature precisa de um parser novo:

```js
// Converte texto livre de idade em dias aproximados (mês≈30d, ano≈365d).
// Aceita combinações: "15 dias", "3 m", "2 a", "2a3m", "1 ano e 2 meses".
// Retorna NaN se não conseguir extrair nada reconhecível.
function parseIdadeDias(texto){
  if(!texto) return NaN;
  const s = texto.toLowerCase();
  let total = 0, achou = false;
  const re = /(\d+(?:[.,]\d+)?)\s*(dias?|d\b|meses?|mes\b|m\b|anos?|ano\b|a\b)/g;
  let m;
  while((m = re.exec(s)) !== null){
    const n = parseFloat(m[1].replace(',', '.'));
    const unidade = m[2];
    if(unidade.startsWith('d')) total += n;
    else if(unidade.startsWith('m')) total += n * 30;
    else if(unidade.startsWith('a')) total += n * 365;
    achou = true;
  }
  return achou ? total : NaN;
}
```

Usado só pra decidir qual linha destacar nos popovers — nunca alimenta nenhum cálculo de dose existente (só peso/peso calórico fazem isso hoje, e continuam fazendo).

### 2) Estrutura de dados por tabela

Cada tabela de referência é um objeto com linhas; cada linha tem uma função `matches(ctx)` que decide se deve ser destacada, onde `ctx` é `{ ageDays, pesoKg, brandKey, computedValue }` (nem todo campo é usado em toda tabela — uma tabela por marca só usa `brandKey`, uma tabela por idade só usa `ageDays`, etc.):

```js
const REF_TABLES = {
  // exemplo de forma — dados completos de cada tabela na seção seguinte
  aminoacidos: {
    titulo: 'Aminoácidos — dose recomendada (g/kg/dia)',
    fonte: 'ESPEN 2018',
    colunas: ['Faixa', 'Dose (g/kg/dia)'],
    linhas: [
      { label: 'Prematuro — 1º dia de vida', valor: '1,5 – 2,5',
        matches: (ctx) => Number.isFinite(ctx.ageDays) && ctx.ageDays <= 1 },
      // ...
    ],
  },
  // ...
};
```

Quando nenhuma linha bate (idade não preenchida/não interpretável, ou ambiguidade — ver "Limitações conhecidas" abaixo), o popover mostra a tabela inteira sem nenhuma linha destacada — nunca um erro, nunca uma linha errada.

### 3) Popover genérico

Uma função só, reaproveitada nos 18 pontos de cada arquivo:

```js
function abrirPopoverRef(anchorEl, tableKey){
  const table = REF_TABLES[tableKey];
  const ctx = { ageDays: parseIdadeDias(idade.value), pesoKg: parseNumberBR(pesoEl.value),
                brandKey: /* srcMVISelect.value ou srcTESelect.value, se aplicável */ '',
                computedValue: /* valor já calculado do campo, se aplicável */ NaN };
  // monta o HTML da tabela, marca a(s) linha(s) cujo matches(ctx) é true com
  // uma classe .ref-highlight, posiciona ancorado em anchorEl (getBoundingClientRect),
  // fecha ao clicar fora ou Esc.
}
```

Cada botão "?" no HTML: `<button type="button" class="ref-btn" data-ref="aminoacidos" aria-label="Ver referência">?</button>`, com um listener genérico `document.querySelectorAll('.ref-btn').forEach(b => b.addEventListener('click', () => abrirPopoverRef(b, b.dataset.ref)))`.

### Limitações conhecidas (aceitas, não bloqueiam a feature)

- **Prematuridade/dia de vida**: não capturados no formulário. Tabelas que dependem disso pros primeiros dias/meses de vida (hídrica, Na/K neonatal, Ca/P/Mg neonatal, aminoácidos neonatal) não destacam a faixa neonatal — mostram sem destaque quando `ageDays` cai nessa janela ambígua.
- **Fase clínica** (aguda/estável/recuperação, Tab. 7 de glicose): não capturada. A tabela de VIG por peso (Tab. 7) destaca a **linha de peso** (todas as 3 fases), não uma fase específica.

## Dados das tabelas (fonte: material do usuário, "TABELA NPP.pdf", ESPEN 2018 salvo indicado)

### `hidrica` (Oferta hídrica) — sem destaque automático (ver Limitações)

**Tab. 1 — Fase 1 (adaptação, dias 1-5 de vida)**, ml/kg/dia:
| | Dia 1 | Dia 2 | Dia 3 | Dia 4 | Dia 5 |
|---|---|---|---|---|---|
| RN a termo | 40–60 | 50–70 | 60–80 | 60–100 | 100–140 |
| RN pré-termo >1500g | 60–80 | 80–100 | 100–120 | 120–140 | 140–160 |
| RN pré-termo 1000-1500g | 70–90 | 90–110 | 110–130 | 130–150 | 160–180 |
| RN pré-termo <1000g | 80–100 | 100–120 | 120–140 | 140–160 | 160–180 |

**Tab. 2 — Fase intermediária** (ml/kg/dia): RN a termo 140–170; pré-termo >1500g 140–160; pré-termo <1500g 140–160.

**Tab. 3 — Holliday-Segar** (sem dependência de idade — pode destacar por peso normalmente): primeiros 10kg → 100 ml/kg/dia; 10-20kg → +50 ml/kg extra/dia; >20kg → +25 ml/kg extra/dia. Somar A+B+C conforme o peso.

**Tab. 4 — pós-neonatal por idade** (ml/kg/dia): 1 mês – 1 ano 120–150; 1-2 anos 80–120; 3-5 anos 80–100; 6-12 anos 60–80; 13-18 anos 50–70. (Rótulo corrigido pós-verificação contra a fonte primária — Jochum et al. 2018, Tabela 5: a primeira linha é "<1 ano" com a nota "após 1 mês de idade", ou seja, é a faixa 1 mês–1 ano; aplica-se **depois** do período neonatal coberto pelas Tabs. 1-3, não a um RN com menos de 1 mês de vida real.)

### `aminoacidos` (g/kg/dia) — destaque por idade

Prematuro 1º dia: 1,5–2,5. Prematuro a partir do 2º dia: 2,5–3,5. Termo: 1,5–3,0. 2º mês–3 anos: **1,0–2,5** (piso mínimo adicionado pós-verificação). 3–18 anos: **1,0–2,0** (idem).

**Aviso anexado às duas linhas de "Prematuro"** (texto fixo da própria tabela, não depende de detectar prematuridade — ver "Limitações conhecidas" acima, este app não sabe se o paciente atual é prematuro): *"A ASPEN 2023 (Robinson et al., JPEN 2023;47(7):830-858) recomenda não iniciar abaixo de 3 g/kg/dia em prematuros — mais conservadora que a ESPGHAN 2018 usada nesta referência, que permite iniciar em 1,5 g/kg/dia."*

Verificado contra a fonte primária (van Goudoever et al. 2018, *Clinical Nutrition*, Tabela 3 + recomendações R3.1-R3.10) — os tetos (2,5 e 2,0) já batiam com o material original, mas faltava o piso de 1,0 g/kg/d que a diretriz também define pras duas faixas (R3.6, R3.8, R3.10) — adicionado agora. Nota à parte (não afeta os números usados aqui, só contexto): a ASPEN 2023 (Robinson et al., *JPEN*) é mais recente e recomenda, especificamente pra prematuros, não descer abaixo de 3 g/kg/dia como alvo — mais agressiva que a ESPGHAN 2018 nesse ponto específico; mantendo a ESPGHAN como fonte principal desta spec, por ser a mesma já usada em todo o resto do material.

### `glicose` (VIG) — Tab.6 sem destaque (neonatal), Tab.7 destaque por peso

**Tab. 6 — RN pré-termo**, mg/kg/min (g/kg/dia entre parênteses): prematuro dia 1: 4–8 (5,8–11,5); dia 2+: meta 8–10 (11,5–14,4), mín 4 (5,8), máx 12 (17,3). A termo dia 1: 2,5–5 (3,6–7,2); dia 2+: meta 5–10 (7,2–14,4), mín 2,5 (3,6), máx 12 (17,3).

**Tab. 7 — crianças**, por peso e fase clínica (mín-máx mg/kg/min):
| Peso | Fase aguda | Fase estável | Recuperação |
|---|---|---|---|
| 28d – 10kg | 2–4 | 4–6 | 6–10 |
| 11 – 30kg | 1,5–2,5 | 2–4 | 3–6 |
| 31 – 45kg | 1–1,5 | 1,5–3 | 3–4 |
| >45kg | 0,5–1 | 1–2 | 2–3 |

### `naK_neonatal` (NaCl/KCl, Tabs. 1-2, mesma tabela de líquidos) — sem destaque

Na (mmol/kg/dia) — dias 1-5, a termo: 0–2, 0–2, 0–2, 1–3, 1–3. Pré-termo >1500g: 0–2(3), 0–2(3), 0–3, 2–5, 2–5. Pré-termo <1500g: 0–2(3), 0–2(3), 0–5(7), 2–5(7), 2–5(7). K (mmol/kg/dia): 0–3 (dias 1-3), 2–3 (dias 4-5), igual pras três categorias. Fase intermediária (Tab.2): Na 2-3 (termo) / 2-5 (pré-termo); K 1-3 (todos).

### `naK_pos_neonatal` (Tab. 4, mesma idade de `hidrica`) — destaque por idade

Na e K, mmol/kg/dia, por faixa etária: 1 mês – 1 ano → Na 2–3, K 1–3. 1-2 anos → Na 1–3, K 1–3. 3-5 anos → Na 1–3, K 1–3. 6-12 anos → Na 1–3, K 1–3. 13-18 anos → Na 1–3, K 1–3. (Mesma correção de rótulo do item acima — ver nota da Tab.4 em `hidrica`.)

### `caPMg` (MgSO4, Gluconato de cálcio, Fósforo — Tab. 11) — destaque por idade, ressalva neonatal

| Faixa | Ca mmol(mg)/kg/d | P mmol(mg)/kg/d | Mg mmol(mg)/kg/d |
|---|---|---|---|
| Prematuro, 1ºs dias de vida | 0,8–2,0 (32-80) | 1,0–2,0 (31-62) | 0,1–0,2 (2,5-5,0) |
| Prematuro, crescimento adequado | 1,6–3,5 (100-140) | 1,6–3,5 (77-108) | 0,2–0,3 (5,0-7,5) |
| 0–6 meses | 0,8–1,5 (30-60) | 0,7–1,3 (20-40) | 0,1–0,2 (2,4-5) |
| 7–12 meses | 0,5 (20) | 0,5 (15) | 0,15 (4) |
| 1–18 anos | 0,25–0,4 (10-16) | 0,2–0,7 (6-22) | 0,1 (2,4) |

(As duas linhas de "prematuro" ficam sem destaque, mesma ressalva de prematuridade não capturada.)

Verificado contra a fonte primária (Mihatsch et al. 2018, *Clinical Nutrition*, Tabela 1) — o mg da linha "prematuro, crescimento adequado" foi corrigido nessa checagem (o material original do usuário tinha 64-140/50-108, provavelmente de uma conversão mmol→mg direta que não bate com o valor impresso na tabela oficial). As demais linhas batem exatamente com a fonte primária.

### `tracos` (Selênio, Zinco — Tab. 13) — destaque por idade

µg/kg/dia:
| Faixa | Ferro | Zinco | Cobre | Selênio | Manganês | Molibdênio |
|---|---|---|---|---|---|---|
| Prematuro | 200–250 | 400–500 | 40 | 7 | ≤1 | 1 |
| 0–3 meses | 50–100 | 250 | 20 | 2–3 | ≤1 | 0,25 |
| 3–12 meses | 50–100 | 100 | 20 | 2–3 | ≤1 | 0,25 |
| 1–18 anos | 50–100 | 50 | 20 | 2–3 | ≤1 | 0,25 |
| **Dose máxima/dia** | 5mg | 5mg | 0,5mg | 100µg | 50µg | 5µg |

(Popover do campo Selênio destaca só a linha de Selênio+Dose máxima de Selênio; Zinco idem — reaproveita os mesmos dados de linha, só muda qual coluna fica em destaque visual.)

### `oligoelementos_marca` (campo Oligoelementos) — destaque pela marca selecionada

Lê direto de `TE_BRANDS` (já existe no código, ver spec do seletor de marca) — **não duplicar os números aqui**. Mostra as 4 marcas do seletor (Ped-Element, Ad-Element, Oliped 4, Politrace 4), destaca a linha de `srcTESelect.value`.

### `polivitaminico_marca` (campo Polivitamínico) — destaque pela marca selecionada

Lê direto de `MVI_BRANDS` — mesma lógica, 3 marcas (Trezevit AB, Polivit A Ped, Polivit B Ped), destaca `srcMVISelect.value`.

### `informativo` (Tab. 17 — um dataset, 6 pontos de uso) — destaque por valor calculado dentro/fora da faixa

| Linha | Campo do formulário | Esperado | Fórmula/Significado |
|---|---|---|---|
| (b) Somatória de cátions | Cátions divalentes (Ca+Mg) | <16 mEq/L | Se >16mEq/L, pode instabilizar a solução |
| (c) Relação Ca/P | Relação Ca:P | 1,3:1 a 2:1 (mg) | Nível próximo de 2:1 é melhor pra incorporação óssea |
| (d) Osmolaridade | Osmolaridade estimada | <600 periférico / 600-900 periférico c/ cuidado / >900 obrigatório central | Define a via de administração |
| (e) Kcal não proteicas/g N | Relação gN/Kcal NP | 100/1–150/1 (estresse metabólico) / 150/1–250/1 (anabolismo) | RN hipercatabólicos se beneficiam de 100-150/1; RN em anabolismo precisam de 150-250/1. Incluir a régua visual "Hipermetabolismo (1/90) — Anabolismo (1/150) — (1/250)" da Tab.5 do PDF junto desta linha. |
| (f) Concentração de glicose | Concentração da solução (G%) | >12,5% não deve ser único critério pra via central | — |
| (g) Oferta calórica | Calorias totais / Aporte calórico | — (sem faixa numérica fixa, é conferência de adequação) | Verifica se as calorias batem com a necessidade |

(Linha (a), concentração de cálcio isolada mEq/L, fica fora — não existe campo correspondente hoje, conforme decidido.)

**Nota de verificação:** ao contrário das outras tabelas desta spec, estas (cátions divalentes, relação Ca:P, osmolaridade 600/900, relação C/N) **não fazem parte das diretrizes ESPGHAN/ESPEN de nutrição parenteral pediátrica** — pertencem à literatura de farmacotécnica/compounding. Segunda passada de verificação, focada especificamente nessa literatura (ASPEN 2014 — Boullata et al., "Parenteral Nutrition Ordering, Order Review, Compounding, Labeling, and Dispensing", *JPEN* 2014;38(3):334-377 — e INS *Infusion Therapy Standards of Practice* 2024), encontrou:

- **Cátions divalentes**: achado real (Driscoll et al. 1995, citado pela ASPEN 2014), mas o corte de 16mEq/L é o *início* de uma faixa (16-20mEq/L) onde bolsas 3-em-1 (TNA, com lipídeo) passam a exigir dextrose/aminoácidos mais concentrados pra manter estabilidade — não um limite absoluto de segurança, e é específico de TNA.
- **Relação Ca:P**: o valor realmente testado (RCT único, evidência fraca — Pelegano et al. 1991) é **1,7:1 mg (1,3:1 mmol)**, não "próximo de 2:1". A ASPEN 2014 recusa formalmente recomendar uma razão fixa pra prevenir precipitação — a prática atual usa curvas de solubilidade específicas por produto.
- **Osmolaridade**: o corte de **900 mOsm/L** está bem sólido (ASPEN 2014 + INS 2024 convergem). O nível intermediário de "600 = cautela" vem de um único estudo antigo (Gazitua et al. 1979), não é um padrão formal de 3 níveis.
- **Relação kcal/N**: não encontrado em nenhuma fonte de farmácia/compounding (é mesmo conceito de nutrição, não de estabilidade de solução) — e uma fonte da área (Skipper & Tupesis, *Nutr Clin Pract* 2005) afirma que esse índice está caindo em desuso pra calcular prescrição nutricional, por risco de superalimentação.

**Decisão do usuário**: manter os 4 valores como estão na UI (não há recomendação forte o bastante a favor ou contra mudá-los) — sem editar os números nem adicionar as ressalvas acima como texto visível nos popovers. Ficam registradas aqui só como documentação/auditoria da verificação feita.

## UI

- Botão `.ref-btn` (`?`, `aria-label="Ver referência"`) logo ao lado do `<label>` de cada campo listado — `span` inline, não ocupa linha própria no grid.
- Popover: `position: fixed`, ancorado via `getBoundingClientRect()` do botão clicado, `z-index` acima do formulário mas abaixo dos overlays existentes (Resumo/Disclaimer/Auth). Fecha em: clique fora, tecla Esc, clique em outro botão `.ref-btn` (só um popover aberto por vez).
- Linha destacada: classe `.ref-highlight` (fundo suave na cor de destaque já usada no projeto — mesma paleta do `.output-negative`/`.aviso-peso-alerta`, mas em tom neutro/informativo, não de alerta).
- Fonte/tamanho de texto compactos (a tabela pode ter 5-6 linhas × 3-4 colunas em alguns casos) — rolagem interna (`overflow-y:auto; max-height`) se não couber.

## Testes / verificação manual

Sem suíte automatizada pra popover/UI em nenhuma das 4 implementações. Adicionar em `app-mobile/tests/calc-parity.mjs` (ou um novo arquivo de teste dedicado, ex. `tests/ref-popovers.mjs`) checks pontuais: `parseIdadeDias()` com alguns textos de exemplo (unit-testável sem browser, se extraído como função pura reexportável — ver plano), e 2-3 casos de popover abrindo/destacando a linha certa via Playwright (ex.: idade "5 meses" no popover de traços deve destacar "0-3 meses"? não — "3-12 meses"; peso 15kg no popover de glicose deve destacar a faixa "11-30kg").

Verificação manual mínima por implementação: abrir cada um dos 18 popovers, conferir que a tabela aparece completa e legível, testar pelo menos 3 cenários de destaque (idade nova, peso variando, marca trocando) e 1 cenário de "sem destaque" (idade vazia).
