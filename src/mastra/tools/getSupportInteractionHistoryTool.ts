import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const SupportInteractionHistorySchema = z.object({
  timeline: z.array(
    z.object({
      interactionId: z.string(),
      occurredAt: z.string(),
      channel: z.string(),
      participants: z.array(z.string()),
      intent: z.string(),
      sentiment: z.enum(["positive", "neutral", "concerned"]),
      summary: z.string(),
      followUpActions: z.array(
        z.object({
          owner: z.string(),
          status: z.enum(["open", "in-progress", "completed"]),
          note: z.string(),
          dueDate: z.string().optional(),
        }),
      ),
    }),
  ),
  unresolvedThreads: z.array(
    z.object({
      topic: z.string(),
      blocker: z.string(),
      proposedNextStep: z.string(),
    }),
  ),
  escalationSignals: z.array(
    z.object({
      metric: z.string(),
      currentValue: z.string(),
      threshold: z.string(),
      recommendation: z.string(),
    }),
  ),
});

export const getSupportInteractionHistoryTool = createTool({
  id: 'get-support-interaction-history',
  description:
    'Returns a chronologically ordered feed of support interactions, including tone markers and unresolved threads.',
  inputSchema: z.object({
    learnerId: z.string().optional(),
    lookbackDays: z.number().optional(),
  }),
  outputSchema: SupportInteractionHistorySchema,
  execute: async ({ context }) => {
    const lookback = context.lookbackDays ?? 45;

    const result: z.infer<typeof SupportInteractionHistorySchema> = {
      timeline: [
        {
          interactionId: 'sync-2025-09-05',
          occurredAt: '2025-09-05T19:30:00Z',
          channel: 'ビデオ会議',
          participants: ['鷺ノ宮 孝太郎', 'メンター：L. フランコ'],
          intent: '制御アルゴリズムのスプリント計画',
          sentiment: 'positive',
          summary: 'ロボットの事例を使って偏導関数の直感を再確認する方針で合意し、ミニラボを共同設計することになった。',
          followUpActions: [
            {
              owner: 'メンター：L. フランコ',
              status: 'completed',
              note: 'ワークスペースにラボの設計と評価ルーブリックを共有済み',
            },
            {
              owner: '鷺ノ宮 孝太郎',
              status: 'in-progress',
              note: '日曜のスタンドアップ前までにラボ結果の振り返りを作成',
              dueDate: '2025-09-08',
            },
          ],
        },
        {
          interactionId: 'async-2025-09-12',
          occurredAt: '2025-09-12T02:10:00Z',
          channel: '非同期メモ',
          participants: ['鷺ノ宮 孝太郎', 'ピアコラボレーションチーム'],
          intent: '振り返りで決まったアクションアイテムの記録',
          sentiment: 'concerned',
          summary: 'トルク安全マージンに関する意見の食い違いが再発しており、次の反復を進めるために意思決定マトリクスの用意を依頼。',
          followUpActions: [
            {
              owner: 'ピアリード',
              status: 'open',
              note: '技術アドバイザー同席での対立解消セッションを設定する',
            },
          ],
        },
        {
          interactionId: 'guardian-2025-09-18',
          occurredAt: '2025-09-18T23:55:00Z',
          channel: 'メール',
          participants: ['モーガン・リバース', 'プログラムコーディネーター'],
          intent: 'ポートフォリオ発表会への招待についての近況共有',
          sentiment: 'positive',
          summary: '保護者は成長の勢いを喜んでおり、技術的成果以外にリーダーシップの伸びを語るためのポイントを求めている。',
          followUpActions: [
            {
              owner: 'プログラムコーディネーター',
              status: 'in-progress',
              note: '協働面のブレークスルーを強調した紹介資料を作成中',
              dueDate: '2025-09-24',
            },
          ],
        },
      ],
      unresolvedThreads: [
        {
          topic: '機械班とソフト班のトルク制限のすり合わせ',
          blocker: 'リスクとトレードオフを共有するテンプレートがなく、スプリントごとに議論が振り出しに戻る',
          proposedNextStep: '来週木曜にシステムメンターが確認する意思決定マトリクスを導入する',
        },
      ],
      escalationSignals: [
        {
          metric: '振り返りでの発言バランス',
          currentValue: '直近3回の振り返りでジョーダンの発言時間は全体の15%未満',
          threshold: '各コアリードが25%以上参加することを目標に設定',
          recommendation: '洞察を端的に伝える練習をコーチングし、次回の振り返り前にファシリテーションのヒントカードを渡す',
        },
        {
          metric: '大会期間におけるタスク集中度',
          currentValue: `直近${lookback}日間の記録では、1週間に重要締切が4件重なっている`,
          threshold: '7日間で重要締切が3件を超えたらアラート',
          recommendation: '第7週はインターン時間を一時的に調整し、回復時間を確保するよう交渉する',
        },
      ],
    };

    return result;
  },
});
