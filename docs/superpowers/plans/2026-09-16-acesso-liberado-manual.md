# Acesso liberado manual (app-web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a concessão manual de acesso gratuito via painel do RevenueCat por uma lista de e-mails liberados no Supabase, gerenciável direto dentro da app-web.

**Architecture:** Tabela nova no Supabase (`npp_acesso_liberado`, chave por e-mail, RLS restrita) + uma função `hasAcessoLiberado(email)` chamada de dentro de `checkAccess()` + um overlay de administração (mesmo padrão visual dos overlays já existentes) visível só pra conta admin.

**Tech Stack:** HTML/CSS/JS vanilla (mesmo padrão do resto do arquivo), SQL/Postgres (Supabase).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-09-16-acesso-liberado-manual-design.md`.
- Escopo só `app-web/index.html` — não mexer em `app-mobile`, original, ou Electron.
- Conta admin fixa: `felipebarbosamd@gmail.com` — só essa conta vê o botão/overlay de gerenciamento.
- Não remover nem desativar a capacidade de conceder acesso via RevenueCat — essa feature é um caminho **adicional**, não uma substituição da plataforma.
- Reusar `escapeHtml()` e `supabaseClient` já existentes no arquivo — não redefinir.

---

### Task 1: Tabela no Supabase + lógica de acesso + tela de administração

**Files:**
- Modify: `app-web/index.html`
- Executar manualmente (SQL Editor do projeto Supabase, fora do repositório): o SQL do Step 1

**Interfaces:**
- Produces: tabela `npp_acesso_liberado` (Postgres); `hasAcessoLiberado(email)` → `Promise<boolean>`; `carregarListaAcessoLiberado()`, elementos `#btnAdminAcesso`, `#overlayAcessoLiberado`.

- [ ] **Step 1: Criar a tabela e as políticas no Supabase**

No SQL Editor do projeto Supabase usado por `app-web/config.js` (mesmo projeto do `app-mobile`), rode:

```sql
create table npp_acesso_liberado (
  email text primary key,
  motivo text,
  created_at timestamptz not null default now()
);

alter table npp_acesso_liberado enable row level security;

create policy "usuário confere o próprio acesso liberado"
  on npp_acesso_liberado
  for select
  using (auth.jwt() ->> 'email' = email);

create policy "admin gerencia toda a lista"
  on npp_acesso_liberado
  for all
  using (auth.jwt() ->> 'email' = 'felipebarbosamd@gmail.com')
  with check (auth.jwt() ->> 'email' = 'felipebarbosamd@gmail.com');
```

Confirme rodando `select * from npp_acesso_liberado;` — deve retornar 0 linhas sem erro.

- [ ] **Step 2: CSS — incluir os novos elementos nos seletores de overlay já existentes**

Encontre (por volta da linha 145):

```css
    #overlayResumo, #overlayDisclaimer, #overlayAuth, #overlayPaywall, #overlayHistorico{
      position: fixed; inset: 0; background: rgba(0,0,0,.35);
      display:none; align-items: center; justify-content: center; padding: 24px;
      z-index: 9999;
    }
    #resumoCard, #disclaimerCard, #authCard, #paywallCard, #historicoCard{
      width: 210mm; max-width: 100%; background: #fff; border-radius: 14px; box-shadow:0 20px 60px rgba(0,0,0,.25);
      padding: 18mm; max-height: 90vh; overflow: auto;
    }
    #disclaimerCard, #authCard, #paywallCard, #historicoCard{width:120mm}
```

Substitua por:

```css
    #overlayResumo, #overlayDisclaimer, #overlayAuth, #overlayPaywall, #overlayHistorico, #overlayAcessoLiberado{
      position: fixed; inset: 0; background: rgba(0,0,0,.35);
      display:none; align-items: center; justify-content: center; padding: 24px;
      z-index: 9999;
    }
    #resumoCard, #disclaimerCard, #authCard, #paywallCard, #historicoCard, #acessoLiberadoCard{
      width: 210mm; max-width: 100%; background: #fff; border-radius: 14px; box-shadow:0 20px 60px rgba(0,0,0,.25);
      padding: 18mm; max-height: 90vh; overflow: auto;
    }
    #disclaimerCard, #authCard, #paywallCard, #historicoCard, #acessoLiberadoCard{width:120mm}
```

(Confirme com `grep -n "overlayResumo, #overlayDisclaimer"` antes de editar — pode ter mudado de linha.)

- [ ] **Step 3: Botão de admin na barra de conta**

Encontre (por volta da linha 185):

```html
      <div id="accountBar" class="sub" style="display:none">
        <span id="accountEmail"></span> · <button type="button" id="btnLogout" class="link-btn" style="display:inline; margin:0">Sair</button>
      </div>
```

Substitua por:

```html
      <div id="accountBar" class="sub" style="display:none">
        <span id="accountEmail"></span> · <button type="button" id="btnLogout" class="link-btn" style="display:inline; margin:0">Sair</button> · <button type="button" id="btnAdminAcesso" class="link-btn" style="display:none; margin:0">Gerenciar acesso liberado</button>
      </div>
```

- [ ] **Step 4: HTML do overlay de administração**

Encontre o fechamento do overlay de Histórico (por volta da linha 588):

```html
  <div id="overlayHistorico" role="dialog" aria-modal="true" aria-labelledby="historicoTitulo">
    <div id="historicoCard">
      <h2 id="historicoTitulo">Histórico de prescrições</h2>
      <div class="muted">Escolha uma data pra carregar</div>
      <div id="historicoLista" style="margin-top:14px"></div>
      <div class="resumo-actions">
        <button type="button" class="secondary" id="btnFecharHistorico">Fechar</button>
      </div>
    </div>
  </div>
```

Logo depois desse bloco (antes do comentário `<!-- Overlay Aviso de responsabilidade -->`), insira:

```html

  <!-- Overlay Admin — acesso liberado manual -->
  <div id="overlayAcessoLiberado" role="dialog" aria-modal="true" aria-labelledby="acessoLiberadoTitulo">
    <div id="acessoLiberadoCard">
      <h2 id="acessoLiberadoTitulo">Acesso liberado manual</h2>
      <div class="muted">E-mails nesta lista usam o app sem precisar de assinatura ativa.</div>
      <div class="grid row" style="margin-top:14px">
        <div class="field span-12">
          <label for="acessoLiberadoEmail">E-mail</label>
          <input id="acessoLiberadoEmail" type="email" placeholder="pessoa@exemplo.com" />
        </div>
        <div class="field span-12">
          <label for="acessoLiberadoMotivo">Motivo (opcional)</label>
          <input id="acessoLiberadoMotivo" type="text" placeholder="Ex.: cortesia, revisor, teste" />
        </div>
      </div>
      <div id="acessoLiberadoErro" class="sub" style="color:var(--danger); display:none"></div>
      <div class="resumo-actions">
        <button type="button" id="btnAcessoLiberadoAdicionar">Liberar acesso</button>
      </div>
      <div id="acessoLiberadoLista" style="margin-top:14px"></div>
      <div class="resumo-actions">
        <button type="button" class="secondary" id="btnFecharAcessoLiberado">Fechar</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 5: `hasAcessoLiberado()` + integrar em `checkAccess()`**

Encontre (por volta da linha 1568):

```js
    async function checkAccess() {
      const session = await getCurrentSession().catch((e) => {
        console.warn('Falha ao checar sessão do Supabase:', e);
        return null;
      });
      if (!session) {
        accountBar.style.display = 'none';
        overlayPaywall.style.display = 'none';
        overlayAuth.style.display = 'flex';
        return false;
      }
      currentUserId = session.user.id;
      overlayAuth.style.display = 'none';
      accountEmail.textContent = session.user.email || '';
      accountBar.style.display = 'block';
      try {
        await configurePurchases(session.user.id);
      } catch (e) {
        console.warn('Falha ao configurar o RevenueCat Web Billing:', e);
      }
      if (await window.hasActiveSubscription()) {
        overlayPaywall.style.display = 'none';
        return true;
      }
      hidePaywallStatus();
      overlayPaywall.style.display = 'flex';
      return false;
    }
```

Substitua por:

```js
    const ADMIN_EMAIL = 'felipebarbosamd@gmail.com';
    async function hasAcessoLiberado(email) {
      if (!supabaseClient || !email) return false;
      try {
        const { data, error } = await supabaseClient
          .from('npp_acesso_liberado')
          .select('email')
          .eq('email', email)
          .maybeSingle();
        if (error) { console.warn('Erro ao checar acesso liberado:', error); return false; }
        return !!data;
      } catch (e) {
        console.warn('Falha de rede ao checar acesso liberado:', e);
        return false;
      }
    }
    async function checkAccess() {
      const session = await getCurrentSession().catch((e) => {
        console.warn('Falha ao checar sessão do Supabase:', e);
        return null;
      });
      if (!session) {
        accountBar.style.display = 'none';
        overlayPaywall.style.display = 'none';
        overlayAuth.style.display = 'flex';
        return false;
      }
      currentUserId = session.user.id;
      overlayAuth.style.display = 'none';
      accountEmail.textContent = session.user.email || '';
      accountBar.style.display = 'block';
      btnAdminAcesso.style.display = (session.user.email === ADMIN_EMAIL) ? 'inline' : 'none';
      try {
        await configurePurchases(session.user.id);
      } catch (e) {
        console.warn('Falha ao configurar o RevenueCat Web Billing:', e);
      }
      const liberado = await hasAcessoLiberado(session.user.email);
      if (liberado || await window.hasActiveSubscription()) {
        overlayPaywall.style.display = 'none';
        return true;
      }
      hidePaywallStatus();
      overlayPaywall.style.display = 'flex';
      return false;
    }
```

(`btnAdminAcesso` é declarado no Step 6, mais abaixo no arquivo — funciona porque `checkAccess()` só é *chamada* dentro do `init()` no fim do script, bem depois de todo `const` de nível superior já ter rodado; a ordem física das declarações no arquivo não importa aqui, só a ordem de execução.)

- [ ] **Step 6: controlador do overlay de administração**

Encontre (por volta da linha 1892, logo após o bloco de Histórico):

```js
    document.getElementById('btnFecharHistorico').addEventListener('click', () => { overlayHistorico.style.display = 'none'; });
```

Logo depois dessa linha, insira:

```js

    // ===== Admin — acesso liberado manual =====
    const btnAdminAcesso = document.getElementById('btnAdminAcesso');
    const overlayAcessoLiberado = document.getElementById('overlayAcessoLiberado');
    const acessoLiberadoLista = document.getElementById('acessoLiberadoLista');
    const acessoLiberadoEmail = document.getElementById('acessoLiberadoEmail');
    const acessoLiberadoMotivo = document.getElementById('acessoLiberadoMotivo');
    const acessoLiberadoErro = document.getElementById('acessoLiberadoErro');

    function mostrarErroAcessoLiberado(msg) {
      acessoLiberadoErro.textContent = msg;
      acessoLiberadoErro.style.display = 'block';
    }
    function esconderErroAcessoLiberado() {
      acessoLiberadoErro.style.display = 'none';
    }

    async function carregarListaAcessoLiberado() {
      acessoLiberadoLista.innerHTML = '<div class="muted">Carregando…</div>';
      try {
        const { data, error } = await supabaseClient
          .from('npp_acesso_liberado')
          .select('email, motivo, created_at')
          .order('created_at', { ascending: false });
        if (error) { acessoLiberadoLista.innerHTML = ''; mostrarErroAcessoLiberado('Não foi possível carregar a lista.'); return; }
        if (!data.length) { acessoLiberadoLista.innerHTML = '<div class="muted">Nenhum e-mail liberado ainda.</div>'; return; }
        acessoLiberadoLista.innerHTML = data.map(row => `
          <div class="kv"><div><b>${escapeHtml(row.email)}</b>${row.motivo ? ' — ' + escapeHtml(row.motivo) : ''}
          <button type="button" class="link-btn acesso-liberado-remover" data-email="${escapeHtml(row.email)}" style="margin-left:8px">Remover</button></div></div>
        `).join('');
        acessoLiberadoLista.querySelectorAll('.acesso-liberado-remover').forEach(botao => {
          botao.addEventListener('click', async () => {
            esconderErroAcessoLiberado();
            const email = botao.dataset.email;
            const { error } = await supabaseClient.from('npp_acesso_liberado').delete().eq('email', email);
            if (error) { mostrarErroAcessoLiberado('Não foi possível remover.'); return; }
            await carregarListaAcessoLiberado();
          });
        });
      } catch (e) {
        acessoLiberadoLista.innerHTML = '';
        mostrarErroAcessoLiberado('Falha de rede ao carregar a lista.');
      }
    }

    btnAdminAcesso.addEventListener('click', async () => {
      esconderErroAcessoLiberado();
      acessoLiberadoEmail.value = '';
      acessoLiberadoMotivo.value = '';
      overlayAcessoLiberado.style.display = 'flex';
      await carregarListaAcessoLiberado();
    });
    document.getElementById('btnFecharAcessoLiberado').addEventListener('click', () => { overlayAcessoLiberado.style.display = 'none'; });
    document.getElementById('btnAcessoLiberadoAdicionar').addEventListener('click', async () => {
      esconderErroAcessoLiberado();
      const email = acessoLiberadoEmail.value.trim().toLowerCase();
      if (!email) { mostrarErroAcessoLiberado('Digite um e-mail.'); return; }
      const motivo = acessoLiberadoMotivo.value.trim() || null;
      const { error } = await supabaseClient.from('npp_acesso_liberado').insert({ email, motivo });
      if (error) { mostrarErroAcessoLiberado('Não foi possível liberar esse e-mail — confira se já não está na lista.'); return; }
      acessoLiberadoEmail.value = '';
      acessoLiberadoMotivo.value = '';
      await carregarListaAcessoLiberado();
    });
```

(`escapeHtml` e `supabaseClient` já existem mais acima no arquivo — confirme com `grep -n "function escapeHtml"` antes de editar, não redefinir.)

- [ ] **Step 7: verificação manual**

Não há teste automatizado pra este arquivo. Precisa de duas contas de teste no Supabase Auth (uma com o e-mail admin `felipebarbosamd@gmail.com`, outra qualquer) — se não tiver acesso a criar/logar como a conta admin real nesta sessão, documente isso como não verificado e sinalize pro usuário testar manualmente depois, mas ainda assim confirme por leitura de código que a lógica está correta.

1. Logar como `felipebarbosamd@gmail.com` → confirmar que "Gerenciar acesso liberado" aparece na barra de conta.
2. Logar com outra conta → confirmar que o botão **não** aparece.
3. Como admin, abrir o overlay, liberar um e-mail de teste que ainda não tem conta.
4. Criar uma conta com esse e-mail (outra sessão/aba anônima) → confirmar que entra direto na calculadora, sem cair no paywall.
5. Como admin, remover esse e-mail da lista → conferir que a conta de teste volta a cair no paywall no próximo carregamento (a menos que tenha assinatura ativa).
6. Confirmar que uma conta sem assinatura e fora da lista continua caindo no paywall normalmente (sem regressão no fluxo existente).

- [ ] **Step 8: Commit**

```bash
cd "/Users/felipebarbosa/Desktop/Claude/NPP Calculator"
git add app-web/index.html
git commit -m "$(cat <<'EOF'
Adiciona acesso liberado manual por e-mail (app-web)

Substitui a concessão manual via painel do RevenueCat por uma lista
de e-mails liberados guardada no Supabase (npp_acesso_liberado, RLS
restrita à própria conta pra conferência e à conta admin pra
gerenciar), com tela de administração dentro do próprio app —
visível só pra felipebarbosamd@gmail.com. checkAccess() passa a
liberar o app se houver assinatura ativa OU o e-mail estar na lista.

Escopo só app-web (única implementação em produção cobrando hoje).
RevenueCat continua funcionando como capacidade da plataforma, não
foi removido.

Requer rodar o SQL da tabela/políticas no Supabase antes de usar em
produção (docs/superpowers/plans/2026-09-16-acesso-liberado-manual.md,
Step 1) — não faz parte deste commit por não ser código versionável.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```
