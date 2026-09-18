/**
 * Scoped search and grouping for the `/` command menu.
 *
 * pi builds the menu as a flat list: built-in commands, prompt templates,
 * extension commands and skills (`skill:<name>`), and hides the origin in an
 * unreadable tag on the description ("[u]", "[p:git:github.com/owner/repo]").
 *
 * This wraps the autocomplete provider (public API, `ui.addAutocompleteProvider`)
 * and adds two things:
 *
 * 1. Scoped search — the first word selects what is searched:
 *
 *        /skill rev        only skills, matching "rev"
 *        /prompt imple     only prompt templates
 *        /pi set           only pi's built-in commands
 *        /ext todos        only extension commands
 *        /ext:jira-flow    only one extension's commands
 *        /skill:code       colon also works, matching "code"
 *
 *    Selecting an item replaces the whole scope text with the command, so the
 *    scaffolding never reaches the editor. Skills drop the `skill:` prefix from
 *    the displayed name (the inserted value keeps it).
 *
 * 2. Labels on the unscoped menu — order by group, readable tag showing the
 *    scope you can type:
 *
 *        /help                 [/pi] Mostra a lista de comandos
 *        /skill:uso            [/skill] Analisa o uso do produto
 *        /implement            [/prompt] Implementa via chain scout -> planner
 *        /refinar-issue        [/ext:jira-flow] Puxa um épico do Jira
 *
 * Only order, `label` and `description` change; `value` (what gets inserted) is
 * untouched. The rewrite is idempotent, so being applied twice — wrapper
 * registered again on reload or session switch — converges instead of stacking
 * tags.
 */

import type { SlashCommandInfo, AutocompleteProviderFactory } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

/** Order of the groups in the unscoped menu. */
const RANK = { pi: 0, skill: 1, prompt: 2, extension: 3 } as const;

/** First word of the input -> what it searches. */
const KEYWORDS: Record<string, Group> = {
	pi: "pi",
	sys: "pi",
	system: "pi",
	skill: "skill",
	skills: "skill",
	prompt: "prompt",
	prompts: "prompt",
	ext: "extension",
	extension: "extension",
	extensions: "extension",
};

/**
 * Shortest prefix accepted before the keyword is complete. Below this, a partial
 * word is left alone so `/ex` keeps meaning the fuzzy search for `explain` and
 * `export` instead of jumping into the extension scope.
 */
const MIN_PREFIX = 3;

const SCOPE = /^\/([a-z]+)(?::([^\s]*))?(?:\s+([\s\S]*))?$/i;

type Group = "pi" | "skill" | "prompt" | "extension";

/**
 * Which scope a first word selects. Complete keywords always work (`/pi`); a
 * partial word works from `MIN_PREFIX` on (`/prom`, `/promp`, `/ski`), as long as
 * it does not fit two groups at once (`/p` is both pi and prompt, so it is left
 * to the fuzzy search).
 */
function resolveGroup(word: string): Group | null {
	const key = word.toLowerCase();
	const exact = KEYWORDS[key];
	if (exact) return exact;
	if (key.length < MIN_PREFIX) return null;
	const groups = new Set<Group>();
	for (const [keyword, group] of Object.entries(KEYWORDS)) {
		if (keyword.startsWith(key)) groups.add(group);
	}
	return groups.size === 1 ? [...groups][0] ?? null : null;
}

type Scope = {
	group: Group;
	/** Package filter, only for `ext:<pacote>`. */
	pkg?: string;
	/** Text to match inside the scope. */
	query: string;
};

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

/** Short name for where an extension command came from. */
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

/** Which group a command belongs to. A command missing from `getCommands()` is a built-in. */
function groupOf(info: SlashCommandInfo | undefined): Group {
	if (!info) return "pi";
	if (info.source === "skill") return "skill";
	if (info.source === "prompt") return "prompt";
	return "extension";
}

/** Tag shown on the unscoped menu: the scope the user can type. */
function tagOf(info: SlashCommandInfo | undefined): string {
	const group = groupOf(info);
	if (group === "extension") return `/ext:${packageName(info?.sourceInfo)}`;
	return `/${group}`;
}

function inScope(info: SlashCommandInfo | undefined, scope: Scope): boolean {
	if (groupOf(info) !== scope.group) return false;
	if (scope.pkg) {
		// Prefix, so "/ext:jir" already narrows to jira-flow.
		return packageName(info?.sourceInfo).toLowerCase().startsWith(scope.pkg.toLowerCase());
	}
	return true;
}

/**
 * Replace the tag with a readable one on the unscoped menu. The description from
 * `getCommands()` is the authority, since it never carries a tag — pi's own
 * provider only tags its copy, possibly after the argument hint
 * ("<KEY> — [u] desc"). Only the part before the description is cleaned, so
 * wrapping twice converges instead of stacking tags.
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

/** Inside a scope the group is known: drop the tag and the `skill:` prefix. */
function scopedItem(item: AutocompleteItem, info: SlashCommandInfo | undefined): AutocompleteItem {
	const label = item.value.startsWith("skill:") ? item.value.slice("skill:".length) : item.label;
	const description = info?.description ?? item.description;
	return { value: item.value, label, ...(description && { description }) };
}

export function groupCommands(getCommands: () => SlashCommandInfo[]): AutocompleteProviderFactory {
	return (current: AutocompleteProvider): AutocompleteProvider => {
		// Prototype chain, so every other provider member keeps working.
		const wrapped = Object.create(current) as AutocompleteProvider;

		wrapped.getSuggestions = async (lines, cursorLine, cursorCol, options) => {
			const typed = (lines[cursorLine] ?? "").slice(0, cursorCol);
			const scope = lines.length === 1 && typed.startsWith("/") ? parseScope(typed) : null;

			let commands: Map<string, SlashCommandInfo>;
			try {
				commands = new Map(getCommands().map((command) => [command.name, command]));
			} catch {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			if (scope) {
				// Ask the provider to fuzzy-match the query, then keep one group.
				const query = scope.query.trim();
				const probe = `/${query}`;
				const suggestions = await current.getSuggestions([probe], 0, probe.length, options);
				const collect = (items: AutocompleteItem[] | undefined): AutocompleteItem[] =>
					(items ?? [])
						.filter((item) => inScope(commands.get(item.value), scope))
						.map((item) => scopedItem(item, commands.get(item.value)));

				let items = collect(suggestions?.items);
				// `/ext jira` should also find the extension by its package name,
				// not only by command name.
				if (items.length === 0 && scope.group === "extension" && query) {
					const all = await current.getSuggestions(["/"], 0, 1, options);
					const wanted = query.toLowerCase();
					items = collect(
						all?.items.filter((item) =>
							packageName(commands.get(item.value)?.sourceInfo).toLowerCase().startsWith(wanted),
						),
					);
				}

				if (items.length === 0) return null;
				// The whole scope text is the prefix, so selecting a command
				// replaces it instead of inserting alongside it.
				return { items, prefix: typed };
			}

			const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
			if (!suggestions || !suggestions.prefix.startsWith("/")) return suggestions;

			const ranked: Ranked[] = suggestions.items.map((item, index) => {
				const info = commands.get(item.value);
				const tag = tagOf(info);
				return {
					item: { ...item, description: retag(item.description, info, tag) },
					rank: RANK[groupOf(info)],
					tag,
					index,
				};
			});

			ranked.sort((a, b) => a.rank - b.rank || a.tag.localeCompare(b.tag) || a.index - b.index);
			return { ...suggestions, items: ranked.map((entry) => entry.item) };
		};

		return wrapped;
	};
}

/** `/skill rev` -> { group: "skill", query: "rev" }, `/ext:jira` -> { group: "extension", pkg: "jira" }. */
function parseScope(typed: string): Scope | null {
	const match = SCOPE.exec(typed);
	if (!match?.[1]) return null;
	const group = resolveGroup(match[1]);
	if (!group) return null;
	const colon = match[2] ?? "";
	const rest = match[3] ?? "";
	// For `ext` the colon names the package; elsewhere it is part of the query.
	const query = group === "extension" ? rest : [colon, rest].filter(Boolean).join(" ");
	return { group, pkg: group === "extension" ? colon || undefined : undefined, query };
}
