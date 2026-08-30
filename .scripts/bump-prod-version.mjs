import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const versionPath = path.join(rootDir, 'version.txt');
const lernaPath = path.join(rootDir, 'lerna.json');
const versionJsonPath = path.join(rootDir, 'version.json');
const commitPath = path.join(rootDir, 'commit.txt');

const pad2 = value => String(value).padStart(2, '0');

function formatTimestamp(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(
    date.getHours()
  )}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

async function readText(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.trim();
  } catch (error) {
    return '';
  }
}

function parseVersion(rawVersion) {
  const match = rawVersion.match(
    /^(?<base>\d+\.\d+\.\d+)(?:-(?<channel>[a-zA-Z]+)\.(?<num>\d+))?(?:_(?<stamp>[\d-]+))?$/
  );

  if (!match?.groups?.base) {
    return null;
  }

  return {
    base: match.groups.base,
    channel: match.groups.channel || 'prod',
    num: match.groups.num ? parseInt(match.groups.num, 10) : null,
  };
}

async function run() {
  const rawVersion = await readText(versionPath);
  let baseVersion = '';
  let channel = 'prod';
  let nextNumber = 1;

  const parsed = parseVersion(rawVersion);
  if (parsed) {
    baseVersion = parsed.base;
    channel = parsed.channel || channel;
    nextNumber = parsed.num != null ? parsed.num + 1 : nextNumber;
  } else {
    const lernaRaw = await readText(lernaPath);
    if (lernaRaw) {
      try {
        const lernaJson = JSON.parse(lernaRaw);
        if (lernaJson?.version) {
          baseVersion = String(lernaJson.version).split('-')[0];
        }
      } catch (error) {
        // ignore parse issues, fallback to 0.0.0
      }
    }
  }

  if (!baseVersion) {
    baseVersion = '0.0.0';
  }

  const timestamp = formatTimestamp(new Date());
  const nextVersion = `${baseVersion}-${channel}.${nextNumber}_${timestamp}`;

  await fs.writeFile(versionPath, nextVersion);

  const commitHash = await readText(commitPath);
  let versionJson = {};
  const existingVersionJson = await readText(versionJsonPath);
  if (existingVersionJson) {
    try {
      versionJson = JSON.parse(existingVersionJson);
    } catch (error) {
      versionJson = {};
    }
  }

  const updatedVersionJson = {
    ...versionJson,
    version: nextVersion,
  };

  if (commitHash) {
    updatedVersionJson.commit = commitHash;
  }

  await fs.writeFile(versionJsonPath, JSON.stringify(updatedVersionJson, null, 2));

  console.log(`Version bumped to ${nextVersion}`);
}

run().catch(error => {
  console.error('Failed to bump version:', error);
  process.exit(1);
});
