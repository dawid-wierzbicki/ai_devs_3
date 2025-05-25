import { spawn } from 'child_process';

describe('S02E01 - Interrogation Task Integration Test', () => {
  test('should run s02e01 transcribe then analyze and get code -1004 response', async () => {
    // Set a longer timeout for this integration test (transcription + analysis)
    jest.setTimeout(60000);

    const runScript = (scriptName: string): Promise<{ stdout: string; stderr: string; code: number | null }> => {
      return new Promise((resolve) => {
        const child = spawn('npm', ['run', scriptName], {
          stdio: 'pipe',
          cwd: process.cwd(),
          env: {
            ...process.env,
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
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

    // Step 1: Run transcribe script
    console.log('Running transcribe script...');
    const transcribeResult = await runScript('dev:transcribe');
    
    // Check that transcribe script ran successfully
    expect(transcribeResult.code).toBeDefined();
    console.log('Transcribe completed with code:', transcribeResult.code);

    // Step 2: Run analyze script
    console.log('Running analyze script...');
    const analyzeResult = await runScript('dev:analyze');
    
    // Check that analyze script ran
    expect(analyzeResult.code).toBeDefined();
    console.log('Analyze completed with code:', analyzeResult.code);
    
    // Look for code -1004 and flag in the analyze output
    const hasCode1004 = analyzeResult.stdout.includes('-1004') && 
                       analyzeResult.stdout.includes('{{FLG:') && 
                       analyzeResult.stdout.includes('}}');
    expect(hasCode1004).toBe(true);
  }, 60000);
}); 