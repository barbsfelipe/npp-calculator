# Calculadora de NPP — transformação em app pago (iOS/Android + web)

**Data:** 2026-08-17 (revisado em 2026-08-18 — trial gratuito e preços mensal/anual)
**Status:** aprovado para planejamento

## Contexto

O projeto hoje tem duas implementações da mesma calculadora clínica (fórmulas em `calcVolumes()` e `calcularPesoCalorico()`, ver `CLAUDE.md`):

1. `calculadora_npp_v0_5_8-2.html` — HTML único, instalável como PWA (manifest + service worker), gratuito, sem login, sem persistência de dados.
2. `app/` — app desktop Electron (macOS), gratuito, não assinado.

Nenhuma das duas está preparada para venda nas lojas (App Store / Google Play) nem tem qualquer mecanismo de conta ou pagamento. O código roda 100% localmente — não há `fetch`, `XMLHttpRequest`, `localStorage` nem analytics em nenhuma das duas implementações hoje.

## Objetivo

Transformar a calculadora em um produto pago — download grátis com trial de uso, depois assinatura mensal ou anual —, disponível como:

- App nativo iOS e Android (lojas Apple/Google), via wrapper Capacitor sobre a lógica existente.
- Versão web (para uso em PC), com login e assinatura, substituindo o acesso gratuito atual.

Público-alvo: profissionais de saúde individuais (compra pessoal, B2C) — não é uma venda institucional/hospitalar neste momento.

## Escopo do v1

### Dentro do escopo

- Empacotar a calculadora atual como app nativo iOS + Android via Capacitor, **sem reescrever as fórmulas clínicas**.
- **Trial gratuito de uso** (não por tempo): 3 prescrições grátis sem precisar de conta — conta a tela inicial (1ª prescrição, já aberta ao instalar) mais cada clique em "Limpar/Nova". Contador local no aparelho (`@capacitor/preferences`), sem servidor — reinstalar o app reseta o trial (limitação aceita, ver Arquitetura técnica).
- Na 4ª tentativa de prescrição nova, o formulário não abre — mostra direto a tela de assinatura (paywall) em vez de bloquear campos.
- Sistema de conta (login/senha) via Supabase Auth, compartilhado entre mobile e web — criado no momento da assinatura (não antes, durante o trial).
- **Duas opções de assinatura** — mensal (R$9,90) e anual (R$79,90 = R$6,66/mês, ~33% de desconto) — que liberam acesso em mobile e web pela mesma conta, via RevenueCat (App Store, Google Play e RevenueCat Web Billing para o checkout web).
- Tela de consentimento/aviso legal no primeiro uso (ferramenta de apoio à decisão clínica, não substitui julgamento clínico, uso por profissional habilitado).
- Botão "Restaurar compra" nos apps mobile.
- Novo ícone (ver seção Identidade Visual).
- Política de Privacidade + Termos de Uso hospedados (GitHub Pages), com cláusula básica de LGPD (coleta de e-mail para autenticação, sem dado de paciente armazenado).
- Ficha de listagem nas lojas (descrição, screenshots, categoria) em pt-BR.
- Migração da versão web atual (PWA gratuita) para a versão com login/paywall — sem período de graça, sem exceções: todo usuário atual precisa criar conta e assinar quando a mudança for ao ar.

### Fora do escopo (fica para depois)

- Licenciamento institucional/B2B (hospital compra para equipe).
- Múltiplos idiomas.
- Layout otimizado para tablet/iPad.
- Qualquer proteção anti-abuso do trial além do contador local (ex: bloquear reinstalação, trial por servidor) — reinstalar resetando o trial é um risco aceito.
- Qualquer lista de exceção/acesso vitalício para usuários atuais (decisão: todo mundo assina, sem exceção).
- Sincronização/armazenamento de dados de paciente (não existe hoje e não entra agora — o formulário continua sem persistência).

## Identidade visual — ícone

Novo ícone definido por brainstorming visual: fundo quase-preto arredondado (estilo "squircle"), luz vinda do canto superior esquerdo, com um símbolo dimensional/glossy no centro — **não** o ícone atual (texto "NPP" em gradiente verde-azulado plano).

**Design aprovado:** núcleo esférico brilhante (gradiente azul/branco) com as letras "NPP" gravadas (sans-serif bold, para caber sem espremer), orbitado por 3 anéis elípticos (representando os 3 macronutrientes — aminoácidos, lipídios, glicose) com pequenos pontos de destaque nas órbitas. Visual inspirado no ícone do Electron.app que o usuário referenciou (fundo escuro, símbolo 3D com anéis), mas com identidade própria ligada a NPP em vez de um átomo genérico.

Passos técnicos de geração de asset (implementação):
- Produzir um master 1024×1024 PNG a partir do mockup SVG aprovado.
- Gerar todos os tamanhos exigidos por iOS (via `@capacitor/assets` ou `sips`) e Android.
- No Android, separar em duas camadas para o ícone adaptativo: fundo (gradiente escuro) e foreground (anéis + núcleo), pois o sistema recorta/anima essas camadas separadamente.

## Arquitetura técnica

### Mobile (Capacitor)

- Novo projeto `app-mobile/` (separado do `app/` Electron atual), com `www/` baseado no HTML existente, reaproveitando a lógica de cálculo sem alterações.
- `npx cap add ios android` para gerar os projetos nativos.
- Plugins: `@revenuecat/purchases-capacitor` (assinatura), `@capacitor/preferences` (flag local de aceite do aviso legal + contador do trial), `@capacitor/splash-screen`, `@capacitor/status-bar`.

### Trial gratuito (contador local)

- Chave própria em `@capacitor/preferences` (ex.: `trialUsageCount`), incrementada em dois pontos: na primeira abertura do app (tela inicial já em branco = uso 1) e a cada clique em "Limpar/Nova" (usos 2 e 3).
- Antes de abrir uma nova prescrição, o app checa `trialUsageCount`: se `< 3` e sem assinatura ativa, incrementa e abre normalmente; se `>= 3` e sem assinatura ativa, não abre — mostra o paywall.
- Assinante ativo (checado via RevenueCat) ignora o contador — nunca é bloqueado.
- Contador é só local, não sincroniza com conta nem servidor: é resetado se o app for desinstalado e reinstalado. Risco aceito (ver Fora do escopo).

### Autenticação e assinatura (mobile + web)

- **Supabase Auth** cuida de login/senha, verificação de e-mail e recuperação de senha — sem backend de autenticação escrito à mão.
- **RevenueCat** continua sendo a fonte de verdade da assinatura, mas passa a ser identificado por conta (`Purchases.logIn(<id do usuário Supabase>)`) em vez de anônimo por aparelho.
- Uma assinatura comprada em qualquer canal — App Store, Google Play ou **RevenueCat Web Billing** (checkout com cartão direto no navegador) — libera acesso em mobile e web pela mesma conta.
- Não é necessário backend customizado: Supabase Auth e RevenueCat são serviços gerenciados; a página web usa os SDKs deles diretamente no navegador para checar login + assinatura antes de renderizar a calculadora.

### Fluxo do app (mobile)

1. Splash/abertura.
2. Primeiro uso: tela de aviso legal/consentimento (persistida localmente).
3. Checagem de assinatura via RevenueCat:
   - Assinante ativo (conta já criada e logada) → abre a calculadora direto, sem checar trial.
   - Sem assinatura → checa o contador de trial local:
     - `trialUsageCount < 3` → abre a calculadora normalmente, incrementa o contador.
     - `trialUsageCount >= 3` → paywall: "Assinar por R$9,90/mês ou R$79,90/ano" + botão "Já tenho conta" (login) + botão "Restaurar compra".
4. Ao escolher um plano no paywall: tela de criar conta (Supabase Auth, e-mail/senha) → checkout (App Store/Google Play) → conta logada e assinatura ativa liberam a calculadora.

### Fluxo do app (web, Plano 3 — ainda não implementado)

Mesma lógica de checagem de assinatura via RevenueCat (login obrigatório na web, sem trial de uso — o trial é só para primeiro contato via mobile). Login com a mesma conta usada no mobile reconhece a assinatura automaticamente.

### Dados e privacidade

- Nenhum dado de paciente é salvo em nenhuma das plataformas — o formulário continua sem persistência, como hoje.
- Passa a existir coleta de e-mail (conta de login) — precisa constar na Política de Privacidade e nos formulários de privacidade da Apple (Privacy Nutrition Label) e Google (Data Safety), com cláusula de LGPD (finalidade, retenção, direito de exclusão da conta).

## Configuração de lojas e legal

- **Apple Developer Program**: inscrição pessoa física (CPF), US$99/ano.
- **Google Play Console**: cadastro pessoa física (CPF), US$25 taxa única. Contas pessoais novas são obrigadas a rodar teste fechado com **mínimo 12 testers ativos por 14 dias corridos** antes de liberar produção — precisa ser planejado com antecedência (recrutar colegas como testers).
- Dois produtos de assinatura (mensal R$9,90 e anual R$79,90) cadastrados em App Store Connect e Play Console.
- Política de Privacidade + Termos de Uso hospedados em página própria (GitHub Pages), linkados nas lojas e dentro do app.
- Postura regulatória: calculadora permanece como ferramenta de apoio/referência para profissional já habilitado — **sem** registro como Software as a Medical Device (SaMD) na ANVISA/FDA.
- Notas para o revisor da Apple: o app tem trial de uso gratuito (3 prescrições) antes do paywall — o revisor consegue testar a calculadora normalmente sem precisar de conta. Se pedir para verificar o fluxo pós-assinatura, disponibilizar conta de teste com assinatura ativa.

## Migração da versão web (cutover)

A PWA atual já está em uso (inclusive pelo próprio usuário e possivelmente colegas no Hemoam). Quando o login/paywall entrar no ar:

- **Sem período de graça e sem lista de exceção** — todo usuário, incluindo quem já usa hoje, precisa criar conta e assinar para continuar usando.
- Atualização da PWA existente in-place (bump da versão do `CACHE` em `sw.js` para forçar atualização do service worker).
- Data de corte e forma de comunicar a mudança para usuários atuais ficam a definir na etapa de implementação.

## Testes antes de publicar

- **Lógica clínica**: comparar entradas/saídas do app empacotado (Capacitor) e da web com login contra a versão HTML original, campo a campo, para garantir que as fórmulas não mudaram ao adaptar o layout.
- **Trial**: abrir o app 3 vezes (contando a tela inicial) sem assinar, confirmar que a 4ª tentativa de prescrição nova bloqueia e mostra o paywall; confirmar que assinante ativo nunca é bloqueado, independente do contador.
- **Fluxo de conta**: criar conta, logar, deslogar, recuperar senha, logar em dois dispositivos diferentes (mobile + web) com a mesma conta e confirmar que a assinatura aparece em ambos.
- **Assinatura**: compra em sandbox da Apple, license tester do Google, e checkout web do RevenueCat — testar mensal e anual, incluindo cancelamento e renovação simulada.
- **Restaurar compra** após reinstalar o app.
- Revisão isolada em simulador iOS e emulador Android antes de submeter às lojas.

## Decisões registradas (histórico do brainstorming)

| Tema | Decisão |
|---|---|
| Público-alvo | Profissional individual (B2C) |
| Monetização | Trial gratuito de 3 prescrições (contador local, sem conta) → assinatura mensal (R$9,90) ou anual (R$79,90) |
| Contas de desenvolvedor | Pessoa física (CPF), ainda não criadas |
| Abordagem técnica mobile | Capacitor (reaproveita HTML/JS existente) |
| Postura regulatória | Ferramenta de apoio/referência, sem registro SaMD |
| Versão web | Mantida, mas com login + assinatura (não descontinuada) |
| Infra de assinatura | RevenueCat (mobile + Web Billing) |
| Autenticação | Supabase Auth (login/senha compartilhado mobile+web) |
| Usuários atuais da versão grátis | Sem exceção — todos precisam assinar |
| Ícone | Núcleo "NPP" com anéis orbitais, estilo escuro/glossy |
