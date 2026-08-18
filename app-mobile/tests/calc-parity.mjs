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

const expectedValues = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'));

const browser = await chromium.launch();
const portedValues = await readOutputs(browser, PORTED);
await browser.close();

assert.deepEqual(
  portedValues,
  expectedValues,
  'Campos calculados de app-mobile/www/index.html divergem do fixture tests/expected-outputs.json'
);
console.log('OK —', OUTPUT_FIELDS.length, 'campos calculados batem com o fixture golden.');
