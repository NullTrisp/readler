# Reader fixtures

Binary books are intentionally not committed. Add licensed test files locally as:

- `sample.cbz` with numbered images and optional `ComicInfo.xml`
- `sample.epub` with metadata, cover, Unicode text, and chapters
- `sample.pdf` with several pages
- corrupted/password-protected variants for error-path testing

Also test a large archive near the device-space limit and a catalog containing at least 1,000 metadata records.
