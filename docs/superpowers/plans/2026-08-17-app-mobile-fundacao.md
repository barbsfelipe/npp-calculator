# App Mobile — Fundação Capacitor (Plano 1 de 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o esqueleto do app mobile (iOS/Android) via Capacitor: a calculadora de NPP rodando dentro de um shell nativo, com o novo ícone, sem login/paywall ainda (isso é o Plano 2).

**Architecture:** Novo diretório `app-mobile/` (irmão de `app/`, que continua sendo o app Electron), com `www/index.html` baseado no HTML já usado pelo app Electron (`app/src/index.html` — já tem o layout minimalista teal/slate e não carrega manifest/service worker de PWA). Capacitor empacota esse `www/` em projetos nativos iOS e Android sem alterar nenhuma linha da lógica de cálculo.

**Tech Stack:** Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`), `@capacitor/assets` (geração de ícone), `playwright-core` (mesmo padrão já usado em `app/.claude/skills/run-app/driver.mjs`, usado aqui para teste de paridade e para rasterizar os SVGs do ícone).

## Global Constraints

- Nenhuma fórmula ou constante de cálculo (`FACT_NACL10`, `FACT_KCL10`, `FACT_MG10`, `FACT_CAGLU10`, `FACT_MVI`, `FACT_ZN`, `FACT_SE`, `FACT_GLN`, `MG_PER_ML_P`, `MEQ_PER_ML_NA_GLY`, `MEQ_PER_ML_K_PHOS`) pode ser alterada ao portar o HTML — spec: "reaproveitando a lógica de cálculo sem alterações".
- `appId` do Capacitor: `com.npp.calculadora` (mesmo bundle id já usado no `build.appId` do Electron em `app/package.json`, para manter consistência de marca entre as duas implementações).
- Diferente de `app/` (gitignored por inteiro), `app-mobile/` é código-fonte versionado — só build artifacts (`node_modules`, `ios/App/Pods`, `ios/App/build`, `android/build`, `android/.gradle`, `android/app/build`) ficam fora do git.
- Sem login/paywall nesta fase — o app fica sempre liberado; conta e assinatura entram no Plano 2.
- Ícone aprovado no brainstorming: núcleo esférico "NPP" (gradiente azul/branco) orbitado por 3 anéis elípticos com pontos de destaque, fundo quase-preto com gradiente radial — ver cores exatas na Task 4.

---

### Task 1: Inicializar o projeto `app-mobile`

**Files:**
- Create: `app-mobile/package.json`
- Create: `app-mobile/capacitor.config.ts`
- Create: `app-mobile/.gitignore`

**Interfaces:**
- Produces: projeto npm em `app-mobile/` com `@capacitor/core`, `@capacitor/ios`, `@capacitor/android` como dependencies e `@capacitor/cli`, `playwright-core` como devDependencies — usado por todas as tasks seguintes.

- [ ] **Step 1: Criar o diretório e o `package.json`**

```bash
mkdir -p "app-mobile"
cd "app-mobile"
npm init -y
```

Expected: cria `app-mobile/package.json` com os campos padrão do `npm init -y`.

- [ ] **Step 2: Instalar as dependências do Capacitor**

```bash
cd "app-mobile"
npm install @capacitor/core @capacitor/ios @capacitor/android
npm install -D @capacitor/cli
npm install -D playwright-core@^1.61.0
```

Expected: `app-mobile/package.json` passa a listar as 3 dependencies e as 2 devDependencies com versões resolvidas (não "latest" — o npm grava a versão exata instalada); `app-mobile/node_modules/` e `app-mobile/package-lock.json` são criados.

- [ ] **Step 3: Rodar `cap init` e conferir o config gerado**

```bash
cd "app-mobile"
npx cap init "Calculadora de NPP" "com.npp.calculadora" --web-dir www
cat capacitor.config.ts
```

Expected output do `cat`:

```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.npp.calculadora',
  appName: 'Calculadora de NPP',
  webDir: 'www'
};

export default config;
```

- [ ] **Step 4: Criar `.gitignore` do projeto mobile**

```bash
cat > "app-mobile/.gitignore" << 'EOF'
node_modules/
ios/App/Pods/
ios/App/build/
ios/App/App/public/
android/build/
android/.gradle/
android/app/build/
android/app/src/main/assets/public/
.DS_Store
EOF
```

Expected: arquivo `app-mobile/.gitignore` criado com essas 9 linhas.

- [ ] **Step 5: Commit**

```bash
cd "app-mobile" && git add package.json package-lock.json capacitor.config.ts .gitignore && git commit -m "Inicializa projeto Capacitor do app mobile"
```

---

### Task 2: Portar a calculadora para `www/` com teste de paridade

**Files:**
- Create: `app-mobile/www/index.html`
- Create: `app-mobile/tests/calc-parity.mjs`

**Interfaces:**
- Consumes: `app/src/index.html` (fonte da lógica de cálculo, não modificado).
- Produces: `app-mobile/www/index.html` — página canônica usada pelo `webDir` do Capacitor (consumida pela Task 3) e pelos scripts de geração de ícone (Task 4, que não depende do conteúdo dela, só do diretório `app-mobile/`).

- [ ] **Step 1: Escrever o teste de paridade (falhando, pois o arquivo portado ainda não existe)**

Crie `app-mobile/tests/calc-parity.mjs`:

```js
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd "app-mobile" && node tests/calc-parity.mjs
```

Expected: FAIL — erro de navegação no `page.goto('file://.../app-mobile/www/index.html')` (`net::ERR_FILE_NOT_FOUND`), porque `www/index.html` ainda não existe.

- [ ] **Step 3: Portar o HTML**

```bash
mkdir -p "app-mobile/www"
cp "app/src/index.html" "app-mobile/www/index.html"
```

Depois, aplique esta substituição exata em `app-mobile/www/index.html` (torna a página compatível com a safe area do notch/ilha dinâmica dentro do shell nativo — o app Electron não precisa disso, mas o wrapper Capacitor roda em tela cheia):

Old string:
```html
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Calculadora de NPP — Prescrição</title>
  <style>
    :root{
```

New string:
```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Calculadora de NPP — Prescrição</title>
  <style>
    :root{
```

E esta segunda substituição exata (adiciona padding de safe-area ao `body`):

Old string:
```html
    body{margin:0;font-family:var(--font); -webkit-font-smoothing:antialiased;}
```

New string:
```html
    body{margin:0;font-family:var(--font); -webkit-font-smoothing:antialiased; padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);}
```

- [ ] **Step 4: Rodar o teste de paridade e confirmar que passa**

```bash
cd "app-mobile" && node tests/calc-parity.mjs
```

Expected: PASS — imprime `OK — 26 campos calculados batem entre original e portado.` (26, não 25 — `OUTPUT_FIELDS.length` é calculado dinamicamente pelo script; a contagem exata não importa, o teste sempre imprime o valor real do array acima).

- [ ] **Step 5: Commit**

```bash
cd "app-mobile" && git add www/index.html tests/calc-parity.mjs && git commit -m "Porta a calculadora para o projeto Capacitor com teste de paridade"
```

---

### Task 3: Adicionar as plataformas nativas iOS e Android

**Files:**
- Create: `app-mobile/ios/` (gerado pelo Capacitor)
- Create: `app-mobile/android/` (gerado pelo Capacitor)

**Interfaces:**
- Consumes: `app-mobile/www/index.html` (Task 2), `app-mobile/capacitor.config.ts` (Task 1).
- Produces: projetos nativos Xcode (`app-mobile/ios/App/App.xcworkspace`) e Android Studio (`app-mobile/android/`) usados pela Task 4 para aplicar o ícone e, no Plano 2, para integrar os SDKs de Supabase/RevenueCat.

- [ ] **Step 1: Pré-requisitos (verificar antes de continuar)**

```bash
xcode-select -p
xcodebuild -version
```

Expected: caminho do Xcode instalado e a versão (ex.: `Xcode 16.x`) — sem isso, `cap add ios` falha. Se `xcodebuild` não existir, instale o Xcode pela App Store antes de prosseguir.

```bash
which java
sdkmanager --version 2>/dev/null || echo "Android SDK não encontrado — instale o Android Studio antes de continuar"
```

Se o Android SDK não estiver instalado, instale o Android Studio (inclui o SDK) antes do Step 3 — sem ele, `cap add android` falha.

- [ ] **Step 2: Adicionar a plataforma iOS**

```bash
cd "app-mobile"
npx cap add ios
npx cap sync ios
```

Expected: cria `app-mobile/ios/App/`; `cap sync` termina com `✔ Sync finished`.

- [ ] **Step 3: Adicionar a plataforma Android**

```bash
cd "app-mobile"
npx cap add android
npx cap sync android
```

Expected: cria `app-mobile/android/`; `cap sync` termina com `✔ Sync finished`.

- [ ] **Step 4: Rodar no simulador iOS e conferir visualmente**

Nota (registrado após a execução do Plano 1): o Capacitor 8 gera o projeto iOS via Swift Package Manager, não CocoaPods — não existe `App.xcworkspace`, abra `App.xcodeproj` no Xcode.

```bash
cd "app-mobile"
xcrun simctl list devices available | grep iPhone | head -3
npx cap run ios
```

Escolha um simulador iPhone da lista quando solicitado. Expected: o simulador abre, o app instala e a tela da calculadora (cabeçalho, campos de peso/macronutrientes) aparece — mesmo conteúdo visual do app Electron, sem o modal de aviso legal preso (deve ser possível fechá-lo tocando no botão).

```bash
mkdir -p /tmp/shots
xcrun simctl io booted screenshot /tmp/shots/ios-fundacao.png
```

Confira `/tmp/shots/ios-fundacao.png` — deve mostrar a calculadora renderizada corretamente em tela cheia.

- [ ] **Step 5: Rodar no emulador Android e conferir visualmente**

```bash
cd "app-mobile"
npx cap run android
```

Escolha um dispositivo/emulador Android quando solicitado (crie um AVD pelo Android Studio antes, se nenhum existir). Expected: o app instala e abre com a mesma tela da calculadora.

```bash
adb exec-out screencap -p > /tmp/shots/android-fundacao.png
```

Confira `/tmp/shots/android-fundacao.png` — mesma verificação visual do Step 4.

- [ ] **Step 6: Commit**

```bash
cd "app-mobile" && git add ios android && git commit -m "Adiciona plataformas nativas iOS e Android"
```

---

### Task 4: Gerar e aplicar o novo ícone (núcleo "NPP" com anéis orbitais)

**Files:**
- Create: `app-mobile/resources/icon-source.svg`
- Create: `app-mobile/resources/icon-background.svg`
- Create: `app-mobile/resources/icon-foreground.svg`
- Create: `app-mobile/resources/render-icon.mjs`

**Interfaces:**
- Consumes: `app-mobile/ios/`, `app-mobile/android/` (Task 3) — o `capacitor-assets` escreve os ícones dentro desses diretórios.
- Produces: `app-mobile/resources/icon.png`, `icon-background.png`, `icon-foreground.png` (masters 1024×1024, gerados localmente, **não versionados** — só os 3 SVGs fonte e o script vão para o git; os PNGs derivados ficam de fora do commit para não duplicar o que já está em `ios/`/`android/`).

- [ ] **Step 1: Criar os 3 SVGs fonte do ícone**

Crie `app-mobile/resources/icon-source.svg` (versão flat/opaca, usada como ícone único no iOS — a App Store não aceita transparência):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="bgGrad" cx="32%" cy="22%" r="85%">
      <stop offset="0%" stop-color="#2c333c"/>
      <stop offset="75%" stop-color="#0f1216"/>
    </radialGradient>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bdf4ef"/>
      <stop offset="100%" stop-color="#3aa7ad"/>
    </linearGradient>
    <radialGradient id="coreGrad" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#e8f4ff"/>
      <stop offset="45%" stop-color="#8fb8e8"/>
      <stop offset="100%" stop-color="#2c4f86"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="100" height="100" fill="url(#bgGrad)"/>
  <ellipse cx="50" cy="50" rx="46" ry="17" fill="none" stroke="url(#ringGrad)" stroke-width="2.4" opacity="0.9" transform="rotate(-18 50 50)"/>
  <ellipse cx="50" cy="50" rx="46" ry="17" fill="none" stroke="url(#ringGrad)" stroke-width="2.4" opacity="0.7" transform="rotate(48 50 50)"/>
  <ellipse cx="50" cy="50" rx="46" ry="17" fill="none" stroke="url(#ringGrad)" stroke-width="2.4" opacity="0.6" transform="rotate(114 50 50)"/>
  <circle cx="86.5" cy="44" r="3.6" fill="#e8fffb"/>
  <circle cx="18" cy="61" r="3" fill="#e8fffb"/>
  <circle cx="63" cy="14" r="2.8" fill="#e8fffb"/>
  <circle cx="50" cy="50" r="21" fill="url(#coreGrad)" stroke="#1c355e" stroke-width="1"/>
  <text x="50" y="55" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="13.5" font-weight="800" letter-spacing="0.5" fill="#0d2547" text-anchor="middle">NPP</text>
</svg>
```

Crie `app-mobile/resources/icon-background.svg` (camada de fundo do ícone adaptativo do Android):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="bgGrad" cx="32%" cy="22%" r="85%">
      <stop offset="0%" stop-color="#2c333c"/>
      <stop offset="75%" stop-color="#0f1216"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="100" height="100" fill="url(#bgGrad)"/>
</svg>
```

Crie `app-mobile/resources/icon-foreground.svg` (camada de frente — só o símbolo, fundo transparente, reduzido a 62% e centralizado para caber na safe zone do ícone adaptativo do Android, que recorta ~34% das bordas):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bdf4ef"/>
      <stop offset="100%" stop-color="#3aa7ad"/>
    </linearGradient>
    <radialGradient id="coreGrad" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#e8f4ff"/>
      <stop offset="45%" stop-color="#8fb8e8"/>
      <stop offset="100%" stop-color="#2c4f86"/>
    </radialGradient>
  </defs>
  <g transform="translate(50 50) scale(0.62) translate(-50 -50)">
    <ellipse cx="50" cy="50" rx="46" ry="17" fill="none" stroke="url(#ringGrad)" stroke-width="2.4" opacity="0.9" transform="rotate(-18 50 50)"/>
    <ellipse cx="50" cy="50" rx="46" ry="17" fill="none" stroke="url(#ringGrad)" stroke-width="2.4" opacity="0.7" transform="rotate(48 50 50)"/>
    <ellipse cx="50" cy="50" rx="46" ry="17" fill="none" stroke="url(#ringGrad)" stroke-width="2.4" opacity="0.6" transform="rotate(114 50 50)"/>
    <circle cx="86.5" cy="44" r="3.6" fill="#e8fffb"/>
    <circle cx="18" cy="61" r="3" fill="#e8fffb"/>
    <circle cx="63" cy="14" r="2.8" fill="#e8fffb"/>
    <circle cx="50" cy="50" r="21" fill="url(#coreGrad)" stroke="#1c355e" stroke-width="1"/>
    <text x="50" y="55" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="13.5" font-weight="800" letter-spacing="0.5" fill="#0d2547" text-anchor="middle">NPP</text>
  </g>
</svg>
```

- [ ] **Step 2: Escrever o script que rasteriza os SVGs em PNG**

Crie `app-mobile/resources/render-icon.mjs` (reaproveita o Chromium do `playwright-core` já instalado na Task 1 — evita depender de ImageMagick/`rsvg-convert`):

```js
#!/usr/bin/env node
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP = {
  'icon-source.svg': 'icon.png',
  'icon-background.svg': 'icon-background.png',
  'icon-foreground.svg': 'icon-foreground.png',
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
for (const [svgName, pngName] of Object.entries(MAP)) {
  await page.goto('file://' + path.join(__dirname, svgName));
  await page.screenshot({ path: path.join(__dirname, pngName) });
  console.log('Gerado', pngName);
}
await browser.close();
```

- [ ] **Step 3: Rodar o script e confirmar os PNGs**

```bash
cd "app-mobile" && node resources/render-icon.mjs
sips -g pixelWidth -g pixelHeight resources/icon.png
```

Expected: imprime `Gerado icon.png`, `Gerado icon-background.png`, `Gerado icon-foreground.png`; o `sips` confirma `pixelWidth: 1024` / `pixelHeight: 1024`.

- [ ] **Step 4: Gerar os ícones nativos com `@capacitor/assets`**

```bash
cd "app-mobile"
npm install -D @capacitor/assets
npx capacitor-assets generate --iconOnly
```

Expected: o comando reporta ícones gerados para `ios/App/App/Assets.xcassets/AppIcon.appiconset/` e `android/app/src/main/res/mipmap-*/` (incluindo as camadas `ic_launcher_background`/`ic_launcher_foreground` do ícone adaptativo).

Nota (registrado após a execução do Plano 1): a versão instalada do `@capacitor/assets` (3.0.5) não tem a flag `--iconOnly` — rode `npx capacitor-assets generate` sem flags. Isso também gera splash screens (a partir do mesmo `icon.png`, ficam com fundo branco e o quadrado escuro do ícone no meio — não é um design revisado) e ícones PWA soltos em `resources/`/`www/` que não fazem parte do escopo deste app (que não é uma PWA). Delete os artefatos de PWA gerados (`icons/`, `www/manifest.json`) e trate os splash screens como pendência de design separada antes de submeter às lojas — não são clinicamente sensíveis, só não foram desenhados.

- [ ] **Step 5: Sincronizar e conferir visualmente nos dois simuladores**

```bash
cd "app-mobile"
npx cap sync
npx cap run ios
```

No simulador, saia para a Home Screen (⌘+Shift+H no simulador do Xcode) e confira que o ícone do app mostra o núcleo "NPP" com os anéis orbitais, fundo escuro — não mais o ícone padrão do Capacitor.

```bash
xcrun simctl io booted screenshot /tmp/shots/ios-icone-home.png
```

Repita para o Android:

```bash
npx cap run android
adb exec-out screencap -p > /tmp/shots/android-icone-home.png
```

- [ ] **Step 6: Commit**

```bash
cd "app-mobile" && git add resources/icon-source.svg resources/icon-background.svg resources/icon-foreground.svg resources/render-icon.mjs package.json package-lock.json ios android && git commit -m "Gera e aplica o novo ícone (núcleo NPP com anéis orbitais)"
```
