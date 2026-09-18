/**
 * Shared card rendering for pi tools.
 *
 * The card is a colored left bar plus a subtle background from the theme
 * (toolPendingBg / toolSuccessBg / toolErrorBg). Two ways to use it:
 *
 * - `toolRenderers({ name, target })` for tools that have no renderers: the call
 *   becomes a flat `● name(target)` line and the result stays hidden until the
 *   user expands it with ctrl+o (errors always show).
 *
 * - `toolRenderers({ name, renderCall, renderResult })` for tools that already
 *   have their own renderers: the existing output is kept and just wrapped in
 *   the card.
 *
 * Put this file outside the auto-discovered extension paths (a subdirectory
 * without an index.ts is not loaded as an extension) and import it relatively.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Container, Text, visibleWidth } from "@earendil-works/pi-tui";

export type CardState = { isPartial?: boolean; isError?: boolean };
export type CardRenderOptions = { expanded: boolean };
export type ToolResult = { content: Array<{ type: string; text?: string }> };
export type ToolRenderContext = { state?: Record<string, unknown>; [key: string]: unknown };
export type RendererMap = {
	renderCall?: (args: any, theme: Theme, context: any) => Component;
	renderResult?: (result: ToolResult, options: CardRenderOptions, theme: Theme, context: any) => Component;
};

const BULLET = "\u25CF"; // ● — no emoji presentation, unlike U+23FA
const ELBOW = "\u23BF"; // ⎿
const BAR = "\u258C"; // ▌

/** Empty component: renders zero lines, used to hide the collapsed result. */
export function blank(): Component {
	return new Container();
}

export function shortenPath(path: string): string {
	const home = process.env.HOME || process.env.USERPROFILE;
	return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export function truncate(text: string, max = 80): string {
	const oneLine = text.replace(/\s+/g, " ").trim();
	return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** First text block of a tool result, if any. */
export function textOf(result: ToolResult): string {
	for (const block of result.content ?? []) {
		if (block.type === "text" && typeof block.text === "string") return block.text;
	}
	return "";
}

/** Best-effort display target when the tool does not declare one. */
function genericTarget(args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const record = args as Record<string, unknown>;
	const preferred = ["path", "subject", "text", "query", "pattern", "command", "name", "id", "storyKey", "taskId", "issueKey", "repo"];
	for (const key of preferred) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return truncate(value, 80);
	}
	const parts: string[] = [];
	for (const [key, value] of Object.entries(record)) {
		if (value === undefined || value === null || typeof value === "object") continue;
		parts.push(`${key}=${String(value)}`);
		if (parts.length >= 3) break;
	}
	return parts.length > 0 ? truncate(parts.join(" "), 80) : undefined;
}

/**
 * Card with a colored left bar and a subtle background.
 *
 * Every line is prefixed with the bar, padded to the full width and then
 * wrapped in the slot background, so call + expanded result read as one block.
 */
export class ToolCard implements Component {
	private readonly child: Component;
	private readonly bar: string;
	private readonly bg: (text: string) => string;

	constructor(child: Component, bar: string, bg: (text: string) => string) {
		this.child = child;
		this.bar = bar;
		this.bg = bg;
	}

	render(width: number): string[] {
		const inner = Math.max(1, width - 2); // bar + space
		return this.child.render(inner).map((line) => {
			const pad = " ".repeat(Math.max(0, inner - visibleWidth(line)));
			return this.bg(`${this.bar} ${line}${pad}`);
		});
	}

	invalidate(): void {
		this.child.invalidate?.();
	}
}

/** Left bar color follows the card state. */
function barFor(theme: Theme, context: CardState): string {
	if (context.isError === true) return theme.fg("error", BAR);
	if (context.isPartial) return theme.fg("warning", BAR);
	return theme.fg("accent", BAR);
}

/** Wrap a child component in the card (colored bar + slot background). */
export function card(theme: Theme, context: CardState, child: Component): Component {
	const slot: "toolPendingBg" | "toolSuccessBg" | "toolErrorBg" = context.isError
		? "toolErrorBg"
		: context.isPartial
			? "toolPendingBg"
			: "toolSuccessBg";
	return new ToolCard(child, barFor(theme, context), (text) => theme.bg(slot, text));
}

/** `● Name(target)` in one flat line. */
export function callLine(theme: Theme, name: string, target?: string, note?: string): Component {
	let text = theme.fg("accent", `${BULLET} `);
	text += theme.bold(theme.fg("toolTitle", name));
	if (target) text += theme.fg("muted", `(${target})`);
	if (note) text += theme.fg("dim", ` ${note}`);
	return new Text(text, 0, 0);
}

/** Expanded output (with `⎿`), or the full error text even when collapsed. */
export function resultBlock(
	result: ToolResult,
	options: CardRenderOptions,
	theme: Theme,
	context: CardState,
): Component {
	const text = textOf(result);
	if (context.isError === true) {
		const lines = text.replace(/\n+$/, "").split("\n");
		const body = lines
			.map((line, i) => (i === 0 ? theme.fg("error", line) : theme.fg("toolOutput", line)))
			.join("\n");
		return card(theme, context, new Text(body || theme.fg("error", "Error"), 0, 0));
	}
	if (!options.expanded || !text.trim()) return blank();
	const lines = text.replace(/\n+$/, "").split("\n");
	const body = lines.map((line) => theme.fg("toolOutput", line)).join("\n  ");
	return card(theme, context, new Text(`${theme.fg("dim", `${ELBOW} `)}${body}`, 0, 0));
}

/**
 * Wrap an existing tool definition so it renders in the card.
 *
 * Use it at the registration site: `pi.registerTool(cardify({ ...definition }))`.
 * The definition keeps its own `renderCall`/`renderResult` (when present they are
 * called and their output wrapped); when absent the tool gets the flat
 * `● name(target)` call with a hidden result.
 */
export function cardify<T extends { name: string } & RendererMap>(
	definition: T,
	spec?: { target?: (args: any) => string | undefined; note?: (args: any) => string | undefined },
) {
	const wrapped = toolRenderers({
		name: definition.name,
		target: spec?.target,
		note: spec?.note,
		renderCall: definition.renderCall
			? (args, theme, context) => definition.renderCall?.(args, theme, context)
			: undefined,
		renderResult: definition.renderResult
			? (result, options, theme, context) => definition.renderResult?.(result, options, theme, context)
			: undefined,
	});
	return { ...definition, ...wrapped };
}

/**
 * Build the card renderers for a tool definition.
 *
 * `renderCall`/`renderResult` are optional. When absent, the tool gets the flat
 * `● name(target)` call with a hidden result. When present, their output is kept
 * and wrapped in the card; `lastComponent` keeps pointing at the component they
 * returned last time, not at the card.
 */
export function toolRenderers(spec: {
	name: string;
	target?: (args: any) => string | undefined;
	note?: (args: any) => string | undefined;
	renderCall?: (args: any, theme: Theme, context: any) => Component;
	renderResult?: (result: ToolResult, options: CardRenderOptions, theme: Theme, context: any) => Component;
}) {
	const keyOf = (slot: "call" | "result") => `__cardInner_${slot}`;
	const innerContext = (context: ToolRenderContext, slot: "call" | "result") => ({
		...context,
		lastComponent: context.state?.[keyOf(slot)],
	});
	const remember = (context: ToolRenderContext, slot: "call" | "result", component: Component) => {
		if (context.state) context.state[keyOf(slot)] = component;
	};

	return {
		renderShell: "self" as const,
		renderCall(args: any, theme: Theme, context: ToolRenderContext): Component {
			const inner = spec.renderCall
				? spec.renderCall(args, theme, innerContext(context, "call"))
				: callLine(theme, spec.name, (spec.target ?? genericTarget)(args), spec.note?.(args));
			remember(context, "call", inner);
			return card(theme, context, inner);
		},
		renderResult(
			result: ToolResult,
			options: CardRenderOptions,
			theme: Theme,
			context: ToolRenderContext,
		): Component {
			if (!spec.renderResult || context.isError === true) {
				return resultBlock(result, options, theme, context);
			}
			const inner = spec.renderResult(result, options, theme, innerContext(context, "result"));
			remember(context, "result", inner);
			return card(theme, context, inner);
		},
	};
}
