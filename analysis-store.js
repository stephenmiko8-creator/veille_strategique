import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

const defaultDirectory = resolve(process.cwd(), 'data');
const dataDirectory = () => process.env.DATA_DIR || defaultDirectory;
let writes = Promise.resolve();

async function readRecords() {
  const directory = dataDirectory();
  await mkdir(directory, {recursive: true});
  const names = await readdir(directory);
  const paths = names
    .filter(name => name === 'analyses.json' || /^analysis-[\w-]+\.json$/.test(name))
    .map(name => join(directory, name));
  const records = [];
  for (const path of paths) {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'));
      records.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const latest = new Map();
  for (const record of records) {
    if (!record?.id) continue;
    const current = latest.get(record.id);
    if (!current || (record.updatedAt || '') > (current.updatedAt || '')) latest.set(record.id, record);
  }
  return [...latest.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function serializeWrite(operation) {
  const result = writes.then(operation);
  writes = result.catch(() => {});
  return result;
}

export async function listAnalyses() {
  await writes;
  return readRecords();
}

export function saveAnalysis(analysis) {
  return serializeWrite(async () => {
    const directory = dataDirectory();
    await mkdir(directory, {recursive: true});
    const id = typeof analysis.id === 'string' && /^[\w-]{1,80}$/.test(analysis.id) ? analysis.id : randomUUID();
    const record = {...analysis, id, updatedAt: new Date().toISOString()};
    const filename = 'analysis-' + id + '-' + Date.now() + '-' + randomUUID() + '.json';
    await writeFile(join(directory, filename), JSON.stringify(record, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
    return record;
  });
}

