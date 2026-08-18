# Calculadora de NPP — App Mobile

Wrapper Capacitor (iOS/Android) da calculadora de Nutrição Parenteral. Ver `docs/superpowers/specs/2026-08-17-npp-calculadora-app-pago-design.md` (raiz do repo) para o contexto do produto completo.

## Setup (clone novo)

```bash
cd app-mobile
npm install
npx cap sync
```

## Comandos

- `npm test` — roda o teste de paridade de cálculo, o de trial/paywall local e o do paywall (`tests/calc-parity.mjs`, `tests/trial-gate.mjs`, `tests/paywall.mjs`) — todos locais, sem depender de rede.
- `npm run test:auth` — roda `tests/auth-flow.mjs` à parte (não entra no `npm test` porque faz chamadas reais pro projeto Supabase de `www/config.js` e cria uma conta de teste descartável a cada execução).
- `npm run icons` — regenera os ícones nativos a partir dos SVGs em `resources/` (não gera splash screens revisados — ver nota abaixo).
- `npx cap run ios` / `npx cap run android` — builda e roda no simulador/emulador (requer Xcode completo / Android Studio instalados).

## Contas e configuração (`www/config.js`)

`www/config.js` (versionado — as chaves ali são feitas pra ficar embutidas no app, não são segredo) guarda 4 valores: `supabaseUrl`, `supabaseAnonKey`, `revenueCatApiKeyIOS`, `revenueCatApiKeyAndroid`. Ver a Task 1 de `docs/superpowers/plans/2026-08-18-conta-assinatura-trial.md` pra como gerar cada um.

**`revenueCatApiKeyIOS` está como `'PENDENTE_CONTA_APPLE_DEVELOPER'`** — o app iOS não pôde ser criado no RevenueCat porque isso exige um `.p8` da App Store Connect, que só existe com conta Apple Developer Program ativa (ainda não criada). Enquanto isso, `configurePurchases()` detecta esse valor e não tenta configurar o SDK no iOS (só loga um aviso) — assinatura fica indisponível nessa plataforma até a chave real existir, mas nada quebra. Quando a conta Apple Developer for criada, gerar a chave real no RevenueCat e substituir esse valor.

## Sem bundler: plugins do Capacitor registrados manualmente

Este projeto não usa bundler — `www/capacitor.js` é o runtime core do Capacitor vendorizado (copiado de `node_modules/@capacitor/core/dist/capacitor.js`, carregado no `<head>` antes do script principal). Diferente de um app com bundler, instalar um plugin (`npm install @capacitor/algumacoisa` + `cap sync`) só linka o código nativo (Swift/Kotlin) — **não** registra o plugin no lado JS automaticamente. Por isso `www/index.html` chama `window.Capacitor.registerPlugin('NomeDoPlugin')` manualmente pra cada plugin usado (`Preferences`, `Purchases`), com o nome exato que o lado nativo registra (não necessariamente igual ao nome do pacote npm — ex: `@revenuecat/purchases-capacitor` registra como `"Purchases"`, não `"CapacitorPurchases"`). Se adicionar um novo plugin nativo, será preciso o mesmo tratamento — conferir o nome exato via `@CapacitorPlugin(name = "...")` (Android) ou `jsName = "..."` (iOS, `CAPBridgedPlugin`) no código do plugin, não assumir.

Se `www/capacitor.js` ficar desatualizado depois de atualizar `@capacitor/core`, rode `cp node_modules/@capacitor/core/dist/capacitor.js www/capacitor.js` de novo.

## Pendências conhecidas

- Splash screens ainda usam o output padrão do `@capacitor/assets` (fundo branco, ícone com cantos quadrados visíveis) — não foram desenhados, precisam de um `resources/splash.svg` próprio antes de submeter às lojas.
- Este projeto ainda não tem verificação visual em simulador/emulador real rodando o código deste plano (a fundação do Plano 1 foi verificada no simulador iOS, mas antes do trial/conta/assinatura existirem — falta reverificar com o código atual).
- `www/index.html` carrega `@supabase/supabase-js` via CDN — funciona offline pro aviso legal/trial/calculadora (protegido por try/catch), mas criar conta/logar exige rede de qualquer forma (chamada real pro Supabase).
- "Confirm email" está desativado no projeto Supabase de teste (facilita o fluxo de signup sem precisar confirmar e-mail) — decisão a revisitar antes de submeter às lojas: permitir contas não verificadas em produção é aceitável por ora, mas não definitivo.
- Não há botão de logout nem de "esqueci minha senha" na UI ainda (Supabase suporta os dois, só não foi construída a tela).
