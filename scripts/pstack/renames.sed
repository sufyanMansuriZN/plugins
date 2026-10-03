# Mechanical renames applied to every .md/.sh/.ts/.mjs file (sed -E).
# Only one-to-one substitutions that are safe in any context belong here.
# Anything that changes meaning goes in patches/ (authored against this output).

# --- models: upstream family -> Claude tier, any version or effort suffix ---
# Families are matched by shape, so an upstream model bump keeps mapping.
# gpt needs a -variant suffix: `gpt-4o` in example prose is not a model choice.
s/\bclaude-opus-[0-9]+([.-][0-9]+)*(-[a-z]+)*/opus/g
s/\bgpt-[0-9]+(\.[0-9]+)*(-[a-z]+)+/fable/g
s/\bgrok-[0-9]+(\.[0-9]+)*(-[a-z]+)*/sonnet/g

# --- model config: Cursor rule file -> user memory file ---
s#~/\.cursor/rules/pstack-models\.mdc#~/.claude/pstack-models.md#g
s#the `pstack-models\.mdc` rule#`~/.claude/pstack-models.md`#g
s#pstack-models\.mdc#pstack-models.md#g
s#If the rule or (that|the) line is missing#If the file or \1 line is missing#g
s#\binherit-parent\b#inherit#g

# --- tools ---
s/\bAskQuestion\b/AskUserQuestion/g
s/`Task`/`Agent`/g
s/\bTask (tool|subagent|schema|`model`)/Agent \1/g
s/\bgeneralPurpose\b/general-purpose/g
s/subagent_type: "Comment Sicko"/subagent_type: "comment-sicko"/g
s/\btodolist\b/todo list/g

# --- Cursor built-ins -> Claude Code equivalents ---
s/the \*\*create-skill\*\* skill \(Cursor's built-in for authoring SKILL\.md files\)/the **skill-creator** skill (for authoring SKILL.md files)/g
s/Cursor's built-in `create-skill`( skill)?/the `skill-creator` skill/g
s/Cursor's `\/loop` command \(a built-in, not a pstack skill\)/the `\/loop` command (a Claude Code built-in, not a pstack skill)/g
s/Cursor's `\/loop` command/the `\/loop` command/g
s/\bCursor restart\b/session restart/g

# --- cursor-team-kit skills are vendored into this plugin ---
s/the `deslop` skill from the `cursor-team-kit` plugin/the `deslop` skill/g
s/`cursor-team-kit` publishes `control-cli`/pstack ships `control-cli`/g
s/ \(from `cursor-team-kit`\)//g
s/ from `cursor-team-kit`//g

# --- Cursor skill and plugin dirs -> Claude Code dirs ---
s#\.cursor/skills/#.claude/skills/#g
s#\.cursor/plugins/#.claude/plugins/#g

# --- skill and agent names must be kebab-case for Claude Code ---
s/^name: Poteto Mode$/name: poteto-mode/
s/^name: Comment Sicko$/name: comment-sicko/

# --- bare names another enabled plugin also ships (see NOTES.md) ---
s/\*\*(tdd|teach)\*\* skill/**pstack:\1** skill/g
s#(^|[^:/A-Za-z0-9_.-])/(tdd|teach)\b#\1/pstack:\2#g
