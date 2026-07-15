const UNSAFE_CHILD_ENVIRONMENT_KEY = /^(?:NODE_OPTIONS|NODE_PATH|NODE_REPL_.*|ELECTRON_RUN_AS_NODE)$/i

export function sanitizeChildEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !UNSAFE_CHILD_ENVIRONMENT_KEY.test(key))
  )
}
