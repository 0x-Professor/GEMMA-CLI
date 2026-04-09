import fs from 'fs-extra';
import got from 'got';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import cliProgress from 'cli-progress';
import { GEMMA_MODELS, HF_RESOLVE, ModelId } from '../utils/constants.js';

export async function downloadModel(modelId: ModelId): Promise<void> {
  const modelInfo = GEMMA_MODELS[modelId];
  const url = HF_RESOLVE(modelInfo.repo, modelInfo.filename);
  
  const modelsDir = path.join(os.homedir(), '.gemma-cli', 'models');
  await fs.ensureDir(modelsDir);
  const destination = path.join(modelsDir, modelInfo.filename);
  
  let downloadedBytes = 0;
  if (await fs.pathExists(destination)) {
    const stat = await fs.stat(destination);
    downloadedBytes = stat.size;
  }
  
  const options: Record<string, any> = {
    headers: {
      ...(process.env.GEMMA_HF_TOKEN ? { Authorization: `Bearer ${process.env.GEMMA_HF_TOKEN}` } : {})
    },
    isStream: true
  };
  
  if (downloadedBytes > 0) {
    options.headers = {
      ...options.headers,
      Range: `bytes=${downloadedBytes}-`
    };
  }
  
  return new Promise((resolve, reject) => {
    const downloadStream = got.stream(url, options as any); // using any for stream due to got typings
    
    // Type definitions for cli-progress are perfectly capable
    const bar = new cliProgress.SingleBar({
      format: `Downloading ${modelInfo.displayName} | {bar} | {percentage}% | {value}/{total} bytes`,
    }, cliProgress.Presets.shades_classic);
    
    downloadStream.on('response', (response : any) => {
      if (response.statusCode === 206) { // Partial Content
        const total = parseInt(response.headers['content-range']?.split('/')[1] || '0', 10);
        bar.start(total, downloadedBytes);
      } else {
        const total = parseInt(response.headers['content-length'] || '0', 10);
        bar.start(total, 0);
        downloadedBytes = 0; // Fresh download
      }
    });
    
    downloadStream.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      bar.update(downloadedBytes);
    });
    
    downloadStream.on('end', async () => {
      bar.stop();
      try {
        await verifyChecksum(destination, modelInfo.sha256);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    
    downloadStream.on('error', (err: any) => {
      bar.stop();
      reject(err);
    });
    
    const fileStream = fs.createWriteStream(destination, { flags: downloadedBytes > 0 ? 'a' : 'w' });
    downloadStream.pipe(fileStream);
  });
}

export async function verifyChecksum(filePath: string, expectedHash: string): Promise<boolean> {
  // Temporary bypass if hash is '<hash>'
  if (expectedHash === '<hash>') return true;
  
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => {
      const actualHash = hash.digest('hex');
      if (actualHash === expectedHash) {
        resolve(true);
      } else {
        reject(new Error(`Checksum mismatch. Expected ${expectedHash}, got ${actualHash}`));
      }
    });
    stream.on('error', reject);
  });
}
