const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const cloudDir = path.join(rootDir, 'cloud-monitor');
const distDir = path.join(cloudDir, 'dist');
const bundleDir = path.join(distDir, 'dashboard-viewer-linux-x64');
const entryFile = path.join(cloudDir, 'backend_cloud.js');

const target = String(process.env.PKG_TARGET || 'node18-linux-x64').trim();
const binaryName = 'dashboard-viewer';
const binaryPath = path.join(bundleDir, binaryName);
const skipPkg = ['1', 'true', 'yes'].includes(String(process.env.SKIP_PKG || '').toLowerCase());

main();

function main() {
  cleanAndPrepareDist();

  if (!skipPkg) {
    runPkgBuild();
  } else {
    fs.writeFileSync(
      binaryPath,
      "#!/usr/bin/env bash\necho 'SKIP_PKG=1: binary non generato in questa esecuzione.'\n",
      'utf8'
    );
    fs.chmodSync(binaryPath, 0o755);
  }

  copyRuntimeFiles();
  writePm2Config();
  writeDeployReadme();

  console.log(`Build cloud completata: ${bundleDir}`);
}

function runPkgBuild() {
  if (!fs.existsSync(entryFile)) {
    throw new Error(`File entry mancante: ${entryFile}`);
  }

  const localPkgBinJs = path.join(rootDir, 'node_modules', 'pkg', 'lib-es5', 'bin.js');
  const baseArgs = [entryFile, '--targets', target, '--output', binaryPath];

  if (fs.existsSync(localPkgBinJs)) {
    runCommand(process.execPath, [localPkgBinJs, ...baseArgs], rootDir);
    return;
  }

  console.warn('pkg non trovato in node_modules. Fallback a npx pkg.');

  if (process.platform === 'win32') {
    const commandLine = ['npx', '--yes', 'pkg', ...baseArgs].map(quoteShellArg).join(' ');
    try {
      runShellCommand(commandLine, rootDir);
    } catch (error) {
      throw new Error(
        `Build pkg fallita via npx. Verifica accesso a npm/cache o usa SKIP_PKG=1. Dettagli: ${error.message}`
      );
    }
    return;
  }

  try {
    runCommand('npx', ['--yes', 'pkg', ...baseArgs], rootDir);
  } catch (error) {
    throw new Error(
      `Build pkg fallita via npx. Verifica accesso a npm/cache o usa SKIP_PKG=1. Dettagli: ${error.message}`
    );
  }
}

function cleanAndPrepareDist() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });
}

function copyRuntimeFiles() {
  const frontendSrc = path.join(cloudDir, 'frontend');
  const frontendDst = path.join(bundleDir, 'frontend');

  if (fs.existsSync(frontendSrc)) {
    copyDirectory(frontendSrc, frontendDst);
  } else {
    fs.mkdirSync(frontendDst, { recursive: true });
  }

  const dataSrc = path.join(cloudDir, 'data');
  const dataDst = path.join(bundleDir, 'data');
  fs.mkdirSync(dataDst, { recursive: true });

  const clientsSrc = path.join(dataSrc, 'clients.json');
  const clientsDst = path.join(dataDst, 'clients.json');
  if (fs.existsSync(clientsSrc)) {
    copyFile(clientsSrc, clientsDst);
  } else {
    fs.writeFileSync(clientsDst, JSON.stringify({ clients: {} }, null, 2), 'utf8');
  }

  const readmeSrc = path.join(cloudDir, 'README.md');
  if (fs.existsSync(readmeSrc)) {
    copyFile(readmeSrc, path.join(bundleDir, 'README.md'));
  }
}

function writePm2Config() {
  const filePath = path.join(bundleDir, 'ecosystem.config.cjs');
  const content = `module.exports = {
  apps: [
    {
      name: "dashboard-viewer",
      script: "./dashboard-viewer",
      interpreter: "none",
      cwd: __dirname,
      env: {
        DASHBOARD_VIEWER_HOST: "0.0.0.0",
        DASHBOARD_VIEWER_PORT: "3011"
      }
    }
  ]
};
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeDeployReadme() {
  const filePath = path.join(bundleDir, 'DEPLOY-LINUX.txt');
  const content = `Dashboard Viewer Linux bundle
=============================

Contenuto:
- dashboard-viewer (binario Linux x64)
- frontend/index.html
- data/clients.json
- ecosystem.config.cjs

Avvio rapido:
1) chmod +x ./dashboard-viewer
2) ./dashboard-viewer
3) apri http://localhost:3011

PM2:
- pm2 start ecosystem.config.cjs

Note:
- I dati clienti vengono salvati in ./data/clients.json
- Il frontend viene servito da ./frontend
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${command} ${args.join(' ')}) with exit code ${result.status}`);
  }
}

function runShellCommand(commandLine, cwd) {
  const result = spawnSync(commandLine, {
    cwd,
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${commandLine}) with exit code ${result.status}`);
  }
}

function quoteShellArg(value) {
  const text = String(value);
  if (/^[a-zA-Z0-9_./:\\-]+$/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '\\"')}"`;
}

function copyFile(srcPath, dstPath) {
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.copyFileSync(srcPath, dstPath);
}

function copyDirectory(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(src, dst);
      continue;
    }
    if (entry.isFile()) {
      copyFile(src, dst);
    }
  }
}
