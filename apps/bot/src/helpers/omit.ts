export const omit = <
  Entity extends Record<PropertyKey, unknown>,
  Path extends keyof Entity,
>(
  entity: Entity,
  paths: Path[],
): Omit<Entity, Path> =>
  Object.fromEntries(
    Object.entries(entity).filter(([key]) => !paths.includes(key as Path)),
  ) as Omit<Entity, Path>
