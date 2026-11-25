# 海外ニュースポータルポップコーン

世界7地域のRSSを日本語で読む、ビルド不要のニュースポータル。

- 公開ドメイン: https://worldnewsportal.aipopcorn.jp/
- Git: `git@github.com:mbkzmks/world-news-portal.git`
- HTML / CSS / ES Modules、Node.js 22以上。直接依存は `rss-parser` のみ。

## ローカル実行

```sh
npm ci
npm run check
npm test
npm run fetch-news
python3 -m http.server 8080 --bind 127.0.0.1
```

ブラウザーで http://127.0.0.1:8080/ を開く。ファイルを直接開く `file://` は非対応。
`data/news.json` には初回収集済みの実ニュースを保存している。

## GitHub Actions

1. リポジトリの **Settings → Actions → General → Workflow permissions** で **Read and write permissions** を選び **Save**。管理ポリシーで無効なら管理者側の許可が必要。
2. **Actions → Update world news → Run workflow → main** で初回実行する。
3. 以後は毎時15分（UTC、日本時間でも毎時15分）に実行。変更時だけJSONをコミットする。コミットに `[skip ci]` は付けない。

ワークフロー自体にも `permissions: contents: write` を指定している。収集専用のシークレットは不要。
スケジュールは遅延することがあり、公開リポジトリでは60日間活動がないと定期実行が無効化される場合がある。

## Cloudflare Pages と独自ドメイン

1. **Workers & Pages → Create application → Pages → Import an existing Git repository** から `mbkzmks/world-news-portal` を選ぶ。
2. Project name: `world-news-portal`、Production branch: `main`、Framework preset: **None**。
3. **Build command: 空欄 / Build output directory: `/`**。Root directoryは未指定。環境変数 `SKIP_DEPENDENCY_INSTALL=true` を指定する（静的公開にnpmインストールは不要）。画面でコマンドが必須の場合のみ `exit 0` を使用。
4. デプロイ後、**Custom domains → Set up a custom domain** で `worldnewsportal.aipopcorn.jp` を追加。同じCloudflareアカウントの `aipopcorn.jp` ゾーンに必要なCNAMEを作成する。
5. カスタムドメインが **Active** になりHTTPS表示できることを確認する。DNSだけを先に手動追加せず、Pages側へのドメイン登録を行う。
6. 初回と自動JSONコミット後にPagesのデプロイ履歴を確認する。Git連携の対象ブランチは `main`。

Cloudflare GitHub Appのリポジトリへのアクセス許可が未設定の場合は、対象リポジトリを許可してから連携する。
公開リポジトリのGitHub Actions標準ランナーとPages無料枠を使用する想定。
**Pages無料枠のGitビルドは月500回**。毎時データが変わると月最大744回になるため、指定どおりの毎時更新を月全体で無料継続できる保証はない。現設定は毎時更新を維持している。2時間ごとへの変更、またはGitHub Actionsからの直接アップロード方式（別途APIトークン設定）での運用を検討する。
公式の [Pages制限](https://developers.cloudflare.com/pages/platform/limits/) を参照。無料枠・サービス条件は変更され得る。

## データと障害時の動作

- `scripts/feeds.json`: 7地域×2媒体。媒体の地域別フィードを優先。一部は媒体全体の配信で、記事単位の地域判定はしない。
- 各フィードの新しい5件を収集。URL重複を除き、既存記事と合わせて公開日時の降順で最大120件保存。
- 翻訳済みURLは再翻訳しない。翻訳エラーは原文を保存し、次回再試行。タイトルと短い要約を区切り文字で結合して1回で翻訳する。
- フィード障害は個別にスキップ。全フィード失敗時は既存JSONを変更せず異常終了。ファイルの読込異常時も上書きしない。
- 記事内容に変化がなければ更新日時も変更しない。画面は24時間以上データ更新がない場合に案内を表示する。
- 外部テキストは `textContent` で描画。リンクはHTTP(S)だけを許可。外部ページは別タブで開く。
- 検索入力で現在の地域内の記事を絞り込み、Enterまたは検索ボタンでGoogle検索へ移動。
- 天気は東京固定。Open-Meteoから現在気温・天気・当日最高最低気温を取得。失敗時は再取得ボタンを表示。

Googleの指定翻訳エンドポイントは非公式で、提供継続・翻訳品質・利用上限の保証はない。外部フィードもアクセス制限やURL変更があり得る。
広告はプレースホルダーのみ。公開・収益化時は各RSSの転載・翻訳条件とOpen-Meteoの利用条件を確認する。

## 保守

製品仕様は [docs/SPEC.md](docs/SPEC.md)、現在の作業状況は [docs/TODO.md](docs/TODO.md)、設計判断は [docs/DECISIONS.md](docs/DECISIONS.md) を参照。
作業開始前に `AGENTS.md` を読む。

公式資料: [Pagesの静的HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)、[カスタムドメイン](https://developers.cloudflare.com/pages/configuration/custom-domains/)、[Actionsの定期実行](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[Open-Meteo](https://open-meteo.com/en/docs)。
