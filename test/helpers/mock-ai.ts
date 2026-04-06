/**
 * Shape compatible with the `openai` SDK as used by `AiCoachService` for Jest module mocks.
 *
 * Typical wiring (until OpenAI is injectable):
 * `jest.mock('openai', () => ({ default: jest.fn().mockImplementation(() => mockOpenAiClient) }))`
 */
export const mockOpenAiClient = {
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [
          { message: { content: 'Mocked AI response', role: 'assistant' } },
        ],
      }),
    },
  },
};
