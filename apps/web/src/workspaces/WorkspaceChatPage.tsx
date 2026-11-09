import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUpRight, FileText, MessageCircle, Paperclip, Plus, Search, Send, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest, downloadFile } from "../lib/api";
import type { WorkspaceFile } from "./types";
import { useWorkspaceScope } from "./useWorkspaceScope";
import "./workspace-chat.css";

type ChatMember = { id: string; displayName: string; role: string };
type ChatMessage = {
  id: string;
  conversationId: string;
  senderMemberId: string;
  senderName: string;
  content: string;
  fileId: string | null;
  createdAt: string;
  isMine: boolean;
};
type ChatConversation = {
  id: string;
  workspaceId: string;
  type: "WORKSPACE" | "DIRECT";
  memberAId: string | null;
  memberBId: string | null;
  updatedAt: string;
  lastMessage: ChatMessage | null;
};
type MessagePage = { messages: ChatMessage[]; nextAfterId: string | null; nextBeforeId: string | null };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "?";
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(value));
}

function isSameDay(first: string, second: string) {
  return new Date(first).toDateString() === new Date(second).toDateString();
}

export function WorkspaceChatPage() {
  const { workspacesQuery, workspace } = useWorkspaceScope();
  const workspaceId = workspace?.id;
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [composer, setComposer] = useState("");
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [sendError, setSendError] = useState("");
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [olderBeforeId, setOlderBeforeId] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);

  const conversationsQuery = useQuery({
    queryKey: ["workspace-chat-conversations", workspaceId],
    queryFn: () => apiRequest<ChatConversation[]>(`/workspaces/${workspaceId}/chat/conversations`),
    enabled: Boolean(workspaceId),
    refetchInterval: 8_000,
  });
  const membersQuery = useQuery({
    queryKey: ["workspace-chat-members", workspaceId],
    queryFn: () => apiRequest<ChatMember[]>(`/workspaces/${workspaceId}/chat/members`),
    enabled: Boolean(workspaceId),
  });
  const filesQuery = useQuery({
    queryKey: ["workspace-chat-files", workspaceId],
    queryFn: () => apiRequest<WorkspaceFile[]>(`/workspaces/${workspaceId}/chat/files`),
    enabled: Boolean(workspaceId),
  });

  const conversations = conversationsQuery.data ?? [];
  const roomConversation = conversations.find((conversation) => conversation.type === "WORKSPACE");
  const activeConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? roomConversation ?? null;
  const activeConversationId = activeConversation?.id;

  const messagesQuery = useQuery({
    queryKey: ["workspace-chat-messages", workspaceId, activeConversationId],
    queryFn: () => apiRequest<MessagePage>(`/workspaces/${workspaceId}/chat/conversations/${activeConversationId}/messages?limit=50`),
    enabled: Boolean(workspaceId && activeConversationId),
    refetchInterval: 4_000,
  });

  const members = membersQuery.data ?? [];
  const directConversations = conversations.filter((conversation) => conversation.type === "DIRECT");
  const availableMembers = members.filter((member) =>
    member.displayName.toLowerCase().includes(memberSearch.trim().toLowerCase()),
  );
  const files = filesQuery.data ?? [];
  const filteredFiles = files.filter((file) => file.name.toLowerCase().includes(fileSearch.trim().toLowerCase()));
  const currentMessages = messagesQuery.data?.messages ?? [];
  const visibleMessages = useMemo(() => {
    const seen = new Set<string>();
    return [...olderMessages, ...currentMessages].filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
  }, [currentMessages, olderMessages]);
  const conversationTitle = activeConversation?.type === "DIRECT"
    ? members.find((member) => member.id === activeConversation.memberAId || member.id === activeConversation.memberBId)?.displayName ?? "Direct conversation"
    : "Workspace room";

  useEffect(() => {
    setSelectedConversationId("");
    setOlderMessages([]);
    setOlderBeforeId(null);
  }, [workspaceId]);

  useEffect(() => {
    if (!activeConversationId) return;
    setOlderMessages([]);
    setOlderBeforeId(null);
    setSendError("");
  }, [activeConversationId]);

  useEffect(() => {
    if (olderMessages.length || !messagesQuery.data) return;
    setOlderBeforeId(messagesQuery.data.nextBeforeId);
  }, [messagesQuery.data, olderMessages.length]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    if (wasNearBottom.current) list.scrollTop = list.scrollHeight;
  }, [visibleMessages.length, activeConversationId]);

  const startDirectMessage = useMutation({
    mutationFn: (memberId: string) =>
      apiRequest<ChatConversation>(`/workspaces/${workspaceId}/chat/direct`, {
        method: "POST",
        body: JSON.stringify({ memberId }),
      }),
    onSuccess: async (conversation) => {
      setSelectedConversationId(conversation.id);
      setNewMessageOpen(false);
      setMemberSearch("");
      queryClient.setQueryData<ChatConversation[]>(
        ["workspace-chat-conversations", workspaceId],
        (existing) => existing
          ? [conversation, ...existing.filter((item) => item.id !== conversation.id)]
          : [conversation],
      );
      await queryClient.invalidateQueries({ queryKey: ["workspace-chat-conversations", workspaceId] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: (message: { content: string; fileId?: string }) =>
      apiRequest<ChatMessage>(`/workspaces/${workspaceId}/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify(message),
      }),
    onSuccess: async () => {
      setComposer("");
      setSelectedFile(null);
      setSendError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-chat-messages", workspaceId, activeConversationId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-chat-conversations", workspaceId] }),
      ]);
    },
    onError: (error) => setSendError(error instanceof Error ? error.message : "Message could not be sent."),
  });

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = composer.trim();
    if (!content || sendMessage.isPending || !activeConversationId) return;
    await sendMessage.mutateAsync({ content, ...(selectedFile ? { fileId: selectedFile.id } : {}) }).catch(() => undefined);
  }

  async function openDirect(member: ChatMember) {
    await startDirectMessage.mutateAsync(member.id).catch(() => undefined);
  }

  async function loadOlderMessages() {
    if (!workspaceId || !activeConversationId || !olderBeforeId || loadingOlder) return;
    setLoadingOlder(true);
    const list = messageListRef.current;
    const previousHeight = list?.scrollHeight ?? 0;
    try {
      const page = await apiRequest<MessagePage>(
        `/workspaces/${workspaceId}/chat/conversations/${activeConversationId}/messages?limit=50&beforeId=${encodeURIComponent(olderBeforeId)}`,
      );
      setOlderMessages((existing) => [...page.messages, ...existing]);
      setOlderBeforeId(page.nextBeforeId);
      requestAnimationFrame(() => {
        if (list) list.scrollTop = list.scrollHeight - previousHeight;
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Older messages could not be loaded.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function openFile(file: WorkspaceFile) {
    if (!workspaceId) return;
    try {
      await downloadFile(`/workspaces/${workspaceId}/files/${file.id}/download`, file.name);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "This file could not be opened.");
    }
  }

  if (workspacesQuery.isLoading) return <div className="page-loading"><span className="loader" />Opening your workspace…</div>;
  if (workspacesQuery.isError) return <div className="inline-error" role="alert"><div><strong>Workspace chat could not load.</strong><p>{workspacesQuery.error instanceof Error ? workspacesQuery.error.message : "Please try again."}</p></div><button className="button button-outline button-small" onClick={() => void workspacesQuery.refetch()}>Try again</button></div>;
  if (!workspace) return <div className="workspace-empty-card"><div className="workspace-empty-mark"><Users size={19} /></div><span className="eyebrow">BUSINESS WORKSPACE</span><h2>Chat starts with your team.</h2><p>Create a workspace or accept an invitation to start a shared room with your staff.</p><Link className="button button-green" to="/workspace/team">Set up a workspace</Link></div>;

  const messageError = messagesQuery.error instanceof Error ? messagesQuery.error.message : "";
  const loadingConversations = conversationsQuery.isLoading;
  const listEmptyText = conversationsQuery.isError
    ? conversationsQuery.error instanceof Error ? conversationsQuery.error.message : "Conversations could not load."
    : "No conversations yet.";

  return (
    <section className="workspace-chat-page">
      <header className="workspace-chat-heading">
        <div>
          <span className="eyebrow">{workspace.name.toUpperCase()} · TEAM COMMUNICATION</span>
          <h1>Conversations, <em>in context.</em></h1>
          <p>Keep decisions, questions, and the files they refer to in one shared place.</p>
        </div>
        <div className="chat-live-indicator"><span /> Updates every few seconds</div>
      </header>

      <div className="workspace-chat-shell">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-top">
            <div><span className="eyebrow">YOUR WORKSPACE</span><h2>Inbox</h2></div>
            <button type="button" className="chat-icon-button" aria-label="Start a direct conversation" title="Start a direct conversation" onClick={() => setNewMessageOpen(!newMessageOpen)}>
              {newMessageOpen ? <X size={17} /> : <Plus size={18} />}
            </button>
          </div>
          {newMessageOpen && <div className="chat-member-picker">
            <label className="chat-search"><Search size={15} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Find a teammate" aria-label="Find a teammate" /></label>
            <div className="chat-member-results">
              {membersQuery.isLoading ? <p>Loading teammates…</p> : membersQuery.isError ? <p>{membersQuery.error instanceof Error ? membersQuery.error.message : "Teammates could not load."}</p> : availableMembers.length ? availableMembers.map((member) => (
                <button key={member.id} type="button" disabled={startDirectMessage.isPending} onClick={() => void openDirect(member)}>
                  <span className="chat-avatar">{initials(member.displayName)}</span><span><strong>{member.displayName}</strong><small>{member.role.toLowerCase()}</small></span><MessageCircle size={15} />
                </button>
              )) : <p>No teammates found.</p>}
            </div>
            {startDirectMessage.isError && <p className="chat-inline-error">{startDirectMessage.error instanceof Error ? startDirectMessage.error.message : "Could not start conversation."}</p>}
          </div>}
          <div className="chat-conversation-list">
            <span className="chat-list-label">TEAM CHANNEL</span>
            {roomConversation && <button type="button" className={`chat-conversation ${activeConversationId === roomConversation.id ? "is-active" : ""}`} onClick={() => setSelectedConversationId(roomConversation.id)}>
              <span className="chat-room-avatar"><Users size={17} /></span>
              <span className="chat-conversation-copy"><strong>General</strong><small>{roomConversation.lastMessage?.content ?? "Shared with everyone"}</small></span>
              {roomConversation.lastMessage && <time>{messageTime(roomConversation.lastMessage.createdAt)}</time>}
            </button>}
            <div className="chat-list-label chat-direct-label"><span>DIRECT MESSAGES</span><span>{directConversations.length}</span></div>
            {directConversations.length ? directConversations.map((conversation) => {
              const person = members.find((member) => member.id === conversation.memberAId || member.id === conversation.memberBId);
              return <button key={conversation.id} type="button" className={`chat-conversation ${activeConversationId === conversation.id ? "is-active" : ""}`} onClick={() => setSelectedConversationId(conversation.id)}>
                <span className="chat-avatar">{initials(person?.displayName ?? "Team")}</span>
                <span className="chat-conversation-copy"><strong>{person?.displayName ?? "Teammate"}</strong><small>{conversation.lastMessage?.content ?? "Start the conversation"}</small></span>
                {conversation.lastMessage && <time>{messageTime(conversation.lastMessage.createdAt)}</time>}
              </button>;
            }) : <p className="chat-sidebar-empty">{loadingConversations ? "Loading conversations…" : listEmptyText}</p>}
          </div>
          <div className="chat-sidebar-foot"><span className="chat-foot-mark"><Users size={14} /></span><span><strong>{members.length + 1} team members</strong><small>Only workspace members can join</small></span></div>
        </aside>

        <main className="chat-thread">
          {conversationsQuery.isError && <div className="chat-thread-error" role="alert"><span>{conversationsQuery.error instanceof Error ? conversationsQuery.error.message : "Conversations could not load."}</span><button type="button" onClick={() => void conversationsQuery.refetch()}>Retry</button></div>}
          {activeConversation ? <>
            <header className="chat-thread-header">
              <div className={activeConversation.type === "WORKSPACE" ? "chat-room-avatar" : "chat-avatar"}>{activeConversation.type === "WORKSPACE" ? <Users size={18} /> : initials(conversationTitle)}</div>
              <div><span className="eyebrow">{activeConversation.type === "WORKSPACE" ? "EVERYONE IN THIS SPACE" : "PRIVATE CONVERSATION"}</span><h2>{conversationTitle}</h2></div>
              <div className="chat-thread-people"><Users size={15} />{activeConversation.type === "WORKSPACE" ? `${members.length + 1} members` : "Just you two"}</div>
            </header>

            {messageError && <div className="chat-thread-error" role="alert"><span>{messageError}</span><button type="button" onClick={() => void messagesQuery.refetch()}>Retry</button></div>}
            <div className="chat-messages" ref={messageListRef} onScroll={(event) => {
              const element = event.currentTarget;
              wasNearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
            }}>
              {olderBeforeId && <button type="button" className="chat-load-older" disabled={loadingOlder} onClick={() => void loadOlderMessages()}>{loadingOlder ? "Loading…" : "Load earlier messages"}<ArrowDown size={13} /></button>}
              {!messagesQuery.isLoading && !visibleMessages.length && <div className="chat-empty-thread"><span><MessageCircle size={20} /></span><strong>This is the start of the conversation.</strong><p>Share an update or tag a workspace file to get things moving.</p></div>}
              {messagesQuery.isLoading && <div className="chat-message-loading"><span className="loader" />Loading messages…</div>}
              {visibleMessages.map((message, index) => {
                const previous = visibleMessages[index - 1];
                const showDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
                const compact = previous && previous.senderMemberId === message.senderMemberId && !showDay
                  && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000;
                const attachedFile = message.fileId ? files.find((file) => file.id === message.fileId) : null;
                return <div key={message.id}>
                  {showDay && <div className="chat-day-divider"><span>{dayLabel(message.createdAt)}</span></div>}
                  <article className={`chat-message ${message.isMine ? "is-mine" : ""} ${compact ? "is-compact" : ""}`}>
                    {!message.isMine && !compact && <span className="chat-avatar chat-message-avatar">{initials(message.senderName)}</span>}
                    <div className="chat-message-body">
                      {!compact && <div className="chat-message-meta"><strong>{message.isMine ? "You" : message.senderName}</strong><time title={fullDate(message.createdAt)}>{messageTime(message.createdAt)}</time></div>}
                      <p className="chat-message-bubble">{message.content}</p>
                      {message.fileId && <button type="button" className="chat-file-chip" onClick={() => attachedFile && void openFile(attachedFile)} disabled={!attachedFile}>
                        <FileText size={15} /><span><strong>{attachedFile?.name ?? "Workspace file"}</strong><small>{attachedFile ? "Open attached file" : "File no longer available"}</small></span><ArrowUpRight size={13} />
                      </button>}
                    </div>
                  </article>
                </div>;
              })}
            </div>

            <footer className="chat-composer-wrap">
              {sendError && <p className="chat-inline-error" role="alert">{sendError}</p>}
              {selectedFile && <div className="chat-selected-file"><FileText size={15} /><span>{selectedFile.name}</span><button type="button" aria-label="Remove attached file" onClick={() => setSelectedFile(null)}><X size={14} /></button></div>}
              {filePickerOpen && <div className="chat-file-picker">
                <div className="chat-file-picker-head"><div><span className="eyebrow">WORKSPACE LIBRARY</span><strong>Tag a file</strong></div><button type="button" className="chat-icon-button" aria-label="Close file picker" onClick={() => setFilePickerOpen(false)}><X size={16} /></button></div>
                <label className="chat-search"><Search size={15} /><input autoFocus value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="Search files…" aria-label="Search files to tag" /></label>
                <div className="chat-file-results">
                  {filesQuery.isLoading ? <p>Loading workspace files…</p> : filesQuery.isError ? <p>Workspace files could not load.</p> : filteredFiles.length ? filteredFiles.slice(0, 30).map((file) => (
                    <button key={file.id} type="button" onClick={() => { setSelectedFile(file); setFilePickerOpen(false); setFileSearch(""); }}>
                      <FileText size={15} /><span><strong>{file.name}</strong><small>{file.mimeType}</small></span><Plus size={14} />
                    </button>
                  )) : <p>No files you can access match that search.</p>}
                </div>
              </div>}
              <form className="chat-composer" onSubmit={(event) => void submitMessage(event)}>
                <textarea value={composer} onChange={(event) => setComposer(event.target.value)} placeholder={`Message ${activeConversation.type === "WORKSPACE" ? "everyone" : conversationTitle}…`} aria-label="Write a chat message" maxLength={4000} rows={2} onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }} />
                <div className="chat-composer-bottom">
                  <div><button type="button" className={`chat-attach-button ${filePickerOpen ? "is-open" : ""}`} onClick={() => setFilePickerOpen(!filePickerOpen)}><Paperclip size={15} /> Tag file</button><span>Enter to send · Shift + Enter for a new line</span></div>
                  <button type="submit" className="chat-send-button" disabled={!composer.trim() || sendMessage.isPending} aria-label="Send message">{sendMessage.isPending ? <span className="chat-send-spinner" /> : <Send size={16} />}<span>Send</span></button>
                </div>
              </form>
            </footer>
          </> : <div className="chat-thread-empty"><span><MessageCircle size={22} /></span><h2>Open a conversation</h2><p>Choose General or start a private conversation with a teammate.</p></div>}
        </main>
      </div>
    </section>
  );
}
