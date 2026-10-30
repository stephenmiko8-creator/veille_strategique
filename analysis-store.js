import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const defaultDirectory = 'D:\\projet IA\\veuille_strategique';
const dataFile = () => join(process.env.DATA_DIR || defaultDirectory, 'analyses.json');
let writes = Promise.resolve();

async function readRecords() {
  const file = dataFile();
  await mkdir(file.slice(0, file.lastIndexOf('\\')), {recursive: true});
  try {
    const records = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(records)) throw new Error('Le fichier des analyses doit contenir une liste.');
    return records;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
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
    const file = dataFile();
    const records = await readRecords();
    const id = typeof analysis.id === 'string' && /^[\w-]{1,80}$/.test(analysis.id) ? analysis.id : randomUUID();
    const record = {...analysis, id, updatedAt: new Date().toISOString()};
    const index = records.findIndex(item => item.id === id);
    if (index === -1) records.unshift(record);
    else records[index] = record;
    const temporaryFile = file + '.' + randomUUID() + '.tmp';
    await writeFile(temporaryFile, JSON.stringify(records, null, 2) + '\n', 'utf8');
    await rename(temporaryFile, file);
    return record;
  });
}

