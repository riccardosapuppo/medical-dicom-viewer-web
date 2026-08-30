import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const appDir = path.join(rootDir, 'platform', 'app');
const distDir = path.join(appDir, 'dist');
const buildToolsDir = path.join(appDir, 'build-tools');
const backendSrc = path.join(rootDir, 'backend.js');

const versionPath = path.join(rootDir, 'version.txt');
const versionRaw = fs.existsSync(versionPath) ? fs.readFileSync(versionPath, 'utf8') : '';
const version = versionRaw.toString().trim().split(/\s+/)[0];

if (!version) {
  console.warn('postbuild: versione non trovata, skip 7z');
}

const webConfigSrc = path.join(buildToolsDir, 'web.config');
if (fs.existsSync(webConfigSrc) && fs.existsSync(distDir)) {
  fs.copyFileSync(webConfigSrc, path.join(distDir, 'web.config'));
}

// IMPORTANTE: garantisce che dist/version.txt (-> build-viewer/version.txt nel
// pacchetto) coincida ESATTAMENTE col nome del pacchetto. Usiamo la stessa
// 'version' (root version.txt) con cui sotto vengono nominati gli zip, scritta
// qui in postbuild (dopo bump+webpack) per evitare ogni problema di timing/cache
// del WriteVersionPlugin che poteva lasciare la sola base (es. "Version: 3.12.0").
// Senza questo, l'upload sulla dashboard fallisce con "Versione incoerente".
if (version && fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'version.txt'), `Version: ${version}`, 'utf8');
  console.log('postbuild: dist/version.txt allineato a', version);
}

// Scrive la version.txt corretta DENTRO una copia di build-viewer appena creata.
// Necessario perche' un eventuale processo webpack in background (watch/dev-server,
// WriteVersionPlugin) puo' riscrivere dist/version.txt con la sola base
// (es. "Version: 3.12.0") DURANTE il packaging: scrivendo sulla copia temporanea
// (non su dist) il pacchetto contiene sempre la versione giusta, a prova di race.
const writeVersionInto = buildViewerDir => {
  if (!version) {
    return;
  }
  try {
    fs.writeFileSync(path.join(buildViewerDir, 'version.txt'), `Version: ${version}`, 'utf8');
  } catch (err) {
    console.warn(`postbuild: impossibile scrivere version.txt in ${buildViewerDir}: ${err.message}`);
  }
};

const find7z = () => {
  const candidates = [
    '7z',
    '7za',
    'C:\\\\Program Files\\\\7-Zip\\\\7z.exe',
    'C:\\\\Program Files (x86)\\\\7-Zip\\\\7z.exe',
  ];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-h'], { stdio: 'ignore' });
    if (result.status === 0) {
      return candidate;
    }
  }
  return null;
};

// Marker che DEVONO essere presenti in un archivio base COMPLETO: il runtime
// (dicomweb-proxy + node_modules). L'archivio in build-tools viene RIUSATO come base
// ad ogni build (rinominato + swap del solo build-viewer): se una volta finisce privo
// di runtime, OGNI build successiva eredita il difetto e produce un pacchetto rotto da
// ~38MB invece di ~120MB. Meglio fermarsi subito con un errore chiaro.
const RUNTIME_MARKERS = ['dicomweb-proxy', 'node_modules'];

const archiveHasRuntime = (sevenZip, archivePath) => {
  if (!fs.existsSync(archivePath)) {
    return false;
  }
  const res = spawnSync(sevenZip, ['l', archivePath], { encoding: 'utf8' });
  if (res.status !== 0 || !res.stdout) {
    // Impossibile listare l'archivio: non blocco (l'assenza di 7z e' gestita altrove).
    return true;
  }
  return RUNTIME_MARKERS.every(marker => res.stdout.includes(marker));
};

const abortIncompleteBase = archivePath => {
  const line = '='.repeat(72);
  console.error(`\n${line}`);
  console.error('postbuild: ERRORE — pacchetto 7z INCOMPLETO (manca il runtime)');
  console.error(`  Archivio: ${archivePath}`);
  console.error(`  Attesi nel pacchetto: ${RUNTIME_MARKERS.join(' + ')} (dicomweb-proxy, node_modules, node .msi...).`);
  console.error('  Senza runtime il pacchetto e\' ~38MB invece di ~120MB, e ogni build successiva');
  console.error('  eredita il difetto perche\' l\'archivio in build-tools viene riusato come base.');
  console.error('  COME RISOLVERE: copia in platform/app/build-tools un pacchetto BASE completo');
  console.error('  (un VisualizzatorePACS_3D_Version ...7z da ~120MB con dicomweb-proxy + node_modules)');
  console.error('  e rilancia la build: il build-viewer verra\' aggiornato mantenendo il runtime.');
  console.error(`${line}\n`);
  throw new Error('postbuild: pacchetto 7z incompleto (manca il runtime). Packaging annullato.');
};

const updateArchive = (archivePath) => {
  const sevenZip = find7z();
  if (!sevenZip) {
    console.warn('postbuild: 7z non trovato, skip aggiornamento archivio');
    return;
  }

  if (!fs.existsSync(distDir)) {
    console.warn('postbuild: dist mancante, skip aggiornamento archivio');
    return;
  }

  const deleteResult = spawnSync(
    sevenZip,
    ['d', archivePath, 'VisualizzatorePACS_3D\\build-viewer', '-r'],
    { stdio: 'inherit' }
  );
  if (deleteResult.status !== 0) {
    console.warn('postbuild: errore rimozione build-viewer dal 7z');
  }

  const deleteBackendResult = spawnSync(
    sevenZip,
    ['d', archivePath, 'VisualizzatorePACS_3D\\backend.js'],
    { stdio: 'inherit' }
  );
  if (deleteBackendResult.status !== 0) {
    console.warn('postbuild: errore rimozione backend.js dal 7z');
  }

  // Cleanup retrocompatibile: rimuove eventuale updater legacy dal 7z.
  spawnSync(sevenZip, ['d', archivePath, 'VisualizzatorePACS_3D\\.scripts\\client-self-updater.cjs'], {
    stdio: 'ignore',
  });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdv-viewer-'));
  const tempPackageRoot = path.join(tempRoot, 'VisualizzatorePACS_3D');
  const targetDir = path.join(tempPackageRoot, 'build-viewer');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(distDir, targetDir, { recursive: true });
  writeVersionInto(targetDir);

  if (fs.existsSync(backendSrc)) {
    fs.copyFileSync(backendSrc, path.join(tempPackageRoot, 'backend.js'));
  } else {
    console.warn('postbuild: backend.js non trovato, skip aggiornamento backend nel 7z');
  }

  // Installer completo versionato nel repo in installer-package/: reiniettato nel 7z ad OGNI
  // build cosi' il fresh-install e' sempre aggiornato. Struttura mirror del pacchetto:
  //   installer-package/install.bat         -> VisualizzatorePACS_3D/install.bat
  //   installer-package/installer/*         -> VisualizzatorePACS_3D/installer/*
  // (installer/ include install.js [PM2+peer-sync+nome cliente], install-dependencies.js,
  //  gli .ps1 IIS con la rimozione della regola legacy 'wado', e pm2-installer-main.zip).
  const installerPackageDir = path.join(rootDir, 'installer-package');
  if (fs.existsSync(installerPackageDir)) {
    const batSrc = path.join(installerPackageDir, 'install.bat');
    if (fs.existsSync(batSrc)) {
      fs.copyFileSync(batSrc, path.join(tempPackageRoot, 'install.bat'));
    } else {
      console.warn('postbuild: installer-package/install.bat non trovato, skip');
    }
    const installerSrc = path.join(installerPackageDir, 'installer');
    if (fs.existsSync(installerSrc)) {
      const installerDst = path.join(tempPackageRoot, 'installer');
      fs.mkdirSync(installerDst, { recursive: true });
      fs.cpSync(installerSrc, installerDst, { recursive: true });
    } else {
      console.warn('postbuild: installer-package/installer/ non trovato, skip');
    }
  } else {
    console.warn('postbuild: installer-package/ non trovato nel repo, skip iniezione installer nel 7z');
  }

  const addResult = spawnSync(
    sevenZip,
    ['a', archivePath, path.join(tempRoot, 'VisualizzatorePACS_3D'), '-r'],
    { stdio: 'inherit' }
  );
  if (addResult.status !== 0) {
    console.warn('postbuild: errore aggiunta build-viewer al 7z');
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
};

const createBuildViewerZip = zipPath => {
  const sevenZip = find7z();
  if (!sevenZip) {
    console.warn('postbuild: 7z non trovato, skip creazione zip build-viewer');
    return;
  }

  if (!fs.existsSync(distDir)) {
    console.warn('postbuild: dist mancante, skip creazione zip build-viewer');
    return;
  }

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdv-viewer-zip-'));
  const tempBuildViewer = path.join(tempRoot, 'build-viewer');
  fs.cpSync(distDir, tempBuildViewer, { recursive: true });
  writeVersionInto(tempBuildViewer);

  const zipResult = spawnSync(sevenZip, ['a', '-tzip', zipPath, tempBuildViewer, '-r'], {
    stdio: 'inherit',
  });

  if (zipResult.status !== 0) {
    console.warn('postbuild: errore creazione zip build-viewer');
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
};

const createClientUpdateZip = zipPath => {
  const sevenZip = find7z();
  if (!sevenZip) {
    console.warn('postbuild: 7z non trovato, skip creazione zip update client');
    return false;
  }

  if (!fs.existsSync(distDir)) {
    console.warn('postbuild: dist mancante, skip creazione zip update client');
    return false;
  }

  if (!fs.existsSync(backendSrc)) {
    console.warn('postbuild: backend.js non trovato, skip creazione zip update client');
    return false;
  }

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdv-client-update-'));
  const payloadRoot = path.join(tempRoot, 'client-update');

  try {
    fs.mkdirSync(payloadRoot, { recursive: true });
    fs.cpSync(distDir, path.join(payloadRoot, 'build-viewer'), { recursive: true });
    writeVersionInto(path.join(payloadRoot, 'build-viewer'));
    fs.copyFileSync(backendSrc, path.join(payloadRoot, 'backend.js'));

    const zipResult = spawnSync(sevenZip, ['a', '-tzip', zipPath, payloadRoot, '-r'], {
      stdio: 'inherit',
    });

    if (zipResult.status !== 0) {
      console.warn('postbuild: errore creazione zip update client');
      return false;
    }

    return true;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
};

const writeSha256File = (sourcePath, outputPath) => {
  if (!fs.existsSync(sourcePath)) {
    console.warn(`postbuild: file mancante, skip checksum (${sourcePath})`);
    return;
  }

  const hash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  const fileName = path.basename(sourcePath);
  fs.writeFileSync(outputPath, `${hash}  ${fileName}\n`, 'utf8');
};

const cleanupOldBuildToolArtifacts = keepFileNames => {
  const keepSet = new Set((keepFileNames || []).filter(Boolean));

  const removablePatterns = [
    /^VisualizzatorePACS_3D_Version .*\.7z$/i,
    /^build-viewer_VisualizzatorePACS_3D_Version .*\.zip$/i,
    /^build-viewer_update_VisualizzatorePACS_3D_Version .*\.zip$/i,
    /^build-viewer_update_VisualizzatorePACS_3D_Version .*\.zip\.sha256$/i,
    /^VisualizzatorePACS_3D_Version .*\.7z\.tmp\d*$/i,
  ];

  const entries = fs.readdirSync(buildToolsDir, { withFileTypes: true });
  entries.forEach(entry => {
    if (!entry.isFile()) {
      return;
    }

    const fileName = entry.name;
    if (keepSet.has(fileName)) {
      return;
    }

    const shouldRemove = removablePatterns.some(pattern => pattern.test(fileName));
    if (!shouldRemove) {
      return;
    }

    const filePath = path.join(buildToolsDir, fileName);
    try {
      fs.rmSync(filePath, { force: true });
    } catch (err) {
      console.warn(`postbuild: impossibile eliminare ${fileName}: ${err.message}`);
    }
  });
};

if (fs.existsSync(buildToolsDir) && version) {
  const files = fs.readdirSync(buildToolsDir).filter(name => name.toLowerCase().endsWith('.7z'));
  if (!files.length) {
    console.warn('postbuild: nessun archivio .7z trovato in build-tools');
  } else {
    const preferred = files.find(name => name.startsWith('VisualizzatorePACS_3D_Version '));
    const archiveName = preferred || files[0];
    const currentArchivePath = path.join(buildToolsDir, archiveName);
    const desiredArchiveName = `VisualizzatorePACS_3D_Version ${version}.7z`;
    const desiredArchivePath = path.join(buildToolsDir, desiredArchiveName);

    // GUARDIA (pre-swap): l'archivio in build-tools verra' riusato come base. Se e' gia'
    // privo di runtime, fermati SUBITO (nulla viene modificato/rinominato) invece di
    // produrre in silenzio un pacchetto rotto che poi si propaga a tutte le build seguenti.
    const sevenZipCheck = find7z();
    if (sevenZipCheck && !archiveHasRuntime(sevenZipCheck, currentArchivePath)) {
      abortIncompleteBase(currentArchivePath);
    }

    if (currentArchivePath !== desiredArchivePath) {
      if (fs.existsSync(desiredArchivePath)) {
        fs.unlinkSync(desiredArchivePath);
      }
      fs.renameSync(currentArchivePath, desiredArchivePath);
    }

    updateArchive(desiredArchivePath);
    const buildViewerZipName = `build-viewer_VisualizzatorePACS_3D_Version ${version}.zip`;
    const buildViewerZipPath = path.join(buildToolsDir, buildViewerZipName);
    createBuildViewerZip(buildViewerZipPath);

    const clientUpdateZipName = `build-viewer_update_VisualizzatorePACS_3D_Version ${version}.zip`;
    const clientUpdateZipPath = path.join(buildToolsDir, clientUpdateZipName);
    const clientUpdateShaPath = `${clientUpdateZipPath}.sha256`;
    const clientUpdateZipCreated = createClientUpdateZip(clientUpdateZipPath);
    if (clientUpdateZipCreated) {
      writeSha256File(clientUpdateZipPath, clientUpdateShaPath);
    }

    const keepFiles = [desiredArchiveName, buildViewerZipName];
    if (clientUpdateZipCreated) {
      keepFiles.push(clientUpdateZipName, `${clientUpdateZipName}.sha256`);
    }
    cleanupOldBuildToolArtifacts(keepFiles);

    // SANITY (post-swap): il pacchetto finale deve restare completo e di dimensione
    // plausibile (~120MB). Cattura anche uno swap che l'abbia impoverito per altri motivi.
    if (sevenZipCheck) {
      const finalHasRuntime = archiveHasRuntime(sevenZipCheck, desiredArchivePath);
      const finalSizeMB = fs.existsSync(desiredArchivePath)
        ? fs.statSync(desiredArchivePath).size / (1024 * 1024)
        : 0;
      if (!finalHasRuntime || finalSizeMB < 60) {
        abortIncompleteBase(desiredArchivePath);
      }
      console.log(`postbuild: 7z OK — runtime presente, ${finalSizeMB.toFixed(0)}MB`);
    }
  }
}
