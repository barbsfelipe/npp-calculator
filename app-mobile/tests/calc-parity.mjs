#!/usr/bin/env node
// Compara os campos calculados de app-mobile/www/index.html contra um
// fixture "golden" (tests/expected-outputs.json) capturado a partir da
// versão portada já verificada como correta — garante que futuras
// alterações não mudem nenhuma fórmula. Autocontido: não depende de nada
// fora deste repositório (em particular, não depende de app/src/index.html,
// que é gitignored e não existe em um clone novo / CI).
// Playwright puro, sem framework de teste, no mesmo estilo do driver.mjs
// do app Electron.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTED = path.resolve(__dirname, '../www/index.html');
const EXPECTED_PATH = path.resolve(__dirname, 'expected-outputs.json');

// SELECTS é aplicado ANTES de INPUTS: #wrapDoseP (que contém #dosePmgkg) só
// fica visível depois que #srcPSelect recebe um valor — preencher os campos
// de fósforo antes disso falharia com "element is not visible".
const SELECTS = {
  '#srcNaClSelect': '10',
  '#srcKClSelect': '10',
  '#srcPSelect': 'gly',
  '#srcMVISelect': 'polivitb',
  '#srcTESelect': 'oliped4',
};
const INPUTS = {
  '#peso': '8,5',
  '#doseH2O': '150',
  '#doseAA': '2,5',
  '#doseLIP': '3',
  '#doseG50': '12',
  '#doseNaCl10': '3',
  '#doseKCl10': '2',
  '#doseMg10': '0,3',
  '#doseCaGlu10': '1',
  '#dosePmgkg': '1,5',
  '#doseSe': '2',
  '#doseZn': '400',
  '#doseTE': '0,3',
  '#doseGln': '0,3',
};
const OUTPUT_FIELDS = [
  '#pesoCalorico', '#volH2O', '#volAA', '#volLIP', '#volG50',
  '#volNaCl10', '#volKCl10', '#volMg10', '#volCaGlu10', '#volP',
  '#volSe', '#volZn', '#volTE', '#volMVI', '#volGln',
  '#volTotal', '#somaComponentes', '#aguaDestilada',
  '#kcalTotais', '#aporteKcalKg', '#catDiva', '#osmolaridade',
  '#kTotal', '#naTotal', '#concSolucao', '#relCaP', '#relGNKcalNP',
];

async function readOutputs(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  for (const [selector, value] of Object.entries(SELECTS)) {
    await page.selectOption(selector, value);
  }
  for (const [selector, value] of Object.entries(INPUTS)) {
    await page.fill(selector, value);
  }
  const values = {};
  for (const selector of OUTPUT_FIELDS) {
    values[selector] = await page.inputValue(selector);
  }
  await page.close();
  return values;
}

// Marca -> dose (mL/kg/dia) pré-preenchida esperada em #doseTE (formatada
// com f2Trim: até 2 casas, cortando zero à direita desnecessário — 0,20→0,2,
// 1,00→1, mas 0,05 não vira 0,1). Valores confirmados rodando a página real
// antes de serem fixados aqui, e não calculados à mão.
const TE_PREFILL_EXPECTED = {
  pedelement: '0,2',
  adelement: '0,05',
  oliped4: '1',
  politrace4: '0,1',
};

async function checkTEPrefill(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  for (const [brand, expected] of Object.entries(TE_PREFILL_EXPECTED)) {
    await page.selectOption('#srcTESelect', brand);
    const prefilled = await page.inputValue('#doseTE');
    assert.equal(
      prefilled, expected,
      `Selecionar marca de oligoelemento "${brand}" deveria pré-preencher a dose em ${expected} mL/kg/dia`
    );
  }
  await page.close();
}

// Trezevit AB usa degrau fixo por faixa de peso (calcMVIVol em www/index.html),
// não fator x peso: P<1 -> 1,5 mL; 1<=P<3 -> 3,25 mL; P>=3 -> 5 mL. 3,25
// formatado com formatML (1 casa) arredonda para "3,3" — confirmado rodando
// a página real, não calculado à mão (ver relatório da tarefa).
const TREZEVIT_TIER_EXPECTED = [
  { peso: '0,5', expected: '1,5' },  // faixa P < 1kg, valor bruto 1,5
  { peso: '2', expected: '3,3' },    // faixa 1kg <= P < 3kg, valor bruto 3,25
  { peso: '5', expected: '5,0' },    // faixa P >= 3kg, valor bruto 5
];

async function checkTrezevitTiers(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  await page.selectOption('#srcMVISelect', 'trezevit');
  for (const { peso, expected } of TREZEVIT_TIER_EXPECTED) {
    await page.fill('#peso', peso);
    const volMVI = await page.inputValue('#volMVI');
    assert.equal(
      volMVI, expected,
      `Trezevit AB com peso ${peso}kg deveria calcular volMVI = ${expected} mL`
    );
  }
  await page.close();
}

// Regressão de bug real (2026-09-17): Trezevit AB é dose PAREADA (A + B,
// mesmo volume cada — ver calcMVIVol/mviLines), mas "Soma dos componentes"
// contava #volMVI só uma vez, subestimando a soma e superestimando "Água
// destilada" em exatamente 1x o volMVI sempre que Trezevit (a marca padrão)
// estava selecionada. Pego numa prescrição real por uma farmacêutica, que
// conferiu a soma na mão e achou 5 mL de diferença. Zera #doseTE pra isolar
// a contribuição do MVI na soma (peso preenchido pré-preenche #doseTE via
// applyTEBrandDefaults, o que senão entraria na conta).
async function checkTrezevitSomaDouble(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  await page.fill('#peso', '30');
  await page.selectOption('#srcMVISelect', 'trezevit');
  await page.fill('#doseTE', '');
  const volMVI = await page.inputValue('#volMVI');
  const soma = await page.inputValue('#somaComponentes');
  assert.equal(volMVI, '5,0', 'Trezevit AB com peso 30kg deveria calcular volMVI (por parte) = 5,0 mL');
  assert.equal(
    soma, '10,0',
    'Trezevit AB (A + B) deveria contar 2x o volMVI na Soma dos componentes (5,0 x 2 = 10,0), não 1x'
  );

  // Marca de produto único (sem par A/B) não deve dobrar.
  await page.selectOption('#srcMVISelect', 'polivita');
  const volMVI2 = await page.inputValue('#volMVI');
  const soma2 = await page.inputValue('#somaComponentes');
  assert.equal(volMVI2, '10,0', 'Polivit A Ped com peso 30kg deveria calcular volMVI = 10,0 mL (4 mL/kg, teto 10)');
  assert.equal(soma2, '10,0', 'Marca de produto único (Polivit A Ped) não deveria dobrar na Soma dos componentes');

  await page.close();
}

async function checkAdElementNotice(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  const aviso = page.locator('#avisoAdElement');

  await page.selectOption('#srcTESelect', 'adelement');
  assert.equal(
    await aviso.isVisible(), true,
    'Selecionar Ad-Element deveria exibir o aviso de manganês (#avisoAdElement)'
  );

  await page.selectOption('#srcTESelect', 'pedelement');
  assert.equal(
    await aviso.isVisible(), false,
    'Selecionar Ped-Element deveria esconder o aviso de manganês (#avisoAdElement)'
  );

  await page.close();
}

// calcMVIVol(NaN, 'trezevit') não pode cair por acidente na faixa P>=3kg
// (NaN < 1 e NaN < 3 são ambos false em JS, então o fluxo cairia no
// "return 5") — com peso vazio, #volMVI tem que ficar em branco, não "5,0".
async function checkMVIBlankWeight(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  await page.selectOption('#srcMVISelect', 'trezevit');
  await page.fill('#peso', '');
  const volMVI = await page.inputValue('#volMVI');
  assert.equal(
    volMVI, '',
    'Com peso vazio e marca Trezevit AB, volMVI deveria ficar em branco (não "5,0")'
  );
  await page.close();
}

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

const expectedValues = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'));

const browser = await chromium.launch();
const portedValues = await readOutputs(browser, PORTED);
await checkTEPrefill(browser, PORTED);
await checkTrezevitTiers(browser, PORTED);
await checkTrezevitSomaDouble(browser, PORTED);
await checkAdElementNotice(browser, PORTED);
await checkMVIBlankWeight(browser, PORTED);
await checkParseIdadeDias(browser, PORTED);
await checkRefPopoverAminoacidos(browser, PORTED);
await checkRefPopoverMarca(browser, PORTED);
await browser.close();

assert.deepEqual(
  portedValues,
  expectedValues,
  'Campos calculados de app-mobile/www/index.html divergem do fixture tests/expected-outputs.json'
);
console.log('OK —', OUTPUT_FIELDS.length, 'campos calculados batem com o fixture golden, o pré-preenchimento das 4 marcas de Oligoelementos confere, as 3 faixas de peso do Trezevit AB conferem, a Soma dos componentes conta 2x o Trezevit AB (dose pareada) e não dobra marca de produto único, o aviso de manganês do Ad-Element aparece/some corretamente, volMVI fica em branco com peso vazio, o parser parseIdadeDias interpreta corretamente os formatos de idade, e os popovers de referência destacam a linha certa por idade e por marca selecionada.');
