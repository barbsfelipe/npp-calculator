# Calculadora de NPP — App Mobile

Wrapper Capacitor (iOS/Android) da calculadora de Nutrição Parenteral. Ver `docs/superpowers/specs/2026-08-17-npp-calculadora-app-pago-design.md` (raiz do repo) para o contexto do produto completo.

## Setup (clone novo)

```bash
cd app-mobile
npm install
npx cap sync
```

## Comandos

- `npm test` — roda o teste de paridade de cálculo (`tests/calc-parity.mjs`) contra o fixture em `tests/expected-outputs.json`.
- `npm run icons` — regenera os ícones nativos a partir dos SVGs em `resources/` (não gera splash screens revisados — ver nota abaixo).
- `npx cap run ios` / `npx cap run android` — builda e roda no simulador/emulador (requer Xcode completo / Android Studio instalados).

## Pendências conhecidas

- Splash screens ainda usam o output padrão do `@capacitor/assets` (fundo branco, ícone com cantos quadrados visíveis) — não foram desenhados, precisam de um `resources/splash.svg` próprio antes de submeter às lojas.
- Este projeto ainda não tem verificação visual em simulador/emulador real (máquina de desenvolvimento atual não tem Xcode.app nem Android SDK instalados).
