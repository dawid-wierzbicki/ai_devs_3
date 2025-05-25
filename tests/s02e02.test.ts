import { spawn } from 'child_process';

describe('S02E02 - Map Analysis Task Integration Test', () => {
  test('should run s02e02 map analysis and complete successfully', async () => {
    // Set a longer timeout for this integration test (image analysis)
    jest.setTimeout(60000);

    const runScript = (scriptName: string): Promise<{ stdout: string; stderr: string; code: number | null }> => {
      return new Promise((resolve) => {
        const child = spawn('npm', ['run', scriptName], {
          stdio: 'pipe',
          cwd: process.cwd(),
          env: {
            ...process.env,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY
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

    // Run map analysis script
    console.log('Running map analysis script...');
    const result = await runScript('dev:map');
    
    // Check that script ran successfully
    expect(result.code).toBe(0);
    console.log('Map analysis completed with code:', result.code);
    
    // Check that the analysis contains expected elements
    const correctCity = result.stdout.includes('Grudziądz');

    expect(correctCity).toBe(true);
  }, 200000);
}); 