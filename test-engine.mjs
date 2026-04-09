import { GemmaEngine } from './dist/src/core/inference.js';
import { loadConfig } from './dist/src/config/settings.js';

async function run() {
    console.log('Loading config...');
    const config = loadConfig();
    console.log('Model:', config.model);

    const engine = new GemmaEngine();
    console.log('Loading model...');
    try {
        await engine.loadModel(config.model);
        console.log('Model loaded!');
        await engine.streamChat([{role:'user', content: 'hi', timestamp: new Date().toISOString()}], (token) => {
            process.stdout.write(token);
        }).next();
        console.log('\nChat done!');
        await engine.unloadModel();
    } catch (e) {
        console.error('Failed:', e);
    }
}
run();
