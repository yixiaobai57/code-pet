# Build and Release

## Local Builds

Package the app from the repository root:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

The packaged artifacts are written to `dist/`.

Use the command that matches the artifact you want to build. In local development, the most reliable path is to build Windows artifacts on Windows and macOS artifacts on macOS.

## Windows Output Paths

After `npm run build:win`, the main Windows outputs are:

- portable build: `dist/Mitarashi Desktop Pet <version>.exe`
- unpacked build: `dist/win-unpacked/Mitarashi Desktop Pet.exe`

If you change mascot assets, movement logic, or tray behavior, rebuild the Windows target so those packaged files reflect the latest renderer and main-process code.

## Tag-Based Releases

The repository includes a GitHub Actions workflow that:

1. detects tags matching `v*`
2. syncs the tag version into `package.json`
3. builds Windows, macOS, and Linux artifacts
4. uploads the files to a GitHub Release

Example:

```bash
git tag v0.3.0
git push origin v0.3.0
```

Latest docs-backed release summary:

- [v0.3.0 Release Notes](/guide/releases/v0.3.0)

## Regenerate the Release Header

Use the bundled Python helper with `uv run`:

```bash
uv run python scripts/generate_release_header.py --version 0.3.0 --output assets/release-header.svg
```

## Publish the Docs Site

The `docs.yml` workflow builds the VitePress site from `docs/` and deploys `docs/.vitepress/dist` to GitHub Pages.
