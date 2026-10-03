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

# Version bump: developer only, and only without the git tag npm version creates by default
check allow developer   'npm version 1.1.0 --no-git-tag-version'
check allow developer   'docker compose run --rm dev npm version 1.1.0 --no-git-tag-version'
check allow developer   'docker compose run --rm dev sh -c "npm ci && npm version 1.1.0 --no-git-tag-version"'
check allow developer   'yarn version --new-version 1.1.0 --no-git-tag-version'
check deny  developer   'npm version 1.1.0'
check deny  developer   'npm version patch'
check deny  developer   'pnpm version 1.1.0'
check deny  developer   'npm version 1.1.0 --no-git-tag-version --git-tag-version'
check deny  developer   'npm version 1.1.0 --no-git-tag-version false'
check deny  developer   "npm version 1.1.0 --no-git-tag-version 'false'"
check deny  developer   'npm version 1.1.0 --no-git-tag-version=false'
check allow developer   'npm version --no-git-tag-version 1.1.0'
check deny  developer   'npm version 1.1.0 --no-git-tag-version && git tag v1.1.0'
check deny  coordinator 'npm version 1.1.0 --no-git-tag-version'
check deny  coordinator 'npm version patch'
check deny  pr-reviewer 'npm version 1.1.0 --no-git-tag-version'
check deny  pr-reviewer 'npm version 1.1.0'
check deny  ""          'npm version 1.1.0 --no-git-tag-version'
check allow developer   'npm view @olaurendeau/mcp-camptocamp version'

# Version tags: coordinator only
check allow coordinator 'git tag v1.1.0'
check allow coordinator 'git push origin v1.1.0'
check allow coordinator 'git tag -a v1.0.4 -m release'
check allow coordinator 'git tag -a -m "Release 1.0.4" v1.0.4'
check allow coordinator 'git tag -am release v1.0.4'
check allow coordinator "git push origin 'v1.0.4'"
check allow coordinator 'git push origin refs/tags/v1.0.4'
check allow coordinator 'git tag v1.1.0 "$SHA"'
check allow coordinator 'git fetch origin && git tag v1.1.0 "$SHA" && git push origin v1.1.0'
check allow coordinator 'git push -u origin feat/new-tool'
check allow coordinator 'git fetch origin && git tag v1.1.0 origin/main && git push origin v1.1.0'
for role in developer pr-reviewer ""; do
  check deny "$role" 'git tag v1.1.0'
  check deny "$role" 'git push origin v1.1.0'
done
check deny  developer   'git tag -a v1.0.4 -m release'
check deny  developer   'git tag -am release v1.0.4'
check deny  developer   "git push origin 'v1.0.4'"
check deny  pr-reviewer 'git push origin refs/tags/v1.0.4'

# Bulk tag pushes and moving or deleting a version tag: nobody, coordinator included
for role in coordinator developer pr-reviewer ""; do
  check deny "$role" 'git push --tags'
  check deny "$role" 'git push origin --follow-tags'
  check deny "$role" 'git tag -f v1.0.4'
  check deny "$role" 'git tag -d v1.0.4'
  check deny "$role" 'git push --force origin v1.0.4'
  check deny "$role" 'git push origin :refs/tags/v1.0.4'
  check deny "$role" 'git push --delete origin v1.0.4'
done
check deny  coordinator 'git tag --force v1.0.4 abc123'
check deny  coordinator 'git tag -fa v1.0.4 -m release'
check deny  coordinator 'git tag --delete v1.0.4'
check deny  coordinator 'git push -f origin v1.0.4'
check deny  coordinator 'git push --force-with-lease origin v1.0.4'
check deny  coordinator 'git push --force-with-lease=v1.0.4:abc origin refs/tags/v1.0.4'
check deny  coordinator 'git push origin -f refs/tags/v1.0.4'
check deny  coordinator 'git push origin :v1.0.4'
check deny  coordinator 'git push -d origin v1.0.4'
check deny  coordinator 'git push origin --delete refs/tags/v1.0.4'
check allow developer   'git push --force-with-lease origin feat/new-tool'
check allow developer   'git push origin --delete feat/old-tool'
check allow developer   'git tag --list'
check allow developer   'git tag -l v1.*'
check allow pr-reviewer "git tag -l 'v*' --sort=-v:refname"
check allow developer   'git push -u origin feat/new-tool'

# Manual publication: nobody, publish.yml publishes from the tag
for role in coordinator developer pr-reviewer ""; do
  check deny "$role" 'npm publish --access public'
  check deny "$role" 'make publish'
  check deny "$role" './mcp-publisher publish'
  check deny "$role" 'gh release create v1.0.4'
done
check deny  developer   'docker compose run --rm dev sh -c "npm ci && npm publish --access public"'
check deny  coordinator 'pnpm publish'
check deny  coordinator 'yarn publish'
check deny  coordinator 'mcp-publisher publish'
check deny  coordinator 'gh release upload v1.0.4 dist.tgz'
check deny  coordinator 'gh -R olaurendeau/mcp-camptocamp release edit v1.0.4'
check deny  coordinator 'gh release delete v1.0.4'
check deny  coordinator 'git tag v1.1.0 && npm publish'
check allow developer   'make publish-prep'
check allow developer   'gh release view v1.0.3'

# Text that only mentions a command: messages, bodies, echo, heredoc bodies
check allow developer   'echo "simulated: gh pr merge 999"'
check allow developer   "git commit -m 'docs: explain that npm publish is human-only'"
check allow developer   "$(lines 'git commit -m "docs: release notes' '' 'Only the human runs npm publish or gh pr merge."')"
check allow developer   'gh pr create --title "chore: guard" --body "blocks gh pr merge for non-coordinators"'
check allow pr-reviewer "$(lines "gh pr comment 7 --body-file - <<'EOF'" 'Release: npm publish and gh pr merge stay restricted.' 'EOF')"
check allow developer   "$(lines 'cat > /tmp/body.md <<EOF' 'git tag v2.0.0 is for the coordinator' 'EOF' 'gh pr comment 7 --body-file /tmp/body.md')"
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
check deny  developer   "git tag -l 'v*' --sort=-v:refname | head -1 && git push --follow-tags"
check deny  developer   'git tag -l && npm publish --access public'
check deny  coordinator 'gh api repos/o/r/commits/abc/statuses --method GET; gh api repos/o/r/statuses/abc -f state=success -f context=agent-review'
check deny  coordinator 'gh api repos/o/r/statuses/abc --field=state=success --field=context=agent-review'
check deny  developer   'gh api -X PUT "repos/o/r/pulls/$N/merge"'
check allow developer   'gh api repos/o/r/pulls/7/merge'

if [ "$failures" -gt 0 ]; then
  echo "$failures of $total guard test(s) failed"
  exit 1
fi
echo "all $total guard tests passed"
