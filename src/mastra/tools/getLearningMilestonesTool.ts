import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const LearningMilestonesOutputSchema = z.object({
  milestoneTimeline: z.array(
    z.object({
      weekIndex: z.number(),
      theme: z.string(),
      confidenceScore: z.number(),
      evidence: z.array(
        z.object({
          artifactType: z.string(),
          description: z.string(),
          link: z.string().optional(),
          reviewer: z.string(),
          collectedAt: z.string(),
        }),
      ),
    }),
  ),
  diagnostics: z.object({
    conceptualGaps: z.array(
      z.object({
        concept: z.string(),
        severity: z.enum(["low", "medium", "high"]),
        observedPatterns: z.array(z.string()),
        recommendedInterventions: z.array(z.string()),
      }),
    ),
    fluencyScores: z.array(
      z.object({
        domain: z.string(),
        percentile: z.number(),
        trailingFourWeekDelta: z.number(),
      }),
    ),
  }),
  emergingOpportunities: z.array(
    z.object({
      area: z.string(),
      trigger: z.string(),
      suggestedExperiments: z.array(
        z.object({
          title: z.string(),
          scope: z.string(),
          expectedLift: z.string(),
        }),
      ),
    }),
  ),
});

export const getLearningMilestonesTool = createTool({
  id: 'get-learning-milestones',
  description: 'Provides recent learning checkpoints, mastery signals, and trailing indicators for the learner.',
  inputSchema: z.object({
    learnerId: z.string().optional(),
    horizonWeeks: z.number().optional(),
  }),
  outputSchema: LearningMilestonesOutputSchema,
  execute: async ({ context }) => {
    const weeks = context.horizonWeeks ?? 6;

    const result: z.infer<typeof LearningMilestonesOutputSchema> = {
      milestoneTimeline: [
        {
          weekIndex: 0,
          theme: 'ベクトル解析のウォームアップ',
          confidenceScore: 0.72,
          evidence: [
            {
              artifactType: 'ノートレビュー',
              description: '勾配降下法の導出に注釈を加え、仲間からのフィードバックを反映させた',
              reviewer: 'メンター：L. フランコ',
              collectedAt: '2025-09-04',
            },
            {
              artifactType: '自己記録',
              description: '指導付き実験の後、発散定理の理解度を5段階中4と自己評価',
              reviewer: '学習ジャーナル',
              collectedAt: '2025-09-03',
            },
          ],
        },
        {
          weekIndex: Math.max(1, weeks - 4),
          theme: '大会シミュレーションのリハーサル',
          confidenceScore: 0.81,
          evidence: [
            {
              artifactType: 'シミュレーションログ',
              description: 'チューニング実験の結果、制御ループの不安定性を35%低減',
              reviewer: 'ロボット分析パイプライン',
              collectedAt: '2025-09-11',
            },
          ],
        },
        {
          weekIndex: weeks,
          theme: 'チーム協働の振り返り',
          confidenceScore: 0.64,
          evidence: [
            {
              artifactType: '振り返りメモ',
              description: 'トルク制限に関する対立が解消されず、ファシリテーションの枠組み導入を要請',
              reviewer: 'チームリーダー',
              collectedAt: '2025-09-18',
            },
          ],
        },
      ],
      diagnostics: {
        conceptualGaps: [
          {
            concept: '複数アクチュエータ系におけるヤコビアンの直観',
            severity: 'medium',
            observedPatterns: [
              '記号表現から行列表現へ切り替える際に支援が必要になる',
              '速度制約を導入すると具体例を求める傾向がある',
            ],
            recommendedInterventions: [
              '偏導関数とアクチュエータの影響を結び付けたビジュアルマップを共同で作成する',
              '練習試合中に素早い近似が必要となるミニプロジェクトを課す',
            ],
          },
        ],
        fluencyScores: [
          { domain: '微分方程式', percentile: 62, trailingFourWeekDelta: 9 },
          { domain: '協働的な振り返り', percentile: 48, trailingFourWeekDelta: -4 },
        ],
      },
      emergingOpportunities: [
        {
          area: 'チーム間メンタリング',
          trigger: '新設のルーキーチームを支援してほしいと依頼された',
          suggestedExperiments: [
            {
              title: 'リーダーシップ同行セッション',
              scope: '経験豊富なファシリテーターとペアを組み、2回の練習試合を観察する',
              expectedLift: '対立調整のスクリプトを強化し、暗黙知を可視化できる',
            },
          ],
        },
        {
          area: 'ポートフォリオのストーリーテリング',
          trigger: '大学広報から、実践プロジェクトのサマリー提供を依頼された',
          suggestedExperiments: [
            {
              title: 'ナラティブスプリント',
              scope: '意思決定ポイントとデータに基づくトレードオフを強調したプロジェクト概要を3件作成する',
              expectedLift: '難関プログラムの面接で差別化要素を明確に伝えられるようになる',
            },
          ],
        },
      ],
    };

    return result;
  },
});
