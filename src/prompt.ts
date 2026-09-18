/**
 * Card style for the user's prompts.
 *
 * The user message component is native and has no extension hook, so this
 * patches its `render` once. The native component wraps the text in a Box with
 * padding (X and Y), which shows as a lone bar on the blank top line and as an
 * extra column before the text; the patch drops the blank padding lines and the
 * horizontal padding so the prompt lines up with the tool cards:
 *
 *     ▌ texto...            (tool cards: ▌ ● Read(path))
 *
 * The bar color is derived from the theme's `userMessageBg`, darkened, so it
 * reads as part of the card instead of the accent used by the tool cards.
 *
 * The context is stored on the prototype so a module re-import (for example on
 * `/reload`) does not wrap it twice.
 */

import { UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BAR = "\u258C"; // ▌
const SENTINEL = "\u0000";
const PATCH_FLAG = "__czePromptCard";
const OSC_PREFIX = /^(?:\x1b\][^\x07]*\x07)+/;
const ANSI = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;
const SGR_RUN = /^(?:\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07)/;
const BG_RGB = /48;2;(\d+);(\d+);(\d+)m/;
const RESET_BG = "\x1b[49m";
const FALLBACK_BAR = "\x1b[38;2;41;36;29m"; // dark beige, when the bg is not truecolor

export type PromptCardContext = {
	theme: {
		fg(color: string, text: string): string;
		bg(color: string, text: string): string;
	};
};

type PatchedPrototype = {
	render(width: number): string[];
	[PATCH_FLAG]?: boolean;
	__czePromptCardContext?: PromptCardContext;
};

function plain(line: string): string {
	return line.replace(ANSI, "");
}

/** Escape sequence that turns the background on, extracted from theme.bg(). */
function backgroundOn(context: PromptCardContext): string {
	const styled = context.theme.bg("userMessageBg", SENTINEL);
	const index = styled.indexOf(SENTINEL);
	return index > 0 ? styled.slice(0, index) : "";
}

/** Bar color: the card background, darkened. */
function barFor(context: PromptCardContext): string {
	const match = BG_RGB.exec(backgroundOn(context));
	if (!match) return FALLBACK_BAR;
	const [r, g, b] = [1, 2, 3].map((i) => Math.round(Number(match[i]) * 0.7));
	return `\x1b[38;2;${r};${g};${b}m`;
}

/** Remove the first visible character when it is a space (the Box padding). */
function stripLeadingSpace(line: string): string {
	let index = 0;
	while (index < line.length && line[index] === "\x1b") {
		const match = SGR_RUN.exec(line.slice(index));
		if (!match) break;
		index += match[0].length;
	}
	return line[index] === " " ? line.slice(0, index) + line.slice(index + 1) : line;
}

/** Pad or truncate to an exact visible width, keeping the background. */
function fit(line: string, target: number): string {
	const width = visibleWidth(line);
	if (width === target) return line;
	if (width > target) return truncateToWidth(line, target, "");
	const index = line.lastIndexOf(RESET_BG);
	const pad = " ".repeat(target - width);
	return index >= 0 ? line.slice(0, index) + pad + line.slice(index) : line + pad;
}

export function installPromptCard(context: PromptCardContext): void {
	const proto = UserMessageComponent.prototype as unknown as PatchedPrototype;

	if (!proto[PATCH_FLAG]) {
		proto[PATCH_FLAG] = true;
		const original = proto.render;
		proto.render = function render(this: unknown, width: number): string[] {
			const current = proto.__czePromptCardContext;
			if (!current || width < 10) return original.call(this, width);

			// One column is handed back to the bar; the Box pads X (1) and Y (1).
			const raw = original.call(this, Math.max(1, width - 1));
			if (raw.length === 0) return raw;

			const first = raw[0]?.match(OSC_PREFIX)?.[0] ?? "";
			const last = raw[raw.length - 1]?.match(OSC_PREFIX)?.[0] ?? "";
			const body = raw.map((line, i) => {
				let value = line;
				if (i === 0) value = value.slice(first.length);
				if (i === raw.length - 1) value = value.slice(last.length);
				return stripLeadingSpace(value);
			});

			// Drop the Box vertical padding (blank lines).
			let start = 0;
			let end = body.length - 1;
			while (start < end && plain(body[start]).trim() === "") start++;
			while (end > start && plain(body[end]).trim() === "") end--;
			const kept = body.slice(start, end + 1);

			const background = backgroundOn(current);
			const painted = `${barFor(current)}${BAR}\x1b[39m`;
			return kept.map((line, i) => {
				const prefix = i === 0 ? first : i === kept.length - 1 ? last : "";
				return `${prefix}${background}${painted} ${fit(line, width - 2)}${RESET_BG}`;
			});
		};
	}

	proto.__czePromptCardContext = context;
}
