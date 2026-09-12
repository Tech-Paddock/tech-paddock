#!/usr/bin/env bash
# Prints the open-items ledger and every agent's worklog, across all branches.
#
# Worklogs are committed on the branch they belong to, so no two agents ever
# write the same path and a merge conflict between them is impossible. The cost
# is that reading them all means looking at every branch, which is what this
# script does so nobody has to remember how.
#
# Run it before you start work. See the Rules of Engagement in CLAUDE.md.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

git fetch origin --quiet 2>/dev/null || echo "(fetch failed — showing what is already local)"

echo "================================================================"
echo " OPEN ITEMS — technical director"
echo "================================================================"
cat .claude/worklogs/_open-items.md 2>/dev/null || echo "(no ledger found)"

# Every pull request is now a draft until Joel approves it, so a ledger update
# can sit unmerged for a while. Worklogs survive that — they are read from the
# branch they live on, below. The ledger was not: it is read from the working
# tree, which on a fresh session is main, so anything pending was invisible
# exactly when it mattered most. Show what is waiting rather than hiding it.
for ref in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v 'origin/HEAD'); do
  branch="${ref#origin/}"
  [ "$branch" = "main" ] && continue
  git merge-base --is-ancestor "$ref" origin/main 2>/dev/null && continue
  pending=$(git diff origin/main.."$ref" -- .claude/worklogs/_open-items.md 2>/dev/null)
  [ -z "$pending" ] && continue
  echo
  echo "  !! LEDGER CHANGES PENDING ON $branch — not yet on main"
  echo "  !! A draft pull request is probably waiting on Joel. Read this before"
  echo "  !! trusting the ledger above to be current."
  echo "$pending" | grep -E '^[-+]' | grep -vE '^[-+]{3}' | sed 's/^/  /'
done

echo
echo "================================================================"
echo " AGENT WORKLOGS"
echo "================================================================"

found=0
for ref in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v 'origin/HEAD'); do
  branch="${ref#origin/}"
  # A branch's worklog is named for the branch, with slashes flattened.
  slug="${branch//\//-}"
  body=$(git show "$ref:.claude/worklogs/$slug.md" 2>/dev/null)
  [ -z "$body" ] && continue
  found=1
  merged=""
  git merge-base --is-ancestor "$ref" origin/main 2>/dev/null && merged="  [merged into main]"
  echo
  echo "---------------------------------------------------------------"
  echo "$branch — last commit $(git log -1 --format='%ar' "$ref" 2>/dev/null)$merged"
  echo "---------------------------------------------------------------"
  echo "$body"
done

[ "$found" -eq 0 ] && echo "(no worklogs on any branch yet)"

echo
echo "================================================================"
echo " BRANCHES WITH NO WORKLOG"
echo "================================================================"
for ref in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v 'origin/HEAD'); do
  branch="${ref#origin/}"
  [ "$branch" = "main" ] && continue
  slug="${branch//\//-}"
  if ! git show "$ref:.claude/worklogs/$slug.md" >/dev/null 2>&1; then
    ahead=$(git rev-list --count origin/main.."$ref" 2>/dev/null || echo "?")
    echo "  $branch  (+$ahead commits, no worklog)"
  fi
done
