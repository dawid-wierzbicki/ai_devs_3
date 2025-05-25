import { spawn } from 'child_process';

describe('S01E05 - Censorship Task Integration Test', () => {
  test('should run s01e05 script and get code -1004 response', async () => {
    // Set a longer timeout for this integration test
    jest.setTimeout(30000);

    const runScript = (): Promise<{ stdout: string; stderr: string; code: number | null }> => {
      return new Promise((resolve) => {
        // Use npm run command which should work across environments
        const child = spawn('npm', ['run', 'dev:censorship'], {
          stdio: 'pipe',
          cwd: process.cwd(),
          env: {
            ...process.env,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY,
            CENTRALA_API_KEY: process.env.CENTRALA_API_KEY
          },
          shell: true
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          resolve({ stdout, stderr, code });
        });

        child.on('error', (error) => {
          resolve({ stdout, stderr: error.message, code: 1 });
        });
      });
    };

    const result = await runScript();
    
    // Check that the script ran (npm might return 0 even if the script has issues)
    expect(result.code).toBeDefined();
    
    // Look for code -1004 in the output
    const hasCode1004 = result.stdout.includes('-1004') && result.stdout.includes('{{FLG:') && result.stdout.includes('}}');
    expect(hasCode1004).toBe(true);
  }, 30000);
}); 