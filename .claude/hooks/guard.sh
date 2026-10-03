#!/usr/bin/env bash
# PreToolUse guard for Bash calls: each sensitive command stays with the role that owns it.
# - `gh pr merge`               → coordinator only
# - writing the agent-review status → pr-reviewer only
# - release commands             → nobody (the human releases)
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

matches() { grep -Eq -- "$1" <<<"$cmd"; }

if matches '(npm|pnpm|yarn)[[:space:]]+publish|make[[:space:]]+publish|mcp-publisher[[:space:]]+publish|gh[[:space:]]+release[[:space:]]+(create|upload|edit|delete)|git[[:space:]]+tag[[:space:]]+(-[as][[:space:]]+)?v[0-9]|git[[:space:]]+push.*(--tags|[[:space:]]v[0-9]+\.[0-9])'; then
  deny "Release commands (publish, version tags, GitHub releases) are reserved for the human. Report the release as a decision for the coordinator to escalate."
fi

if matches 'gh[[:space:]]+pr[[:space:]]+merge' && [ "$agent" != "coordinator" ]; then
  deny "Only the coordinator merges PRs, once agent-review is success on the head SHA. Report the PR to the coordinator instead."
fi

if matches 'statuses' && matches 'agent-review' && matches '[[:space:]](-f|-F|--field|--raw-field)[[:space:]]|(-X|--method)[[:space:]]*POST' && [ "$agent" != "pr-reviewer" ]; then
  deny "Only the pr-reviewer agent sets the agent-review status. Ask the coordinator to dispatch pr-reviewer."
fi

exit 0
