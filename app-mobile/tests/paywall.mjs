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
