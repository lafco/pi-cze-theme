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
themes/cze.json            tema: dark com userMessageBg bege
```
