# pi-cze-theme

Cards compactos para as tool calls do pi.

Cada chamada vira uma linha flat dentro de um card com barra colorida à
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

## Instalar

```bash
pi install git:github.com/lafco/pi-cze-theme
```

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
extensions/cze-ui.ts   extensão (re-registra as tools nativas)
src/card.ts            helper de render (ToolCard, toolRenderers, cardify)
```
