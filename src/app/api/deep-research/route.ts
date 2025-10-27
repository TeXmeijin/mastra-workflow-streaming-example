import { NextRequest } from "next/server";
import { mastra } from "@/mastra/index";
import { DeepResearchResultSchema } from "@/schemas/deepResearch";
import { z } from "zod";

const ChatPayloadSchema = z.object({
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.union([z.string(), z.array(z.any())]).optional(),
      parts: z
        .array(
          z.object({
            type: z.string(),
            text: z
              .union([z.string(), z.object({ value: z.string() })])
              .optional(),
          }),
        )
        .optional(),
    }),
  ),
});

const encoder = new TextEncoder();

const STREAM_CODES = {
  text: '0',
  error: '3',
  assistant_message: '4',
} as const;

function formatAssistantStreamPart(type: 'assistant_message' | 'error', value: unknown): string {
  const code = STREAM_CODES[type];
  if (!code) {
    throw new Error(`Unsupported stream part type: ${type}`);
  }
  return `${code}:${JSON.stringify(value)}\n`;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function extractLatestUserMessage(payload: z.infer<typeof ChatPayloadSchema>): string | null {
  const messages = payload.messages ?? [];
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) {
    return null;
  }

  if (typeof lastUserMessage.content === 'string') {
    return lastUserMessage.content;
  }

  const isTextPart = (part: unknown): part is { type: 'text'; text: string } =>
    typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text' &&
    typeof (part as { text?: unknown }).text === 'string';

  if (Array.isArray(lastUserMessage.content)) {
    const textParts = lastUserMessage.content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (isTextPart(part)) {
          return part.text;
        }
        if (
          typeof part === 'object' &&
          part !== null &&
          'text' in part &&
          typeof (part as { text?: unknown }).text === 'object' &&
          (part as { text: { value?: unknown } }).text !== null &&
          typeof (part as { text: { value?: unknown } }).text.value === 'string'
        ) {
          return (part as { text: { value: string } }).text.value;
        }
        return '';
      })
      .filter(Boolean);

    if (textParts.length > 0) {
      return textParts.join('\n\n');
    }
  }

  if (Array.isArray(lastUserMessage.parts)) {
    const textPart = lastUserMessage.parts.find(isTextPart);
    if (textPart) {
      return textPart.text;
    }
  }

  return null;
}

function sanitizeJsonBlock(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const match = trimmed.match(/^```[a-zA-Z0-9]*\s*([\s\S]*?)```$/);
    if (match) {
      return match[1].trim();
    }
  }
  return trimmed;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const chatPayload = ChatPayloadSchema.parse(body);

  const query = extractLatestUserMessage(chatPayload);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!query) {
          const errorChunk = formatAssistantStreamPart('error', 'No user query provided.');
          controller.enqueue(encoder.encode(errorChunk));
          controller.close();
          return;
        }

        controller.enqueue(
          encoder.encode(
            formatAssistantStreamPart('assistant_message', {
              id: generateId(),
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Starting deep research… running multi-phase search workflow.',
                },
              ],
            }),
          ),
        );

        const researchAgent = mastra.getAgent('researchAgent');
        const result = await researchAgent.generate(
          [
            {
              role: 'user',
              content: `Research the following topic thoroughly and respond in JSON matching the schema: "${query}"`,
            },
          ],
          {
            maxSteps: 20,
            output: DeepResearchResultSchema,
          },
        );

        const parsedFromObject = (() => {
          try {
            return result.object ? DeepResearchResultSchema.parse(result.object) : null;
          } catch {
            return null;
          }
        })();

        const parsedFromText = (() => {
          const cleaned = sanitizeJsonBlock(result.text);
          if (!cleaned) return null;
          try {
            return DeepResearchResultSchema.parse(JSON.parse(cleaned) as unknown);
          } catch {
            return null;
          }
        })();

        const payload =
          parsedFromObject ??
          parsedFromText ?? {
            queries: [],
            searchResults: [],
            learnings: [],
            completedQueries: [],
            phase: 'initial',
          };
        const content = JSON.stringify(payload, null, 2);

        const messageChunk = formatAssistantStreamPart('assistant_message', {
          id: generateId(),
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        });

        controller.enqueue(encoder.encode(messageChunk));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error occurred';
        const errorChunk = formatAssistantStreamPart('error', message);
        controller.enqueue(encoder.encode(errorChunk));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
