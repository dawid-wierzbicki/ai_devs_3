import { spawn } from 'child_process';

describe('S02E04 - Multimedia File Context Sorting Integration Test', () => {
  test('should run multimedia file context sorting workflow and complete all steps successfully', async () => {
    // Set a longer timeout for this integration test (API calls + DALL-E 3 generation)
    jest.setTimeout(120000); // 2 minutes for DALL-E 3 generation

    const runScript = (scriptName: string): Promise<{ stdout: string; stderr: string; code: number | null }> => {
      return new Promise((resolve) => {
        const child = spawn('npm', ['run', scriptName], {
          stdio: 'pipe',
          cwd: process.cwd(),
          env: {
            ...process.env,
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
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

    console.log('Running multimedia file context sorting script...');
    const result = await runScript('dev:multimedia');
    
    // Check that script ran successfully
    console.log('Multimedia file context sorting completed with code:', result.code);
    expect(result.code).toBe(0);

    // Verify that all major steps were completed
    const output = result.stdout;
    console.log('Output:', output);
    
    const hasFlag = output.includes('{{FLG:') && output.includes('}}');
    expect(hasFlag).toBe(true);
    
  }, 120000);
});