import type { Register } from 'claude-code'

import { register as cd } from './cd'
import { register as mermaid } from './mermaid'
import { register as reply } from './reply'

// One line per tool, keyed by its userConfig field. The loader refuses `on` passed to anything
// but a function named here, so the tools cannot be looped over from a table. Tools that draw part
// of a reply share the reply hook, which reads their options itself.
export const register: Register = (on, options) => {
  if (options.mermaid !== false) mermaid(on, options)
  if (options.mermaid !== false) reply(on, options)
  if (options.cd !== false) cd(on, options)
}
