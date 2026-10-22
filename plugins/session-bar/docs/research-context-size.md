# Research: how much context is too much in a coding session

Question: on a 1M-token model, at what token counts do quality, speed and cost start to slip, and where
should session-bar's ctx segment turn orange (`warn`) and vermillion (`hot`)? Today `band()` in
`plugins/session-bar/hooks/register.tsx` colors ctx at 50 % / 80 % of the model's window. On Opus 5.5 that
means 500K / 800K tokens. The previous version used fixed 200K / 250K / 300K thresholds.

Checked 2026-10-03 against primary sources only: Anthropic's API and Claude Code docs, Anthropic system
cards and engineering posts, and the original papers or reports for independent benchmarks. Prices and
model names are as the pages state them on that date.

## Recommendation for session-bar

Base ctx color on **absolute tokens, capped by a share of the window: use whichever threshold is lower.**

| Level | Rule | 1M models (Opus 5.5, Sonnet 5.5, Fable 5.1) | 200K models (Haiku 4.5, any 1M model held to 200K) |
|---|---|---|---|
| `warn` | `tokens >= min(150_000, 0.5 * window)` | 150K | 100K |
| `hot` | `tokens >= min(250_000, 0.8 * window)` | 250K | 160K |

- **warn at 150K.** 150,000 input tokens is the default trigger for Anthropic's server-side compaction on
  every current model. Anthropic gives the reason for compacting as "as a conversation grows, response
  quality degrades"
  ([compaction-threshold](https://platform.claude.com/docs/en/build-with-claude/compaction-threshold)).
  So 150K is Anthropic's own default "time to shrink this" point, even on 1M models.
- **hot at 250K.** Anthropic's length-split long-context scores are strong up to the 256K bin and clearly
  lower in the 512K–1M bin. Opus 4.8 GraphWalks BFS drops from 85.9 to 68.1 F1
  ([Opus 4.8 system card §8.9](https://www-cdn.anthropic.com/0f0c97ad20d8005706296bd92aa1c27c6b2f4f61/Claude%20Opus%204.8%20System%20Card.pdf)).
  No current model publishes any length-split result. Past ~256K you are on unmeasured ground, every
  request costs more, and a cache miss on Opus 5.5 costs $1.25–$2.00 at 250K (see Cost).
- **Absolute, not a share.** Accuracy, latency and per-request cost all scale with the tokens sent, not with
  how full the window is. A 1M window only moves the hard stop and the auto-compact point (~967K,
  [model-config](https://code.claude.com/docs/en/model-config)), not where quality starts to slip.
- **Lower of the two.** On a 200K window Claude Code compacts at the 200K boundary
  ([model-config](https://code.claude.com/docs/en/model-config)). 150K / 250K would warn too late there or
  never fire at all, so the share caps them at 100K / 160K.
- **Follow-on.** With absolute thresholds, an orange pill can sit next to "15 %", which reads as a
  contradiction. Consider printing the token count (`ctx 180k`) instead of the share.
- **Conservative alternative:** warn at 100K. That is Anthropic's default for context editing and for
  the (deprecated) SDK compaction, and the size above which Claude Code offers "resume from summary"
  (sources below). It will fire in many ordinary coding sessions.
- **Unverified:** whether the mod API's `e.context.window` is the model window or the user's
  `/autocompact` window. If a user sets `/autocompact 200k`, the share cap is only right if `window`
  reflects that setting.

## Cost

**Every request re-sends the whole context.** "Each time you send a message in Claude Code, it makes a new
API request ... Claude Code re-sends the full context: the system prompt, your project context, every prior
message and tool result, and your new message"
([Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching)). Tool use multiplies this:
"each time Claude uses tools it sends another request carrying that batch of tool results"
([costs](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session)). Input cost per request
is therefore linear in context size, and the total for a session that keeps growing is quadratic.

**No price step at 200K on current models.** "Claude 4.6 and later models ... include the full 1M token
context window at standard pricing. (A 900k-token request is billed at the same per-token rate as a 9k-token
request.)" ([pricing: long context](https://platform.claude.com/docs/en/about-claude/pricing#long-context-pricing)).
1M is the default for every 1M model, with no beta header
([context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows#context-window-sizes-by-model)).
Fast mode pricing "applies across the full context window, including requests over 200k input tokens"
([pricing: fast mode](https://platform.claude.com/docs/en/about-claude/pricing#fast-mode-pricing)). Nothing
on the pricing page puts a token boundary on price.

**Opus 5.5 rates** ([pricing](https://platform.claude.com/docs/en/about-claude/pricing#model-pricing)):
$4/MTok base input, $5 for 5-minute cache writes, $8 for 1-hour cache writes, $0.20 for cache hits (0.05x
base, lower than the usual 0.1x), $20 output. For comparison: Sonnet 5.5 $2 / $0.20 hit / $10 output;
Fable 5.1 $10 / $0.25 hit / $50; Haiku 4.5 $1 / $0.10 / $5 (same page).

**Worked example: input cost of one Opus 5.5 request that carries X tokens of context** (my arithmetic
from the rates above; output cost doesn't depend on context size and is left out):

| Context X | Uncached (base $4) | Warm cache read ($0.20) | Cold rebuild, 5-min write ($5) | Cold rebuild, 1-hour write ($8) |
|---|---|---|---|---|
| 100K | $0.40 | $0.02 | $0.50 | $0.80 |
| 200K | $0.80 | $0.04 | $1.00 | $1.60 |
| 400K | $1.60 | $0.08 | $2.00 | $3.20 |
| 800K | $3.20 | $0.16 | $4.00 | $6.40 |

- In normal Claude Code use the prefix is cached, so a request costs roughly the "warm" column plus a cache
  write for the newly appended tokens. A cache miss costs a full rebuild. Misses happen on the first
  message after an idle gap longer than the TTL, after a model switch, after `/compact`, and so on
  ([prompt caching: invalidation](https://code.claude.com/docs/en/prompt-caching#actions-that-invalidate-the-cache)).
- TTL: the main conversation gets 1 hour on a subscription within plan usage. It gets 5 minutes on usage
  credits, an API key or a cloud provider. Subagents get 5 minutes by default
  ([prompt caching: which TTL](https://code.claude.com/docs/en/prompt-caching#which-ttl-each-request-gets)).
- Cumulative cost (my arithmetic, 4K new tokens per request, 5-minute writes). Growing one session to 800K
  takes 200 requests and re-reads 79.6M cached tokens: $15.92 in reads plus $4.00 in writes. Four separate
  sessions that each stop at 200K re-read 19.6M tokens: $3.92 in reads plus the same $4.00 in writes. The
  read bill is 4x larger for one long session. (This ignores the work of re-establishing context after a
  `/clear`.)
- API rate limits: cache reads do not count toward ITPM on current models
  ([rate limits](https://platform.claude.com/docs/en/api/rate-limits#cache-aware-itpm)). A long cached
  context therefore costs money and plan usage, but not API throughput.
- Tokenizer: "Claude 4.7 and later models ... use a newer tokenizer ... approximately 30% more tokens for the
  same text" ([pricing](https://platform.claude.com/docs/en/about-claude/pricing#model-pricing)). A 200K
  threshold tuned on an older model holds about 30 % less text today.

## Speed

- The docs say latency grows with input length, but give no curve. "The fewer tokens the model has to
  process and generate, the faster the response will be"
  ([reducing latency](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency)).
  "Actual latency depends on prompt length, output length, and thinking effort"
  ([models overview](https://platform.claude.com/docs/en/models/overview)).
- Caching is the big lever. "You will generally see improved time-to-first-token for long documents"
  ([prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). A cache miss
  makes "the next response slower and more expensive while it rebuilds". After an idle gap, "the first turn
  back after stepping away can be noticeably slower"
  ([Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching)). So the slow requests in a
  big session are the cache misses, and how slow they are scales with context size.
- `/compact` on a large context "is itself a large request". After the cache has expired, its summarization
  request "reprocesses the full history as uncached input"
  ([costs](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session),
  [prompt caching: compacting](https://code.claude.com/docs/en/prompt-caching#compacting-the-conversation)).
- **Unverified:** I found no Anthropic page that publishes time-to-first-token as a function of input length
  (for example, seconds at 100K vs 800K), cached or uncached. Any specific latency number at these sizes is
  unverified.

## Quality

### First-party statements

- "More context isn't automatically better. As token count grows, accuracy and recall degrade, a
  phenomenon known as *context rot*"
  ([context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)).
- "Claude's context window fills up fast, and performance degrades as it fills ... When the context window
  is getting full, Claude may start 'forgetting' earlier instructions or making more mistakes"
  ([Claude Code best practices](https://code.claude.com/docs/en/best-practices)).
- Degradation is "a performance gradient rather than a hard cliff: models remain highly capable at longer
  contexts but may show reduced precision for information retrieval and long-range reasoning". The goal is
  "the smallest possible set of high-signal tokens"
  ([Effective context engineering, 2025-09-29](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
- "Context is a finite resource with diminishing returns, and irrelevant content degrades model focus"
  ([context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)).

### First-party numbers split by length (the newest are for Opus 4.8; none for current models)

| Model | Benchmark | ≤256K bin | 1M bin | Source |
|---|---|---|---|---|
| Opus 4.6 | MRCR v2 8-needle (mean match ratio, max effort) | 93.0 (128K–256K) | 76.0 (524K–1M) | [Opus 4.6 card, Table 2.18.A](https://www-cdn.anthropic.com/6a5fa276ac68b9aeb0c8b6af5fa36326e0e166dd/Claude%20Opus%204.6%20System%20Card.pdf) |
| Opus 4.6 / 4.7 / 4.8 | GraphWalks BFS (F1) | 61.1 / 76.9 / 85.9 | 16.3 / 40.3 / 68.1 | [Opus 4.8 card, Table 8.9.A](https://www-cdn.anthropic.com/0f0c97ad20d8005706296bd92aa1c27c6b2f4f61/Claude%20Opus%204.8%20System%20Card.pdf) |
| Opus 4.6 / 4.7 / 4.8 | GraphWalks Parents (F1) | 95.4 / 93.6 / 99.3 | 48.6 / 56.6 / 83.3 | same |

- Each generation pushes the curve out, but every model scores lower in the 1M bin than in the 256K bin.
  The Opus 4.8 card notes that the 1M-subset problems "exceed [the API's] 1M token limit", so that bin runs
  slightly past what you can send.
- The Opus 5.5, Sonnet 5.5 and Fable 5.1 system cards report long context only as an aggregate ProgramBench
  score. Opus 5.5 scores 91.2 %, with "episodes [that] cover a range of context lengths up to the full 1M
  token window" ([Opus 5.5 card §8.10](https://www.anthropic.com/claude-opus-5-5-system-card)). They contain
  no MRCR, GraphWalks or needle results and no breakdown by length (I searched the extracted text of all
  three cards). **Where current models start to drop off is unverified.**

### Independent evidence

| Study | Claude models | Finding |
|---|---|---|
| [Context Rot, Chroma, 2025-07-14](https://www.trychroma.com/research/context-rot) | Opus 4, Sonnet 4, Sonnet 3.7/3.5, Haiku 3.5 (18 LLMs in all) | "models do not use their context uniformly; instead, their performance grows increasingly unreliable as input length grows", even on simple tasks. On LongMemEval, focused (~300-token) prompts beat the full 113K-token prompt for every model, and "the Claude models exhibit the most pronounced gap", mostly from abstaining. Claude had "the lowest hallucination rates". |
| [NoLiMa, ICML 2025](https://arxiv.org/abs/2502.05167) | Claude 3.5 Sonnet | Needle tasks with no literal word match. "Out of the 13 models, 11 exhibit performance at 32K lengths that is half or less of their base scores." Claude 3.5 Sonnet: base 87.5, 29.8 at 32K, effective length 4K (Table 3). |
| [RULER, COLM 2024](https://arxiv.org/abs/2404.06654) | none | Of 17 models that claim 32K+, "only half of them can maintain satisfactory performance at the length of 32K." |
| [Lost in the Middle, TACL](https://arxiv.org/abs/2307.03172) | Claude 1.3, Claude 1.3 100K | A U-shaped curve: accuracy is highest when the relevant text sits at the start or end of the context and "significantly degrades" in the middle, "even for explicitly long-context models". |
| [Context Length Alone Hurts..., Findings of EMNLP 2025](https://arxiv.org/abs/2510.05381) | Claude 3.7 Sonnet (listed as Claude-3.5 in Table 2) | Even with perfect retrieval, accuracy "still degrades substantially (13.9%–85%) as input length increases but remains well within the models' claimed lengths" (tested up to 30K tokens). Closed models degraded less than open ones. |
| [Fiction.LiveBench, 2026-04-04](https://fiction.live/stories/Fiction-liveBench-April-04-2026/oQdzQvKHw8JyXbN87) ([results table](https://cdn6.fiction.live/file/fictionlive/a7be0188-9a0a-4b19-a4b3-97e7deecf52e.png)) | Opus 4.6, Opus 4.5, Sonnet 4.5 | Story comprehension at 0–192K. Opus 4.6 scores 94.4 at 32K and 93.8 at 120K. Sonnet 4.5 drops from 91.7 at 32K to 75.0 at 120K. All three Claude rows show 0.0 at 192K with no explanation. That looks like a run failure, not a score (**unverified**). No current Claude model is listed. |

Reading of the evidence: older models degrade from a few thousand tokens. Recent Claude models hold up well
through ~256K on Anthropic's own retrieval and reasoning tests and lose 15–30+ points in the ~1M bin.
Anthropic describes this as a gradient with no cliff. None of these benchmarks measures an agentic coding
session full of stale tool output. Anthropic's best-practices page addresses exactly that case: "Long
sessions with irrelevant context can reduce performance"
([best practices](https://code.claude.com/docs/en/best-practices#course-correct-early-and-often)).

## Claude Code behavior

- **Auto-compact point.** "Models running with a native 1M window compact before the window fills, at about
  967K tokens by default." Models held to 200K compact "at the 200K boundary". This includes
  `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`, Opus 4.6 / Sonnet 4.6 without extended context, and Opus 4.8+ with a
  200K window on Bedrock, Google Cloud and Foundry
  ([model-config](https://code.claude.com/docs/en/model-config)). Changelog: v2.1.247 (2026-08-26) moved
  Sonnet 5 from ~934K to ~967K. v2.1.260 (2026-09-03): "Opus and Fable sessions now compact shortly before
  the 1M-token limit" ([changelog](https://code.claude.com/docs/en/changelog)).
- **User-set window.** `/autocompact 500k` sets the window per model (100K–1M). The `autoCompactWindow`
  setting, the `--autocompact` flag and `CLAUDE_CODE_AUTO_COMPACT_WINDOW` do the same
  ([model-config](https://code.claude.com/docs/en/model-config)). Per-model saving arrived in v2.1.288
  (2026-10-02, [changelog](https://code.claude.com/docs/en/changelog)).
- **Built-in warning.** "A context or auto-compact warning ... The conversation has grown close to the
  session's auto-compact window" ([costs](https://code.claude.com/docs/en/costs)). The last documented
  threshold change was v1.0.51 (2025-07-11): "Increased auto-compact warning threshold from 60% to 80%"
  ([changelog](https://code.claude.com/docs/en/changelog)). **Unverified:** whether 80 % still applies.
  On a 1M model it would mean roughly 770K.
- **Status line data.** `exceeds_200k_tokens` is "a fixed threshold regardless of actual context window
  size". `used_percentage` counts input tokens only. The docs' example script colors context at 70 % / 90 %
  ([statusline](https://code.claude.com/docs/en/statusline)).
- **Anthropic's other default thresholds:**
  - API threshold compaction: 150,000 input tokens by default, minimum 50,000
    ([compaction-threshold](https://platform.claude.com/docs/en/build-with-claude/compaction-threshold)).
  - Context-editing tool-result clearing: triggers at 100,000 input tokens by default.
  - SDK compaction (deprecated): 100,000 tokens by default
    ([context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)).
  - Claude Code resume: "when you resume a session that has been inactive for more than about an hour and
    is over 100,000 tokens", Claude Code offers to resume from a summary
    ([sessions](https://code.claude.com/docs/en/sessions#resume-from-a-summary)).
- **Session hygiene Anthropic recommends**
  ([best practices](https://code.claude.com/docs/en/best-practices#manage-your-session),
  [costs](https://code.claude.com/docs/en/costs#manage-context-proactively)):
  - `/clear` between unrelated tasks.
  - After two failed corrections, `/clear` and rewrite the prompt: "A clean session with a better prompt
    almost always outperforms a long session with accumulated corrections".
  - `/compact <focus>` at natural breaks rather than waiting for auto-compact mid-task.
  - Use subagents for investigation and verbose output, so only a summary lands in the main context.
  - Use `/btw` for side questions.
  - "Unexpectedly high spend ... usually traces back to long sessions that were never cleared."
  - Anthropic also notes the exception: "Sometimes you *should* let context accumulate because you're deep
    in one complex problem."

## Usage limits (subscriptions)

- Long context does draw plan usage faster, and the docs say so directly. "A session that has been open for
  hours can use far more of your plan limits than your activity suggests". With caching, Claude Code
  "re-reads that history at the cached token rate, so a one-line question in a session that has been open
  all day still draws usage for the whole conversation"
  ([costs: why usage climbs](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session)).
- Cache misses after a break longer than the TTL (1 hour on a subscription) reprocess the full context.
  `/compact` on a big context is a big request. "`/clear` costs nothing" (same page).
- On paid plans, `/usage` flags "behaviors such as long context or cache misses" once one "accounts for 10%
  or more of recent usage" ([costs: plan usage breakdown](https://code.claude.com/docs/en/costs#plan-usage-breakdown)).
  **Unverified:** the token size at which `/usage` counts a request as "long context".
- Help center: "Current conversation length" is listed as a factor in usage limits. Cached content "counts
  less against your limits than new content"
  ([usage limit best practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices)).
  "Every previous message is resent on every turn", so clear between tasks
  ([Models, usage, and limits in Claude Code](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code)).
- Team/Enterprise seat allowances reset "on a rolling five-hour window and a weekly window"
  ([costs](https://code.claude.com/docs/en/costs#claude-for-teams-and-enterprise)).
- **Unverified:** how cached versus uncached tokens are weighted against the 5-hour and weekly limits.
  Anthropic does not publish the weighting.

## Sources

All checked 2026-10-03.

Anthropic API docs
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Models overview: https://platform.claude.com/docs/en/models/overview
- Claude Opus 5.5: https://platform.claude.com/docs/en/models/opus-5-5/overview
- What's new in Opus 5.5: https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5
- Context windows: https://platform.claude.com/docs/en/build-with-claude/context-windows
- Compaction overview: https://platform.claude.com/docs/en/build-with-claude/compaction
- Compaction at a token threshold: https://platform.claude.com/docs/en/build-with-claude/compaction-threshold
- Context editing: https://platform.claude.com/docs/en/build-with-claude/context-editing
- Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Reducing latency: https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency
- Rate limits: https://platform.claude.com/docs/en/api/rate-limits

Claude Code docs
- Manage costs: https://code.claude.com/docs/en/costs
- Model configuration (auto-compact window, 1M context): https://code.claude.com/docs/en/model-config
- Prompt caching in Claude Code: https://code.claude.com/docs/en/prompt-caching
- Best practices: https://code.claude.com/docs/en/best-practices
- How Claude Code works: https://code.claude.com/docs/en/how-claude-code-works
- Manage sessions: https://code.claude.com/docs/en/sessions
- Status line: https://code.claude.com/docs/en/statusline
- Changelog: https://code.claude.com/docs/en/changelog

Anthropic posts and system cards
- Effective context engineering for AI agents (2025-09-29): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Claude Opus 5.5 announcement: https://www.anthropic.com/claude-opus-5-5
- Claude Opus 5.5 system card: https://www.anthropic.com/claude-opus-5-5-system-card
- Claude Sonnet 5.5 system card: https://www.anthropic.com/claude-sonnet-5-5-system-card
- Claude Fable 5.1 & Mythos 5.1 system card: https://www.anthropic.com/claude-fable-5-1-system-card
- Claude Opus 4.8 system card: https://www-cdn.anthropic.com/0f0c97ad20d8005706296bd92aa1c27c6b2f4f61/Claude%20Opus%204.8%20System%20Card.pdf
- Claude Opus 4.6 system card: https://www-cdn.anthropic.com/6a5fa276ac68b9aeb0c8b6af5fa36326e0e166dd/Claude%20Opus%204.6%20System%20Card.pdf

Anthropic help center
- Usage limit best practices: https://support.claude.com/en/articles/9797557-usage-limit-best-practices
- Models, usage, and limits in Claude Code: https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code
- How do usage and length limits work?: https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work

Independent
- Chroma, Context Rot (2025-07-14): https://www.trychroma.com/research/context-rot
- Modarressi et al., NoLiMa (ICML 2025): https://arxiv.org/abs/2502.05167
- Hsieh et al., RULER (COLM 2024): https://arxiv.org/abs/2404.06654
- Liu et al., Lost in the Middle (TACL): https://arxiv.org/abs/2307.03172
- Du et al., Context Length Alone Hurts LLM Performance Despite Perfect Retrieval (Findings of EMNLP 2025): https://arxiv.org/abs/2510.05381
- Fiction.LiveBench (2026-04-04): https://fiction.live/stories/Fiction-liveBench-April-04-2026/oQdzQvKHw8JyXbN87
