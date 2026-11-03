import { defineConfig } from "vitepress";

const repo = "https://github.com/Sunwood-ai-labs/desktop-pet-mitarashi";
const docsUrl = "https://sunwood-ai-labs.github.io/desktop-pet-mitarashi/";

export default defineConfig({
  title: "Desktop Pet Mitarashi",
  description: "Tray-friendly desktop cat mascot with bilingual docs and release workflows.",
  base: "/desktop-pet-mitarashi/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", href: "/fav.svg" }],
    ["meta", { name: "theme-color", content: "#d98943" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Desktop Pet Mitarashi" }],
    ["meta", { property: "og:description", content: "Tray-friendly desktop cat mascot built with Electron." }],
    ["meta", { property: "og:image", content: `${docsUrl}release-header.svg` }]
  ],
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      title: "Desktop Pet Mitarashi",
      description: "Tray-friendly desktop cat mascot built with Electron."
    },
    ja: {
      label: "日本語",
      lang: "ja-JP",
      title: "Desktop Pet Mitarashi",
      description: "Electron 製のデスクトップ猫マスコット。"
    }
  },
  themeConfig: {
    logo: "/fav.svg",
    siteTitle: "Desktop Pet Mitarashi",
    search: {
      provider: "local"
    },
    socialLinks: [
      { icon: "github", link: repo }
    ],
    footer: {
      message: "Built with Electron, VitePress, and a running cat.",
      copyright: "MIT License"
    },
    locales: {
      root: {
        nav: [
          { text: "Guide", link: "/guide/getting-started" },
          { text: "Features", link: "/guide/features" },
          { text: "Articles", link: "/guide/articles/v0.3.0-launch-story" },
          { text: "Build & Release", link: "/guide/build-and-release" },
          { text: "Releases", link: "/guide/releases/v0.3.0" },
          { text: "GitHub", link: repo }
        ],
        sidebar: [
          {
            text: "Guide",
            items: [
              { text: "Getting Started", link: "/guide/getting-started" },
              { text: "Features and Controls", link: "/guide/features" },
              { text: "Build and Release", link: "/guide/build-and-release" }
            ]
          },
          {
            text: "Articles",
            items: [
              { text: "v0.3.0 Launch Story", link: "/guide/articles/v0.3.0-launch-story" }
            ]
          },
          {
            text: "Releases",
            items: [
              { text: "v0.3.0", link: "/guide/releases/v0.3.0" }
            ]
          }
        ],
        outlineTitle: "On this page",
        docFooter: {
          prev: "Previous page",
          next: "Next page"
        },
        editLink: {
          pattern: `${repo}/edit/main/docs/:path`,
          text: "Suggest a change to this page"
        }
      },
      ja: {
        nav: [
          { text: "ガイド", link: "/ja/guide/getting-started" },
          { text: "機能", link: "/ja/guide/features" },
          { text: "記事", link: "/ja/guide/articles/v0.3.0-launch-story" },
          { text: "ビルド", link: "/ja/guide/build-and-release" },
          { text: "リリース", link: "/ja/guide/releases/v0.3.0" },
          { text: "GitHub", link: repo }
        ],
        sidebar: [
          {
            text: "ガイド",
            items: [
              { text: "はじめに", link: "/ja/guide/getting-started" },
              { text: "機能と操作", link: "/ja/guide/features" },
              { text: "ビルドとリリース", link: "/ja/guide/build-and-release" }
            ]
          },
          {
            text: "記事",
            items: [
              { text: "v0.3.0 紹介記事", link: "/ja/guide/articles/v0.3.0-launch-story" }
            ]
          },
          {
            text: "リリース",
            items: [
              { text: "v0.3.0", link: "/ja/guide/releases/v0.3.0" }
            ]
          }
        ],
        outlineTitle: "このページ",
        docFooter: {
          prev: "前のページ",
          next: "次のページ"
        },
        editLink: {
          pattern: `${repo}/edit/main/docs/:path`,
          text: "このページを編集する"
        }
      }
    }
  }
});
