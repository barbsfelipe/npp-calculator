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
