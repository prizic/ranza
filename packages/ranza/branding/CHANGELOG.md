# Changelog

All notable changes to `@ranza/branding` will be documented in this file.

## 0.0.0

- Initial release (RANZ-47): an Organization sets one brand colour and one logo; the Portal a Guest opens draws them. The foreground is derived by WCAG contrast and a colour too light to read as text on the canvas is refused. A logo is validated by its bytes, stored in Postgres, and served versioned by its hash. Every change and every reset is audited. A Resident reads the brand of an Organization they have a current Stay with, by Stay.
