import type { Register } from 'claude-code'

import { register as mermaid } from './mermaid'

// One line per tool, keyed by its userConfig field. The loader refuses `on` passed to anything
// but a function named here, so the tools cannot be looped over from a table.
export const register: Register = (on, options) => {
  if (options.mermaid !== false) mermaid(on, options)
}
