# Seletor de marca — Polivitamínico e Oligoelementos

**Data**: 2026-09-15
**Status**: aprovado, aguardando plano de implementação

## Contexto e objetivo

O cálculo de **Polivitamínico** (`volMVI`) hoje é 100% automático e fixo na fórmula do Trezevit AB (`2 mL/kg, máx 10 mL`), sem campo de dose nem seletor de marca. O de **Oligoelementos** (`doseTE`/`volTE`) já é agnóstico de marca (o clínico digita a dose mL/kg direto), mas não ajuda o clínico a saber qual número usar pra cada marca disponível.

O usuário forneceu um material de referência (tabela ESPEN 2018, autoria própria com coautores) com doses por marca pra ambos. Uma verificação em duas passadas contra bulário ANVISA / artigo científico revisado por pares (Souza FIS et al., *Rev Paul Pediatr* 2008;26(3):278-89, SciELO) confirmou, corrigiu e descartou itens dessa tabela — ver seção "Dados por marca" abaixo, já com os valores finais pós-verificação.

Esta feature adiciona seletores de marca pros dois campos, com fórmula/dose correta por marca, e um mecanismo de "lembrar a última marca usada" (novo — não existe hoje pra nenhum campo do formulário).

## Escopo

Aplicar nas três implementações: `calculadora_npp_v0_5_8-2.html`, `app/src/index.html`, `app-mobile/www/index.html` — é lógica de cálculo central, mantida duplicada entre as três (ver CLAUDE.md).

## Fora de escopo

- Cerne-12, Frutovitam, MVI-12/Opoplex Pediátrico e Tracitrans Plus — excluídos da lista de marcas oferecidas (ver "Marcas excluídas" abaixo).
- Qualquer teto de dose por mineral individual (ex.: máximo de zinco/cobre/manganês por dia) — fica só o valor de mL/kg por marca, sem cross-check nutricional automático.
- A consulta de valores de referência por faixa etária (fluidos, eletrólitos, macronutrientes — Tabs 1-13/17 do material do usuário) — projeto separado, ainda não desenhado.

## Marcas excluídas (e por quê)

| Marca | Motivo |
|---|---|
| MVI-12 / Opoplex Pediátrico | Sem registro localizável na ANVISA, sem canal de venda identificado no Brasil hoje (aparenta ser só México) |
| Cerne-12 | Bula contraindica expressamente para menores de 11 anos, sem exceção — fora do público desta calculadora |
| Frutovitam | Bula não define dose numérica abaixo de 20kg ("individualizar" a critério médico) — não dá pra automatizar com segurança |
| Tracitrans Plus | Bula do fabricante declara formulação para adultos e crianças **acima de 40kg**; não indicado para neonatos/crianças abaixo disso |

## Dados por marca (pós-verificação)

### Polivitamínico (`volMVI`, select `srcMVISelect`, permanece 100% automático — sem campo de dose manual)

- **Trezevit AB** (Inpharma, registro ANVISA válido) — não é fator×peso linear. Regra por faixa de peso, A e B sempre iguais entre si:
  - `P < 1`: 1,5 mL de A + 1,5 mL de B
  - `1 ≤ P < 3`: 3,25 mL de A + 3,25 mL de B
  - `P ≥ 3` (até 11 anos): 5 mL de A + 5 mL de B (1 ampola de cada)
- **Polivit A Ped** (Inpharma) — `4 mL/kg`, teto de 1 ampola = 10 mL. *(Teto assumido por convenção com os demais produtos da categoria — não há confirmação literal de bula pra esse teto específico.)*
- **Polivit B Ped** (Inpharma) — `2 mL/kg`, teto de 1 ampola = 5 mL. *(Mesma ressalva do teto acima.)*

### Oligoelementos (`doseTE`, select `srcTESelect` pré-preenche o campo de dose já existente, que continua editável)

- **Ped-Element** (fabricante atual: Pierre Fabre do Brasil; registro ANVISA vencido, mas isso não implica necessariamente fora do mercado) — `0,2 mL/kg`. Ampola 4 mL (duas fontes convergem nesse valor; uma fonte de 2008 cita 5 mL).
- **Ad-Element** (Pierre Fabre do Brasil; registro vencido) — `0,05 mL/kg`. Ampola 2 mL. Nota exibida: mesmo com a dose ajustada, a oferta de manganês fica acima do recomendado — replicar como aviso, igual ao padrão já usado no seletor de Fósforo (`<small class="notice">`).
- **Oliped 4** (Inpharma) — `1 mL/kg`. Ampola 5 mL.
- **Politrace 4** (Inpharma) — `0,1 mL/kg`. Ampola 5 mL.

## UI

Seção **Micronutrientes — Traços & Vitaminas**, dois `<select>` novos em `span-12` (não `span-3` — seletor de fonte/marca quebra layout em coluna estreita, já documentado como problema conhecido neste projeto):

- **"Polivitamínico — marca"**: Trezevit AB / Polivit A Ped / Polivit B Ped. Ao trocar, `volMVI` recalcula pela regra daquela marca.
- **"Oligoelementos — marca"**: Ped-Element / Ad-Element / Oliped 4 / Politrace 4. Ao trocar, pré-preenche `doseTE` com a dose sugerida (editável).

A label fixa "Polivitamínicos — TrezevitAB (auto)" vira genérica: "Polivitamínico (auto)".

Quando Ad-Element estiver selecionado, mostra o aviso de manganês.

## Resumo impresso (`buildResumo`)

- Trezevit AB selecionado → duas linhas: "Trezevit A" e "Trezevit B", mesmo valor de `volMVI` nas duas.
- Qualquer outra marca de Polivitamínico → uma linha com o nome da marca escolhida.
- Oligoelementos → uma linha com o nome da marca escolhida (já existe a linha "Oligoelementos"; só passa a incluir o nome da marca).

## Persistência — "lembrar última marca"

Mecanismo novo (não existe hoje pra nenhum campo):

- `app-mobile`: reusa o wrapper `prefsGet`/`prefsSet` já existente (Capacitor Preferences nativo, com fallback pra `localStorage` fora do app nativo).
- `calculadora_npp_v0_5_8-2.html` e `app/src/index.html`: `localStorage` direto (mesmo mecanismo, sem o wrapper nativo que só existe no app-mobile).
- Chaves: `mviBrand` e `teBrand`.
- Ao carregar a página, se houver valor salvo, aplica no select correspondente; senão usa o default de primeiro uso.
- Default de primeiro uso (antes de existir qualquer valor salvo): Polivitamínico = Trezevit AB, Oligoelemento = Ped-Element.
- **Botão Limpar**: hoje reseta todos os selects pra um valor fixo. Os dois novos passam a reaplicar a última marca lembrada (não um valor fixo, e não vazio) — mantém a marca do hospital entre prescrições, só limpa os dados do paciente.
- Cada seleção nova grava imediatamente a preferência (no `change` do select).

## Testes / verificação manual

Sem suíte automatizada pra essas duas implementações de UI (só o `app-mobile` tem os testes em `app-mobile/tests/`, que cobrem paridade de cálculo — vale conferir se `calc-parity.mjs` precisa de casos novos pras marcas). Verificação manual mínima por implementação:

1. Cada marca de Polivitamínico, testando os 3 tiers de peso do Trezevit AB (ex.: 0,5kg / 2kg / 5kg) e o valor linear das outras duas.
2. Cada marca de Oligoelemento, conferindo que a dose pré-preenche e que o volume calculado bate com dose × peso.
3. Aviso do Ad-Element aparece/desaparece corretamente ao trocar marca.
4. Fechar e reabrir o app/página → última marca escolhida continua selecionada.
5. Botão Limpar → mantém a última marca (não zera, não volta pro default fixo).
6. Resumo impresso mostra a marca certa (ou as duas linhas de Trezevit A/B).
