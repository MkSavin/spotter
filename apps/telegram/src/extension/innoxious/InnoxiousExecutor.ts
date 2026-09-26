import { applicationLogger as logger } from '../../log'
import type {
  InnoxiousMedia,
  InnoxiousMediaGroup,
  MediaInput,
} from './InnoxiousMedia'

export class InnoxiousExecutor {
  async execute<
    Input extends MediaInput,
    Media extends InnoxiousMedia<Input> | InnoxiousMediaGroup<Input>,
    Result,
  >(
    media: Media,
    callback: (
      resolver: () => Promise<
        Media extends InnoxiousMedia<Input> ? Input : Input[]
      >,
    ) => Promise<Result>,
  ): Promise<Result> {
    // Reason only: the error object expands into a grammY source dump.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callback(() => media.naive() as any)
      } catch (error) {
        logger.warn(
          `Publishing media by public (naive) strategy failed: ${(error as Error)?.message}`,
        )
      }
    }

    logger.debug('Retrying with buffered (accurate) strategy')

    try {
      return await callback(() => media.accurate() as any)
    } catch (error) {
      logger.error(
        `Publishing media by buffered (accurate) strategy failed: ${(error as Error)?.message}`,
      )
      throw error
    }
  }
}
