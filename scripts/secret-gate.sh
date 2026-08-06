#!/usr/bin/env bash
# secret-gate.sh — refuse to publish commits that contain credential-shaped
# strings. Sourced (or run) by the autonomous loops before they push.
#
# These loops run headless with --dangerously-skip-permissions against public
# repos. An agent that reads a sibling repo will happily quote a credential it
# found into a plan document; that is how a Supabase service_role JWT reached
# a public repo twice (synthesis-lab/cycle-031, cycle-042).
#
# CANONICAL SOURCE: jetson/scripts/secret-gate.sh. Copies live in sibling repos
# because they are separate checkouts with no shared runtime. Keep them in sync.
#
# Usage:  secret_gate_check || exit 0     # after sourcing
#    or:  bash secret-gate.sh             # exit 0 = clean, 1 = blocked
#
# Exit 1 also covers "cannot determine what is unpublished" — an unknown range
# is not a safe range, so the gate fails CLOSED rather than waving the push
# through. The earlier version guarded its whole body on `git diff origin/HEAD`
# succeeding, which meant a repo without an origin/HEAD symref skipped scanning
# entirely and published anything.

# Credential shapes. Deliberately broader than the obvious ones: the first
# version matched sk-[A-Za-z0-9]{20,}, which the dashes in Anthropic's
# sk-ant-api03-… and OpenAI's sk-proj-… keys break, so it missed both.
SECRET_PATTERNS='eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

# Resolve what "unpublished" means here, most specific first.
secret_gate_base_ref() {
    local branch ref
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
    for ref in "@{u}" "origin/${branch}" "origin/HEAD"; do
        if git rev-parse --verify --quiet "$ref" >/dev/null 2>&1; then
            printf '%s' "$ref"
            return 0
        fi
    done
    return 1
}

secret_gate_check() {
    local base leaked
    if ! base="$(secret_gate_base_ref)"; then
        echo "secret-gate: BLOCKED — cannot resolve an upstream ref, so there is"
        echo "  no way to tell which commits are unpublished. Set one with:"
        echo "    git branch --set-upstream-to=origin/<branch>"
        return 1
    fi

    leaked=$(git diff -U0 "${base}..HEAD" 2>/dev/null \
        | grep -E '^\+' \
        | grep -oE "$SECRET_PATTERNS" \
        | sort -u | head -10)

    if [ -n "$leaked" ]; then
        echo "secret-gate: BLOCKED — commits ahead of ${base} contain credential-shaped strings:"
        # Truncate to a recognisable prefix regardless of length. The previous
        # sed only rewrote matches of 25+ characters, so a 20-char AKIA key
        # printed in full into the runner log.
        echo "$leaked" | awk '{ printf "  %s…[redacted, %d chars]\n", substr($0,1,6), length($0) }'
        echo "Scrub them, then push by hand. Not pushing."
        return 1
    fi
    return 0
}

# Allow direct execution as well as sourcing.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    secret_gate_check
fi
