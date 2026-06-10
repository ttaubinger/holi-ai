import { z } from 'zod';

export const JobIdResponseSchema = z.object({
  jobId: z.string(),
});

export const JobStatusResponseSchema = z.object({
  status: z.string(),
  result: z.any().optional(),
  error: z.any().optional(),
}).loose();

export const ChatHistoryResponseSchema = z.object({
  messages: z.array(z.any()).optional().default([]),
}).loose();
