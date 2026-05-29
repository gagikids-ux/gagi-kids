let handler

try {
  const mod = await import('../server.js')
  handler = mod.default
} catch (err) {
  handler = (req, res) => res.status(500).json({
    error: err.message,
    name: err.constructor?.name,
    stack: err.stack?.split('\n').slice(0, 6)
  })
}

export default handler
