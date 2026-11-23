export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";

export interface ProductivityFile {
  id: string;
  name?: string;
  originalName?: string;
  mimeType: string;
  sizeBytes: string;
}

export interface ProductivityAttachment {
  fileId: string;
  file: ProductivityFile;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  progress: number;
  dueAt: string | null;
  assignee?: { user: { id: string; name: string; email: string } } | null;
  attachments: ProductivityAttachment[];
}

export interface CalendarLink {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

export interface MeetingActionItem {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  assigneeUserId: string | null;
  personalTaskId?: string | null;
  workspaceTaskId?: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  transcript: string;
  summary: string | null;
  decisions: string[];
  recordingFileId: string | null;
  recordingFile: ProductivityFile | null;
  calendarEventId: string | null;
  calendarEvent: CalendarLink | null;
  actionItems: MeetingActionItem[];
}

export type FormQuestionType =
  | "SHORT_ANSWER"
  | "PARAGRAPH"
  | "MULTIPLE_CHOICE"
  | "CHECKBOXES"
  | "EMAIL"
  | "NUMBER"
  | "FILE_UPLOAD";

export interface FormQuestion {
  id: string;
  prompt: string;
  type: FormQuestionType;
  required: boolean;
  choices?: string[];
}

export interface WorkspaceForm {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  schema: { questions: FormQuestion[] };
  shareActive: boolean;
  responseCount: number;
  publishedAt: string | null;
}

export interface FormResponse {
  id: string;
  respondentName: string;
  respondentEmail: string;
  answers: Record<string, unknown>;
  submittedAt: string;
}

export function fileLabel(file: ProductivityFile): string {
  return file.originalName ?? file.name ?? "Document";
}
