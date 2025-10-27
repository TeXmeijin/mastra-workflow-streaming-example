import { z } from "zod";
import OpenAI from "openai";
import { DeepResearchResultSchema } from "@/schemas/deepResearch";

let openAiClient: OpenAI | null = null;
const DEFAULT_MODEL = process.env.OPENAI_WEB_SEARCH_MODEL || 'gpt-4.1';

const getOpenAiClient = (): OpenAI => {
  if (!openAiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEYが設定されていません');
    }

    openAiClient = new OpenAI({ apiKey });
  }

  return openAiClient;
};

const buildUserLocation = () => ({
  type: 'approximate' as const,
  country: process.env.OPENAI_WEB_SEARCH_COUNTRY || 'JP',
  region: process.env.OPENAI_WEB_SEARCH_REGION || 'Tokyo',
  city: process.env.OPENAI_WEB_SEARCH_CITY || 'Tokyo',
  timezone: process.env.OPENAI_WEB_SEARCH_TIMEZONE || 'Asia/Tokyo',
});

/**
 * OpenAI Response API の output 構造を表す型定義
 * 実際のSDKの型は複雑なため、パース時に型ガードを使用
 */
interface UrlCitationAnnotation {
  type: 'url_citation';
  start_index: number;
  end_index: number;
  title: string;
  url: string;
}

// 型ガード関数
function isUrlCitation(annotation: any): annotation is UrlCitationAnnotation {
  return (
    annotation &&
    typeof annotation === 'object' &&
    annotation.type === 'url_citation' &&
    typeof annotation.start_index === 'number' &&
    typeof annotation.end_index === 'number' &&
    typeof annotation.title === 'string' &&
    typeof annotation.url === 'string'
  );
}

/**
 * OpenAI Responses API の output をパースして DeepResearchResult 形式に変換
 *
 * @param output - OpenAI Responses API から返される response.output (any型で受け取りランタイムチェック)
 * @returns DeepResearchResultSchema に準拠したオブジェクト
 */
export function parseOpenAiWebSearchResponse(output: any): z.infer<typeof DeepResearchResultSchema> {
  try {
    if (!Array.isArray(output)) {
      return {
        searchResults: [],
        error: 'output が配列ではありません',
      };
    }

    // message タイプの要素を探す
    const messageOutput = output.find((item: any) => item && item.type === 'message');

    if (!messageOutput) {
      return {
        searchResults: [],
        error: 'message タイプの出力が見つかりませんでした',
      };
    }

    const content = messageOutput.content?.[0];
    if (!content || content.type !== 'output_text') {
      return {
        searchResults: [],
        error: 'output_text タイプのコンテンツが見つかりませんでした',
      };
    }

    const { text, annotations = [] } = content;

    if (typeof text !== 'string') {
      return {
        searchResults: [],
        error: 'テキストが文字列ではありません',
      };
    }

    // url_citation タイプの annotation のみをフィルタリング
    const urlCitations = annotations.filter((ann: any) => isUrlCitation(ann));

    // 最大5件に制限
    const limitedCitations = urlCitations.slice(0, 5);

    const searchResults = limitedCitations.map((citation: UrlCitationAnnotation) => {
      // start_index と end_index を使って該当テキスト部分を抽出
      const excerptText = text.substring(citation.start_index, citation.end_index);

      return {
        title: citation.title,
        url: citation.url,
        content: excerptText,
      };
    });

    return {
      searchResults,
    };
  } catch (error) {
    return {
      searchResults: [],
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    };
  }
}

/**
 * requestOpenAiWebSearch のオブジェクト返却版
 *
 * @param prompt - 検索したいトピック・質問
 * @param signal - AbortSignal（オプション）
 * @returns DeepResearchResult 形式のオブジェクト
 */
export async function requestOpenAiWebSearchStructured(
  prompt: string,
  signal?: AbortSignal
): Promise<z.infer<typeof DeepResearchResultSchema>> {
  try {
    const client = getOpenAiClient();
    const userLocation = buildUserLocation();

    const response = await client.responses.create(
      {
        model: DEFAULT_MODEL,
        tools: [
          {
            type: 'web_search',
            user_location: userLocation,
          },
        ],
        tool_choice: 'auto',
        input: `あなたは教育情報収集担当職員です。以下に関して信頼性の高い日本国内のソースから情報を収集してURLと引用したテキストの組を教えて下さい\n\n"${prompt}"`,
      },
      { signal }
    );

    // response.output をパースして構造化データを返す
    return parseOpenAiWebSearchResponse(response.output);
  } catch (error) {
    console.error('Open AI Web Search Called. Error:', error);
    return {
      searchResults: [],
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    };
  }
}
