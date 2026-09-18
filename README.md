# pi-cze-theme

Card compacto para **todas** as tool calls do pi, e os seus prompts no mesmo
estilo.

Cada chamada vira uma linha flat dentro de um card com barra colorida à
esquerda e fundo sutil. O resultado fica escondido por padrão; `ctrl+o`
expande (erros aparecem sempre):

```
▌ ● Read(src/foo.ts)
▌ ● pw2_request(GET /api/status) dryRun
▌ ● mcpb_ask_product(vacations "Quantos dias de férias o colaborador perde?")
▌ todo + Validar entendimento do epic
```

A barra segue o estado: accent no sucesso, âmbar enquanto roda, vermelho em
erro. As cores de fundo saem do tema ativo (`toolSuccessBg`, `toolPendingBg`,
`toolErrorBg`).

## Como funciona

Tools registradas por outras extensões não podem ser re-registradas daqui (cada
extensão tem o seu mapa de tools, e `pi.getAllTools()` não expõe `execute` nem
os renderers). Por isso o card é aplicado no componente de renderização
(`ToolExecutionComponent`), via `src/tool-card-patch.ts`:

- tools com `renderCall`/`renderResult` mantêm o conteúdo e ganham o card;
- tools sem renderers ganham a chamada flat `● nome(alvo)` e o resultado
  escondido.

O alvo é deduzido dos argumentos (`src/card.ts`): requisição HTTP (`MÉTODO
/path`), `storyKey`/`taskId`, `index` + texto, `product` + pergunta, etc. Nada
disso exige mudança nas extensões — é o que permite cardar tools que você não
possui, como as `mcpb_*`.

## Prompt do usuário

O que você digita também ganha a barra, sobre o bloco `userMessageBg` do tema.
O pacote traz o tema `cze` (cópia do `dark` com `userMessageBg` bege,
`#3A342A`) — selecione `cze` em `/settings`.

## Menu do `/`

Busca por escopo: a primeira palavra escolhe o que é buscado.

```
/skill rev        so skills, casando "rev"
/prompt imple     so prompt templates
/pi set           so comandos nativos do pi
/ext todos        so comandos de extensao
/ext jira         por nome do pacote tambem
/ext:jira-flow    so uma extensao
/skill:code       os dois-pontos tambem funcionam
```

Selecionar um item substitui todo o texto do escopo pelo comando, então o
andaime nunca chega no editor. Skills aparecem sem o prefixo `skill:` (o valor
inserido mantém).

Sem escopo, o menu vem agrupado por origem — comandos do pi, skills, prompts e
extensões — e a tag mostra o escopo que você pode digitar:

```
/help                 [/pi] Mostra a lista de comandos
/skill:uso            [/skill] Analisa o uso do produto
/implement            [/prompt] Implementa via chain scout -> planner -> worker
/refinar-issue        [/ext:jira-flow] Puxa um épico do Jira
```

Usa o hook público `ui.addAutocompleteProvider`: muda ordem, `label` e
`description`, nunca o `value` (o que é inserido no editor). Comandos da mesma
extensão ficam juntos, e o retag é idempotente.

## Instalar

```bash
pi install git:github.com/lafco/pi-cze-theme
```

Depois escolha o tema `cze` em `/settings`.

## Estrutura

```
extensions/cze-ui.ts       extensão: chamada das tools nativas + barra no prompt
src/card.ts                primitivos do card (ToolCard, callLine, alvo genérico)
src/tool-card-patch.ts     aplica o card em todas as tools
src/prompt.ts              patch do componente do prompt do usuário
src/command-groups.ts      escopos e agrupamento do menu do /
themes/cze.json            tema: dark com userMessageBg bege
```
