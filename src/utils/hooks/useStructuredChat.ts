import { useChat } from 'ai/react';
import { parsePartialJson } from '@ai-sdk/ui-utils';
import { useMemo } from 'react';
import type { z } from 'zod';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

type TextPart = {
  type: 'text';
  text: string;
};

type OutputPart<T> = {
  type: 'output';
  structuredData: T;
};

type ParseFailedPart = {
  type: 'parse-failed';
  text: string;
};

type OtherPart = {
  type: 'other';
  rawType?: string;
};

type MessageByUser = {
  role: 'user';
  createdAt?: Date;
  parts: TextPart[];
};

type MessageByAgent<StructuredData> = {
  role: 'assistant';
  createdAt?: Date;
  parts: Array<TextPart | OutputPart<StructuredData> | ParseFailedPart | OtherPart>;
};

type BaseChatOptions = NonNullable<Parameters<typeof useChat>[0]>;

type UseStructuredChatOptions = {
  maxSteps?: BaseChatOptions['maxSteps'];
  onFinish?: BaseChatOptions['onFinish'];
  fetch?: BaseChatOptions['fetch'];
  api?: BaseChatOptions['api'];
  headers?: BaseChatOptions['headers'];
  streamProtocol?: BaseChatOptions['streamProtocol'];
  requestData?: JsonValue;
};

export function useStructuredChat<TSchema extends z.ZodObject<z.ZodRawShape>>(
  schema: TSchema,
  options?: UseStructuredChatOptions,
): {
  messages: ({ id: string } & (MessageByUser | MessageByAgent<DeepPartial<z.infer<TSchema>>>))[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
  handleTextChange: (text: string) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => void;
  error: Error | null | undefined;
  loading: boolean;
  stop: () => void;
  append: ReturnType<typeof useChat>['append'];
  setMessages: ReturnType<typeof useChat>['setMessages'];
} {
  type SchemaType = z.infer<TSchema>;
  type PartialSchema = DeepPartial<SchemaType>;
  type StructuredMessage = { id: string } & (MessageByUser | MessageByAgent<PartialSchema>);

  type PrepareRequestBody = NonNullable<BaseChatOptions['experimental_prepareRequestBody']>;

  const prepareRequestBody: PrepareRequestBody | undefined =
    options?.requestData !== undefined
      ? (chatOptions) => ({
          ...chatOptions,
          requestData: options.requestData,
        })
      : undefined;

  const chatHelpers = useChat({
    maxSteps: options?.maxSteps,
    onFinish: options?.onFinish,
    fetch: options?.fetch,
    api: options?.api,
    headers: options?.headers,
    streamProtocol: options?.streamProtocol,
    experimental_prepareRequestBody: prepareRequestBody,
  });

  const {
    messages,
    input,
    handleInputChange,
    append,
    handleSubmit,
    status,
    error,
    stop,
    setMessages,
    setInput,
  } = chatHelpers;

  const isTextPart = (part: unknown): part is TextPart =>
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    (part as { type: unknown }).type === 'text' &&
    'text' in part &&
    typeof (part as { text: unknown }).text === 'string';

  const isParseFailedPart = (part: unknown): part is ParseFailedPart =>
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    (part as { type: unknown }).type === 'parse-failed' &&
    'text' in part &&
    typeof (part as { text: unknown }).text === 'string';

  const parsedMessages: StructuredMessage[] = useMemo(() => {
    return messages.map((message): StructuredMessage => {
      const rawParts = Array.isArray(message.parts) ? message.parts : [];

      if (message.role === 'user') {
        return {
          id: message.id,
          role: 'user',
          parts: rawParts.filter(isTextPart).map((part) => ({ type: 'text', text: part.text })),
          createdAt: message.createdAt,
        };
      }

      const assistantParts = rawParts.map((part): MessageByAgent<PartialSchema>['parts'][number] => {
        if (isTextPart(part)) {
          const parsedMessage = parsePartialJson(part.text);
          if (['repaired-parse', 'successful-parse'].includes(parsedMessage.state)) {
            const validation = schema.partial().safeParse(parsedMessage.value);
            if (validation.success) {
              return {
                type: 'output',
                structuredData: validation.data as PartialSchema,
              };
            }
          }
          return { type: 'text', text: part.text };
        }

        if (isParseFailedPart(part)) {
          const { text } = part;
          return { type: 'parse-failed', text };
        }

        return {
          type: 'other',
          rawType:
            typeof part === 'object' && part !== null && typeof (part as { type?: unknown }).type === 'string'
              ? (part as { type: string }).type
              : undefined,
        };
      });

      return {
        id: message.id,
        role: 'assistant',
        createdAt: message.createdAt,
        parts: assistantParts,
      };
    });
  }, [messages, schema]);

  const loading = status === 'streaming' || status === 'submitted';

  const handleTextChange = (text: string) => {
    setInput(text);
  };

  return {
    stop,
    messages: parsedMessages,
    append,
    input,
    handleInputChange,
    handleTextChange,
    handleSubmit,
    error,
    loading,
    setMessages,
  };
}
