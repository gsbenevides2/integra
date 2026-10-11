#!/usr/bin/env bash
# Emits "NEW_BOT_COMMENT id=<id>" each time gsbenevides2-chan posts a new comment on the issue.
# Usage: watch.sh <issue-number>
issue="$1"
repo="gsbenevides2/integra"
last_bot_comment() {
  gh api "repos/$repo/issues/$issue/comments?per_page=100" \
    --jq '[.[] | select(.user.login=="gsbenevides2-chan")] | last | .id' 2>/dev/null || true
}
seen=$(last_bot_comment)
while true; do
  sleep 45
  cur=$(last_bot_comment)
  if [ -n "$cur" ] && [ "$cur" != "$seen" ]; then
    echo "NEW_BOT_COMMENT id=$cur"
    seen=$cur
  fi
done
