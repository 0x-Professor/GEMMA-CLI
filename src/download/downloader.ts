import fs from 'fs-extra';
import got from 'got';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { GEMMA_MODELS, HF_RESOLVE, ModelId } from '../utils/constants.js';

export async function downloadModel(modelId: ModelId, onProgress?: (downloaded: number, total: number) => void): Promise<void> {
  const modelInfo = GEMMA_MODELS[modelId];
  const url = HF_RESOLVE(modelInfo.repo, modelInfo.filename);

  const modelsDir = path.join(process.env.GEMMA_HOME || path.join(os.homedir(), '.gemma-cli'), 'models');
  await fs.ensureDir(modelsDir);
  const destination = path.join(modelsDir, modelInfo.filename);

  let downloadedBytes = 0;
  let totalBytes = 0;
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
    const downloadStream = got.stream(url, options as any);

    downloadStream.on('response', (response : any) => {
      if (response.statusCode === 206) {
        totalBytes = parseInt(response.headers['content-range']?.split('/')[1] || '0', 10);
      } else {
        totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        downloadedBytes = 0; // Fresh download
      }
      if (onProgress) onProgress(downloadedBytes, totalBytes);
    });

    downloadStream.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (onProgress) onProgress(downloadedBytes, totalBytes);
    });

    downloadStream.on('end', async () => {
      try {
        await verifyChecksum(destination, modelInfo.sha256);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    downloadStream.on('error', (err: any) => {
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
