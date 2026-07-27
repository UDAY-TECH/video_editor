// The single source of truth for the project file schema version (Section 3).
// Bump this whenever Clip/Track/MediaAsset/ProjectFile shape changes, and add
// a corresponding migration case in main/project-io/migrate.ts.
export const CURRENT_PROJECT_VERSION = '1.1.0';
