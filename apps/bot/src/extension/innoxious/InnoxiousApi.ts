import { applicationLogger as logger } from '../../log'
import type { InnoxiousMediaGroup, MediaInput } from './InnoxiousMedia'

export class InnoxiousApi {
  tryIndex = 0

  async execute<Input extends MediaInput, Result>(
    media: InnoxiousMediaGroup<Input>,
    callback: (resolver: () => Promise<Input[]>) => Promise<Result>,
    defaultValue: Result,
  ): Promise<Result> {
    let result: Result = defaultValue

    // First try naive approach (prefer remote links / minimal buffering)
    if (this.tryIndex < 3) {
      try {
        result = await callback(() => media.naive())
        this.tryIndex = 0
        return result
      } catch (error) {
        logger.error(
          'Error while publishing media by public (naive) strategy',
          error,
        )
        this.tryIndex++
      }
    }

    // If naive failed several times - fallback to accurate (buffered) approach
    if (this.tryIndex !== 0) {
      logger.debug('Retrying with buffered (accurate) strategy')

      try {
        result = await callback(() => media.accurate())
        this.tryIndex = 0
      } catch (error) {
        logger.error(
          'Error while publishing media by buffered (accurate) strategy',
          error,
        )
      }
    }

    return result
  }
}
