export type WorkspaceRole = "OWNER" | "ADMIN" | "MANAGER" | "STAFF";
export type MemberStatus = "ACTIVE" | "SUSPENDED" | "REMOVED";
export type PermissionEffect = "GRANT" | "RESTRICT";

export interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
  createdAt: string;
  joinedAt?: string;
}

export interface WorkspaceMember {
  id: string;
  role: WorkspaceRole;
  status: MemberStatus;
  joinedAt: string;
  updatedAt: string;
  displayName: string | null;
  user: { id: string; email: string; name: string };
  _count?: { permissions: number };
  accessibleFolderCount?: number;
  permissions?: FolderRule[];
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface WorkspaceFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
  permissions?: string[];
  inherited?: boolean;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  folderId: string | null;
  createdAt: string;
}

export interface FolderRule {
  id?: string;
  folderId: string;
  effect: PermissionEffect;
  permissionKeys: string[];
  inherit: boolean;
  createdAt?: string;
  updatedAt?: string;
  folder?: Pick<WorkspaceFolder, "id" | "name" | "parentFolderId">;
}

export interface WorkspaceActivity {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export interface WorkspaceNotification {
  id: string;
  type: string;
  message: string;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
}

export const PERMISSION_KEYS = [
  "viewFolder",
  "viewFiles",
  "uploadFiles",
  "editFiles",
  "renameFiles",
  "moveFiles",
  "downloadFiles",
  "deleteFiles",
  "createSubfolders",
  "renameFolders",
  "manageContents",
  "shareFiles",
  "managePermissions",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  viewFolder: "View folder",
  viewFiles: "View files",
  uploadFiles: "Upload files",
  editFiles: "Edit files",
  renameFiles: "Rename files",
  moveFiles: "Move files",
  downloadFiles: "Download files",
  deleteFiles: "Delete files",
  createSubfolders: "Create subfolders",
  renameFolders: "Rename folders",
  manageContents: "Manage folder contents",
  shareFiles: "Share files",
  managePermissions: "Manage permissions",
};

export const PERMISSION_PRESETS: Record<string, PermissionKey[]> = {
  "View only": ["viewFolder", "viewFiles"],
  "Upload access": ["viewFolder", "viewFiles", "uploadFiles"],
  Editor: ["viewFolder", "viewFiles", "uploadFiles", "editFiles", "renameFiles", "createSubfolders", "manageContents"],
  "Full control": [...PERMISSION_KEYS],
};

export function workspaceHref(path: string, workspaceId?: string): string {
  if (!workspaceId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}workspace=${encodeURIComponent(workspaceId)}`;
}

export function roleLabel(role: WorkspaceRole): string {
  return {
    OWNER: "Business owner",
    ADMIN: "Administrator",
    MANAGER: "Manager",
    STAFF: "Staff member",
  }[role];
}
