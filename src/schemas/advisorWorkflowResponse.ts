import { z } from "zod";

export const AdvisorWorkflowResponseSchema = z.object({
  response: z.string().optional().describe(`# about
  response for user's prompt.
  
  # format
  Markdown形式のテキスト。見出し（# ## ###）、リスト（- *）、引用（>）、リンク（[text](url)）、太字（**text**）などの記法を使用できる。引用には必ず出典情報を含めること。
  全体的に箇条書きは最低限に留め、JLPT N1水準の文章中心で出力すること
  
  # includes
  考えたこと、リサーチした内容を軽く触れる。
  回答を述べる。得てきた情報を踏まえ、論理的に、しかし優しく質問者に寄り添った回答を述べる。
  必要に応じてネクストアクションの提示を行う。
  
  # caution
  ユーザーにできるだけ外部サイトを開かせないように、回答は大量に網羅的に行うこと。回答不足を懸念されることが最も恐れるべきことである。
  `),
  researchSynthesis: z
    .array(
      z.object({
        query: z.string(),
        headline: z.string(),
        keyFindings: z.array(z.string()),
        implications: z.array(z.string()),
        references: z
          .array(
            z.object({
              title: z.string(),
              url: z
                .string()
                .describe(
                  "URL of the reference. 必ず存在するURLを利用せよ。引数から渡されており存在が対外的に証明されているものだけを利用する",
                ),
              note: z.string(),
            }),
          )
          .describe(
            "必ず引数で渡された調査結果から正しいURLや内容をそのまま引用して出力する",
          ),
      }),
    )
    .describe("リサーチ結果の共有"),
});

export type AdvisorWorkflowResponse = z.infer<typeof AdvisorWorkflowResponseSchema>;
