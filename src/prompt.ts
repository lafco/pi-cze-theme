/**
 * Card style for the user's prompts.
 *
 * Same left bar as the tool cards, over the `userMessageBg` block from the
 * active theme (see `themes/cze.json`). The line is rendered two columns
 * narrower and the bar is prepended, so the total width is unchanged.
 *
 * `UserMessageComponent` is native and has no extension hook, so this patches
 * its `render` once. The context is stored on the prototype so a module
 * re-import (for example on `/reload`) does not wrap it twice.
 */

import { UserMessageComponent } from "@earendil-works/pi-coding-agent";

const BAR = "\u258C"; // ▌
const SENTINEL = "\u0000";
const PATCH_FLAG = "__czePromptCard";

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

/** Escape sequence that turns the background on, extracted from theme.bg(). */
function backgroundOn(context: PromptCardContext): string {
	const styled = context.theme.bg("userMessageBg", SENTINEL);
	const index = styled.indexOf(SENTINEL);
	return index > 0 ? styled.slice(0, index) : "";
}

export function installPromptCard(context: PromptCardContext): void {
	const proto = UserMessageComponent.prototype as unknown as PatchedPrototype;

	if (!proto[PATCH_FLAG]) {
		proto[PATCH_FLAG] = true;
		const original = proto.render;
		proto.render = function render(this: unknown, width: number): string[] {
			const current = proto.__czePromptCardContext;
			if (!current || width < 10) return original.call(this, width);
			const inner = Math.max(1, width - 2);
			const lines = original.call(this, inner);
			if (lines.length === 0) return lines;
			const background = backgroundOn(current);
			const bar = current.theme.fg("accent", BAR);
			return lines.map((line) => `${background}${bar} ${line}\x1b[49m`);
		};
	}

	proto.__czePromptCardContext = context;
}
