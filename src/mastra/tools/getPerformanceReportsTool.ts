import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const PerformanceReportSchema = z.object({
  metrics: z.array(
    z.object({
      name: z.string(),
      currentValue: z.number(),
      targetRange: z.tuple([z.number(), z.number()]),
      direction: z.enum(["up", "flat", "down"]),
      commentary: z.string(),
    }),
  ),
  qualitativeHighlights: z.array(
    z.object({
      title: z.string(),
      observer: z.string(),
      observation: z.string(),
      evidence: z.string(),
    }),
  ),
  riskRegister: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      probability: z.number(),
      impact: z.number(),
      mitigationPlan: z.string(),
      owner: z.string(),
    }),
  ),
});

export const getPerformanceReportsTool = createTool({
  id: 'get-performance-reports',
  description:
    'Returns quantified performance metrics, qualitative observations, and trend analysis for quarterly reflection.',
  inputSchema: z.object({
    learnerId: z.string().optional(),
    window: z.enum(['30d', '60d', '90d']).optional(),
  }),
  outputSchema: PerformanceReportSchema,
  execute: async ({ context }) => {
    const window = context.window ?? '60d';

    const result: z.infer<typeof PerformanceReportSchema> = {
      metrics: [
        {
          name: '概念移転スコア',
          currentValue: 78,
          targetRange: [82, 90] as [number, number],
          direction: 'up',
          commentary:
            '微積分のセッションにロボットのケーススタディを取り入れた結果、前期間比で6ポイント上昇。',
        },
        {
          name: '協働ファシリテーション指数',
          currentValue: 58,
          targetRange: [70, 85] as [number, number],
          direction: 'flat',
          commentary: '対立のエスカレーションをためらう傾向が続き、目標値を下回ったまま。振り返りで使う定型プロンプトが必要。',
        },
        {
          name: '自主課題の完了率',
          currentValue: 92,
          targetRange: [85, 95] as [number, number],
          direction: 'up',
          commentary: '大会準備で忙しい中でも高い完了率を維持。学習計画への主体性が伺える。',
        },
      ],
      qualitativeHighlights: [
        {
          title: 'システム思考のブレークスルー',
          observer: 'エンジニアリングメンター',
          observation: 'センサーノイズが制御モデルにどう伝播するかを説明し、冗長性チェックを自ら提案した。',
          evidence: '2025-09-14の模擬試合コーチングセッションの録画。',
        },
        {
          title: '内省習慣の成熟',
          observer: '自己記録ノート',
          observation: '意思決定のトレードオフと次の実験案を「もし〜なら次に〜」形式で書き残すようになった。',
          evidence: '振り返り記録 #42（トルク意思決定マトリクスの草案に言及）。',
        },
      ],
      riskRegister: [
        {
          id: 'risk-workload-compression',
          description: `大会スプリント期間とインターンの長時間勤務が${window}の期間で重なっている。`,
          probability: 0.6,
          impact: 0.7,
          mitigationPlan: '事前にミニタスクへ分割して合意し、週に2回は休息の夜を確保。短時間のリカバリーサーベイを導入。',
          owner: 'プログラムコーディネーター',
        },
        {
          id: 'risk-collaboration-fatigue',
          description: '連携チームとの緊張が長期化し、課題を表面化させる意欲が低下する恐れがある。',
          probability: 0.5,
          impact: 0.6,
          mitigationPlan: '次回の振り返りで第三者ファシリテーターを試験導入し、重要対話用のチェックリストをジョーダンに提供する。',
          owner: 'コラボレーションコーチ',
        },
      ],
    };

    return result;
  },
});
