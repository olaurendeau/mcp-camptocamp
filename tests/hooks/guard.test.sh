#!/usr/bin/env bash
# Runs .claude/hooks/guard.sh against simulated PreToolUse inputs.
set -uo pipefail

GUARD="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/guard.sh"
failures=0
total=0

check() {
  local expected=$1 agent=$2 cmd=$3 input output rc actual
  total=$((total + 1))
  input=$(jq -n --arg c "$cmd" --arg a "$agent" \
    '{hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {command: $c}} + (if $a == "" then {} else {agent_type: $a} end)')
  output=$("$GUARD" <<<"$input" 2>/dev/null)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    actual="error(exit $rc)"
  elif [ -n "$output" ] && [ "$(jq -r '.hookSpecificOutput.permissionDecision // empty' <<<"$output")" = "deny" ]; then
    actual=deny
  else
    actual=allow
  fi
  if [ "$actual" = "$expected" ]; then
    echo "ok    $expected  [${agent:-main}] ${cmd//$'\n'/ ⏎ }"
  else
    echo "FAIL  expected $expected, got $actual  [${agent:-main}] ${cmd//$'\n'/ ⏎ }"
    failures=$((failures + 1))
  fi
}

lines() { printf '%s\n' "$@"; }

# Merging
check allow coordinator 'gh pr merge 5 --squash'
check deny  developer   'gh pr merge 5 --squash'
check deny  ""          'gh pr merge 5 --squash'
check deny  pr-reviewer 'cd /repo && gh  pr   merge 5'
check deny  developer   'gh -R olaurendeau/mcp-camptocamp pr merge 7'
check deny  developer   'gh api -X PUT repos/o/r/pulls/7/merge'
check deny  developer   "bash -c 'gh pr merge 7 --squash'"
check deny  developer   'out="$(gh pr merge 7 --squash)"'
check allow developer   'gh pr view 5 --json mergeStateStatus'

# agent-review status
SET='gh api repos/{owner}/{repo}/statuses/abc123 -f state=success -f context=agent-review -f description=ok'
READ='gh api "repos/{owner}/{repo}/commits/abc123/statuses" --jq '"'"'[.[] | select(.context=="agent-review")][0].state'"'"
check allow pr-reviewer "$SET"
check deny  developer   "$SET"
check deny  coordinator "$SET"
check deny  developer   'gh api repos/o/r/statuses/abc -f "context=agent-review" -f "state=success"'
check deny  ""          'gh api -X POST repos/o/r/statuses/abc --input body.json # agent-review'
check deny  developer   "$(lines 'gh api repos/o/r/statuses/abc --input - <<EOF' '{"state":"success","context":"agent-review"}' 'EOF')"
check allow coordinator "$READ"
check allow coordinator 'gh api repos/o/r/commits/abc/statuses -F per_page=100 --method GET --jq ".[] | select(.context==\"agent-review\")"'
check allow developer   'gh api repos/o/r/statuses/abc -f state=success -f context=ci'

# Release
check deny  coordinator 'npm publish --access public'
check deny  developer   'docker compose run --rm dev sh -c "npm ci && npm publish --access public"'
check deny  coordinator 'npm version patch'
check deny  developer   'make publish'
check allow developer   'make publish-prep'
check deny  coordinator 'git tag v1.0.4'
check deny  coordinator 'git tag -a v1.0.4 -m release'
check deny  coordinator 'git tag -a -m "Release 1.0.4" v1.0.4'
check deny  coordinator 'git tag -am release v1.0.4'
check deny  coordinator 'git push origin v1.0.4'
check deny  coordinator 'git push --tags'
check deny  coordinator 'git push --follow-tags'
check deny  coordinator 'git push origin refs/tags/v1.0.4'
check deny  coordinator 'gh release create v1.0.4'
check deny  coordinator './mcp-publisher publish'
check allow developer   'git tag --list'
check allow developer   'git tag -l v1.*'
check allow developer   'git push -u origin feat/new-tool'
check allow developer   'gh release view v1.0.3'
check allow developer   'npm view @olaurendeau/mcp-camptocamp version'

# Text that only mentions a command: messages, bodies, echo, heredoc bodies
check allow developer   'echo "simulated: gh pr merge 999"'
check allow developer   "git commit -m 'docs: explain that npm publish is human-only'"
check allow developer   "$(lines 'git commit -m "docs: release notes' '' 'Only the human runs npm publish or gh pr merge."')"
check allow developer   'gh pr create --title "chore: guard" --body "blocks gh pr merge for non-coordinators"'
check allow pr-reviewer "$(lines "gh pr comment 7 --body-file - <<'EOF'" 'Release: npm publish and gh pr merge stay restricted.' 'EOF')"
check allow coordinator "$(lines 'cat > /tmp/body.md <<EOF' 'git tag v2.0.0 is for the human' 'EOF' 'gh pr comment 7 --body-file /tmp/body.md')"
check deny  developer   "$(lines "cat > /tmp/x <<'EOF'" 'just text' 'EOF' 'gh pr merge 7 --squash')"
check deny  developer   "$(lines 'sh -s <<EOF' 'gh pr merge 7 --squash' 'EOF')"
check deny  developer   "git commit -m \"don't\" && gh pr merge 5 && echo 'x'"
check deny  developer   "$(lines 'grep -q x <<<"text"' 'gh pr merge 7')"
check allow developer   "git commit -m\"docs: note that npm publish is human-only\""
check allow pr-reviewer "git show \"abc:CONTRIBUTING.md\" | grep -n -E '^\\| (\`gh pr merge\`|release)'"
check deny  developer   "$(lines 'gh pr \' '  merge 7 --squash')"

# Exemptions apply to their own command only, not to the whole command line
check allow coordinator "git tag -l 'v*' --sort=-v:refname | head -1"
check deny  coordinator "git tag -l 'v*' --sort=-v:refname | head -1 && npm version patch && git push --follow-tags"
check deny  developer   'git tag -l && npm publish --access public'
check deny  coordinator 'gh api repos/o/r/commits/abc/statuses --method GET; gh api repos/o/r/statuses/abc -f state=success -f context=agent-review'
check deny  coordinator 'gh api repos/o/r/statuses/abc --field=state=success --field=context=agent-review'
check deny  coordinator "git push origin 'v1.0.4'"
check deny  developer   'gh api -X PUT "repos/o/r/pulls/$N/merge"'
check allow developer   'gh api repos/o/r/pulls/7/merge'

if [ "$failures" -gt 0 ]; then
  echo "$failures of $total guard test(s) failed"
  exit 1
fi
echo "all $total guard tests passed"
