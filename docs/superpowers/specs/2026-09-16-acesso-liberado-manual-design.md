# Acesso liberado manual (app-web)

**Data**: 2026-09-16
**Status**: aprovado, aguardando plano de implementação

## Contexto e objetivo

Hoje, pra dar acesso gratuito a alguém (cortesia, teste, etc.) na app-web, o único jeito é entrar no painel do RevenueCat e conceder um "grant" de assinatura vitalícia manualmente pro customer daquela pessoa. Funciona, mas depende de: (a) a pessoa já ter feito login pelo menos uma vez (só assim existe um "customer" no RevenueCat pra encontrar), e (b) o usuário sempre abrir o painel externo do RevenueCat pra fazer isso.

Esta feature adiciona um mecanismo próprio, mais prático: uma lista de e-mails liberados guardada no Supabase (mesmo projeto que a app-web já usa), com uma tela de administração **dentro do próprio app**, sem precisar sair pra nenhum painel externo.

**Decisão explícita**: escopo só `app-web` por agora — é a única implementação em produção cobrando de verdade hoje. Não estende pro `app-mobile` (ainda não lançado). A concessão manual via RevenueCat continua existindo como capacidade da plataforma (não está sendo removida), só deixa de ser o único caminho.

## Escopo

- `app-web/index.html` apenas.
- Uma tabela nova no Supabase (mesmo projeto de `app-web/config.js`).

## Fora de escopo

- `app-mobile` — fica pra quando/se fizer sentido depois do lançamento.
- Editar/revogar via qualquer coisa além da tela de admin nova (o painel do Supabase Table Editor também funciona como alternativa manual, mas não é o fluxo principal).
- Qualquer expiração automática do acesso liberado — é permanente até alguém remover manualmente (igual "vitalício" no RevenueCat).

## Modelo de dados

```sql
create table npp_acesso_liberado (
  email text primary key,
  motivo text,
  created_at timestamptz not null default now()
);

alter table npp_acesso_liberado enable row level security;

-- Qualquer usuário logado só enxerga se o PRÓPRIO e-mail está na lista
-- (usado por checkAccess() pra decidir se libera o app).
create policy "usuário confere o próprio acesso liberado"
  on npp_acesso_liberado
  for select
  using (auth.jwt() ->> 'email' = email);

-- Só a conta admin (dona do app) vê/gerencia a lista inteira.
create policy "admin gerencia toda a lista"
  on npp_acesso_liberado
  for all
  using (auth.jwt() ->> 'email' = 'felipebarbosamd@gmail.com')
  with check (auth.jwt() ->> 'email' = 'felipebarbosamd@gmail.com');
```

`email` como chave primária (não `user_id`) é proposital: permite liberar alguém **antes** de essa pessoa criar conta — quando ela se cadastrar com esse e-mail, o acesso já está valendo, sem passo extra.

## Lógica de acesso (`checkAccess()`)

Local: `app-web/index.html`, função `checkAccess()` (por volta da linha 1568 — confirmar com `grep -n` no momento da implementação).

Hoje: `if (await window.hasActiveSubscription()) { ...libera... }`.

Nova regra: liberar se `hasActiveSubscription()` **OU** `hasAcessoLiberado(session.user.email)` — o segundo é uma consulta nova à tabela:

```js
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
```

## Tela de administração

- Botão **"Gerenciar acesso liberado"** na barra de conta (`accountBar`, onde já fica o e-mail logado + botão Sair) — visível **só** quando `session.user.email === 'felipebarbosamd@gmail.com'`. Ninguém mais vê esse botão.
- Abre um overlay novo (`#overlayAcessoLiberado`), mesmo padrão visual dos overlays já existentes (Resumo, Paywall, Auth, Histórico — `position:fixed`, cartão centralizado):
  - Lista dos e-mails já liberados (e-mail + motivo + data), carregada via `select *` na tabela (a política de admin permite ver tudo).
  - Campo de e-mail + campo de motivo (opcional) + botão "Liberar acesso" → `insert`.
  - Botão "Remover" em cada linha da lista → `delete` por e-mail.
  - Botão de fechar.
- Erros de rede/Supabase tratados com a mesma disciplina já usada no resto do arquivo (try/catch, mensagem de erro na tela, nunca deixar estourar exceção não tratada).

## Testes / verificação manual

Sem suíte automatizada pra este arquivo (mesmo padrão dos outros específicos de app-web). Verificação manual:

1. Rodar o SQL da tabela/políticas no Supabase (SQL Editor do projeto).
2. Logar como `felipebarbosamd@gmail.com` → confirmar que o botão "Gerenciar acesso liberado" aparece.
3. Logar com outra conta → confirmar que o botão **não** aparece.
4. Como admin, liberar um e-mail de teste (de uma conta que ainda não existe) → criar essa conta depois → confirmar que ela entra direto na calculadora, sem cair no paywall.
5. Remover o acesso liberado dessa conta → conferir que da próxima vez que abrir, cai no paywall de novo (a menos que também tenha assinatura ativa).
6. Confirmar que uma conta sem assinatura e sem estar na lista continua caindo no paywall normalmente (não quebrou o fluxo existente).
