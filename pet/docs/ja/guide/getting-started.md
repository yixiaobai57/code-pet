# はじめに

## 必要なもの

- Node.js 20 以上
- npm
- デスクトップアプリを実行するための Windows / macOS / Linux

## インストールと起動

リポジトリのルートで次を実行します。

```bash
npm ci
npm start
```

これで Electron アプリが起動し、猫とペンギンの両方のマスコットウィンドウとトレイアイコンが表示されます。ウィンドウを閉じてもアプリは終了せず、トレイに隠れます。

## Windows 実行ファイルで起動する

Windows ビルド後は、主に次の 2 つを使います。

- `dist/Mitarashi Desktop Pet <version>.exe`
- `dist/win-unpacked/Mitarashi Desktop Pet.exe`

通常利用や配布にはポータブル `.exe`、パッケージ後の挙動確認には展開済みの実行ファイルが便利です。

## ドキュメントのローカル表示

VitePress の依存関係を一度インストールします。

```bash
npm run docs:install
```

その後、ローカル docs サイトを起動します。

```bash
npm run docs:dev
```

## 自動起動

対応プラットフォームでは、トレイメニューからログイン時起動を設定できます。

- Windows: `Start with Windows`
- macOS: `Start at Login`

Windows でログイン時起動した場合、サインイン直後にフォーカスを奪わないよう、アプリはトレイに隠れた状態で起動します。
