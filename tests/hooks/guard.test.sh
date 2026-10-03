#!/usr/bin/env bash
# Runs .claude/hooks/guard.sh against simulated PreToolUse inputs.
set -uo pipefail

GUARD="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/guard.sh"
failures=0

check() {
  local expected=$1 agent=$2 cmd=$3 input output actual
  input=$(jq -n --arg c "$cmd" --arg a "$agent" \
    '{hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {command: $c}} + (if $a == "" then {} else {agent_type: $a} end)')
  output=$("$GUARD" <<<"$input")
  actual=allow
  if [ -n "$output" ] && [ "$(jq -r '.hookSpecificOutput.permissionDecision // empty' <<<"$output")" = "deny" ]; then actual=deny; fi
  if [ "$actual" = "$expected" ]; then
    echo "ok    $expected  [${agent:-main}] $cmd"
  else
    echo "FAIL  expected $expected, got $actual  [${agent:-main}] $cmd"
    failures=$((failures + 1))
  fi
}

# Merging
check allow coordinator 'gh pr merge 5 --squash'
check deny  developer   'gh pr merge 5 --squash'
check deny  ""          'gh pr merge 5 --squash'
check deny  pr-reviewer 'cd /repo && gh  pr   merge 5'
check allow developer   'gh pr view 5 --json mergeStateStatus'

# agent-review status
SET='gh api repos/{owner}/{repo}/statuses/abc123 -f state=success -f context=agent-review -f description=ok'
READ='gh api "repos/{owner}/{repo}/commits/abc123/statuses" --jq '"'"'[.[] | select(.context=="agent-review")][0].state'"'"
check allow pr-reviewer "$SET"
check deny  developer   "$SET"
check deny  coordinator "$SET"
check deny  ""          'gh api -X POST repos/o/r/statuses/abc --input body.json # agent-review'
check allow coordinator "$READ"
check allow developer   'gh api repos/o/r/statuses/abc -f state=success -f context=ci'

# Release
check deny  coordinator 'npm publish --access public'
check deny  developer   'make publish'
check deny  coordinator 'git tag v1.0.4'
check deny  coordinator 'git tag -a v1.0.4 -m release'
check deny  coordinator 'git push origin v1.0.4'
check deny  coordinator 'git push --tags'
check deny  coordinator 'gh release create v1.0.4'
check deny  coordinator './mcp-publisher publish'
check allow developer   'git tag --list'
check allow developer   'git push -u origin feat/new-tool'
check allow developer   'gh release view v1.0.3'
check allow developer   'npm view @olaurendeau/mcp-camptocamp version'

# Text that only mentions a command: quoted arguments and heredoc bodies
check allow developer   'echo "simulated: gh pr merge 999"'
check allow developer   "git commit -m 'docs: explain that npm publish is human-only'"
check allow pr-reviewer "$(printf '%s\n' "gh pr comment 7 --body-file - <<'EOF'" 'Release: npm publish and gh pr merge stay restricted.' 'EOF')"
check allow coordinator "$(printf '%s\n' 'cat > /tmp/body.md <<EOF' 'git tag v2.0.0 is for the human' 'EOF' 'gh pr comment 7 --body-file /tmp/body.md')"
check deny  developer   "$(printf '%s\n' "cat > /tmp/x <<'EOF'" 'just text' 'EOF' 'gh pr merge 7 --squash')"
check deny  developer   'gh api repos/o/r/statuses/abc -f "context=agent-review" -f "state=success"'

if [ "$failures" -gt 0 ]; then
  echo "$failures failure(s)"
  exit 1
fi
echo "all guard tests passed"
