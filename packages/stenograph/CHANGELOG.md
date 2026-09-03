# stenograph

## 1.3.0

### Minor Changes

- 79f802b: feat: stamp every log line with `dd.mm.yyyy hh:mm:ss`
  
  A log said what happened but not when, so correlating our lines against an NVR's or a broker's meant guessing. The time is local, since container logs are read next to a wall clock and `TZ` is already set per node.
  
  fix: stop the catalog from burying the log
  
  `Catalog for "..." unchanged` is gone: it was the expected outcome of every quiet refresh and said nothing. A forced republish of an identical catalog drops to debug — only a catalog that actually differs stays at info, because that means cameras appeared or went away. Twelve quiet refreshes now print one line instead of thirteen; a real deployment log showed 98 catalog lines where 1 was informative.
  
  `publishCatalog` takes an explicit `force` rather than having the caller drop the memo, so a forced round can still tell a genuine change from a routine repeat.

## 1.2.0

### Minor Changes

- 6fcfb86: Architectural refactoring

## 1.1.0

### Minor Changes

- 538fb94: Full project architecture rework

## 1.0.2

### Patch Changes

- dc9bc6b: Overall stability fixes and improvements

## 1.0.1

### Patch Changes

- d18442e: fix: stenograph log levels prefixes changed. Prisma schema file moved to root directory
