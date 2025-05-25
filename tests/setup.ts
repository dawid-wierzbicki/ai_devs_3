// Set environment variables for tests
// These will be overridden by real environment variables if they exist
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'test-openai-key';
}
if (!process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
}
if (!process.env.CENTRALA_API_KEY) {
  process.env.CENTRALA_API_KEY = 'test-centrala-key';
}

// Reset mocks before each test (for any tests that do use mocks)
beforeEach(() => {
  if (jest.clearAllMocks) {
    jest.clearAllMocks();
  }
}); 