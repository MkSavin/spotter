export const get = <
  Entity extends Record<string, unknown>,
  Path extends keyof Entity,
>(
  entity: Entity,
  path: Path,
  defaultValue: Entity[Path],
): Entity[Path] => {
  return path in entity ? entity[path] : defaultValue
}
