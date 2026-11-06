export const WORKSPACE_PERMISSION_KEYS = [
  'viewFolder', 'viewFiles', 'uploadFiles', 'editFiles', 'renameFiles', 'moveFiles',
  'downloadFiles', 'deleteFiles', 'createSubfolders', 'renameFolders',
  'manageContents', 'shareFiles', 'managePermissions',
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSION_KEYS)[number] | string;
export type PermissionRule = {
  folderId: string;
  effect: 'GRANT' | 'RESTRICT';
  permissionKeys: string[];
  inherit: boolean;
};

/**
 * Rules are evaluated root-to-leaf. A restriction blocks ancestor grants for
 * its folder subtree; an explicit grant below the restriction may re-grant.
 * The owner/admin role bypasses folder rules; manager/staff do not.
 */
export function evaluateFolderPermission(
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF',
  permission: WorkspacePermission,
  folderPath: Array<{ id: string }>,
  rules: PermissionRule[],
): boolean {
  if (role === 'OWNER' || role === 'ADMIN') return true;
  let allowed = false;
  const ids = new Set(folderPath.map((folder) => folder.id));
  for (const folder of folderPath) {
    const applicable = rules.filter((rule) =>
      rule.folderId === folder.id
      && (rule.inherit || folder.id === folderPath.at(-1)?.id)
      && rule.permissionKeys.includes(permission));
    if (applicable.some((rule) => rule.effect === 'RESTRICT')) allowed = false;
    else if (applicable.some((rule) => rule.effect === 'GRANT')) allowed = true;
  }
  // Defensive: the path is an authorization boundary and must end at target.
  if (!folderPath.length || !ids.has(folderPath.at(-1)!.id)) return false;
  return allowed;
}

export function isWorkspaceAdministrator(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
