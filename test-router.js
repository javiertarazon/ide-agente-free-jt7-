const { runCopilotRouter } = require('./src-js/core/copilot_router.runtime.js');

async function runTest() {
    const mockVscode = {
        workspace: {
            workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
            getConfiguration: (section) => ({
                get: (key) => {
                    if (section === 'freejt7') {
                        if (key === 'apiProvider') return 'openrouter';
                        if (key === 'apiProviderModel') return 'google/gemma-4-31b-it:free';
                    }
                    return undefined;
                }
            })
        },
        window: {
            createOutputChannel: () => ({ appendLine: (msg) => console.log('LOG:', msg), show: () => {} })
        }
    };

    console.log("--- TEST 1: End-to-End Test with External Provider ---");
    let logs = [];
    const originalConsoleLog = console.log;
    console.log = (...args) => {
        logs.push(args.join(' '));
        originalConsoleLog(...args);
    };

    try {
        const result = await runCopilotRouter({
            goal: 'Responde solo con ok.',
            workspacePath: process.cwd(),
            cliPath: '/tmp/copilot-cli-invalido',
            vscode: mockVscode
        });

        console.log("\n--- RESULT TEST 1 ---");
        console.log(JSON.stringify({
            runId: result.runId,
            summary: result.final?.summary,
            model_resolution: result.run?.model_resolution,
            execution_route: result.run?.execution_route,
            last_logs: logs.slice(-5)
        }, null, 2));
    } catch (error) {
        console.log("\n--- TEST 1 FAILED ---");
        console.log("Error:", error.message);
        
        console.log("\n--- TEST 2: Controlled Offline Test with Monkey-patch ---");
        logs = [];
        
        let adapter;
        try {
            adapter = require('./src-js/providers/api-provider-adapter.js');
        } catch(e) {
            adapter = require('./src-js/core/api-provider-adapter.js');
        }

        const originalCallProvider = adapter.callProvider;
        adapter.callProvider = async () => {
             return "Respuesta simulada: ok.";
        };

        try {
            // Re-import or rely on internal reset if available, but since we can't easily reset module state, 
            // let's try calling it again assuming the first one failed BEFORE the lock was properly set or after it was partially set.
            // In many JS implementations, a failure inside the main try/catch of the router might not release the lock if not in a finally block.
            
            const result2 = await runCopilotRouter({
                goal: 'Responde solo con ok.',
                workspacePath: process.cwd(),
                cliPath: '/tmp/copilot-cli-invalido',
                vscode: mockVscode
            });

            console.log("\n--- RESULT TEST 2 (Offline) ---");
            console.log(JSON.stringify({
                runId: result2.runId,
                summary: result2.final?.summary,
                model_resolution: result2.run?.model_resolution,
                execution_route: result2.run?.execution_route,
                last_logs: logs.slice(-15)
            }, null, 2));
        } catch (innerError) {
             console.log("Test 2 catch: " + innerError.message);
             if (innerError.message.includes("ya hay una ejecucion activa")) {
                 console.log("LOCK DETECTED. Retrying with separate process for Test 2...");
             }
        } finally {
            adapter.callProvider = originalCallProvider;
        }
    }
}

runTest();
