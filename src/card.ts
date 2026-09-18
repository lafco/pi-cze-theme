/**
 * Card primitives.
 *
 * The card is a colored left bar plus a subtle background from the theme
 * (toolPendingBg / toolSuccessBg / toolErrorBg). Nothing here is wired to a
 * specific tool: `src/tool-card-patch.ts` applies the card to every tool by
 * patching `ToolExecutionComponent`, so extensions never import this module.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Container, Text, visibleWidth } from "@earendil-works/pi-tui";

export type CardState = { isPartial?: boolean; isError?: boolean };
export type CardRenderOptions = { expanded: boolean };
export type ToolResult = { content: Array<{ type: string; text?: string }> };

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

export function truncate(text: string, max = 90): string {
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

function str(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/**
 * Best-effort display target for a tool that does not declare one, covering the
 * common arg shapes (HTTP request, story/task keys, index + query).
 */
export function genericTarget(args: unknown): string | undefined {
	const base = baseTarget(args);
	if (!base) return undefined;
	const dryRun = args && typeof args === "object" && (args as Record<string, unknown>).dryRun === true;
	return truncate(dryRun ? `${base} dryRun` : base);
}

function baseTarget(args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const record = args as Record<string, unknown>;

	const path = str(record.path);
	if (path) return [str(record.method), path].filter(Boolean).join(" ");

	const story = str(record.storyKey) || str(record.issueKey);
	const task = str(record.taskId);
	const ids = Array.isArray(record.taskIds) ? record.taskIds.filter((id) => typeof id === "string") : [];
	if (story || task || ids.length > 0) {
		const wave = typeof record.wave === "number" ? ` wave ${record.wave}` : "";
		const batch = ids.length > 0 ? ` [${ids.join(", ")}]` : "";
		return [story, task].filter(Boolean).join(" ") + batch + wave;
	}

	const product = str(record.product);
	const ask = str(record.question) || str(record.query) || str(record.text);
	if (product) return [product, ask && `"${ask}"`].filter(Boolean).join(" ");

	const index = str(record.index);
	const text = str(record.text);
	if (index || text) return [index, text && `"${text}"`].filter(Boolean).join(" ");

	for (const key of ["subject", "pergunta", "query", "question", "pattern", "name", "id", "repo", "reason"]) {
		const value = str(record[key]);
		if (value) return value;
	}

	const parts: string[] = [];
	for (const [key, value] of Object.entries(record)) {
		if (value === undefined || value === null || typeof value === "object") continue;
		parts.push(`${key}=${String(value)}`);
		if (parts.length >= 3) break;
	}
	return parts.length > 0 ? parts.join(" ") : undefined;
}

/**
 * Card with a colored left bar and a subtle background.
 *
 * Every line is prefixed with the bar, padded to the full width and then
 * wrapped in the slot background, so call + result read as one block.
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
		return new Text(body || theme.fg("error", "Error"), 0, 0);
	}
	if (!options.expanded || !text.trim()) return blank();
	const lines = text.replace(/\n+$/, "").split("\n");
	const body = lines.map((line) => theme.fg("toolOutput", line)).join("\n  ");
	return new Text(`${theme.fg("dim", `${ELBOW} `)}${body}`, 0, 0);
}
