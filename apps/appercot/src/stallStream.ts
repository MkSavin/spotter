export const streamWithStall = (
  source: ReadableStream<Uint8Array>,
  stallMs = 30_000,
) => {
  const aborter = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const restart = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      aborter.abort(new Error(`Upload made no progress for ${stallMs}ms`))
    }, stallMs)
  }
  const reader = source.getReader()
  const stream = new ReadableStream<Uint8Array>({
    start: restart,
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          clearTimeout(timer)
          controller.close()
          return
        }
        restart()
        controller.enqueue(value)
      } catch (error) {
        clearTimeout(timer)
        controller.error(error)
      }
    },
    async cancel(reason) {
      clearTimeout(timer)
      await reader.cancel(reason)
    },
  })
  return { stream, signal: aborter.signal }
}
