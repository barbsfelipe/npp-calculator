#!/usr/bin/env node
// Compara os campos calculados da versão original (app/src/index.html) com a
// versão portada para o Capacitor (app-mobile/www/index.html), usando o
// mesmo conjunto de entradas nas duas páginas — garante que portar o HTML
// não alterou nenhuma fórmula. Playwright puro, sem framework de teste,
// no mesmo estilo do driver.mjs do app Electron.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL = path.resolve(__dirname, '../../app/src/index.html');
const PORTED = path.resolve(__dirname, '../www/index.html');

const INPUTS = {
  '#peso': '8,5',
  '#doseH2O': '150',
  '#doseAA': '2,5',
  '#doseLIP': '3',
  '#doseG50': '12',
  '#doseNaCl10': '3',
  '#doseMg10': '0,3',
  '#doseCaGlu10': '1',
  '#doseSe': '2',
  '#doseZn': '400',
  '#doseTE': '0,3',
  '#doseGln': '0,3',
};
const SELECTS = {
  '#srcNaClSelect': '10',
  '#srcKClSelect': '10',
  '#srcPSelect': 'gly',
};
const OUTPUT_FIELDS = [
  '#pesoCalorico', '#volH2O', '#volAA', '#volLIP', '#volG50',
  '#volNaCl10', '#volMg10', '#volCaGlu10', '#volP',
  '#volSe', '#volZn', '#volTE', '#volMVI', '#volGln',
  '#volTotal', '#somaComponentes', '#aguaDestilada',
  '#kcalTotais', '#aporteKcalKg', '#catDiva', '#osmolaridade',
  '#kTotal', '#naTotal', '#concSolucao', '#relCaP', '#relGNKcalNP',
];

async function readOutputs(browser, filePath) {
  const page = await browser.newPage();
  await page.goto('file://' + filePath);
  await page.click('#btnFecharDisclaimer');
  for (const [selector, value] of Object.entries(INPUTS)) {
    await page.fill(selector, value);
  }
  for (const [selector, value] of Object.entries(SELECTS)) {
    await page.selectOption(selector, value);
  }
  const values = {};
  for (const selector of OUTPUT_FIELDS) {
    values[selector] = await page.inputValue(selector);
  }
  await page.close();
  return values;
}

const browser = await chromium.launch();
const originalValues = await readOutputs(browser, ORIGINAL);
const portedValues = await readOutputs(browser, PORTED);
await browser.close();

assert.deepEqual(
  portedValues,
  originalValues,
  'Campos calculados divergem entre app/src/index.html e app-mobile/www/index.html'
);
console.log('OK —', OUTPUT_FIELDS.length, 'campos calculados batem entre original e portado.');
