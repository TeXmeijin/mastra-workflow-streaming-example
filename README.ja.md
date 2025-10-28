# 本番環境向けストリーミングマルチエージェントワークフロー：Mastra v0.20とリアルタイムレンダリングの技術的研究

## 要旨

本リポジトリは、Next.js App Routerアーキテクチャと統合されたMastra v0.20フレームワークを用いた、ストリーミングマルチエージェントワークフローの包括的な実装研究を提示する。NDJSONストリーミング、部分的JSONパース、プログレッシブUIレンダリングを通じた本番環境レベルのリアルタイムワークフロー可視化アプローチを実証する。本実装は、学習者理解・深層リサーチ・統合という3段階のアドバイザリーワークフローを包含し、単一エージェントアプローチと比較したワークフローベースのエージェントオーケストレーションのアーキテクチャ上の優位性を例証する。主要な技術的貢献は以下の通り：(1) `fullStream.pipeTo`を通じた高価値ツールイベント（現状はweb検索）の選択的ストリーミング、(2) `parsePartialJson`を用いたクライアント側プログレッシブレンダリング、(3) 置換/追加セマンティクスによる多段階エージェント出力のステートフル管理。本システムは、共有Zodスキーマでレイヤー間の契約を合わせつつランタイム検証の課題を明記し、中間ワークフロー状態を公開することで応答性の高いユーザー体験を実現する。

---

**実装に関する注記**: 本プロジェクトの実装においてはAIコーディングアシスタント（Claude Code、Codex）を活用しているが、核心となるストリーミングプロトコルのアーキテクチャ—特に`fullStream.pipeTo(writer)`パターンおよびNDJSONイベント多重化—は、著者自身によるMastra内部イベント構造の直接観測と反復的な実験を通じて開発された。

---

## 1. はじめに

### 1.1 背景と動機

**toC向けAIサービスにおけるユーザー体験要求**

複雑な推論タスクは、包括的なソリューションを提供するために、複数の専門AIエージェント—学習者プロファイリング、深層リサーチ、アドバイザリー統合—の協調を必要とする場面が増えている。しかし、toC向けサービスは厳しいUX制約に直面する：ユーザーは進捗が可視化されない数秒間の待機でインタラクションを放棄する。中間出力のリアルタイム透明性は選択肢ではなく、ユーザー離脱を防ぎエンゲージメントを維持するための必須要件である。

**確立された基盤とその限界**

先行研究（[Manalink Dev: Teacher Search Agent](https://zenn.dev/manalink_dev/articles/teacher-search-agent-by-mastra)）は、単一AIエージェントによる構造化データストリーミングがこれらのUX要求を満たせることを実証した。不完全なJSONを再構築する`parsePartialJson()`、部分的に生成されたオブジェクトのための`DeepPartial<T>`型、慎重なUIレンダリングといった技術により、単一エージェントワークフローのリアルタイム可視性を成功裏に実現している。

しかし、単一エージェントアーキテクチャは本質的に問題の複雑性を制限する。タスクが多段階推論、ツール呼び出しを伴う反復的リサーチ、情報源を跨ぐ統合を要求する場合、ワークフローを通じた複数の専門エージェントの調整がアーキテクチャ上必要となる。Mastra v0.20の`workflow.createRunAsync().streamVNext()`はワークフローオーケストレーションを提供するが、明示的なストリーミング実装なしでは**ネストしたツール呼び出し**（Workflow → Step → Agent → Tool）は不透明なままである。ワークフローステップ内でリサーチエージェントが実行する15秒のWeb検索はUIをフリーズさせる—toC文脈では容認不可能である。

**貢献：複雑なマルチエージェントタスクに対する厳しいUX要求の充足**

本研究は、マルチエージェントワークフローのストリーミングメカニズムを実装することでアーキテクチャギャップに対処する。`fullStream.pipeTo(writer)`と、意図的なサーバー側フィルタリングを組み合わせてワークフロー階層を通じて高価値なツール呼び出しと中間状態を伝播させることで、複雑なマルチエージェントシステムでもユーザーが追跡しやすい情報だけを提示できることを示す。現在のリファレンス実装ではリサーチ進捗を示すweb検索ツール呼び出しをデフォルトで可視化し、要件に応じて他ツールを段階的に追加できる設計としている。これにより、toC向けサービスは洗練されたマルチエージェント推論を活用しつつユーザー体験を損なわない—本番環境デプロイメントにおける必須要件である。

### 1.2 目的

本技術的研究はワークフローストリーミングの課題に取り組む：

1. **高価値ツール呼び出しのストリーミング**: ワークフローステップ内で実行されるエージェントからのweb検索イベントを優先的にリアルタイム公開し、必要に応じて他ツールも段階的に拡張できるようにする
2. **構造化出力パースの維持**: 単一エージェントパターンからの`parsePartialJson()`技術を多段階ワークフローに適用
3. **ワークフロー対応UIレンダリングの実装**: ワークフローステップ名に基づいてストリーミングイベントを適切なUIコンポーネントにルーティング
4. **型契約の維持**: Zodスキーマを共有しつつランタイム検証範囲を明確化し、今後の強化ポイントを特定

**技術的貢献**:
- **fullStreamメカニズム**: ワークフロー内でツール呼び出しを公開するための`fullStream`の活用—公式ワークフローストリーミングガイドには文書化されていないパターン
- **選択的ツールストリーミング**: デフォルトでweb検索ツールイベントのみを転送し、ノイズを抑えつつ必要に応じて他ツールを追加できるサーバー側フィルタリング
- **深層ストリーミングアーキテクチャ**: workflow → agent → tool階層を通じてツールイベントを伝播する`stream.fullStream.pipeTo(writer)`パターン
- **NDJSONイベントプロトコル**: ステップレベルルーティングを備えたテキストデルタ、ツール呼び出し、エラーを多重化する軽量プロトコル
- **プログレッシブJSON再構築**: 置換/追加セマンティクスを持つ多段階ワークフロー向けに適応されたクライアント側`parsePartialJson()`統合

## 2. アーキテクチャと方法論

### 2.1 システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                  クライアント (page.tsx)                     │
│  • ReadableStreamDefaultReader                             │
│  • TextDecoder + NDJSONパース                              │
│  • parsePartialJson (ストリーミングJSON再構築)              │
│  • Replace/Appendレンダリングセマンティクス                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ NDJSON over HTTP
┌──────────────────────▼──────────────────────────────────────┐
│            APIルート (route.ts)                             │
│  • run.streamVNext({ closeOnSuspend: true })               │
│  • イベントフィルタリング: text-delta + web-search tool-call│
│  • NDJSONエンコーディング: { event, stepName, text }        │
└──────────────────────┬──────────────────────────────────────┘
                       │ AsyncIterator
┌──────────────────────▼──────────────────────────────────────┐
│          Mastra Workflow (advisorWorkflow.ts)               │
│  Step 1: gather-learner-understanding                       │
│  Step 2: perform-deep-research (maxSteps: 20)              │
│  Step 3: synthesize-advisor-plan                            │
│  • stream.fullStream.pipeTo(writer)                         │
│  • Zodスキーマによる構造化出力                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 主要コンポーネント

| コンポーネント | ファイルパス | 責務 |
|-----------|-----------|----------------|
| ワークフロー定義 | `src/mastra/workflows/advisorWorkflow.ts` | スキーマ検証されたI/Oを持つ3ステップDAG |
| ストリーミングエンドポイント | `src/app/api/counselor-workflow/route.ts` | ワークフローイベントからのNDJSONストリーム生成 |
| フロントエンドUI | `src/app/page.tsx` | 部分的JSONパースによるプログレッシブレンダリング |
| 共有スキーマ | `src/schemas/*.ts` | レイヤー間の型安全なコントラクト |

## 3. 実装詳細

### 3.1 fullStream vs. textStream: イベント伝播メカニズム

Mastraの公式[Workflow Streamingドキュメント](https://mastra.ai/en/docs/streaming/workflow-streaming)は、[Streams API](https://developer.mozilla.org/ja/docs/Web/API/ReadableStream/pipeTo)で定義される`pipeTo`メソッドを介してエージェントの`textStream`をワークフローwriterにパイプする例を示している：

```typescript
await stream.textStream.pipeTo(writer);
```

`textStream`プロパティは最終的なテキスト出力のみを発行し、ツール呼び出しと中間推論を除外する。Mastraの[Agent.stream()リファレンス](https://mastra.ai/en/reference/streaming/agents/stream)によると、代替の`fullStream`プロパティは`ReadableStream`インターフェースを通じて全てのチャンクタイプを公開する：
- `text-delta`: トークンの増分生成
- `tool-call`: 引数を持つツール呼び出し
- `tool-result`: ツール実行結果
- `reasoning-delta`: モデル推論トレース（サポートされている場合）
- `finish`: ストリーム完了

ワークフローステップで`textStream`を`fullStream`に置き換えることで（advisorWorkflow.ts:98, 212）：

```typescript
await stream.fullStream.pipeTo(writer, {
  preventClose: true,
  preventAbort: true,
  preventCancel: true,
});
```

ツール呼び出しを含むすべてのエージェントイベントがワークフロー階層を通じてAPIエンドポイントに伝播する。`pipeTo`メソッドは`ReadableStream`と`WritableStream`間でデータを転送し、追加オプションがストリームライフサイクル動作を制御する。

**イベントフィルタリングによる帯域軽減**

`fullStream`プロパティは`textStream`よりも大幅に多くのデータを発行する。UIを高シグナルな更新に集中させるため、APIルートはサーバー側のイベントフィルタリングを実装し、text-deltaに加えてweb検索ツール呼び出しのみを転送している（route.ts:137-154）。要件の変化に応じて条件分岐を追加すれば、同じパターンで他ツールをホワイトリスト化できる：

```typescript
if (payloadOutput.type === "tool-call" && payloadOutput.payload?.toolName?.includes('webSearch')) { // web検索のみホワイトリスト
  send({
    event: "tool-call",
    text: JSON.stringify(payloadOutput.payload?.args),
    toolName: 'web-search',
    stepName,
  });
} else if (payloadOutput.type === "text-delta") {
  send({
    event: "text-chunk",
    text: String(payloadOutput.payload?.text) ?? "",
    stepName,
  });
}
// その他のイベントタイプはフィルタリングされる
```

`text-delta`とweb検索の`tool-call`イベントのみがクライアントに到達する。大きなレスポンスペイロードを含む可能性がある`tool-result`や内部的な`reasoning-delta`チャンクはサーバー側で破棄され、必要に応じてホワイトリストに追加することで段階的に公開範囲を広げられる。

### 3.2 ワークフロー定義: advisorWorkflow.ts

本ワークフローは、各ステップがZodスキーマで検証される3つの逐次ステップを持つ有向非巡回グラフ（DAG）を実装する：

**ステップ1: 学習者理解** (`gather-learner-understanding`, 60-140行目)
```typescript
const stream = await agent.stream([...], { output: LearnerUnderstandingSchema });
await stream.fullStream.pipeTo(writer, {
  preventClose: true,
  preventAbort: true,
  preventCancel: true,
});
```

**なぜ`fullStream`か？**: `fullStream`プロパティは、`text-delta`や`tool-call`イベントを含むすべての中間イベントを公開し、リアルタイムUI更新を可能にする。対照的に、`textStream`は最終的なテキスト出力のみを提供し、ツール呼び出しへの可視性を失う。

**ステップ2: 深層リサーチ** (`perform-deep-research`, 150-226行目)
- 反復的なツール使用を可能にするため`maxSteps: 20`を実行
- Web検索ツール呼び出しは`fullStream.pipeTo(writer)`を介してストリーミングされる（212行目）
- 検索結果と学びを含む構造化された`DeepResearchResultSchema`を返す

**ステップ3: アドバイザリー統合** (`synthesize-advisor-plan`, 228-320行目)
- 学習者プロファイルとリサーチ発見を結合
- 最終的な`pipeTo`呼び出しは`preventClose: true`を省略し、ストリーム終了を許可（261行目）

**重要な設計決定**: 各ステップはエージェントの`fullStream`をワークフロー`writer`にパイプし、APIルート側で必要なイベントを選択的に転送できるようにしている。本実装ではweb検索通知のみをクライアントに送る設計としつつ、要件に応じて他ツールを追加する余地を残している。

### 3.2 ストリーミングロジック: route.ts

**イベントフィルタリングと変換** (120-163行目)

APIルートはMastraの内部イベントストリームを簡略化されたNDJSONプロトコルに変換する：

```typescript
for await (const chunk of workflowStream) {
  if (chunk.type === "workflow-step-output") {
    const payloadOutput = chunk.payload.output;

    if (payloadOutput.type === "tool-call" && payloadOutput.payload?.toolName?.includes('webSearch')) {
      send({
        event: "tool-call",
        text: JSON.stringify(payloadOutput.payload?.args),
        toolName: 'web-search',
        stepName,
      });
    } else if (payloadOutput.type === "text-delta") {
      send({
        event: "text-chunk",
        text: String(payloadOutput.payload?.text) ?? "",
        stepName,
      });
    }
  }
}
```

**プロトコル設計**:
- `event: "text-chunk"`: エージェントLLM出力からの増分トークンデルタ
- `event: "tool-call"`: シリアライズされた引数を持つツール呼び出し
- `event: "error"`: メッセージ付きエラー伝播

**重要な実装詳細**: `stepName`抽出（124-135行目）により、フロントエンドが正しいUIコンポーネントにイベントをルーティングでき、複数のワークフローステップの並列可視化をサポートする。

### 3.3 フロントエンドレンダリング: page.tsx

**ストリーミング消費** (119-207行目)

```typescript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  let newlineIndex = buffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    const parsed = JSON.parse(line) as StreamEvent;
    // イベント処理...
  }
}
```

**プログレッシブJSON再構築** (150-176行目)

フロントエンドはステップごとにテキストデルタを蓄積し、プログレッシブパースを試みる：

```typescript
textOutputEachTools[stepName] = (textOutputEachTools[stepName] ?? '') + newText;
const parseResult = parsePartialJson(textOutputEachTools[stepName]);

if (parseResult.state === "successful-parse" || parseResult.state === "repaired-parse") {
  addProcessOutput(stepName, parseResult.value);
}
```

**置換 vs 追加セマンティクス** (64-80行目)

```typescript
function addProcessOutput(processName, output, mode = 'replace') {
  setOutputEachTools((prev) => {
    const last = prev[prev.length - 1];
    if (last && last.processName === processName && mode === 'replace') {
      // 同じステップ → 更新された部分パースで置換
      const next = prev.slice(0, -1);
      next.push(makeItem(processName, output));
      return next;
    }
    // 異なるステップ → 新規エントリを追加
    return [...prev, makeItem(processName, output)];
  });
}
```

**設計根拠**:
- **置換モード**: 部分的JSONが段階的により完全になるエージェントテキスト出力に使用
- **追加モード**: 各呼び出しが個別のイベントであるツール呼び出しに使用（195行目）

**`parsePartialJson`メカニズム**:
`@ai-sdk/ui-utils`ライブラリは不完全なJSONに対する修復ヒューリスティックを提供する：
- 閉じられていない括弧は自動的に閉じられる
- 切り捨てられた文字列は終端される
- 不完全な配列は完成される
これにより、完全なレスポンスが完了する前に部分的なエージェント出力のレンダリング（例：5つの配列要素のうち最初の2つを表示）が可能になる。

## 4. 結果と分析

### 4.1 ストリーミング特性

- **透明性**: サンプルUIでは`検索🔎：...`というラベルでweb検索ツール呼び出しを表示し、調査の進捗を過度な情報量なしに共有できる。
- **応答性**: `parsePartialJson`が修復に成功したタイミングで学習者、リサーチ、統合ステップのJSONが順次レンダリングされ、ワークフロー完了前から意思決定が可能になる。
- **コントロール**: 長時間の実行が想定される場合でも、`AbortController`によってワークフローを途中停止でき、トークン消費やAPIコストを管理しやすい。

### 4.2 ストリーミングアーキテクチャの比較

先行研究（[Teacher Search Agent](https://zenn.dev/manalink_dev/articles/teacher-search-agent-by-mastra)）に基づくと、単一エージェントストリーミングは簡潔である一方、マルチエージェントワークフローストリーミングは追加のアーキテクチャ複雑性を要求する。

| 次元 | 単一エージェントストリーミング | ワークフローストリーミング（本研究） |
|-----------|------------------------|--------------------------------|
| **APIパターン** | `agent.stream()` → API Route → Client | `workflow.createRunAsync().streamVNext()` → API Route → Client |
| **イベントソース** | 単一エージェントのLLM出力ストリーム | ワークフローステップを跨ぐ複数エージェント |
| **ツール呼び出し可視性** | エージェントストリームで直接利用可能 | `fullStream.pipeTo(writer)`による伝播が必要 |
| **クライアント統合** | AI SDKフック（`useChat`、`useObject`） | カスタムNDJSONストリームパーサー |
| **イベントルーティング** | 不要（単一ソース） | UIコンポーネントへのステップ名ベースルーティング |
| **部分的JSONパース** | 単一ストリームに対する`parsePartialJson()` | ステップごとの`parsePartialJson()`と置換/追加ロジック |
| **実装複雑性** | 低（ドキュメント化されたパターン） | 高（未ドキュメント、イベント検査が必要） |

## 5. セットアップと使用方法

### 5.1 インストール

```bash
npm install
```

### 5.2 環境設定

必須の環境変数：

```bash
export OPENAI_API_KEY=sk-...
export FIRECRAWL_API_KEY=fc-...  # Web検索機能用
```

または`.env.local`に永続化：
```
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...
```

### 5.3 開発サーバー

```bash
npm run dev
```

`http://localhost:3000`にアクセスしてストリーミングワークフローインターフェースと対話する。

### 5.4 主要な操作

1. **入力**: 学習者アドバイザリークエリを入力（例：「ロボティクスに興味があるがチームコラボレーションに苦労している16歳をどのようにサポートできますか？」）
2. **ステップ1ストリーミング**: 学習者プロファイルがリアルタイムで組み立てられるのを観察
3. **ステップ2ストリーミング**: Web検索クエリとプログレッシブな結果蓄積を確認
4. **ステップ3ストリーミング**: アドバイザリープランセクションが段階的に表示されるのを確認
5. **キャンセル**: 「停止」をクリックしてワークフローの実行中に中断

READMEに記載しているUIテキスト（例：検索イベントの日本語ラベル）はあくまでサンプルであり、実際の利用状況に応じて適宜変更できる。

## 6. 技術的留意事項

### 6.1 API移行

Mastra v0.20.00時点で、`streamVNext()`と`generateVNext()`はそれぞれ`stream()`と`generate()`に改名された。本コードベースを標準APIに移行する際には以下の更新が必要：

```diff
- const workflowStream = run.streamVNext({ inputData, closeOnSuspend: true });
+ const workflowStream = run.stream({ inputData, closeOnSuspend: true });
```

完全な移行手順については[Mastra Migration Guide](https://mastra.ai/blog/migration-guide-streaming)を参照。

### 6.2 型共有とランタイム検証

- **共有スキーマ**: `src/schemas/`配下の`AdvisorWorkflowResponseSchema`、`DeepResearchResultSchema`、`LearnerUnderstandingSchema`はサーバーとクライアントの双方でインポートし、ビルド時点で契約を揃えている。
- **ランタイム検証範囲**: ワークフローステップとAPIレスポンスはZodでバリデーションしたうえでストリーミングを開始するが、`parsePartialJson`で復元したクライアント側のデータは現状再検証していないため、不正なペイロードが届いた場合そのまま描画される。
- **今後の検討**: クライアント側でも`safeParse`などの軽量なガードやフェイルセーフUIを導入し、輸送エラー発生時でもエンドツーエンドで型保証を維持できるようにする。

## 7. 結論

本技術的研究は、Mastra v0.20とNext.js App Routerを用いたストリーミングマルチエージェントワークフローの本番環境実行可能なアーキテクチャを実証する。主要な貢献は以下の通り：

1. **ストリーミングプロトコル設計**: ステップレベルの粒度を持つNDJSONベースのイベントストリーミング
2. **プログレッシブレンダリング**: リアルタイム構造化出力表示のための`parsePartialJson`統合
3. **アーキテクチャ検証**: 単一エージェントアプローチに対するワークフロー利点の実証的実証
4. **型契約**: 共有Zodスキーマとクライアント側検証強化に向けた計画

本実装は、透明性のある多段階AI推論とヒューマンインザループ監視を必要とする教育技術システム、カスタマーサポート自動化、その他のドメインのための参照アーキテクチャとして機能する。

## 参考文献

### 先行研究
1. [単一エージェントによる構造化データストリーミング (Zenn)](https://zenn.dev/manalink_dev/articles/teacher-search-agent-by-mastra) - `parsePartialJson()`統合の基礎パターン

### Mastraドキュメント
2. [Mastra Workflows Documentation](https://mastra.ai/en/docs/workflows/overview) - 公式ワークフローガイド
3. [Mastra vNext Workflows (Blog)](https://mastra.ai/blog/vNext-workflows) - vNext紹介記事
4. [Mastra Migration Guide: VNext to Standard APIs](https://mastra.ai/blog/migration-guide-streaming) - API移行手順

### Web標準
5. [ReadableStream - Web API | MDN](https://developer.mozilla.org/ja/docs/Web/API/ReadableStream) - Readableストリームインターフェース
6. [WritableStream - Web API | MDN](https://developer.mozilla.org/ja/docs/Web/API/WritableStream) - Writableストリームインターフェース
7. [ReadableStream.pipeTo() - Web API | MDN](https://developer.mozilla.org/ja/docs/Web/API/ReadableStream/pipeTo) - ストリームパイピングメソッド

---

**リポジトリ構造サマリー**:
- **ワークフロー**: `src/mastra/workflows/advisorWorkflow.ts` (3ステップDAG)
- **ストリーミングAPI**: `src/app/api/counselor-workflow/route.ts` (NDJSONエンコーダー)
- **フロントエンド**: `src/app/page.tsx` (プログレッシブレンダラー)
- **スキーマ**: `src/schemas/` (共有型定義)

**コード帰属**: 本実装はMastraの公式ストリーミング例とVercelのNDJSONストリーミングパターンに基づいている。部分的JSONレンダリングと置換/追加セマンティクスに関するすべてのカスタムロジックは、本リポジトリのオリジナルである。
