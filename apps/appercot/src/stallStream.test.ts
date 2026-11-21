import { expect, test } from 'bun:test'
import * as stallStream from './stallStream'

test('an active upload outlives its stall window', async () => {
  const streamWithStall = (
    stallStream as unknown as {
      streamWithStall?: (
        source: ReadableStream<Uint8Array>,
        stallMs: number,
      ) => { stream: ReadableStream<Uint8Array>; signal: AbortSignal }
    }
  ).streamWithStall
  expect(streamWithStall).toBeFunction()
  if (!streamWithStall) throw new Error('Stall-aware stream is missing')

  const source = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of ['a', 'b', 'c']) {
        controller.enqueue(new TextEncoder().encode(chunk))
        await Bun.sleep(15)
      }
      controller.close()
    },
  })
  const { stream, signal } = streamWithStall(source, 20)

  expect(await new Response(stream).text()).toBe('abc')
  expect(signal.aborted).toBe(false)
})

test('an inactive upload aborts after its stall window', async () => {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('a'))
    },
  })
  const { stream, signal } = stallStream.streamWithStall(source, 10)
  const reader = stream.getReader()
  await reader.read()
  await new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })

  expect(signal.aborted).toBe(true)
  await reader.cancel().catch(() => undefined)
})
