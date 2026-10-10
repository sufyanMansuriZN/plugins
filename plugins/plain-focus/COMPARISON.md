# plain-focus vs i-have-adhd 0.4.1

Upstream: https://github.com/ayghri/i-have-adhd (MIT). Cases: upstream `evals/cases.jsonl`
(14 prompts x 2 trials = 28 responses per condition). Model: claude-haiku-5-5, no tools, user settings isolated.

## Static

| | i-have-adhd | plain-focus |
|---|---|---|
| Rules injected at session start | ~1,240 words | ~320 words |
| Always on | needs flag file `~/.claude/.i-have-adhd-always` | on by default (SessionStart hook) |
| Turn off | delete flag file (permanent), "stop adhd mode" (session) | disable plugin (permanent), "stop adhd mode" (session) |
| Writing-style rules | brevity, no idioms | brevity + ASD-STE100-style sentence, word, and paragraph rules |
| Examples per rule | yes (bad/good pairs) | none |
| Hook | node, sh, ps1 variants | one sh script |
| Platforms | Claude Code, Codex, Gemini, Cursor, others | Claude Code only |

## Measured (means over 28 responses)

| | no skill | i-have-adhd | plain-focus |
|---|---|---|---|
| Words per response | 310 | 195 | 194 |
| Avg sentence length (words) | 9.7 | 8.4 | 7.0 |
| Sentences over 25 words | 3% | 1% | 0% |
| Forbidden openers (count) | 2 | 1 | 1 |
| Forbidden closers (count) | 0 | 0 | 0 |
| Input tokens per call (incl. cache) | 3,323 | 5,743 | 4,026 |
| Cost, 28 calls | $0.032 | $0.043 | $0.035 |

Input-token overhead vs no skill: i-have-adhd +2,420, plain-focus +703 (about 3.4x smaller).

## Not measured

- Strict STE compliance: no checker. Sentence length is a proxy only; vocabulary is not checked.
- One model, 2 trials: differences in opener counts (1 vs 1) are noise.

## Quality (blind judge)

Judge: claude-opus-5-5 via upstream `scripts/judge.py` and `evals/rubric.md`, 28 judge calls, reported cost $1.29.
Scores 1 to 5, means over 28 responses. Weighted: correctness 35%, autonomy 25%, actionability 20%, safety 10%, concision 10%.

| | no skill | i-have-adhd | plain-focus |
|---|---|---|---|
| Correctness | 4.25 | 3.82 | 4.07 |
| Autonomy | 4.07 | 3.96 | 3.61 |
| Actionability | 3.89 | 4.07 | 4.21 |
| Safety | 4.86 | 4.43 | 4.61 |
| Concision | 3.29 | 4.00 | 4.36 |
| **Weighted** | **4.10** | **3.99** | **4.07** |
| Blocker flags | 4 | 5 | 2 |

Reading: both skills trade a little correctness and safety for concision and actionability. Neither beats no skill on the weighted score.
plain-focus is closest to no skill. Its weak spot is autonomy (3.61): on `agent-owned-edit` it handed the edit back to the user in both trials.
i-have-adhd had one empty response (`agent-owned-edit`, trial 1) and two overclaimed causes (`partial-success`).

Caveats: tools were disabled in every run, so autonomy cases cannot be done and are judged on what the reply says. 2 trials per case, one judge, differences of 0.1 are inside the noise.

## Autonomy rule experiment (rejected)

Added rule: "Do work you can do yourself (read, edit, run) and report the result." Re-ran the 14 cases x 2 trials and judged against no skill (Opus 5.5, $1.09, separate judge run).

| | no skill | plain-focus v1 | plain-focus + autonomy rule |
|---|---|---|---|
| Autonomy | 3.96 | 3.61 | 3.68 |
| Weighted | 4.15 | 4.07 | 3.82 |
| Blocker flags | 2 | 2 | 6 |

Autonomy moved +0.07 (noise). Correctness and safety fell. The `agent-owned-edit` case still scored 2 in both trials, because tools are off in the harness and the model cannot edit.
The no-skill baseline itself moved 4.10 -> 4.15 between judge runs, so judge noise is about 0.05. Rule removed; v1 stays.
