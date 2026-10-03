#!/usr/bin/env bash
# PreToolUse guard for Bash calls: each sensitive command stays with the role that owns it.
# - merging a PR                     → coordinator only
# - writing the agent-review status  → pr-reviewer only
# - release commands                 → nobody (the human releases)
# A guardrail for agents, not a security boundary: the human and obfuscated commands bypass it.
set -euo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
agent=$(jq -r '.agent_type // ""' <<<"$input")

deny() {
  jq -n --arg reason "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
}

# Heredoc bodies are text (PR comments, commit messages), not commands.
without_heredocs=$(awk '
  delim != "" { line = $0; sub(/^[ \t]+/, "", line); if (line == delim) delim = ""; next }
  { print }
  match($0, /<<-?[ \t]*["'\'']?[A-Za-z_][A-Za-z0-9_]*/) {
    delim = substr($0, RSTART, RLENGTH); sub(/^<<-?[ \t]*["'\'']?/, "", delim)
  }
' <<<"$cmd")
# Quoted strings are arguments too (echo "…", -m "…", --body "…").
unquoted=$(sed -E "s/'[^']*'//g; s/\"([^\"\\\\]|\\\\.)*\"//g" <<<"$without_heredocs")

runs() { grep -Eq -- "$1" <<<"$unquoted"; }
mentions() { grep -Eq -- "$1" <<<"$without_heredocs"; }

if runs '(npm|pnpm|yarn)[[:space:]]+publish|make[[:space:]]+publish|mcp-publisher[[:space:]]+publish|gh[[:space:]]+release[[:space:]]+(create|upload|edit|delete)|git[[:space:]]+tag[[:space:]]+(-[as][[:space:]]+)?v[0-9]|git[[:space:]]+push.*(--tags|[[:space:]]v[0-9]+\.[0-9])'; then
  deny "Release commands (publish, version tags, GitHub releases) are reserved for the human. Report the release as a decision for the coordinator to escalate."
fi

if runs 'gh[[:space:]]+pr[[:space:]]+merge' && [ "$agent" != "coordinator" ]; then
  deny "Only the coordinator merges PRs, once agent-review is success on the head SHA. Report the PR to the coordinator instead."
fi

# Field values are often quoted (-f "context=agent-review"), so this rule looks inside quotes.
if mentions 'statuses' && mentions 'agent-review' && mentions '[[:space:]](-f|-F|--field|--raw-field)[[:space:]]|(-X|--method)[[:space:]]*POST' && [ "$agent" != "pr-reviewer" ]; then
  deny "Only the pr-reviewer agent sets the agent-review status. Ask the coordinator to dispatch pr-reviewer."
fi

exit 0
