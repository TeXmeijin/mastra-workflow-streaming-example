import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getClientProfileTool = createTool({
  id: "get-client-profile",
  description:
    "Returns a synthesized learner profile including context, constraints, and stakeholder expectations for advisory planning.",
  inputSchema: z.object({
    learnerId: z
      .string()
      .optional()
      .describe("Identifier for the learner. Optional for demo environments."),
  }),
  outputSchema: z.object({
    learner: z.object({
      id: z.string(),
      name: z.string(),
      ageBand: z.string(),
      academicStage: z.string(),
      learningStylePreferences: z.array(z.string()),
      schedulingConstraints: z.object({
        weeklyAvailability: z.array(
          z.object({
            day: z.string(),
            windows: z.array(z.object({ start: z.string(), end: z.string() })),
          }),
        ),
        blackoutPeriods: z.array(
          z.object({ label: z.string(), reason: z.string() }),
        ),
      }),
      motivationSignals: z.array(
        z.object({
          signal: z.string(),
          source: z.string(),
          freshnessDays: z.number(),
        }),
      ),
    }),
    guardians: z.array(
      z.object({
        name: z.string(),
        relationship: z.string(),
        priorities: z.array(z.string()),
        communicationStyle: z.string(),
      }),
    ),
    objectives: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        targetTimelineWeeks: z.number(),
        successCriteria: z.array(z.string()),
        blockers: z.array(z.string()),
      }),
    ),
    environmentalFactors: z.object({
      studyEnvironment: z.string(),
      competingCommitments: z.array(z.string()),
      technologyAccess: z.array(z.string()),
      emotionalClimate: z.string(),
    }),
  }),
  execute: async ({ context }) => {
    const learnerId = context.learnerId ?? "demo-learner-001";

    return {
      learner: {
        id: learnerId,
        name: "鷺ノ宮 孝太郎",
        ageBand: "16〜17歳",
        academicStage: "高校2年・理工系志望",
        learningStylePreferences: [
          "視覚的なモデリング",
          "ステップごとのガイド学習",
          "実社会と結びついたプロジェクト",
        ],
        schedulingConstraints: {
          weeklyAvailability: [
            { day: "火曜日", windows: [{ start: "18:00", end: "20:30" }] },
            { day: "木曜日", windows: [{ start: "19:00", end: "21:00" }] },
            { day: "日曜日", windows: [{ start: "10:00", end: "12:00" }] },
          ],
          blackoutPeriods: [
            {
              label: "ロボット競技 地区予選",
              reason: "第6〜7週は夜間すべて大会準備に充てる予定",
            },
          ],
        },
        motivationSignals: [
          {
            signal: "微積分をロボット開発に結びつけた例を自ら求めている",
            source: "メンターミーティング記録",
            freshnessDays: 11,
          },
          {
            signal: "自主学習チェックリストをリマインドなしで更新し続けている",
            source: "学習管理アプリ解析",
            freshnessDays: 5,
          },
        ],
      },
      guardians: [
        {
          name: "モーガン・リバース",
          relationship: "保護者",
          priorities: [
            "工学系進学に向けた数学的思考力の強化",
            "グループ活動での自己主張力向上",
          ],
          communicationStyle:
            "週次ダッシュボード形式で、リスク指標が明確なレポートを好む",
        },
        {
          name: "プリヤ・シャー",
          relationship: "進路指導カウンセラー",
          priorities: [
            "難関工学系プログラムが求めるポートフォリオ要件との整合性",
            "継続的なレジリエンス習慣のモニタリング",
          ],
          communicationStyle: "月1回のオンライン面談と共有ノートでの進捗確認",
        },
      ],
      objectives: [
        {
          id: "obj-math-capstone",
          label: "多変数微積分をロボット制御の課題に自信を持って適用する",
          targetTimelineWeeks: 10,
          successCriteria: [
            "設計レビューで勾配の概念を自分の言葉で説明できる",
            "制御システムのケーススタディを5件以上ノートにまとめ再利用している",
          ],
          blockers: [
            "大会シーズン中は実験時間が不足しがち",
            "基礎的な代数演算のスピードがたまに落ちる",
          ],
        },
        {
          id: "obj-collaboration",
          label: "他チームとの技術的な対立を効果的に調整する",
          targetTimelineWeeks: 6,
          successCriteria: [
            "練習試合後に交渉内容を要約して共有している",
            "各スプリントで最低2回のフィードバックループを設計している",
          ],
          blockers: [
            "新しいグループでは声の大きいメンバーに譲りがち",
            "チーム間の衝突をどうエスカレーションするかが曖昧",
          ],
        },
      ],
      environmentalFactors: {
        studyEnvironment:
          "工房に隣接した専用学習スペース（ホワイトボード壁、デュアルモニター付き）",
        competingCommitments: [
          "ロボット部キャプテンとしての活動",
          "週末のファブリケーション系インターン",
        ],
        technologyAccess: [
          "高性能ノートPC",
          "地域メイカースペースのシミュレーション環境",
          "隔週でVR試作ラボを利用可能",
        ],
        emotionalClimate:
          "基本的には前向き。大会前に軽いストレスはあるが、新しいプロジェクトに対しては強い意欲を示す",
      },
    };
  },
});
