import { promises as fs } from 'fs';
import type { ProjectFile } from '../../shared/types';
import { migrateProjectFile, CURRENT_PROJECT_VERSION } from './migrate';

export { CURRENT_PROJECT_VERSION };

export async function writeProjectFile(filePath: string, project: ProjectFile): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8');
}

export async function readProjectFile(filePath: string): Promise<ProjectFile> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return migrateProjectFile(JSON.parse(raw));
}
