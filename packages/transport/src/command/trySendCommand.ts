import type { CommandReply } from '../schema/delivery'
import type { CommandBus } from './CommandBus'

/**
 * A reply, or the reason no reply came. `send` throws on timeout and on a dead
 * bus, which callers must distinguish from a refusal: one means the service is
 * unreachable, the other that the domain said no.
 */
export type CommandOutcome =
  | { reached: true; reply: CommandReply }
  | { reached: false; error: unknown }

/** Turns a throwing `send` into a value, leaving the response to the caller. */
export const trySendCommand = async (
  bus: Pick<CommandBus, 'send'>,
  kind: string,
  args: Record<string, unknown> = {},
  principalUuid?: string,
): Promise<CommandOutcome> => {
  try {
    return { reached: true, reply: await bus.send(kind, args, principalUuid) }
  } catch (error) {
    return { reached: false, error }
  }
}
