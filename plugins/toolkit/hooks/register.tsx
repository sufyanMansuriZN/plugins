import type { Register } from 'claude-code'

import { register as cd } from './cd'
import { register as mermaid } from './mermaid'
import { register as reply } from './reply'

// One line per tool. A tool that can be turned off is gated on its userConfig field. The loader
// refuses `on` passed to anything but a function named here, so the tools cannot be looped over
// from a table. Tools that draw part of a reply share the reply hook.
export const register: Register = (on, options) => {
  mermaid(on, options)
  reply(on, options)
  if (options.cd !== false) cd(on, options)
}
