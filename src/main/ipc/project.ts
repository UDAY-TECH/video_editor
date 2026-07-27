import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { ProjectFile } from '../../shared/types';
import type { ProjectSaveResult, ProjectLoadResult } from '../../shared/api';
import { writeProjectFile, readProjectFile } from '../project-io';

const FILE_FILTERS = [{ name: 'Video Editor Project', extensions: ['veproj'] }];

export function registerProjectIpc(): void {
  ipcMain.handle(
    'project:save',
    async (event, project: ProjectFile, filePath: string | null): Promise<ProjectSaveResult> => {
      let targetPath = filePath;
      if (!targetPath) {
        const win = BrowserWindow.fromWebContents(event.sender);
        const options = { defaultPath: `${project.name}.veproj`, filters: FILE_FILTERS };
        const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return { canceled: true };
        targetPath = result.filePath;
      }
      await writeProjectFile(targetPath, project);
      return { canceled: false, filePath: targetPath };
    },
  );

  ipcMain.handle('project:load', async (event): Promise<ProjectLoadResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ['openFile' as const], filters: FILE_FILTERS };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const filePath = result.filePaths[0];
    const project = await readProjectFile(filePath);
    return { canceled: false, filePath, project };
  });
}
