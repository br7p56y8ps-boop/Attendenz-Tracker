# Offline font assets

These WOFF2 variable-font files are local copies of the Latin and Latin-ext subsets served by the [Google Fonts CSS API](https://fonts.googleapis.com/css2). Each family is defined in `src/fonts.css` so the selected typeface can load offline. The app's service worker discovers these font URLs in the generated stylesheet and adds them to its install cache.

Included families: Caveat, Comfortaa, DM Sans, Inter, Lora, Manrope, Nunito, Oswald, Outfit, Playfair Display, Plus Jakarta Sans, Roboto Mono, Source Code Pro, and Space Grotesk.

The per-family SIL Open Font License texts are kept in `licenses/` and are sourced from the matching directories in the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl). Keep the license files with the font assets when redistributing them.
