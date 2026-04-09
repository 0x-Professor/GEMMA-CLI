import si from 'systeminformation';
import os from 'os';
import { GEMMA_MODELS, ModelId } from '../utils/constants.js';

export interface SystemInfo {
  ramGB: number;
  diskGB: number;
  cpu: string;
  gpuMode: 'metal' | 'cuda' | false;
}

export async function detectGpu(): Promise<'metal' | 'cuda' | false> {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return 'metal';
  }
  const graphics = await si.graphics();
  const hasNvidia = graphics.controllers.some(c => (/nvidia/i).test(c.vendor || c.name || ''));
  if (hasNvidia) {
    return 'cuda';
  }
  return false;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const ramGB = os.totalmem() / (1024 ** 3);
  
  const fsSize = await si.fsSize();
  const mainDrive = fsSize.find(fs => fs.mount === '/' || fs.mount === 'C:') || fsSize[0];
  const diskGB = mainDrive ? mainDrive.available / (1024 ** 3) : 0;

  const cpuInfo = await si.cpu();

  return {
    ramGB,
    diskGB,
    cpu: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
    gpuMode: await detectGpu()
  };
}

export interface ModelCompat {
  modelId: ModelId;
  displayName: string;
  sizeMB: number;
  recommended: boolean;
  compatible: boolean;
  reason?: string;
  ramPercent: number;
}

export function checkModelCompat(sys: SystemInfo): ModelCompat[] {
  const results: ModelCompat[] = [];
  for (const [id, model] of Object.entries(GEMMA_MODELS)) {
    const modelId = id as ModelId;
    let compatible = true;
    let reason = '';
    if (sys.ramGB < model.minRamGB) {
      compatible = false;
      reason = `Not enough RAM (need ${model.minRamGB} GB, have ${sys.ramGB.toFixed(1)} GB)`;
    } else if (sys.diskGB < model.minDiskGB) {
      compatible = false;
      reason = `Not enough Disk (need ${model.minDiskGB} GB, have ${sys.diskGB.toFixed(1)} GB)`;
    }
    
    results.push({
      modelId,
      displayName: model.displayName,
      sizeMB: model.sizeMB,
      recommended: model.recommended,
      compatible,
      reason,
      ramPercent: Math.min(100, Math.round((model.minRamGB / sys.ramGB) * 100))
    });
  }
  return results;
}

export async function runDoctor(): Promise<string> {
  const sys = await getSystemInfo();
  const compat = checkModelCompat(sys);
  
  let out = '== System Information ==\n';
  out += `OS:  ${os.type()} ${os.release()} ${os.arch()}\n`;
  out += `CPU: ${sys.cpu}\n`;
  out += `RAM: ${sys.ramGB.toFixed(1)} GB\n`;
  out += `Disk: ${sys.diskGB.toFixed(1)} GB free\n`;
  out += `GPU: ${sys.gpuMode || 'None (CPU fallback)'}\n\n`;
  
  out += '== Model Compatibility ==\n';
  for (const c of compat) {
    if (c.compatible) {
      out += `[OK] ${c.displayName} (${c.sizeMB} MB) ${c.recommended ? '- Recommended' : ''}\n`;
    } else {
      out += `[NO] ${c.displayName} - ${c.reason}\n`;
    }
  }
  
  return out;
}
