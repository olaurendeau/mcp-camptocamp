#!/usr/bin/env bash
# PreToolUse guard for Bash calls: each sensitive command stays with the role that owns it.
# - merging a PR                     → coordinator only
# - writing the agent-review status  → pr-reviewer only
# - version bump (npm version)       → developer only, with --no-git-tag-version
# - version tags (git tag/push vX.Y) → coordinator only, one named tag at a time
# - bulk tag push (--tags/--follow-tags/--mirror/glob), moving or deleting a version tag → nobody
# - manual publication               → nobody (publish.yml publishes from the tag)
# The human decides when to release and which version; agents only carry it out.
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
# heredoc bodies (unless fed to a shell), message/body/title arguments, and echo/printf/grep arguments.
# Everything else stays, including `sh -c "…"`, `bash -c '…'` and `$(…)`, which the shell runs.
# Then split into one simple command per line, so each rule and its exemptions see one command at a time.
segments=$(perl -0777 -pe '
  s/\\\n//g;
  s{^([^\n]*?)(?<!<)<<(?!<)-?[ \t]*([\x27"]?)(\w+)\2([^\n]*)\n.*?^[ \t]*\3[ \t]*$}{
    my ($whole, $line) = ($&, "$1$4");
    $line =~ /(?:^|[\s|;&(])(?:ba|z|da)?sh(?:\s|$)/ ? $whole : $line
  }gsme;
  my $q = qr/"(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27/s;
  s/((?:^|\s)(?:-[a-zA-Z]*m|--message|--body|-b|--title|-t|--notes)(?:\s+|=)?)$q/$1""/g;
  s/((?:^|[;&|(]|\s)(?:echo|printf|grep|egrep|rg)(?:\s+-[-\w]+)*\s+)$q/$1""/g;
  s/&&|\|\||[;|\n]/\n/g;
' <<<"$raw")

# Global options may sit between the program and its subcommand (git -C <path> push, git -c k=v tag,
# npm --prefix . version, make -C . publish), and their value may be quoted.
value='("[^"]*"|'\''[^'\'']*'\''|[^-[:space:]][^[:space:]]*)'
git='git([[:space:]]+((-C|-c|--git-dir|--work-tree|--namespace|--config-env|--super-prefix)[[:space:]]+'"$value"'|-[^[:space:]]*))*[[:space:]]+'
pkg='(npm|pnpm|yarn)([[:space:]]+-[^[:space:]]*([[:space:]]+'"$value"')?)*[[:space:]]+'

publish="${pkg}publish"
publish+='|make[[:space:]](.*[[:space:]])?publish([[:space:]]|$)'
publish+='|mcp-publisher[[:space:]]+publish'
publish+='|gh[[:space:]].*release[[:space:]]+(create|upload|edit|delete)'
bump="${pkg}version"
no_git_tag='[[:space:]]--no-git-tag-version([[:space:]"'\'']|$)'
git_tag='[[:space:]]--git-tag-version|--no-git-tag-version[[:space:]]+["'\'']?(true|false)(["'\''[:space:]]|$)'
tag_create="${git}"'tag[[:space:]].*v[0-9]'
# A + before the tag (+v1.0.4, '+v1.0.4', +refs/tags/…) force-moves it: tag_push matches it, push_force refuses it.
tag_push="${git}"'push[[:space:]].*(refs/tags/|[[:space:]:]["'\'']?\+?["'\'']?v[0-9]+\.[0-9])'
# Only list-mode options may precede -l, so `git tag -a -l v1.1.0` stays a creation.
tag_list="${git}"'tag([[:space:]]+(-n[0-9]*|-i|--ignore-case|--(sort|format|column|no-column|color|contains|no-contains|merged|no-merged|points-at)(=[^[:space:]]*)?))*[[:space:]]+(-l|--list)([[:space:]]|$)'
# --mirror force-pushes every ref, a glob refspec (refs/tags/*) every matching one, push.followTags is --follow-tags.
tag_bulk="${git}"'push[[:space:]](.*(--tags|--follow-tags|--mirror)([[:space:]]|$)|.*\*)'
tag_bulk+='|git[[:space:]].*[pP][uU][sS][hH]\.[fF][oO][lL][lL][oO][wW][tT][aA][gG][sS]'
tag_force='[[:space:]](-[a-zA-Z]*[fd][a-zA-Z]*|--force|--delete)([[:space:]]|$)'
push_force='[[:space:]](-[a-zA-Z]*[fd][a-zA-Z]*|--force|--force-with-lease|--force-if-includes|--delete)([[:space:]=]|$)'
push_force+='|[[:space:]]["'\'']?[:+]'
merge='gh[[:space:]].*pr[[:space:]]+merge'
api_merge='pulls/[^[:space:]/]+/merge'
write='[[:space:]](-f|-F|--field|--raw-field|--input)([[:space:]]|=)|(-X|--method)[[:space:]=]*(POST|PUT|PATCH)'
get='(-X|--method)[[:space:]=]*GET'

has() { grep -Eq -- "$2" <<<"$1"; }

while IFS= read -r seg; do
  if has "$seg" "$publish"; then
    deny "Manual publication (npm/pnpm/yarn publish, make publish, mcp-publisher publish, gh release create/upload/edit/delete) is blocked for every agent. Publication happens only through publish.yml, triggered by the coordinator pushing tag vX.Y.Z on main."
  fi

  if has "$seg" "$bump"; then
    if [ "$agent" != "developer" ]; then
      deny "Only a developer bumps the version, in a bump PR for a release the human asked for. Ask the coordinator to dispatch a developer."
    fi
    if ! has "$seg" "$no_git_tag" || has "$seg" "$git_tag"; then
      deny "Run npm version with --no-git-tag-version: without it, npm version also creates a git tag, and version tags belong to the coordinator."
    fi
  fi

  if has "$seg" "$tag_bulk"; then
    deny "Push one named tag (git push origin vX.Y.Z), never --tags, --follow-tags, --mirror, a glob refspec or push.followTags: worktrees share tag refs, so a bulk push can publish tags nobody asked for."
  fi

  if { has "$seg" "$tag_create" && has "$seg" "$tag_force"; } || { has "$seg" "$tag_push" && has "$seg" "$push_force"; }; then
    deny "No agent moves or deletes a version tag (tag -f/-d, forced or +refspec push, deletion push): re-pushing a tag republishes an already-released version through publish.yml. Report it to the human."
  fi

  if [ "$agent" != "coordinator" ] && { has "$seg" "$tag_create" || has "$seg" "$tag_push"; } && ! has "$seg" "$tag_list"; then
    deny "Only the coordinator creates and pushes version tags, on main, once the bump PR is merged and the human asked for the release. Report to the coordinator instead."
  fi

  if [ "$agent" != "coordinator" ] && { has "$seg" "$merge" || { has "$seg" "$api_merge" && has "$seg" '(-X|--method)[[:space:]=]*PUT'; }; }; then
    deny "Only the coordinator merges PRs, once agent-review is success on the head SHA. Report the PR to the coordinator instead."
  fi

  # The context may sit in a quoted field or a JSON heredoc (--input -), so look for it in the raw command.
  if [ "$agent" != "pr-reviewer" ] && has "$seg" 'statuses' && has "$seg" "$write" && ! has "$seg" "$get" \
    && grep -q 'agent-review' <<<"$raw"; then
    deny "Only the pr-reviewer agent sets the agent-review status. Ask the coordinator to dispatch pr-reviewer."
  fi
done <<<"$segments"

exit 0
