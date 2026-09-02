# Salvar/reabrir prescrição de NPP (app-web)

**Data**: 2026-09-02
**Status**: aprovado, aguardando plano de implementação

## Contexto e objetivo

Hoje, cada vez que um médico abre a calculadora precisa preencher tudo do zero. Na prática (ex.: UTI neonatal), a NPP de um paciente é reavaliada e ajustada diariamente — o clínico quer poder abrir a prescrição de ontem daquele paciente, editar só o que mudou (peso, alguma dose) e salvar de novo, sem redigitar tudo.

Esta feature adiciona: buscar um paciente já prescrito, carregar a última prescrição dele (ou uma data específica do histórico), editar, e salvar — tudo dentro do `app-web` (única versão com login/conta hoje).

## Escopo

- **Só `app-web`**. As outras cópias (`app-mobile`, o HTML standalone/PWA, `app/` Electron) não têm sistema de conta hoje e ficam de fora desta feature.
- Usa a mesma conta Supabase Auth que o app-web já usa pro login/paywall (ver `docs/superpowers/specs/2026-08-17-npp-calculadora-app-pago-design.md`).
- Plano gratuito do Supabase por enquanto — o time pode migrar pro Pro (US$25/mês) mais adiante se o volume de vendas justificar (evita a pausa automática por inatividade e adiciona backup diário); essa decisão é independente desta feature e não bloqueia a implementação.

## Fora de escopo (por ora)

- Sincronizar/replicar essa feature nas outras 3 cópias do código.
- Um conceito de "paciente" com identidade própria e estável (ver decisão de modelo de dados abaixo) — se um nome for digitado com uma variação diferente, o histórico não casa automaticamente.
- Editar/apagar entradas do histórico pela UI (fica pra uma iteração futura, se for pedido).
- Compartilhar uma prescrição salva entre usuários/contas diferentes.

## Modelo de dados

Uma tabela nova no Supabase, sem tabela de "pacientes" separada — decisão registrada abaixo.

```sql
create table npp_prescricoes_salvas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_paciente text not null,
  data_prescricao date not null,
  hospital text,
  setor text,
  leito text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, nome_paciente, data_prescricao)
);

alter table npp_prescricoes_salvas enable row level security;

create policy "usuário só vê/edita as próprias prescrições salvas"
  on npp_prescricoes_salvas
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

`hospital`/`setor`/`leito` ficam duplicados fora do `payload` só para aparecerem na lista de busca sem precisar abrir o JSON inteiro.

### Decisão: uma tabela agrupando por nome (não duas tabelas com paciente com ID próprio)

Avaliamos duas abordagens:

- **A (escolhida)**: uma tabela só, histórico agrupado pelo texto de `nome_paciente`. Busca = filtro direto na tabela. Mais simples, sem join, sem decidir explicitamente "isso é o mesmo paciente ou um novo?" a cada salvamento.
- **B (descartada por agora)**: tabela `pacientes` (id estável) + tabela `prescrições` (FK pro paciente). Permitiria renomear um paciente sem perder o vínculo do histórico, e seria mais correto para guardar dados fixos do paciente no futuro (alergias, etc.) — mas exige mais telas/decisões e não foi pedido.

Trade-off aceito da opção A: se o nome for digitado de forma diferente entre duas prescrições do mesmo paciente (ex.: "João Silva" vs "João da Silva"), elas não se agrupam sozinhas — mas como o fluxo já é "digitar e clicar no que aparecer na busca", isso raramente vira problema na prática.

## Fluxo de tela

**Campo "Nome completo" (já existe no cabeçalho) vira busca**: ao digitar 2+ letras, aparece uma lista suspensa com os pacientes salvos que combinam (nome, hospital, leito, data mais recente), consultando `npp_prescricoes_salvas` filtrado por `user_id = auth.uid()`.

**Carregar**: clicar num item da lista carrega a prescrição **mais recente** daquele nome no formulário inteiro (todos os campos), disparando o recálculo normal (as mesmas funções que já rodam a cada tecla digitada — não precisa de lógica de cálculo nova).

**Ver histórico**: um link "Ver histórico" ao lado do campo abre uma lista das datas já salvas daquele nome; clicar numa data carrega a prescrição daquele dia específico em vez da mais recente.

**Proteção contra perda de dados**: se o formulário já tiver algo preenchido (não estiver vazio) quando o usuário for carregar outro paciente/data, mostrar uma confirmação antes de sobrescrever. Formulário vazio → carrega direto.

**Salvar**: um botão novo "Salvar prescrição" ao lado dos botões existentes (Resumo/Imprimir/Limpar). Salva o payload + `nome_paciente` (valor atual do campo) + `data_prescricao` (hoje) via upsert — se já existir uma entrada de hoje para esse nome, sobrescreve; senão, cria uma nova linha. Mostra uma confirmação simples de sucesso.

**Paciente novo**: nome digitado sem correspondência na busca → nenhuma sugestão aparece, segue preenchendo normal; "Salvar" cria o primeiro registro dele.

**Editar o nome após carregar**: se o usuário carregar um paciente, mudar o texto do campo "Nome completo" e salvar, isso cria uma entrada nova sob o nome novo (não renomeia o histórico antigo) — consequência direta da decisão de modelo de dados acima.

## O que entra no payload salvo

Todos os campos **editáveis** do formulário: cabeçalho completo (hospital, nome, idade, peso, setor, leito, registro — `nome` entra tanto no payload quanto na coluna `nome_paciente`, de propósito, pra carregar ser só "preencher cada campo do payload" sem caso especial) + todas as doses + todos os seletores de fonte/unidade (`srcPSelect`, `srcNaClSelect`, `srcKClSelect`, `srcLIPSelect`, `srcCaUnitSelect`, `srcPUnitSelect`). Na prática, é a união dos ids já usados nos arrays `doseFieldIds`/`selectFieldIds` do código (usados hoje pra registrar listeners e pro botão Limpar) mais os campos de cabeçalho. Os campos **"(auto)"** (volumes calculados, calorias, osmolaridade, etc.) **não** entram — são sempre recalculados no momento de carregar, evitando guardar um valor desatualizado.

## Tratamento de erro

- Falha de rede/Supabase ao buscar ou salvar: mostra uma mensagem simples (ex.: "Não foi possível salvar, tente novamente") sem travar o resto do app — mesmo padrão não-bloqueante já usado para falhas do RevenueCat no app-web.
- Usuário desloga / sessão expira: a busca/salvar simplesmente param de funcionar (o app-web já exige login pra usar a calculadora, então esse caso é coberto pelo gate existente).
