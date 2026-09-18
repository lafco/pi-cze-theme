/**
 * Grouping for the `/` command menu.
 *
 * pi builds the menu as a flat list: built-in commands, prompt templates,
 * extension commands and skills (`skill:<name>`), in that order, and encodes the
 * origin as a tag on the description ("[u]", "[p:git:github.com/owner/repo]").
 *
 * This wraps the autocomplete provider (public API, `ui.addAutocompleteProvider`)
 * and rewrites the suggestions: groups first, readable tag on the description,
 * and commands from the same extension kept together. Filtering, selection and
 * insertion stay with the base provider — only `label`/`description`/order change,
 * never `value`.
 *
 *     /help                 [pi] Mostra a lista de comandos
 *     /model                [pi] Seleciona o modelo
 *     /skill:uso            [skill] Analisa o uso do produto
 *     /refinar-issue        [jira-flow] Refina uma issue do Jira
 *
 * The rewrite is idempotent (strips the tag it finds, adds its own), so being
 * applied twice — wrapper registered again on reload/session switch — converges
 * to the same result.
 */

import type { SlashCommandInfo, AutocompleteProviderFactory } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

/** Order of the groups in the menu. */
const RANK = { pi: 0, skill: 1, prompt: 2, extension: 3 } as const;

type Ranked = {
	item: AutocompleteItem;
	rank: number;
	tag: string;
	index: number;
};

function lastSegment(value: string): string {
	return (
		value
			.replace(/@[^/@]*$/, "")
			.split(/[?#]/)[0]
			?.replace(/\.git$/, "")
			.split("/")
			.filter(Boolean)
			.pop() ?? ""
	);
}

/** Short label for where an extension command came from. */
function packageName(info: SlashCommandInfo["sourceInfo"] | undefined): string {
	const source = info?.source?.trim() ?? "";
	const path = info?.path ?? "";

	// "git:host/owner/repo@ref" -> repo, "npm:pkg" -> pkg.
	if (/^(npm|git):/i.test(source)) {
		const name = lastSegment(source.replace(/^[a-z0-9_-]+:/i, ""));
		if (name) return name;
	}

	// Inline packages have a synthetic path: "<inline:llama.cpp>".
	const inline = /^<([^>]+)>$/.exec(path);
	if (inline?.[1]) return lastSegment(inline[1].replace(/^[a-z0-9_-]+:/i, "")) || "ext";

	// Local extension: the directory that holds it (jira-flow/index.ts -> jira-flow),
	// or the file name for single-file extensions (extensions/todo.ts -> todo).
	const directory = lastSegment(path.replace(/\/[^/]*$/, ""));
	if (directory && directory !== "extensions") return directory;
	const file = lastSegment(path).replace(/\.[^.]+$/, "");
	if (file) return file;

	return lastSegment(source.replace(/^[a-z0-9_-]+:/i, "")) || "ext";
}

function groupOf(info: SlashCommandInfo | undefined): { rank: number; tag: string } {
	if (!info) return { rank: RANK.pi, tag: "pi" };
	if (info.source === "skill") return { rank: RANK.skill, tag: "skill" };
	if (info.source === "prompt") return { rank: RANK.prompt, tag: "prompt" };
	return { rank: RANK.extension, tag: packageName(info.sourceInfo) };
}

/**
 * Replace the origin tag with a readable one. The description from
 * `getCommands()` is the authority, since it never carries a tag — pi's own
 * provider only tags its copy, possibly after the argument hint
 * ("<KEY> — [u] desc"). Only the part before the description is cleaned, so
 * wrapping twice (reload, new session) converges instead of stacking tags.
 */
function retag(
	description: string | undefined,
	info: SlashCommandInfo | undefined,
	tag: string,
): string | undefined {
	const text = description ?? "";
	// Built-in commands are never tagged by pi's provider, so only our own tag
	// (if a previous wrap added it) is removed.
	if (!info) {
		const marker = `[${tag}]`;
		const body = text.startsWith(marker) ? text.slice(marker.length).trimStart() : text;
		return body ? `${marker} ${body}` : marker;
	}

	const raw = info.description ?? "";
	const head = (raw && text.endsWith(raw) ? text.slice(0, text.length - raw.length) : text)
		.replace(/\[[^\]]*\]\s?$/, "")
		.replace(/\s*—\s*$/, "")
		.trim();
	const body = raw ? (head ? `${head} — ${raw}` : raw) : head;
	return body ? `[${tag}] ${body}` : `[${tag}]`;
}

export function groupCommands(getCommands: () => SlashCommandInfo[]): AutocompleteProviderFactory {
	return (current: AutocompleteProvider): AutocompleteProvider => {
		// Prototype chain, so every other provider member keeps working.
		const wrapped = Object.create(current) as AutocompleteProvider;

		wrapped.getSuggestions = async (lines, cursorLine, cursorCol, options) => {
			const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
			if (!suggestions || !suggestions.prefix.startsWith("/")) return suggestions;

			let known: Map<string, SlashCommandInfo>;
			try {
				known = new Map(getCommands().map((command) => [command.name, command]));
			} catch {
				return suggestions;
			}

			const ranked: Ranked[] = suggestions.items.map((item, index) => {
				const info = known.get(item.value);
				const group = groupOf(info);
				return {
					item: { ...item, description: retag(item.description, info, group.tag) },
					rank: group.rank,
					tag: group.tag,
					index,
				};
			});

			ranked.sort((a, b) => a.rank - b.rank || a.tag.localeCompare(b.tag) || a.index - b.index);
			return { ...suggestions, items: ranked.map((entry) => entry.item) };
		};

		return wrapped;
	};
}
