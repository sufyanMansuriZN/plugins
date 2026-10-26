import type { Register } from 'claude-code'

import { register as cd } from './cd'
import { register as mermaid } from './mermaid'
import { register as plan } from './plan'
import { register as reply } from './reply'
import { register as sessions } from './sessions'
import { register as wrapUp } from './wrap-up'

// One line per tool, every tool always on. The loader refuses `on` passed to anything but a function
// named here, so the tools cannot be looped over from a table. The mermaid preview and table copy
// draw parts of a reply, so they share the reply hook. The first registered hook is outermost, and the
// reply hook draws tables without passing on, so sessions comes before it to put its cards under any reply.
export const register: Register = (on, options) => {
  mermaid(on, options)
  sessions(on, options)
  reply(on, options)
  cd(on, options)
  wrapUp(on, options)
  plan(on, options)
}
