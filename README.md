# pi-cze-theme

Cards compactos para as tool calls do pi, mais os prompts do usuário no mesmo
estilo.

Cada chamada de tool vira uma linha flat dentro de um card com barra colorida à
esquerda e fundo sutil. O resultado fica escondido por padrão; `ctrl+o`
expande (erros aparecem sempre):

```
▌ ● Read(src/foo.ts)
▌ ● Grep(/TODO/ in src)
▌ ● todo + Ajustar o login
```

A barra segue o estado: accent no sucesso, âmbar enquanto roda, vermelho em
erro. As cores de fundo saem do tema ativo (`toolSuccessBg`, `toolPendingBg`,
`toolErrorBg`).

## Prompt do usuário

O que você digita também ganha a barra, sobre o bloco `userMessageBg` do tema.
O pacote traz o tema `cze` (cópia do `dark` com `userMessageBg` bege,
`#3A342A`) — selecione `cze` em `/settings` para o prompt ficar bege.

Sem o tema `cze`, a barra aparece igual, mas sobre o fundo do tema ativo.

## Instalar

```bash
pi install git:github.com/lafco/pi-cze-theme
```

Depois escolha o tema `cze` em `/settings`.

## O que muda

- `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls` são re-registrados com
  o mesmo nome e `renderShell: "self"`; a execução é delegada às tools
  originais, então o comportamento é idêntico ao do pi padrão.
- Qualquer tool sua pode usar o helper:

```ts
import { toolRenderers, cardify } from "pi-cze-theme/src/card.ts";

// tool sem renderer
pi.registerTool({
  name: "minha_tool",
  ...,
  ...toolRenderers({ name: "MinhaTool", target: (a) => a.path }),
});

// tool que já tem renderers: preserva o conteúdo e só envolve no card
pi.registerTool(cardify({ ...definicao }, { target: (a) => a.id }));
```

## Estrutura

```
extensions/cze-ui.ts   extensão (tools nativas + barra no prompt)
src/card.ts            helper de render (ToolCard, toolRenderers, cardify)
src/prompt.ts          patch do componente do prompt do usuário
themes/cze.json        tema: dark com userMessageBg bege
```
