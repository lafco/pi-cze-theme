/**
 * Applies the card to every tool.
 *
 * Tools registered by other extensions cannot be re-registered from here: each
 * extension owns its `tools` map and `pi.getAllTools()` does not expose
 * `execute` or the renderers. The only way to reach tools we do not own (for
 * example the `mcpb_*` ones) is the rendering component itself, so this patches
 * `ToolExecutionComponent`:
 *
 * - tools with `renderCall`/`renderResult` keep their content and get wrapped
 *   in the card;
 * - tools without them get the flat `● name(target)` call and a hidden result
 *   (ctrl+o expands, errors always show).
 *
 * The patch is installed once (flag on the prototype) and is a no-op if the
 * component shape changes: every step is guarded.
 */

import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { blank, callLine, card, genericTarget, resultBlock, ToolCard } from "./card.ts";

const PATCH_FLAG = "__czeToolCard";
const INNER_PREFIX = "__czeInner_";

type Renderer = (args: any, theme: Theme, context: any) => unknown;
type ResultRenderer = (result: any, options: any, theme: Theme, context: any) => unknown;

type Patchable = {
	[PATCH_FLAG]?: boolean;
	toolName?: string;
	toolDefinition?: { renderCall?: Renderer; renderResult?: ResultRenderer; [key: string]: unknown };
	getCallRenderer?(): Renderer | undefined;
	getResultRenderer?(): ResultRenderer | undefined;
	getRenderShell?(): string;
};

function innerContext(context: any, slot: "call" | "result"): any {
	return { ...context, lastComponent: context?.state?.[`${INNER_PREFIX}${slot}`] };
}

function keep(context: any, slot: "call" | "result", component: unknown): void {
	if (context?.state) context.state[`${INNER_PREFIX}${slot}`] = component;
}

export function installToolCards(): void {
	const proto = ToolExecutionComponent.prototype as unknown as Patchable;
	if (proto[PATCH_FLAG]) return;
	if (typeof proto.getCallRenderer !== "function" || typeof proto.getResultRenderer !== "function") return;
	proto[PATCH_FLAG] = true;

	const originalCall = proto.getCallRenderer;
	const originalResult = proto.getResultRenderer;
	const originalShell = proto.getRenderShell;

	if (typeof originalShell === "function") {
		proto.getRenderShell = function getRenderShell(this: Patchable): string {
			// The card draws its own framing; the built-in Box would add a
			// second background plus vertical padding.
			if (this.toolDefinition) return "self";
			return originalShell.call(this);
		};
	}

	proto.getCallRenderer = function getCallRenderer(this: Patchable): Renderer {
		const existing = originalCall.call(this);
		const name = this.toolName ?? "";
		return (args: any, theme: Theme, context: any) => {
			const inner = existing ? existing(args, theme, innerContext(context, "call")) : callLine(theme, name, genericTarget(args));
			const component = (inner as any) ?? blank();
			if (component instanceof ToolCard) return component;
			keep(context, "call", component);
			return card(theme, context, component);
		};
	};

	proto.getResultRenderer = function getResultRenderer(this: Patchable): ResultRenderer {
		const existing = originalResult.call(this);
		return (result: any, options: any, theme: Theme, context: any) => {
			if (!existing || context?.isError === true) {
				return resultBlock(result, options, theme, context);
			}
			const inner = existing(result, options, theme, innerContext(context, "result"));
			const component = (inner as any) ?? blank();
			if (component instanceof ToolCard) return component;
			keep(context, "result", component);
			return card(theme, context, component);
		};
	};
}
