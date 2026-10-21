# Self-hosted fonts

Every typeface in the app loads from this folder through `next/font/local`. Builds never download fonts, so a Google Fonts outage or a slow network cannot fail a build.

The files are the Latin subset that `next/font/google` would download for each call: the same family, weights, styles, and variable axes. Each folder holds one family. Each file name gives the family, style, weight range, any extra variable axis (for example `opsz`), and the subset, for example `newsreader-normal-200-800-opsz-latin.woff2`.

All files come from Google Fonts. Each family is licensed under the SIL Open Font License 1.1 or the Apache License 2.0, as its Google Fonts page states. Both licenses allow these files to be served on a website.

## Add a font

1. Request the CSS for the family from the Google Fonts CSS2 API with a modern browser user agent, for example `https://fonts.googleapis.com/css2?family=Urbanist:wght@100..900&display=swap`.
2. Download the `woff2` file under the `/* latin */` comment, and save it as `<family>/<family>-<style>-<weights>-latin.woff2`.
3. Load it with `localFont` and a relative path, and give each file its weight or weight range and style:

```ts
import localFont from "next/font/local";

export const display = localFont({
  src: [
    { path: "../../../assets/fonts/urbanist/urbanist-normal-100-900-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--radar-font",
});
```

Use `adjustFontFallback: "Times New Roman"` for serif families. The default fallback (`Arial`) suits the others.
