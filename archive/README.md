# Archive

This folder keeps code and files that the launch does not use.
The owner approved this "trim" in [docs/LAUNCH.md](../docs/LAUNCH.md): unused code moves here. It is not deleted.

## What this folder is

- Files here stay in Git. Their history stays with them when you move them with `git mv`.
- Nothing here is built, type-checked, linted, or tested.
- Nothing here is uploaded to Vercel.
- The secret scan (`npm run check:secrets`) still scans this folder. Do not put secrets here.

Because nothing checks this code, it can stop working as the rest of the project changes.
Do not import from `archive/` in application code.

## How to restore something

1. Move it back to its old path with `git mv archive/<path> <old-path>`.
2. Repair imports and other code that changed since the move.
3. Run the four checks: `npm run type-check`, `npm run lint`, `npm test`, and `npm run build`.

## Where the exclusion is set

- `tsconfig.json`: `exclude` lists `archive`.
- `eslint.config.mjs`: `globalIgnores` lists `archive/**`.
- `.vercelignore`: lists `/archive`.
- `vitest.config.ts` and `vitest.integration.config.ts` include only `src/**`, so they skip this folder.
- `src/app/globals.css`: `@source not "../../archive"` stops Tailwind from reading this folder.

## What is archived

Trim task 8 (the two design galleries):

- `src/gallery/`: the 20 candidate designs, their kit, and the review tools.
- `src/app/gallery/`: the `/gallery` pages.
- `src/app/api/gallery/`: the gallery review endpoints.
- `public/gallery-previews/`: the gallery preview images.
- `src/designs/<name>/`: the 21 older designs. Pulse stays in `src/designs/pulse/`.
- `src/designs/registry.ts`, `registry.test.ts`, and `commission-copy.test.ts`: the older gallery list and its tests.
- `src/designs/pulse/Design.tsx`: the standalone Pulse that only `/designs/pulse` used.
- `src/app/(marketing)/designs/`: the `/designs` pages.

The archived designs load fonts from `src/assets/fonts/`. Those fonts stay in `src/`, so a restored design finds them.

Newsletter provider change (owner decision, 2026-11-25: Resend replaces Beehiiv):

- `src/server/workflows/beehiiv-newsletter-service.ts` and its test: the older Beehiiv newsletter adapter.
