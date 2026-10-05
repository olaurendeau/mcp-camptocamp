#!/usr/bin/env bash
# PreToolUse guard for Bash calls: each sensitive command stays with the role that owns it.
# - merging a PR                     → coordinator only
# - writing the agent-review status  → pr-reviewer only
# - version bump (npm version)       → developer only, with --no-git-tag-version
# - version tags (git tag/push vX.Y) → coordinator only, one named tag at a time
# - bulk tag push (--tags/--follow-tags/--mirror/glob), moving or deleting a version tag → nobody
# - tag creation through the API (POST …/git/refs, GraphQL createRef) → coordinator only
# - moving or deleting a tag (PATCH/DELETE …/git/refs/…, GraphQL updateRef/updateRefs/deleteRef),
#   or writing a release, through the API → nobody
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
# heredoc bodies (unless fed to a shell), message/body/title arguments, echo/printf/grep/awk/sed
# arguments, and # comments.
# Then split into one simple command per line, so each rule and its exemptions see one command at a time.
# The split follows the shell: it never cuts inside quotes, and the code the shell runs from a command
# ($(…), `…`, <(…), sh -c '…', eval "…") becomes its own command, replaced by $() or "" in the outer one.
# A removed heredoc leaves <<HEREDOC_<n> in its command; its body follows the commands, as a line starting with \x01.
segments=$(perl -e '
  local $/; $_ = <STDIN>;
  s/\\\n//g;
  my @bodies;
  s{^([^\n]*?)(?<!<)<<(?!<)-?[ \t]*([\x27"]?)(\w+)\2([^\n]*)\n(.*?)^[ \t]*\3[ \t]*$}{
    my ($whole, $pre, $post, $body) = ($&, $1, $4, $5);
    if ("$pre$post" =~ /(?:^|[\s|;&(\/])(?:ba|z|da|k)?sh(?:\s|$)/) { $whole }
    else { push @bodies, $body =~ s/\n/ /gr; "$pre<<HEREDOC_$#bodies $post" }
  }gsme;
  # A double-quoted text still runs its $(…) and `…`, so it stays and the split below extracts them.
  my $q = qr/"(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27/s;
  my $text = sub { my ($opt, $str) = @_; $str =~ /^"(?:[^\\]|\\.)*?(?:\$\(|`)/s ? "$opt$str" : "$opt\"\"" };
  s/((?:^|\s)(?:-[a-zA-Z]*m|--message|--body|-b|--title|-t|--notes)(?:\s+|=)?)($q)/$text->($1, $2)/ge;
  s/((?:^|[;&|(`]|\s)(?:echo|printf|grep|egrep|fgrep|rg|awk|gawk|sed)(?:\s+-\S+)*\s+)($q)/$text->($1, $2)/ge;

  my @out;
  my $runs_code = qr/(?:^|[\s\/])(?:(?:ba|z|da|k)?sh(?:\s+-[-a-zA-Z]+)*\s+-[a-zA-Z]*c[a-zA-Z]*|eval)\s+\z/;
  # Index of the ) closing a substitution whose content starts at $i.
  sub closing {
    my ($s, $i) = @_;
    my $depth = 1;
    while ($i < length $s) {
      my $c = substr($s, $i, 1);
      if ($c eq "\\") { $i += 2; next }
      if ($c eq "\x27") { my $j = index($s, "\x27", $i + 1); return length $s if $j < 0; $i = $j + 1; next }
      if ($c eq "\"") { $i++; while ($i < length $s && substr($s, $i, 1) ne "\"") { $i += substr($s, $i, 1) eq "\\" ? 2 : 1 } $i++; next }
      $depth++ if $c eq "(";
      return $i if $c eq ")" && --$depth == 0;
      $i++;
    }
    return length $s;
  }
  # Index of the backtick closing the one before $i.
  sub backtick {
    my ($s, $i) = @_;
    $i += substr($s, $i, 1) eq "\\" ? 2 : 1 while $i < length $s && substr($s, $i, 1) ne "`";
    return $i;
  }
  sub split_cmd {
    my ($s) = @_;
    my ($cur, $i, $n) = ("", 0, length $s);
    my $flush = sub { (my $c = $cur) =~ s/\n/ /g; push @out, $c if $c =~ /\S/; $cur = "" };
    while ($i < $n) {
      my $c = substr($s, $i, 1);
      my $next = substr($s, $i + 1, 1);
      if ($c eq "\\") { $cur .= substr($s, $i, 2); $i += 2 }
      elsif ($c eq "\x27") {
        my $j = index($s, "\x27", $i + 1); $j = $n if $j < 0;
        if ($cur =~ $runs_code) { split_cmd(substr($s, $i + 1, $j - $i - 1)); $cur .= "\"\"" }
        else { $cur .= substr($s, $i, $j - $i + 1) }
        $i = $j + 1;
      }
      elsif ($c eq "\"") {
        my $str = "";
        $i++;
        while ($i < $n && substr($s, $i, 1) ne "\"") {
          my $d = substr($s, $i, 1);
          if ($d eq "\\") { $str .= substr($s, $i, 2); $i += 2 }
          elsif ($d eq "\$" && substr($s, $i + 1, 1) eq "(") { my $e = closing($s, $i + 2); split_cmd(substr($s, $i + 2, $e - $i - 2)); $str .= "\$()"; $i = $e + 1 }
          elsif ($d eq "`") { my $e = backtick($s, $i + 1); split_cmd(substr($s, $i + 1, $e - $i - 1)); $str .= "\$()"; $i = $e + 1 }
          else { $str .= $d; $i++ }
        }
        $i++;
        if ($cur =~ $runs_code) { split_cmd($str); $cur .= "\"\"" } else { $cur .= "\"$str\"" }
      }
      elsif (($c eq "\$" || $c eq "<" || $c eq ">") && $next eq "(") {
        my $e = closing($s, $i + 2); split_cmd(substr($s, $i + 2, $e - $i - 2)); $cur .= "\$()"; $i = $e + 1;
      }
      elsif ($c eq "`") { my $e = backtick($s, $i + 1); split_cmd(substr($s, $i + 1, $e - $i - 1)); $cur .= "\$()"; $i = $e + 1 }
      elsif ($c eq "#" && $cur =~ /(?:^|[\s;&|(])\z/) { $i++ while $i < $n && substr($s, $i, 1) ne "\n" }
      elsif ($c eq "&" && ($cur =~ /[<>]\z/ || $next eq ">")) { $cur .= $c; $i++ }
      elsif ($c =~ /[;&|\n]/) { $flush->(); $i++ }
      else { $cur .= $c; $i++ }
    }
    $flush->();
  }
  split_cmd($_);
  print "$_\n" for @out;
  print "\x01$_\n" for @bodies;
' <<<"$raw")
heredocs=()
while IFS= read -r line; do
  case $line in $'\x01'*) heredocs+=("${line#?}") ;; esac
done <<<"$segments"

# Global options may sit between the program and its subcommand (git -C <path> push, git -c k=v tag,
# npm --otp 123456 publish, make -C . publish), and their value may be quoted.
# Any npm/pnpm/yarn option may take the next word as its value. For the version bump (a Perl regex),
# that word must not be a subcommand that reads, so `npm --json view version` views the version.
value='("[^"]*"|'\''[^'\'']*'\''|[^-[:space:]][^[:space:]]*)'
git='git([[:space:]]+((-C|-c|--git-dir|--work-tree|--namespace|--config-env|--super-prefix)[[:space:]]+'"$value"'|-[^[:space:]]*))*[[:space:]]+'
pkg='(npm|pnpm|yarn)([[:space:]]+-[^[:space:]]*([[:space:]]+'"$value"')?)*[[:space:]]+'
reads='view|info|show|v|run|run-script'
# The start of a command: subshell or group, keywords, variable assignments, a path to the program.
start='^[[:space:](){!]*(([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*|if|then|elif|else|do|while|until|time|command|env)[[:space:]]+)*([^[:space:]]*/)?'

publish="${pkg}publish"
publish+='|make[[:space:]](.*[[:space:]])?publish([[:space:]]|$)'
publish+='|mcp-publisher[[:space:]]+publish'
publish+='|gh[[:space:]].*release[[:space:]]+(create|upload|edit|delete)'
bump_value='(?:"[^"]*"|\x27[^\x27]*\x27|[^-\s]\S*)'
bump='(?:npm|pnpm|yarn)(?:\s+-\S*(?:\s+(?!(?:'"$reads"')(?:\s|$))'"$bump_value"')?)*\s+version'
# A read word may still be an option value (npm --tag v version patch): then version followed by an argument bumps.
bump+='|(?:npm|pnpm|yarn)(?:\s+-\S*(?:\s+'"$bump_value"')?)*\s+-\S*\s+(?:'"$reads"')\s+version(?:\s+-\S*)*\s+[^-\s]'
no_git_tag='[[:space:]]--no-git-tag-version([[:space:]"'\'']|$)'
git_tag='[[:space:]]--git-tag-version|--no-git-tag-version[[:space:]]+["'\'']?(true|false)(["'\''[:space:]]|$)'
tag_create="${git}"'tag[[:space:]].*v[0-9]'
# A + before the tag (+v1.0.4, '+v1.0.4', +refs/tags/…) force-moves it: tag_push matches it, push_force refuses it.
tag_push="${git}"'push[[:space:]].*(refs/tags/|[[:space:]:]["'\'']?\+?["'\'']?v[0-9]+\.[0-9])'
# Only list-mode options may precede -l, so `git tag -a -l v1.1.0` stays a creation.
# Anchored to the start of the command, so a listing only exempts itself.
tag_list="${start}${git}"'tag([[:space:]]+(-n[0-9]*|-i|--ignore-case|--(sort|format|column|no-column|color|contains|no-contains|merged|no-merged|points-at)(=[^[:space:]]*)?))*[[:space:]]+(-l|--list)([[:space:]]|$)'
# --mirror force-pushes every ref, a glob refspec (refs/tags/*) every matching one.
tag_bulk="${git}"'push[[:space:]](.*(--tags|--follow-tags|--mirror)([[:space:]]|$)|.*\*)'
# push.followTags turns every push into --follow-tags: refuse turning it on (case-insensitive match),
# by value (=true, `config … true/yes/on/1`) or as a bare `-c push.followTags`; reading or disabling it is fine.
truthy='["'\'']?(true|yes|on|[0-9]*[1-9])(["'\''[:space:]]|$)'
follow_tags='git[[:space:]].*(push\.followtags(=|["'\'']?[[:space:]]+)'"$truthy"'|-c[[:space:]]+["'\'']?push\.followtags["'\'']?([[:space:]]|$))'
tag_force='[[:space:]](-[a-zA-Z]*[fd][a-zA-Z]*|--force|--delete)([[:space:]]|$)'
push_force='[[:space:]](-[a-zA-Z]*[fd][a-zA-Z]*|--force|--force-with-lease|--force-if-includes|--delete)([[:space:]=]|$)'
push_force+='|[[:space:]]["'\'']?[:+]'
merge='gh[[:space:]].*pr[[:space:]]+merge'
api_merge='pulls/[^[:space:]/]+/merge'
method='(-X|--method|--request)[[:space:]=]*'
# gh api writes with -f/-F/--input, curl with -d/--data/--json/--form: both default to POST.
write='[[:space:]](-f|-F|--field|--raw-field|--input|-d|--data[-a-z]*|--json|--form)([[:space:]=@"'\'']|$)|'"$method"'(POST|PUT|PATCH)'
get="${method}GET"
api_refs='git/refs([/"'\''[:space:]?]|$)'
api_releases='/releases([/"'\''[:space:]?]|$)'
create_ref='createRef[[:space:]]*\('
# updateRef and deleteRef take a refId, so the command never names their target; updateRefs names its refs.
move_ref_by_id='(updateRef|deleteRef)[[:space:]]*\('
move_refs='updateRefs[[:space:]]*\('
# A body read from stdin: --input -, -d @-.
stdin_body='(--input[[:space:]=]+|@)-(["'\''[:space:]]|$)'

has() { grep -Eq -- "$2" <<<"$1"; }
has_i() { grep -Eiq -- "$2" <<<"$1"; }
has_p() { perl -e 'exit($ARGV[0] =~ /$ARGV[1]/ ? 0 : 1)' -- "$1" "$2"; }
# An API call that changes something: POST/PUT/PATCH/DELETE, and not forced back to GET.
api_writes() { { has "$1" "$write" || has "$1" "${method}DELETE"; } && ! has "$1" "$get"; }
# What an API call sends: its own command, with its own heredoc body or here-string when it reads stdin.
# Fails when stdin comes from a file or a pipe, which the hook cannot read.
sends() {
  local n
  if ! has "$1" "$stdin_body" || has "$1" '<<<'; then printf '%s\n' "$1"; return 0; fi
  n=$(perl -ne 'print $1 if /<<HEREDOC_(\d+)/' <<<"$1")
  [ -n "$n" ] && printf '%s\n%s\n' "$1" "${heredocs[$n]:-}"
}
# The API call names only branches, in a field, the path or its own stdin body; another command's refs/heads/ does not count.
branch_only() { local text; text=$(sends "$1") || return 1; has "$text" 'refs/heads/' && ! has "$text" 'refs/tags'; }
# PATCH/DELETE on a …/git/refs/heads/… path targets that branch, whatever the body says.
branch_path() { has "$1" "${method}(PATCH|PUT|DELETE)" && has "$1" 'git/refs/heads/' && ! has "$1" 'git/refs/tags'; }
# A GraphQL mutation is looked up in the whole line, so a tag it names anywhere in the line counts too.
graphql_branch_only() { branch_only "$1" && ! has "$raw" 'refs/tags'; }

while IFS= read -r seg; do
  case $seg in $'\x01'*) continue ;; esac
  if has "$seg" "$publish" || { has "$seg" "$api_releases" && api_writes "$seg"; }; then
    deny "Manual publication (npm/pnpm/yarn publish, make publish, mcp-publisher publish, gh release create/upload/edit/delete, writes to …/releases through the API) is blocked for every agent. Publication happens only through publish.yml, triggered by the coordinator pushing tag vX.Y.Z on main."
  fi

  # Any ref write through the API that is not known to target a branch (refs/heads/) may be a tag.
  # Creating one (POST …/git/refs) is a tag push; updating or deleting one (PATCH/DELETE …/git/refs/…) moves it.
  if has "$seg" "$api_refs" && api_writes "$seg" && ! branch_only "$seg" && ! branch_path "$seg"; then
    if has "$seg" "${method}(PATCH|PUT|DELETE)" || has "$seg" 'git/refs/tags/'; then
      deny "No agent moves or deletes a tag through the API (PATCH/DELETE on …/git/refs/… other than refs/heads/…): re-pointing a tag republishes an already-released version through publish.yml. Report it to the human."
    fi
    if [ "$agent" != "coordinator" ]; then
      deny "Only the coordinator creates version tags (POST …/git/refs or git push origin vX.Y.Z), on main, once the bump PR is merged and the human asked for the release. Report to the coordinator instead."
    fi
  fi
  # GraphQL: updateRef/updateRefs/deleteRef move or delete a ref, createRef creates one, like PATCH/DELETE and POST.
  # The mutation may sit in a variable set by another command or in a heredoc, so look for it in the raw command.
  if has "$seg" 'graphql'; then
    if has "$raw" "$move_ref_by_id" || { has "$raw" "$move_refs" && ! graphql_branch_only "$seg"; }; then
      deny "No agent moves or deletes a tag through the API (GraphQL updateRef/deleteRef, or updateRefs outside refs/heads/): re-pointing a tag republishes an already-released version through publish.yml. Report it to the human."
    fi
    if [ "$agent" != "coordinator" ] && has "$raw" "$create_ref" && ! graphql_branch_only "$seg"; then
      deny "Only the coordinator creates version tags (GraphQL createRef outside refs/heads/), on main, once the bump PR is merged and the human asked for the release. Report to the coordinator instead."
    fi
  fi

  if has_p "$seg" "$bump"; then
    if [ "$agent" != "developer" ]; then
      deny "Only a developer bumps the version, in a bump PR for a release the human asked for. Ask the coordinator to dispatch a developer."
    fi
    if ! has "$seg" "$no_git_tag" || has "$seg" "$git_tag"; then
      deny "Run npm version with --no-git-tag-version: without it, npm version also creates a git tag, and version tags belong to the coordinator."
    fi
  fi

  if has "$seg" "$tag_bulk" || has_i "$seg" "$follow_tags"; then
    deny "Push one named tag (git push origin vX.Y.Z), never --tags, --follow-tags, --mirror, a glob refspec or push.followTags enabled: worktrees share tag refs, so a bulk push can publish tags nobody asked for."
  fi

  if { has "$seg" "$tag_create" && has "$seg" "$tag_force"; } || { has "$seg" "$tag_push" && has "$seg" "$push_force"; }; then
    deny "No agent moves or deletes a version tag (tag -f/-d, forced or +refspec push, deletion push): re-pushing a tag republishes an already-released version through publish.yml. Report it to the human."
  fi

  if [ "$agent" != "coordinator" ] && { has "$seg" "$tag_push" || { has "$seg" "$tag_create" && ! has "$seg" "$tag_list"; }; }; then
    deny "Only the coordinator creates and pushes version tags, on main, once the bump PR is merged and the human asked for the release. Report to the coordinator instead."
  fi

  if [ "$agent" != "coordinator" ] && { has "$seg" "$merge" || { has "$seg" "$api_merge" && has "$seg" "${method}PUT"; }; }; then
    deny "Only the coordinator merges PRs, once agent-review is success on the head SHA. Report the PR to the coordinator instead."
  fi

  # The context may sit in a quoted field or a JSON heredoc (--input -), so look for it in the raw command.
  if [ "$agent" != "pr-reviewer" ] && has "$seg" 'statuses' && has "$seg" "$write" && ! has "$seg" "$get" \
    && grep -q 'agent-review' <<<"$raw"; then
    deny "Only the pr-reviewer agent sets the agent-review status. Ask the coordinator to dispatch pr-reviewer."
  fi
done <<<"$segments"

exit 0
