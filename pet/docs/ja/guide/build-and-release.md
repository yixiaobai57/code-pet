# ビルドとリリース

## ローカルビルド

リポジトリのルートで次を実行します。

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

生成物は `dist/` に出力されます。

欲しい成果物に応じて対応するコマンドを使ってください。ローカル開発では、Windows 向けは Windows 上、macOS 向けは macOS 上でビルドするのが最も安定します。

## Windows 出力先

`npm run build:win` の後は、主に次の 2 つが生成されます。

- ポータブル版: `dist/Mitarashi Desktop Pet <version>.exe`
- 展開済み版: `dist/win-unpacked/Mitarashi Desktop Pet.exe`

マスコット素材、移動ロジック、トレイ挙動を変更した場合は、Windows ターゲットを再ビルドして、パッケージ済みファイルにも最新コードを反映してください。

## タグベースのリリース

このリポジトリには GitHub Actions ワークフローがあり、次を自動実行します。

1. `v*` 形式のタグを検出
2. タグのバージョンを `package.json` に同期
3. Windows / macOS / Linux 向け成果物をビルド
4. 生成物を GitHub Release にアップロード

例:

```bash
git tag v0.3.0
git push origin v0.3.0
```

最新の docs 版リリース要約:

- [v0.3.0 リリースノート](/ja/guide/releases/v0.3.0)

## リリースヘッダー画像の再生成

付属の Python ヘルパーは `uv run` で実行します。

```bash
uv run python scripts/generate_release_header.py --version 0.3.0 --output assets/release-header.svg
```

## docs サイトの公開

`docs.yml` ワークフローは `docs/` の VitePress サイトをビルドし、`docs/.vitepress/dist` を GitHub Pages へデプロイします。
