#!/usr/bin/env bash
# Ships the commit at HEAD to the host and applies it there.
#
# A commit, not a working tree: what runs on the host is something `git show`
# can reproduce, and a half-edited file on somebody's machine cannot leak into
# it. Uncommitted work is therefore ignored, and the script says so.
set -euo pipefail

host=${RANZA_DEPLOY_HOST:-root@178.105.194.50}
root=/opt/apps/ranza
revision=$(git rev-parse --short HEAD)

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "note: uncommitted changes are not deployed; shipping HEAD ($revision)" >&2
fi

# Extract beside the live tree and rename, so a transfer that dies halfway
# leaves the previous source in place rather than a directory missing its
# second half.
git archive --format=tar --prefix=src.new/ HEAD |
  ssh "$host" "set -e
    mkdir -p $root && cd $root
    rm -rf src.new && tar -xf -
    rm -rf src && mv src.new src
    echo $revision > src/.revision"

ssh "$host" "RANZA_REVISION=$revision $root/src/deploy/apply.sh"
