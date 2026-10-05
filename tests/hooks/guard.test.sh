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

# Global options before the subcommand: git -C/-c/--git-dir, npm --prefix, make -C
for role in developer pr-reviewer ""; do
  check deny "$role" 'git -C /repo tag v1.1.0'
  check deny "$role" 'git -C /repo push origin v1.1.0'
  check deny "$role" 'git -c user.name=x push origin refs/tags/v1.1.0'
  check deny "$role" 'git --git-dir=/repo/.git push origin v1.1.0'
  check deny "$role" 'git -C "/my repo" --no-pager push origin v1.1.0'
  check deny "$role" 'cd /repo && git -C "$WT" tag -a v1.1.0 -m release'
done
check allow coordinator 'git -C /repo tag v1.1.0'
check allow coordinator 'git -C /repo push origin v1.1.0'
check allow coordinator 'git -C "/my repo" tag -a v1.1.0 -m release'
for role in coordinator developer pr-reviewer ""; do
  check deny "$role" 'git -C /repo push --tags'
  check deny "$role" 'git -C /repo push origin --follow-tags'
  check deny "$role" 'git -C /repo tag -f v1.0.4'
  check deny "$role" 'git -C /repo push origin :v1.0.4'
  check deny "$role" 'git -c core.x=y push --force origin v1.0.4'
  check deny "$role" 'npm --prefix . publish'
  check deny "$role" 'pnpm --filter "my pkg" publish'
  check deny "$role" 'make -C . publish'
  check deny "$role" 'make build publish'
done
check allow developer   'git -C /repo push -u origin feat/new-tool'
check allow developer   'git -C /repo tag --list'
check allow developer   'git -C /repo log v1.0.4'
check allow developer   'git -C /repo push --force-with-lease origin feat/new-tool'
check allow developer   'npm --prefix . version 1.1.0 --no-git-tag-version'
check allow developer   'npm -w pkg version 1.1.0 --no-git-tag-version'
check deny  developer   'npm --prefix . version patch'
check deny  developer   'npm --prefix "/my dir" version 1.1.0'
check deny  developer   'pnpm -C . version 1.1.0'
check deny  developer   'yarn --cwd . version'
for role in coordinator pr-reviewer ""; do
  check deny "$role" 'npm --prefix . version 1.1.0 --no-git-tag-version'
  check deny "$role" 'npm -w pkg version patch'
done
check allow developer   'npm --prefix . view @olaurendeau/mcp-camptocamp version'
check allow developer   'npm --prefix . run test'
check allow developer   'make -C . publish-prep'
check allow developer   'make -C . check'

# Refspecs: + forces the update, --mirror and globs push every tag, push.followTags is --follow-tags
for role in coordinator developer pr-reviewer ""; do
  check deny "$role" 'git push origin +v1.1.0'
  check deny "$role" "git push origin '+v1.1.0'"
  check deny "$role" "git push origin +'v1.1.0'"
  check deny "$role" 'git push origin +refs/tags/v1.0.4'
  check deny "$role" 'git push origin +HEAD:refs/tags/v1.0.4'
  check deny "$role" 'git -C /repo push origin +v1.0.4'
  check deny "$role" 'git push --mirror origin'
  check deny "$role" 'git -C /repo push --mirror'
  check deny "$role" "git push origin 'refs/tags/*'"
  check deny "$role" 'git push origin refs/tags/*:refs/tags/*'
  check deny "$role" 'git -c push.followTags=true push origin feat/new-tool'
  check deny "$role" 'git config push.followtags true'
done
check allow developer   'git push origin +feat/new-tool'
check allow coordinator 'git push origin HEAD:refs/heads/feat/x'

# Listing tags with options before -l is not creating one
check allow developer   'git tag -n -l v1*'
check allow developer   "git tag --sort=-v:refname -l 'v*'"
check allow pr-reviewer 'git -C /repo tag -n5 --list'
check deny  developer   'git tag -a -l v1.1.0'

# Exemptions apply to their own command only, not to the whole command line
check allow coordinator "git tag -l 'v*' --sort=-v:refname | head -1"
check deny  coordinator "git tag -l 'v*' --sort=-v:refname | head -1 && npm version patch && git push --follow-tags"
check deny  developer   "git tag -l 'v*' --sort=-v:refname | head -1 && git push --follow-tags"
check deny  developer   'git tag -l && npm publish --access public'
check deny  coordinator 'gh api repos/o/r/commits/abc/statuses --method GET; gh api repos/o/r/statuses/abc -f state=success -f context=agent-review'
check deny  coordinator 'gh api repos/o/r/statuses/abc --field=state=success --field=context=agent-review'
check deny  developer   'gh api -X PUT "repos/o/r/pulls/$N/merge"'
check allow developer   'gh api repos/o/r/pulls/7/merge'

# Quoted strings and substitutions are not cut apart: a | or ; inside them does not split the command
check allow coordinator 'gh api repos/o/r/commits/abc/statuses -F per_page=100 --jq ".[] | select(.context==\"agent-review\") | .state" --method GET'
check allow coordinator "gh api repos/o/r/commits/abc/statuses -F per_page=100 --jq '.[] | select(.context==\"agent-review\")' --method GET"
check deny  developer   "gh api \"repos/o/r/statuses/\$(gh pr view 7 --json commits --jq '.commits | last | .oid')\" -f state=success -f context=agent-review"
check deny  developer   'gh api repos/o/r/statuses/$(git rev-parse HEAD | head -c 40) -f state=success -f context=agent-review'
check deny  developer   'gh api repos/o/r/statuses/`git rev-parse HEAD | head -c 40` -f state=success -f context=agent-review'
check allow pr-reviewer "gh api \"repos/o/r/statuses/\$(gh pr view 7 --json commits --jq '.commits | last | .oid')\" -f state=success -f context=agent-review -f description='ok; no blocker | 2 suggestions'"
check deny  developer   'out="$(gh pr merge 7 --squash | tail -1)"'
check deny  developer   'echo "$(gh pr merge 7 --squash)"'
check deny  developer   'bash -c "gh api repos/o/r/commits/abc/statuses --method GET && gh api repos/o/r/statuses/abc -f state=success -f context=agent-review"'
check deny  developer   "sh -c 'npm version 1.1.0 --no-git-tag-version && npm version patch'"
check deny  developer   'eval "gh pr merge 7"'
check allow developer   "docker compose run --rm dev sh -c 'npm ci && npm run check'"
check allow developer   'gh pr create --title "chore: x" --body "$(cat <<'"'"'EOF'"'"'
Agents never run `npm publish` or `gh pr merge`; it is "human only".

Closes #8
EOF
)"'

# A lone & (background) separates commands; redirections with & do not
check deny  developer   'git tag -l & git tag v1.1.0'
check deny  developer   'npm version 1.1.0 --no-git-tag-version & npm version patch'
check deny  developer   'gh api repos/o/r/commits/abc/statuses --method GET & gh api repos/o/r/statuses/abc -f state=success -f context=agent-review'
check allow developer   'make check > /tmp/check.log 2>&1 &'
check allow developer   'npm test &> /tmp/test.log; git tag -l'

# A heredoc fed to a shell given by its path is shell code
check deny  developer   "$(lines '/bin/sh -s <<EOF' 'gh pr merge 7 --squash' 'EOF')"
check deny  developer   "$(lines '/usr/bin/env bash <<EOF' 'gh pr merge 7 --squash' 'EOF')"
check deny  developer   "$(lines '/bin/bash <<'"'"'EOF'"'"'' 'npm publish' 'EOF')"

# curl writes with -d/--data (POST by default)
check deny  developer   "curl -H \"Authorization: token \$T\" https://api.github.com/repos/o/r/statuses/abc -d '{\"state\":\"success\",\"context\":\"agent-review\"}'"
check deny  coordinator 'curl --data @status.json https://api.github.com/repos/o/r/statuses/abc # agent-review'
check deny  developer   "curl --request POST https://api.github.com/repos/o/r/statuses/abc --json '{\"context\":\"agent-review\"}'"
check allow pr-reviewer "curl https://api.github.com/repos/o/r/statuses/abc -d '{\"state\":\"success\",\"context\":\"agent-review\"}'"
check allow coordinator 'curl -s https://api.github.com/repos/o/r/commits/abc/statuses | jq ".[] | select(.context==\"agent-review\")"'

# awk and sed patterns are text, like grep
check allow pr-reviewer "awk '/npm publish/' Makefile"
check allow pr-reviewer "sed -n '/gh pr merge/p' CONTRIBUTING.md"
check allow pr-reviewer "awk -F: '/git tag v1.1.0/ {print \$1}' notes.txt"
check deny  developer   "awk '{print}' notes.txt && gh pr merge 7"

# Tags through the REST API: creating one (POST …/git/refs) is the coordinator's, like git push origin vX.Y.Z
TAG_API_CREATE=(
  'gh api repos/{owner}/{repo}/git/refs -f ref=refs/tags/v1.0.5 -f sha=abc'
  'gh api -X POST repos/o/r/git/refs -f ref=refs/tags/v1.0.5 -f sha=abc'
  "$(lines 'gh api repos/o/r/git/refs --input - <<EOF' '{"ref":"refs/tags/v1.0.5","sha":"abc"}' 'EOF')"
  "curl -H \"Authorization: token \$T\" https://api.github.com/repos/o/r/git/refs -d '{\"ref\":\"refs/tags/v1.0.5\",\"sha\":\"abc\"}'"
  # The ref may not appear in the command at all: only a branch (refs/heads/) is free for every role.
  'gh api repos/o/r/git/refs --input ref.json'
  'curl -X POST https://api.github.com/repos/o/r/git/refs -d @ref.json'
  "gh api graphql -f query='mutation { createRef(input: {repositoryId: \"R_1\", name: \"refs/tags/v1.0.5\", oid: \"abc\"}) { ref { name } } }'"
  "gh api graphql -f query='mutation { createRef(input: {repositoryId: \"R_1\", name: \$name, oid: \"abc\"}) { ref { name } } }' -f name=v1.0.5"
)
for cmd in "${TAG_API_CREATE[@]}"; do
  check allow coordinator "$cmd"
  for role in developer pr-reviewer ""; do
    check deny "$role" "$cmd"
  done
done

# Moving or deleting a tag through the REST API, and writing releases: nobody (they trigger publish.yml)
for role in coordinator developer pr-reviewer ""; do
  check deny  "$role" 'gh api -X PATCH repos/o/r/git/refs/tags/v1.0.4 -f sha=abc -F force=true'
  check deny  "$role" 'gh api --method PATCH repos/o/r/git/refs/tags/v1.0.4 --input body.json'
  check deny  "$role" "curl --request PATCH https://api.github.com/repos/o/r/git/refs/tags/v1.0.4 -d '{\"sha\":\"abc\",\"force\":true}'"
  check deny  "$role" 'gh api --method DELETE repos/o/r/git/refs/tags/v1.0.4'
  check deny  "$role" 'gh api -X DELETE "repos/o/r/git/refs/tags/v1.0.4"'
  check deny  "$role" 'curl -X DELETE https://api.github.com/repos/o/r/git/refs/tags/v1.0.4'
  check deny  "$role" 'gh api repos/{owner}/{repo}/releases -f tag_name=v1.0.5'
  check deny  "$role" 'gh api -X PATCH repos/o/r/releases/123 -f draft=false'
  check deny  "$role" 'gh api -X DELETE repos/o/r/releases/123'
  check deny  "$role" 'curl -X POST https://api.github.com/repos/o/r/releases -d @release.json'
  check allow "$role" 'gh api repos/o/r/git/refs/tags'
  check allow "$role" 'gh api repos/o/r/git/refs/tags -F per_page=100 --method GET'
  check allow "$role" 'gh api repos/o/r/releases --jq ".[0].tag_name"'
  check allow "$role" 'gh api repos/o/r/releases/latest'
  # Branches stay free through the API
  check allow "$role" 'gh api repos/o/r/git/refs -f ref=refs/heads/feat/x -f sha=abc'
  check allow "$role" 'gh api -X PATCH repos/o/r/git/refs/heads/feat/x -f sha=abc -F force=true'
  check allow "$role" 'gh api -X DELETE repos/o/r/git/refs/heads/feat/old-tool'
  check allow "$role" "gh api graphql -f query='mutation { createRef(input: {repositoryId: \"R_1\", name: \"refs/heads/feat/x\", oid: \"abc\"}) { ref { name } } }'"
  check allow "$role" "gh api graphql -f query='query { repository(owner: \"o\", name: \"r\") { refs(refPrefix: \"refs/tags/\", first: 5) { nodes { name } } } }'"
done
# A ref the command does not name is not known to be a branch: updating or deleting it may move a tag
check deny  coordinator 'gh api -X PATCH "repos/o/r/git/refs/$REF" -f sha=abc -F force=true'
check deny  coordinator 'gh api -X DELETE "repos/o/r/git/refs/$REF"'

# GraphQL: updateRef, updateRefs and deleteRef outside refs/heads/ move or delete a tag: nobody, coordinator included
GQL_UPDATE_BODY='{"query":"mutation { updateRef(input: {refId: \"REF_1\", oid: \"abc\", force: true}) { clientMutationId } }"}'
GQL_BRANCH_BODY='{"query":"mutation { createRef(input: {repositoryId: \"R_1\", name: \"refs/heads/feat/x\", oid: \"abc\"}) { clientMutationId } }"}'
REST_BRANCH_BODY='{"ref":"refs/heads/feat/x","sha":"abc"}'
GQL_MOVE=(
  "gh api graphql -f query='mutation { updateRef(input: {refId: \"REF_1\", oid: \"abc\", force: true}) { ref { name } } }'"
  "gh api graphql -f query='mutation { deleteRef(input: {refId: \"REF_1\"}) { clientMutationId } }'"
  "gh api graphql -f query='mutation { updateRefs(input: {repositoryId: \"R_1\", refUpdates: [{name: \"refs/tags/v1.0.4\", afterOid: \"abc\", force: true}]}) { clientMutationId } }'"
  "gh api graphql -f query='mutation { updateRefs(input: {repositoryId: \"R_1\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: \"abc\"}, {name: \"refs/tags/v1.0.4\", afterOid: \"abc\", force: true}]}) { clientMutationId } }'"
  "curl https://api.github.com/graphql -d '{\"query\":\"mutation { deleteRef(input: {refId: \\\"REF_1\\\"}) { clientMutationId } }\"}'"
  "$(lines 'gh api graphql --input - <<EOF' "$GQL_UPDATE_BODY" 'EOF')"
)
for role in coordinator developer pr-reviewer ""; do
  for cmd in "${GQL_MOVE[@]}"; do
    check deny "$role" "$cmd"
  done
  check allow "$role" "gh api graphql -f query='mutation { updateRefs(input: {repositoryId: \"R_1\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: \"abc\", force: true}]}) { clientMutationId } }'"
  check allow "$role" "$(lines 'gh api graphql --input - <<EOF' "$GQL_BRANCH_BODY" 'EOF')"
done

# The refs/heads/ exemption covers its own command only: a branch push does not exempt the next API write
BRANCH_THEN='git push origin HEAD:refs/heads/feat/x && '
for role in coordinator developer pr-reviewer ""; do
  check deny  "$role" "${BRANCH_THEN}gh api -X PATCH \"repos/o/r/git/refs/\$REF\" -f sha=abc -F force=true"
  check deny  "$role" "${BRANCH_THEN}gh api -X DELETE \"repos/o/r/git/refs/\$REF\""
  check deny  "$role" "${BRANCH_THEN}gh api graphql -f query='mutation { deleteRef(input: {refId: \"REF_1\"}) { clientMutationId } }'"
  check allow "$role" "${BRANCH_THEN}gh api repos/o/r/git/refs -f ref=refs/heads/feat/y -f sha=abc"
  check allow "$role" "$(lines 'gh api repos/o/r/git/refs --input - <<EOF' "$REST_BRANCH_BODY" 'EOF')"
done
check allow coordinator "${BRANCH_THEN}gh api repos/o/r/git/refs --input ref.json"
check allow coordinator "${BRANCH_THEN}gh api graphql -f query='mutation { createRef(input: {repositoryId: \"R_1\", name: \$name, oid: \"abc\"}) { ref { name } } }' -f name=v1.0.5"
for role in developer pr-reviewer ""; do
  check deny "$role" "${BRANCH_THEN}gh api repos/o/r/git/refs --input ref.json"
  check deny "$role" "${BRANCH_THEN}gh api graphql -f query='mutation { createRef(input: {repositoryId: \"R_1\", name: \$name, oid: \"abc\"}) { ref { name } } }' -f name=v1.0.5"
done

# make with options or other targets before publish
for role in coordinator developer pr-reviewer ""; do
  check deny  "$role" 'make -C /repo publish'
  check deny  "$role" 'make publish-prep publish'
done

# push.followTags: only enabling it is refused
for role in coordinator developer pr-reviewer ""; do
  check allow "$role" 'git config --get push.followTags'
  check allow "$role" 'git config --unset push.followTags'
  check allow "$role" 'git config push.followTags'
  check allow "$role" 'git config push.followTags false'
  check allow "$role" 'git -c push.followTags=false push origin feat/new-tool'
  check deny  "$role" 'git -c push.followTags push origin feat/new-tool'
  check deny  "$role" 'git -c push.FollowTags=1 push origin feat/new-tool'
  check deny  "$role" 'git config --global push.followTags yes'
  check deny  "$role" "git config set push.followTags 'true'"
  check deny  "$role" 'git config push.followTags ON'
done

# npm/pnpm/yarn: an option may take the next word as its value, unless that word is a subcommand
# that reads (npm --json view version views the version, it does not bump it)
for role in coordinator developer pr-reviewer ""; do
  check allow "$role" 'npm --json view version'
  check allow "$role" 'npm --silent view @olaurendeau/mcp-camptocamp version'
  check allow "$role" 'npm --json info @olaurendeau/mcp-camptocamp version'
  check allow "$role" 'npm --silent run version'
  check deny  "$role" 'npm --otp 123456 publish'
  check deny  "$role" 'npm --access public publish'
  check deny  "$role" 'npm --tag next publish'
  check deny  "$role" 'pnpm --reporter silent publish'
  check deny  "$role" 'npm --tag next version patch'
  check deny  "$role" 'npm --tag next version 1.2.0'
  check deny  "$role" 'npm --otp 1 version patch'
  # A read word taken as an option value, then version and an argument: a bump, not a read
  check deny  "$role" 'npm --tag v version patch'
  check deny  "$role" 'npm --tag run version patch'
  check deny  "$role" 'npm --tag view version 1.2.0'
  check deny  "$role" 'npm --tag v version --preid rc prerelease'
done
check allow developer   'npm --tag next version 1.2.0 --no-git-tag-version'
check allow developer   'npm --tag v version patch --no-git-tag-version'
check allow developer   'npm --tag run version --no-git-tag-version 1.2.0'
check deny  developer   'npm --registry https://r.example version patch'
check deny  developer   'npm --loglevel silent version 1.1.0'
check deny  developer   'npm --json version patch'
check deny  coordinator 'npm --json version 1.1.0 --no-git-tag-version'

# The tag-listing exemption covers the listing command only
for role in developer pr-reviewer ""; do
  check deny  "$role" 'git push origin v1.1.0 # git tag --list'
  check deny  "$role" 'git push origin v1.1.0 $(git tag -l)'
  check deny  "$role" 'git push origin v1.1.0 $(git tag -l )'
  check deny  "$role" 'git tag v1.1.0 `git tag -l`'
  check deny  "$role" 'git push origin v1.1.0 "$(git tag --list)"'
  check deny  "$role" 'git push origin v1.1.0 git tag -l'
  check deny  "$role" 'bash -c "git push origin v1.1.0 && git tag -l"'
  check deny  "$role" 'git tag -a -l v1.1.0'
  check allow "$role" "latest=\$(git tag -l 'v*' --sort=-v:refname | head -1)"
  check allow "$role" 'git tag -l v1.* | tail -1'
  check allow "$role" '(git tag -l v1.*)'
  check allow "$role" 'echo done # then git push origin v1.1.0'
done

# Global options with a value separated by a space
for role in developer pr-reviewer ""; do
  check deny  "$role" 'git --git-dir /repo/.git push origin v1.1.0'
  check deny  "$role" 'git --work-tree /repo tag v1.1.0'
  check deny  "$role" 'git --namespace ns push origin v1.1.0'
  check deny  "$role" 'git --git-dir /r/.git --work-tree /r tag -a v1.1.0 -m release'
done
for role in coordinator developer pr-reviewer ""; do
  check deny  "$role" 'git --git-dir /repo/.git push --tags'
  check deny  "$role" 'git --work-tree /repo --namespace ns push origin --follow-tags'
done
check allow coordinator 'git --git-dir /r/.git --work-tree /r tag -a v1.1.0 -m release'

# Everyday commands stay allowed for every role
for role in coordinator developer pr-reviewer ""; do
  check allow "$role" 'git -C /repo push -u origin feat/new-tool'
  check allow "$role" 'git push --force-with-lease origin feat/new-tool'
  check allow "$role" 'git -C "/my repo" diff origin/main...HEAD'
  check allow "$role" 'git --no-pager -C /repo log v1.0.4..HEAD'
  check allow "$role" 'git -C /repo tag --list'
  check allow "$role" "git tag -l 'v*' --sort=-v:refname | head -1"
  check allow "$role" 'make -C . check'
  check allow "$role" 'make check && docker compose down -v'
  check allow "$role" 'npm --prefix . view @olaurendeau/mcp-camptocamp version'
  check allow "$role" 'npm --prefix . run test'
  check allow "$role" 'gh pr view 5 --json mergeStateStatus'
  check allow "$role" "$READ"
  check allow "$role" "$(lines 'git commit -F - <<EOF' 'chore: note that gh pr merge and npm publish are restricted' 'EOF')"
  check allow "$role" 'gh pr checks 217 --watch --interval 30'
  check allow "$role" 'gh pr comment 217 --body-file /tmp/review.md'
  check allow "$role" 'docker compose run --rm dev sh -c "npm ci && npm run check"'
  check allow "$role" 'git -C /repo status --short'
done

if [ "$failures" -gt 0 ]; then
  echo "$failures of $total guard test(s) failed"
  exit 1
fi
echo "all $total guard tests passed"
