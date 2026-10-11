# Changelog

All notable changes to `@ranza/branding` will be documented in this file.

## 0.0.0

- Initial release (RANZ-47): an Organization sets one brand colour and one logo; the Portal a Guest opens draws them. Every valid colour is accepted; the foreground is derived by WCAG contrast and a darker text shade of the same hue is derived for text and links on white. A logo is validated by its bytes, stored in Postgres, and served versioned by its hash. Every change and every reset is audited. A Resident reads the brand of an Organization they have a current Stay with, by Stay.
- RANZ-47 review: a Resident reads a brand only where the Portal is shown a Stay (Subscription, Entitlement and Portal capability), and only the columns the Portal draws. The logo is checked for integrity (PNG chunks and IEND, WebP length, JPEG markers). `brandSettings` says why a viewer may not change the brand.
