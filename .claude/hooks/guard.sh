#!/usr/bin/env bash
# PreToolUse guard for Bash calls: each sensitive command stays with the role that owns it.
# - merging a PR                     → coordinator only
# - writing the agent-review status  → pr-reviewer only
# - release commands                 → nobody (the human releases)
# A guardrail for agents, not a security boundary: the human and obfuscated commands bypass it.
# Fails closed: if the hook itself breaks, exit 2 blocks the command.
set -euo pipefail
trap 'echo "guard hook failed; blocking to stay safe" >&2; exit 2' ERR

for tool in jq perl; do
  command -v "$tool" >/dev/null || { echo "guard hook needs $tool on PATH" >&2; exit 2; }
done

input=$(cat)
raw=$(jq -r '.tool_input.command // ""' <<<"$input")
agent=$(jq -r '.agent_type // ""' <<<"$input")

deny() {
  jq -n --arg reason "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
}

# Remove what is text rather than command, so PR comments and commit messages may quote commands:
# heredoc bodies (unless fed to a shell), message/body/title arguments, and echo/printf arguments.
# Everything else stays, including `sh -c "…"`, `bash -c '…'` and `$(…)`, which the shell runs.
cmd=$(perl -0777 -pe '
  s{^([^\n]*?)(?<!<)<<(?!<)-?[ \t]*([\x27"]?)(\w+)\2([^\n]*)\n.*?^[ \t]*\3[ \t]*$}{
    my ($whole, $line) = ($&, "$1$4");
    $line =~ /(?:^|[\s|;&(])(?:ba|z|da)?sh(?:\s|$)/ ? $whole : $line
  }gsme;
  my $q = qr/"(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27/s;
  s/((?:^|\s)(?:-[a-zA-Z]*m|--message|--body|-b|--title|-t|--notes)(?:\s+|=))$q/$1""/g;
  s/((?:^|[;&|(]|\s)(?:echo|printf)\s+)$q/$1""/g;
' <<<"$raw")

runs() { grep -Eq -- "$1" <<<"$cmd"; }

release='(npm|pnpm|yarn)[[:space:]]+(publish|version)'
release+='|make[[:space:]]+publish([[:space:]]|$)'
release+='|mcp-publisher[[:space:]]+publish'
release+='|gh[[:space:]][^;&|]*release[[:space:]]+(create|upload|edit|delete)'
release+='|git[[:space:]]+tag[[:space:]][^;&|]*v[0-9]'
release+='|git[[:space:]]+push[^;&|]*(--tags|--follow-tags|refs/tags/|[[:space:]]v[0-9]+\.[0-9])'
if runs "$release" && ! runs 'git[[:space:]]+tag[[:space:]]+(-l|--list)([[:space:]]|$)'; then
  deny "Release commands (version bump, publish, version tags, GitHub releases) are reserved for the human. Report the release as a decision for the coordinator to escalate."
fi

if runs 'gh[[:space:]][^;&|]*pr[[:space:]]+merge|pulls/[0-9]+/merge' && [ "$agent" != "coordinator" ]; then
  deny "Only the coordinator merges PRs, once agent-review is success on the head SHA. Report the PR to the coordinator instead."
fi

# The context may sit in a quoted field or a JSON heredoc (--input -), so look for it in the raw command.
if runs 'statuses' && grep -q 'agent-review' <<<"$raw" \
  && runs '[[:space:]](-f|-F|--field|--raw-field|--input)[[:space:]]|(-X|--method)[[:space:]=]*(POST|PUT|PATCH)' \
  && ! runs '(-X|--method)[[:space:]=]*GET' && [ "$agent" != "pr-reviewer" ]; then
  deny "Only the pr-reviewer agent sets the agent-review status. Ask the coordinator to dispatch pr-reviewer."
fi

exit 0
