/**
 * cze-ui — card style for pi.
 *
 * The card itself is applied to every tool by `src/tool-card-patch.ts`. This
 * file only:
 *
 * - gives the built-in tools a nicer call line (path/range, command, diff);
 * - patches the user prompt to show the same left bar.
 *
 * Execution is untouched: the built-ins are re-registered with the same names
 * and delegate to the original implementations via createXTool(ctx.cwd).
 */

import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	type ExtensionAPI,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { blank, callLine, shortenPath, truncate } from "../src/card.ts";
import { installPromptCard } from "../src/prompt.ts";
import { installToolCards } from "../src/tool-card-patch.ts";

const ELBOW = "\u23BF"; // ⎿

export default function (pi: ExtensionAPI) {
	// Every tool gets the card (see the module docstring).
	installToolCards();

	// Left bar on the user's prompts, over the theme's `userMessageBg`.
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		installPromptCard(ctx.ui);
	});

	const cache = new Map<string, ReturnType<typeof build>>();

	function build(cwd: string) {
		return {
			read: createReadTool(cwd),
			bash: createBashTool(cwd),
			edit: createEditTool(cwd),
			write: createWriteTool(cwd),
			grep: createGrepTool(cwd),
			find: createFindTool(cwd),
			ls: createLsTool(cwd),
		};
	}

	function toolsFor(cwd: string) {
		let tools = cache.get(cwd);
		if (!tools) {
			tools = build(cwd);
			cache.set(cwd, tools);
		}
		return tools;
	}

	// read -------------------------------------------------------------------
	pi.registerTool({
		name: "read",
		label: "read",
		description: toolsFor(process.cwd()).read.description,
		parameters: toolsFor(process.cwd()).read.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return toolsFor(ctx.cwd).read.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args, theme) {
			const path = shortenPath(args.path ?? "");
			const range =
				args.offset !== undefined || args.limit !== undefined
					? `:${args.offset ?? 1}${args.limit !== undefined ? `-${(args.offset ?? 1) + args.limit - 1}` : ""}`
					: "";
			return callLine(theme, "Read", `${path}${range}`);
		},
	});

	// bash -------------------------------------------------------------------
	pi.registerTool({
		name: "bash",
		label: "bash",
		description: toolsFor(process.cwd()).bash.description,
		parameters: toolsFor(process.cwd()).bash.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return toolsFor(ctx.cwd).bash.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args, theme) {
			return callLine(theme, "Bash", truncate(args.command ?? "", 100));
		},
	});

	// edit -------------------------------------------------------------------
	pi.registerTool({
		name: "edit",
		label: "edit",
		description: toolsFor(process.cwd()).edit.description,
		parameters: toolsFor(process.cwd()).edit.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return toolsFor(ctx.cwd).edit.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args, theme) {
			const count = args.edits?.length ?? 0;
			return callLine(theme, "Edit", shortenPath(args.path ?? ""), count > 1 ? `(${count} edits)` : undefined);
		},
		renderResult(result, options, theme) {
			const details = result.details as { diff?: string } | undefined;
			if (!options.expanded || !details?.diff) return blank();
			const body = details.diff
				.split("\n")
				.filter((line) => !line.startsWith("+++") && !line.startsWith("---") && !line.startsWith("@@"))
				.map((line) => {
					if (line.startsWith("+")) return theme.fg("toolDiffAdded", line);
					if (line.startsWith("-")) return theme.fg("toolDiffRemoved", line);
					return theme.fg("toolDiffContext", line);
				})
				.join("\n  ");
			return new Text(`${theme.fg("dim", `${ELBOW} `)}${body}`, 0, 0);
		},
	});

	// write ------------------------------------------------------------------
	pi.registerTool({
		name: "write",
		label: "write",
		description: toolsFor(process.cwd()).write.description,
		parameters: toolsFor(process.cwd()).write.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return toolsFor(ctx.cwd).write.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args, theme) {
			const lines = args.content ? args.content.split("\n").length : 0;
			return callLine(theme, "Write", shortenPath(args.path ?? ""), lines ? `${lines} lines` : undefined);
		},
	});

	// grep -------------------------------------------------------------------
	pi.registerTool({
		name: "grep",
		label: "grep",
		description: toolsFor(process.cwd()).grep.description,
		parameters: toolsFor(process.cwd()).grep.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return toolsFor(ctx.cwd).grep.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args, theme) {
			return callLine(theme, "Grep", `/${args.pattern ?? ""}/ in ${args.path ? shortenPath(args.path) : "."}`);
		},
	});

	// find -------------------------------------------------------------------
	pi.registerTool({
		name: "find",
		label: "find",
		description: toolsFor(process.cwd()).find.description,
		parameters: toolsFor(process.cwd()).find.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return toolsFor(ctx.cwd).find.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args, theme) {
			return callLine(theme, "Find", `${args.pattern ?? ""} in ${args.path ? shortenPath(args.path) : "."}`);
		},
	});

	// ls ---------------------------------------------------------------------
	pi.registerTool({
		name: "ls",
		label: "ls",
		description: toolsFor(process.cwd()).ls.description,
		parameters: toolsFor(process.cwd()).ls.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return toolsFor(ctx.cwd).ls.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args, theme) {
			return callLine(theme, "Ls", shortenPath(args.path ?? "."));
		},
	});
}
