import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../lib/api";
import type { Workspace } from "./types";

export function useWorkspaceScope() {
  const [searchParams, setSearchParams] = useSearchParams();
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiRequest<Workspace[]>("/workspaces"),
  });

  const workspaces = workspacesQuery.data ?? [];
  const requestedId = searchParams.get("workspace");
  const workspace =
    workspaces.find((item) => item.id === requestedId) ??
    workspaces[0] ??
    null;

  function selectWorkspace(workspaceId: string) {
    const next = new URLSearchParams(searchParams);
    next.delete("folder");
    next.set("workspace", workspaceId);
    setSearchParams(next);
  }

  return { workspacesQuery, workspaces, workspace, selectWorkspace };
}
