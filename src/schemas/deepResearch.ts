import { z } from "zod";

export const DeepResearchResultSchema = z.object({
  searchResults: z
    .array(
      z.object({
        title: z.string().describe("ページのタイトルをできるだけそのまま添付"),
        url: z.string().describe("ヒットしたURLを一言一句そのまま添付"),
        content: z
          .string()
          .describe(
            "ページ内容の抜粋。特にユーザーの要望を満たしていると判断した理由など。",
          ),
      }),
    )
    .max(5)
    .describe("検索してヒットした重要な文献を含む配列"),
  error: z.union([z.string(), z.object({}).passthrough()]).optional(),
});
