import type { Register } from 'claude-code'

import { register as cd } from './cd'
import { register as mermaid } from './mermaid'
import { register as plan } from './plan'
import { register as reply } from './reply'
import { register as restart } from './restart'
import { register as sessions } from './sessions'
import { register as usage } from './usage'
import { register as wrapUp } from './wrap-up'

// One line per tool, every tool always on. The loader refuses `on` passed to anything but a function
// named here, so the tools cannot be looped over from a table. The mermaid preview and table copy
// draw parts of a reply, so they share the reply hook. The first registered hook is outermost, and the
// reply hook draws tables without passing on, so the next step box, sessions and the task list come before
// it to draw under any reply. Under a reply they draw in the reverse order: the list, the cards, then the box.
export const register: Register = (on, options) => {
  mermaid(on, options)
  wrapUp(on, options)
  sessions(on, options)
  plan(on, options)
  reply(on, options)
  cd(on, options)
  restart(on, options)
  usage(on, options)
}
