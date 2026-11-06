"""How the toolkit was used: its model tools from the transcripts, its buttons from the usage logs.

Usage: python3 -I scripts/usage.py [--since YYYY-MM-DD] [--errors]

The transcripts are Claude Code's, in ~/.claude/projects/. They hold every call Claude made to a
toolkit tool, but not a press on what the toolkit draws; the toolkit notes each press in
~/.claude/toolkit/usage/<session id>.jsonl (hooks/usage.ts). Only terminal sessions count, and only
those that started with the toolkit's rules.
"""
import argparse, collections, datetime, glob, json, os, re

HOME = os.path.expanduser('~')
APP_ACTIONS = {'commit': 'Commit', 'create_pr': 'Create PR', 'merge': 'Merge', 'fix_ci': 'Fix CI',
               'address_comments': 'Address comments', 'resolve_conflicts': 'Resolve conflicts', 'verify': 'Verify'}
# A pressed element's key → the tool and the control it belongs to.
CONTROLS = [
    (r'quote:', 'quote copy', 'copy text'),
    (r'md:', 'table copy', 'copy as markdown'),
    (r'rich:', 'table copy', 'copy table'),
    (r'prose:', 'file links', 'open a file'),
    (r'retry-', 'mermaid', 'Retry'),
    (r'toggle-', 'mermaid', 'Show source / Show picture'),
    (r'full-', 'mermaid', 'open full size'),
    (r'answer:0', 'next step box', 'first answer'),
    (r'answer:', 'next step box', 'another answer'),
    (r'toggle$', 'task list', '+N more / show less'),
    (r'attach:', 'sessions', 'copy claude attach'),
]
TABLE = re.compile(r'^\s*\|.*\|\s*\n\s*\|[\s:|-]+\|\s*$', re.M)
QUOTE = re.compile(r'^>\s?\S', re.M)
SPAN = re.compile(r'`([^`\s]*[/.][^`\s]*?)(?::\d+(?:[-:]\d+)?)?`')


def text_of(content):
    if isinstance(content, str):
        return content
    return '\n'.join(b.get('text', '') for b in content or [] if isinstance(b, dict) and b.get('type') == 'text')


def error_kind(text):
    text = re.sub(r'</?tool_use_error>', '', text).strip()
    text = re.sub(r'task_\w+', 'task_…', re.sub(r'"[^"]*"', '"…"', re.sub(r'\d+', 'N', text)))
    return text[:110]


def scan_transcript(path, report, since):
    calls, open_ask, is_toolkit, cwd = {}, None, False, ''
    rows = []
    for line in open(path, errors='replace'):
        try:
            rows.append(json.loads(line))
        except ValueError:
            pass
    if not any(row.get('entrypoint') == 'cli' for row in rows[:50]):
        return
    for row in rows:
        if row.get('type') == 'attachment':
            is_toolkit = is_toolkit or '(toolkit)' in str((row.get('attachment') or {}).get('content', ''))[:200]
            continue
        # A resumed transcript holds older turns too; only the window counts.
        if row.get('isSidechain') or row.get('timestamp', since) < since:
            continue
        cwd = row.get('cwd') or cwd
        content = (row.get('message') or {}).get('content')
        if row.get('type') == 'assistant':
            for block in content or []:
                if block.get('type') == 'tool_use' and block.get('name', '').startswith('mcp__toolkit__'):
                    tool = block['name'].removeprefix('mcp__toolkit__')
                    report['calls'][tool] += 1
                    calls[block.get('id')] = tool
                    given = block.get('input') or {}
                    if tool == 'wrap_up' and given.get('ask'):
                        open_ask = {a.get('label') or APP_ACTIONS.get(a.get('action'), '') for a in given.get('actions') or []}
                elif block.get('type') == 'text':
                    text = re.sub(r'```.*?```', '', block.get('text', ''), flags=re.S)
                    shapes = report['shapes']
                    shapes['replies'] += 1
                    shapes['with a mermaid block'] += '```mermaid' in block.get('text', '')
                    shapes['with a table'] += bool(TABLE.search(text))
                    shapes['with a block quote'] += bool(QUOTE.search(text))
                    named = [os.path.join(cwd, os.path.expanduser(p)) for p in SPAN.findall(text)]
                    shapes['with a file that exists'] += any(os.path.exists(p) for p in named)
        elif row.get('type') == 'user':
            results = [b for b in content if isinstance(b, dict) and b.get('type') == 'tool_result'] if isinstance(content, list) else []
            for block in results:
                tool = calls.pop(block.get('tool_use_id'), None)
                if tool and block.get('is_error'):
                    report['errors'][tool][error_kind(text_of(block.get('content')))] += 1
            prompt = None if results or row.get('isMeta') else text_of(content).strip()
            if prompt and open_ask is not None and not prompt.startswith('<'):
                report['answers']['pressed a button' if prompt in open_ask else 'typed a prompt instead'] += 1
                open_ask = None
    report['sessions'] += is_toolkit


def main():
    parser = argparse.ArgumentParser(description='How the toolkit was used, since a date (two weeks ago by default).')
    parser.add_argument('--since', default=(datetime.date.today() - datetime.timedelta(days=14)).isoformat())
    parser.add_argument('--errors', action='store_true', help='list every kind of error a tool returned')
    args = parser.parse_args()
    since = datetime.datetime.fromisoformat(args.since).timestamp()
    since_utc = datetime.datetime.fromtimestamp(since, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')

    report = {'sessions': 0, 'calls': collections.Counter(), 'errors': collections.defaultdict(collections.Counter),
              'answers': collections.Counter(), 'shapes': collections.Counter()}
    for path in glob.glob(f'{HOME}/.claude/projects/*/*.jsonl'):
        if os.path.getmtime(path) >= since:
            scan_transcript(path, report, since_utc)

    presses, logs = collections.Counter(), 0
    for path in glob.glob(f'{HOME}/.claude/toolkit/usage/*.jsonl'):
        for line in open(path, errors='replace'):
            try:
                press = json.loads(line)
            except ValueError:
                continue
            if not isinstance(press, dict) or str(press.get('at', '')) < since_utc:
                continue
            logs += 1
            element = str(press.get('element', ''))
            tool, control = next(((t, c) for key, t, c in CONTROLS if re.match(key, element)), ('other', element))
            presses[tool, control] += 1

    print(f'Since {args.since}: {report["sessions"]} terminal sessions with the toolkit\'s rules.\n')
    print('Model tools (calls, errors):')
    for tool, count in report['calls'].most_common():
        errors = report['errors'][tool]
        print(f'  {tool:26} {count:6} {sum(errors.values()):5}')
        for kind, n in errors.most_common(None if args.errors else 2):
            print(f'  {"":26} {"":6} {n:5}  {kind}')
    answers = report['answers']
    if answers:
        print(f'\nQuestions in the next step box answered by the next prompt: {dict(answers)}')
    print(f'\nPresses on what the toolkit draws ({logs} in the usage logs):')
    if not presses:
        print('  none yet: the toolkit notes presses from version 0.16.0 on')
    for (tool, control), count in sorted(presses.items()):
        print(f'  {tool:16} {control:36} {count:5}')
    print('\nTerminal replies (what the drawing tools act on):')
    for shape, count in report['shapes'].items():
        print(f'  {shape:26} {count:6}')


if __name__ == '__main__':
    main()
