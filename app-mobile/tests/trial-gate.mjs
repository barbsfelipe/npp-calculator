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
// O paywall ainda está visível do passo 4 (Task 2 não fecha o paywall no
// caminho "já assinante" — isso só é implementado na Task 4, que também
// dispara esse caminho de verdade após uma compra). Escondemos manualmente
// aqui só pra conseguir clicar em #btnLimpar de novo (senão o overlay,
// com position:fixed;inset:0, intercepta o clique e o Playwright trava
// esperando ele ficar clicável) — isso testa a decisão do gate em si,
// não a UI de fechamento do paywall.
await page.evaluate(() => {
  window.hasActiveSubscription = async () => true;
  document.getElementById('overlayPaywall').style.display = 'none';
});
await page.click('#btnLimpar');
assert.equal(await page.isVisible('#overlayPaywall'), false, 'assinante ativo não deveria ver o paywall');

await browser.close();
console.log('OK — contador de trial, persistência do aviso legal e gate de paywall funcionando.');
