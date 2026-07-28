const escapeAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export const issuePage = (csrfToken: string): string => `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="issue-token" content="${escapeAttribute(csrfToken)}">
  <meta name="color-scheme" content="light">
  <title>Issues · Web Comic Library</title>
  <link rel="stylesheet" href="/assets/issues.css">
  <script type="module" src="/assets/issues.js"></script>
</head>
<body>
  <header class="app-header">
    <a class="repository" href="/">
      <span class="repository-owner">Web Comic Library</span>
      <span class="repository-divider">/</span>
      <span class="repository-section">Issues</span>
    </a>
    <div class="header-summary" id="header-summary" aria-live="polite">読み込み中…</div>
    <div class="shortcut-hint"><kbd>/</kbd><span>検索</span></div>
  </header>

  <main class="workspace">
    <section class="issue-index" aria-label="Issue一覧">
      <div class="index-title">
        <div>
          <h1>Issues</h1>
          <p>実装、対応、レビューの現在地</p>
        </div>
        <span class="visible-count" id="visible-count"></span>
      </div>

      <nav class="view-tabs" id="view-tabs" aria-label="作業ビュー">
        <button type="button" data-view="active" aria-pressed="true">未完了 <span data-count="active"></span></button>
        <button type="button" data-view="human" aria-pressed="false">人の対応 <span data-count="human"></span></button>
        <button type="button" data-view="review" aria-pressed="false">レビュー <span data-count="review"></span></button>
        <button type="button" data-view="done" aria-pressed="false">完了 <span data-count="done"></span></button>
        <button type="button" data-view="all" aria-pressed="false">すべて <span data-count="all"></span></button>
      </nav>

      <div class="filters">
        <label class="search-field">
          <span class="search-icon" aria-hidden="true"></span>
          <span class="sr-only">Issueを検索</span>
          <input id="search" type="search" placeholder="番号またはタイトルを検索" autocomplete="off">
        </label>
        <div class="filter-row">
          <label>
            <span>状態</span>
            <select id="status-filter"><option value="">すべて</option></select>
          </label>
          <label>
            <span>担当</span>
            <select id="execution-filter"><option value="">すべて</option></select>
          </label>
          <label>
            <span>優先度</span>
            <select id="priority-filter"><option value="">すべて</option></select>
          </label>
          <label>
            <span>レビュー</span>
            <select id="review-filter"><option value="">すべて</option></select>
          </label>
          <label>
            <span>並び順</span>
            <select id="sort">
              <option value="priority">優先度</option>
              <option value="newest">新しい番号</option>
              <option value="oldest">古い番号</option>
            </select>
          </label>
        </div>
        <div class="filter-footer">
          <div class="active-filters" id="active-filters" aria-live="polite"></div>
          <button class="clear-filters" id="clear-filters" type="button" hidden>条件をクリア</button>
        </div>
      </div>

      <div class="issue-list" id="issue-list" aria-live="polite"></div>
    </section>

    <section class="issue-detail" id="issue-detail" aria-label="Issue詳細">
      <div class="detail-empty">
        <div class="empty-mark" aria-hidden="true">#</div>
        <h2>Issueを選択</h2>
        <p>左の一覧から、内容を確認または更新するissueを選んでください。</p>
      </div>
    </section>
  </main>

  <div class="toast-region" id="toast-region" aria-live="polite" aria-atomic="true"></div>
</body>
</html>`;
