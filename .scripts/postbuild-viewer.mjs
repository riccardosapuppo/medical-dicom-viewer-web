/**
 * Puts the freshly built viewer into the on-premise package, and refuses to
 * ship a package that lost its runtime.
 *
 * A site installation is one 7-Zip archive holding the runtime — the DICOMweb
 * proxy, its node_modules, the Node installer — with the built viewer inside
 * it. Only the viewer changes between releases, so each build reuses the
 * previous archive as its base and swaps that one folder.
 *
 * Which is where this earns its length. Reusing the base means a base that
 * comes out wrong stays wrong: an archive that once lost its runtime is the
 * base of every build after it, and each of those produces an installer of
 * about 38 MB instead of about 120 MB that installs and then does not run. It
 * happened, and the only symptom was the size. So the archive is inspected for
 * the runtime before the swap and again after, and the build stops rather than
 * writing a package that looks finished.
 *
 * The base archive lives in platform/app/build-tools, which is not part of this
 * repository: it is a hundred and twenty megabytes of third-party runtime, and
 * it belongs to a site rather than to the software. Without it every step below
 * is skipped and this script does one thing, writing dist/version.txt, which is
 * what happens on a clone.
 */
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

/** The folder the archive holds everything under, and the name it is filed by. */
const PACKAGE = 'DicomViewer';

/** A path inside the archive: 7-Zip separates them the Windows way. */
const inPackage = (...parts) => [PACKAGE, ...parts].join(path.win32.sep);

const versionPath = path.join(rootDir, 'version.txt');
const versionRaw = fs.existsSync(versionPath) ? fs.readFileSync(versionPath, 'utf8') : '';
const version = versionRaw.toString().trim().split(/\s+/)[0];

if (!version) {
  console.warn('postbuild: no version found, skipping the packaging');
}

const webConfigSrc = path.join(buildToolsDir, 'web.config');
if (fs.existsSync(webConfigSrc) && fs.existsSync(distDir)) {
  fs.copyFileSync(webConfigSrc, path.join(distDir, 'web.config'));
}

// dist/version.txt has to say exactly what the package is named, because the
// dashboard compares the two and rejects the upload when they differ. Both come
// from the root version.txt, and this is written here, after the version bump
// and after webpack, rather than during the build: the plugin that writes it
// runs early enough to leave the base version behind ("Version: 3.12.0") when
// the bump has not landed yet.
if (version && fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'version.txt'), `Version: ${version}`, 'utf8');
  console.log('postbuild: dist/version.txt now says', version);
}

/**
 * The right version.txt, written into a copy rather than into dist.
 *
 * A webpack still watching in another window can rewrite dist/version.txt with
 * the base version WHILE the package is being assembled. Writing to the copy
 * that is about to be archived takes the race out of it.
 */
const writeVersionInto = buildViewerDir => {
  if (!version) {
    return;
  }
  try {
    fs.writeFileSync(path.join(buildViewerDir, 'version.txt'), `Version: ${version}`, 'utf8');
  } catch (error) {
    console.warn(`postbuild: cannot write version.txt in ${buildViewerDir}: ${error.message}`);
  }
};

const find7z = () => {
  const candidates = [
    '7z',
    '7za',
    // Forward slashes: Windows accepts them, and they keep this readable.
    'C:/Program Files/7-Zip/7z.exe',
    'C:/Program Files (x86)/7-Zip/7z.exe',
  ];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-h'], { stdio: 'ignore' });
    if (result.status === 0) {
      return candidate;
    }
  }
  return null;
};

/** What a complete base archive contains. Their absence is the whole fault. */
const RUNTIME_MARKERS = ['dicomweb-proxy', 'node_modules'];

const archiveHasRuntime = (sevenZip, archivePath) => {
  if (!fs.existsSync(archivePath)) {
    return false;
  }
  const listed = spawnSync(sevenZip, ['l', archivePath], { encoding: 'utf8' });
  if (listed.status !== 0 || !listed.stdout) {
    // The archive could not be listed, which is not the same as knowing it is
    // incomplete. A missing 7-Zip is reported elsewhere; this does not stop.
    return true;
  }
  return RUNTIME_MARKERS.every(marker => listed.stdout.includes(marker));
};

const abortIncompleteBase = archivePath => {
  const rule = '='.repeat(72);
  console.error(`\n${rule}`);
  console.error('postbuild: STOPPED — the package is incomplete: the runtime is missing');
  console.error(`  Archive: ${archivePath}`);
  console.error(`  Expected inside it: ${RUNTIME_MARKERS.join(' + ')}, and the Node installer.`);
  console.error('  Without the runtime the package is about 38 MB instead of about 120 MB, and');
  console.error('  every build after this one inherits the fault, because the archive in');
  console.error('  build-tools is reused as the base.');
  console.error('  TO FIX: put a complete base package in platform/app/build-tools and build');
  console.error('  again. The viewer inside it is replaced; the runtime is kept.');
  console.error(`${rule}\n`);
  throw new Error('postbuild: the package is missing its runtime. Nothing was written.');
};

const updateArchive = archivePath => {
  const sevenZip = find7z();
  if (!sevenZip) {
    console.warn('postbuild: no 7-Zip found, skipping the archive update');
    return;
  }

  if (!fs.existsSync(distDir)) {
    console.warn('postbuild: no dist, skipping the archive update');
    return;
  }

  const removed = spawnSync(sevenZip, ['d', archivePath, inPackage('build-viewer'), '-r'], {
    stdio: 'inherit',
  });
  if (removed.status !== 0) {
    console.warn('postbuild: could not remove build-viewer from the archive');
  }

  const removedBackend = spawnSync(sevenZip, ['d', archivePath, inPackage('backend.js')], {
    stdio: 'inherit',
  });
  if (removedBackend.status !== 0) {
    console.warn('postbuild: could not remove backend.js from the archive');
  }

  // An updater older packages carried, taken out of any archive that still has
  // one. Silent: most archives do not.
  spawnSync(sevenZip, ['d', archivePath, inPackage('.scripts', 'client-self-updater.cjs')], {
    stdio: 'ignore',
  });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-package-'));
  const tempPackageRoot = path.join(tempRoot, PACKAGE);
  const targetDir = path.join(tempPackageRoot, 'build-viewer');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(distDir, targetDir, { recursive: true });
  writeVersionInto(targetDir);

  if (fs.existsSync(backendSrc)) {
    fs.copyFileSync(backendSrc, path.join(tempPackageRoot, 'backend.js'));
  } else {
    console.warn('postbuild: no backend.js, leaving the one in the archive alone');
  }

  // The installer is versioned in the repository under installer-package/ and
  // put back into the archive on every build, so a fresh install is never older
  // than the viewer it installs. It mirrors the package:
  //   installer-package/install.bat   ->  <package>/install.bat
  //   installer-package/installer/*   ->  <package>/installer/*
  const installerPackageDir = path.join(rootDir, 'installer-package');
  if (fs.existsSync(installerPackageDir)) {
    const batSrc = path.join(installerPackageDir, 'install.bat');
    if (fs.existsSync(batSrc)) {
      fs.copyFileSync(batSrc, path.join(tempPackageRoot, 'install.bat'));
    } else {
      console.warn('postbuild: no installer-package/install.bat, skipping it');
    }
    const installerSrc = path.join(installerPackageDir, 'installer');
    if (fs.existsSync(installerSrc)) {
      const installerDst = path.join(tempPackageRoot, 'installer');
      fs.mkdirSync(installerDst, { recursive: true });
      fs.cpSync(installerSrc, installerDst, { recursive: true });
    } else {
      console.warn('postbuild: no installer-package/installer/, skipping it');
    }
  } else {
    console.warn('postbuild: no installer-package/ in the repository, skipping the installer');
  }

  const added = spawnSync(sevenZip, ['a', archivePath, path.join(tempRoot, PACKAGE), '-r'], {
    stdio: 'inherit',
  });
  if (added.status !== 0) {
    console.warn('postbuild: could not add build-viewer to the archive');
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
};

const createBuildViewerZip = zipPath => {
  const sevenZip = find7z();
  if (!sevenZip) {
    console.warn('postbuild: no 7-Zip found, skipping the build-viewer zip');
    return;
  }

  if (!fs.existsSync(distDir)) {
    console.warn('postbuild: no dist, skipping the build-viewer zip');
    return;
  }

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-zip-'));
  const tempBuildViewer = path.join(tempRoot, 'build-viewer');
  fs.cpSync(distDir, tempBuildViewer, { recursive: true });
  writeVersionInto(tempBuildViewer);

  const zipped = spawnSync(sevenZip, ['a', '-tzip', zipPath, tempBuildViewer, '-r'], {
    stdio: 'inherit',
  });

  if (zipped.status !== 0) {
    console.warn('postbuild: could not create the build-viewer zip');
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
};

/** The smaller archive an installed site downloads to update itself in place. */
const createClientUpdateZip = zipPath => {
  const sevenZip = find7z();
  if (!sevenZip) {
    console.warn('postbuild: no 7-Zip found, skipping the update zip');
    return false;
  }

  if (!fs.existsSync(distDir)) {
    console.warn('postbuild: no dist, skipping the update zip');
    return false;
  }

  if (!fs.existsSync(backendSrc)) {
    console.warn('postbuild: no backend.js, skipping the update zip');
    return false;
  }

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-update-'));
  const payloadRoot = path.join(tempRoot, 'client-update');

  try {
    fs.mkdirSync(payloadRoot, { recursive: true });
    fs.cpSync(distDir, path.join(payloadRoot, 'build-viewer'), { recursive: true });
    writeVersionInto(path.join(payloadRoot, 'build-viewer'));
    fs.copyFileSync(backendSrc, path.join(payloadRoot, 'backend.js'));

    const zipped = spawnSync(sevenZip, ['a', '-tzip', zipPath, payloadRoot, '-r'], {
      stdio: 'inherit',
    });

    if (zipped.status !== 0) {
      console.warn('postbuild: could not create the update zip');
      return false;
    }

    return true;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
};

/** The checksum an installed site verifies its download against. */
const writeSha256File = (sourcePath, outputPath) => {
  if (!fs.existsSync(sourcePath)) {
    console.warn(`postbuild: nothing at ${sourcePath}, skipping its checksum`);
    return;
  }

  const hash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  const fileName = path.basename(sourcePath);
  fs.writeFileSync(outputPath, `${hash}  ${fileName}\n`, 'utf8');
};

/** Last build's packages, so build-tools does not grow one archive per release. */
const cleanupOldBuildToolArtifacts = keepFileNames => {
  const keepSet = new Set((keepFileNames || []).filter(Boolean));
  const escaped = PACKAGE.replace(/[.*+?^${}()|[\]]/g, '');

  const removablePatterns = [
    new RegExp(`^${escaped}_Version .*[.]7z$`, 'i'),
    new RegExp(`^build-viewer_${escaped}_Version .*[.]zip$`, 'i'),
    new RegExp(`^build-viewer_update_${escaped}_Version .*[.]zip$`, 'i'),
    new RegExp(`^build-viewer_update_${escaped}_Version .*[.]zip[.]sha256$`, 'i'),
    new RegExp(`^${escaped}_Version .*[.]7z[.]tmp[0-9]*$`, 'i'),
  ];

  for (const entry of fs.readdirSync(buildToolsDir, { withFileTypes: true })) {
    if (!entry.isFile() || keepSet.has(entry.name)) {
      continue;
    }
    if (!removablePatterns.some(pattern => pattern.test(entry.name))) {
      continue;
    }
    try {
      fs.rmSync(path.join(buildToolsDir, entry.name), { force: true });
    } catch (error) {
      console.warn(`postbuild: cannot delete ${entry.name}: ${error.message}`);
    }
  }
};

if (fs.existsSync(buildToolsDir) && version) {
  const files = fs.readdirSync(buildToolsDir).filter(name => name.toLowerCase().endsWith('.7z'));
  if (!files.length) {
    console.warn('postbuild: no .7z base archive in build-tools');
  } else {
    const preferred = files.find(name => name.startsWith(`${PACKAGE}_Version `));
    const archiveName = preferred || files[0];
    const currentArchivePath = path.join(buildToolsDir, archiveName);
    const desiredArchiveName = `${PACKAGE}_Version ${version}.7z`;
    const desiredArchivePath = path.join(buildToolsDir, desiredArchiveName);

    // Before the swap. If the base is already missing its runtime, stop here,
    // with nothing renamed and nothing written, rather than quietly producing a
    // broken package that then becomes the base of every build after it.
    const sevenZip = find7z();
    if (sevenZip && !archiveHasRuntime(sevenZip, currentArchivePath)) {
      abortIncompleteBase(currentArchivePath);
    }

    if (currentArchivePath !== desiredArchivePath) {
      if (fs.existsSync(desiredArchivePath)) {
        fs.unlinkSync(desiredArchivePath);
      }
      fs.renameSync(currentArchivePath, desiredArchivePath);
    }

    updateArchive(desiredArchivePath);

    const buildViewerZipName = `build-viewer_${PACKAGE}_Version ${version}.zip`;
    createBuildViewerZip(path.join(buildToolsDir, buildViewerZipName));

    const clientUpdateZipName = `build-viewer_update_${PACKAGE}_Version ${version}.zip`;
    const clientUpdateZipPath = path.join(buildToolsDir, clientUpdateZipName);
    const clientUpdateZipCreated = createClientUpdateZip(clientUpdateZipPath);
    if (clientUpdateZipCreated) {
      writeSha256File(clientUpdateZipPath, `${clientUpdateZipPath}.sha256`);
    }

    const keepFiles = [desiredArchiveName, buildViewerZipName];
    if (clientUpdateZipCreated) {
      keepFiles.push(clientUpdateZipName, `${clientUpdateZipName}.sha256`);
    }
    cleanupOldBuildToolArtifacts(keepFiles);

    // After the swap. Catches a swap that emptied the archive for any other
    // reason: a complete package is around 120 MB, and 60 is far below anything
    // a real one has ever been.
    if (sevenZip) {
      const stillComplete = archiveHasRuntime(sevenZip, desiredArchivePath);
      const megabytes = fs.existsSync(desiredArchivePath)
        ? fs.statSync(desiredArchivePath).size / (1024 * 1024)
        : 0;
      if (!stillComplete || megabytes < 60) {
        abortIncompleteBase(desiredArchivePath);
      }
      console.log(`postbuild: package complete, runtime present, ${megabytes.toFixed(0)} MB`);
    }
  }
}
