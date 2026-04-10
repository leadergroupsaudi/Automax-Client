import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentApi } from "../api/documents";
import { toast } from "sonner";

export const documentKeys = {
  all: ["documents"] as const,
  files: (parentId?: string) =>
    [...documentKeys.all, "files", parentId ?? "root"] as const,
  search: (query: string) =>
    [...documentKeys.all, "search", query] as const,
  fileInfo: (fileId: string) =>
    [...documentKeys.all, "fileInfo", fileId] as const,
  comments: (fileId: string) =>
    [...documentKeys.all, "comments", fileId] as const,
  tags: (fileId: string) =>
    [...documentKeys.all, "tags", fileId] as const,
  versions: (fileId: string) =>
    [...documentKeys.all, "versions", fileId] as const,
};

export function useDocumentFiles(parentId?: string) {
  return useQuery({
    queryKey: documentKeys.files(parentId),
    queryFn: async () => {
      const res = await documentApi.listFiles(parentId);
      return res.data;
    },
  });
}

export function useDocumentSearch(
  query: string,
  tags?: Record<string, string>,
  enabled = true,
) {
  return useQuery({
    queryKey: [...documentKeys.search(query), tags] as const,
    queryFn: async () => {
      const res = await documentApi.searchFiles(query, tags);
      return res.data;
    },
    enabled:
      enabled &&
      (query.length > 0 ||
        (tags !== undefined && Object.keys(tags).length > 0)),
  });
}

export function useFileInfo(fileId: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.fileInfo(fileId),
    queryFn: async () => {
      const res = await documentApi.getFileInfo(fileId);
      return res.data;
    },
    enabled,
  });
}

export function useFileComments(fileId: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.comments(fileId),
    queryFn: async () => {
      const res = await documentApi.getComments(fileId);
      return res.data;
    },
    enabled,
  });
}

export function useAddComment(fileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => documentApi.addComment(fileId, content),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: documentKeys.comments(fileId),
      });
      toast.success("Comment added");
    },
    onError: () => {
      toast.error("Failed to add comment");
    },
  });
}

export function useFileTags(fileId: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.tags(fileId),
    queryFn: async () => {
      const res = await documentApi.getTags(fileId);
      return res.data;
    },
    enabled,
  });
}

export function useSetTags(fileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tags: Record<string, string>) =>
      documentApi.setTags(fileId, tags),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: documentKeys.tags(fileId),
      });
      await queryClient.invalidateQueries({
        queryKey: documentKeys.fileInfo(fileId),
      });
      toast.success("Tags updated");
    },
    onError: () => {
      toast.error("Failed to update tags");
    },
  });
}

export function useFileVersions(fileId: string) {
  return useQuery({
    queryKey: documentKeys.versions(fileId),
    queryFn: async () => {
      const res = await documentApi.listVersions(fileId);
      return res.data;
    },
    enabled: !!fileId,
  });
}

export function useUploadVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      fileId,
      file,
      description,
    }: {
      fileId: string;
      file: File;
      description: string;
    }) => documentApi.uploadVersion(fileId, file, description),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: documentKeys.versions(variables.fileId),
      });
      toast.success("Version uploaded");
    },
    onError: () => {
      toast.error("Failed to upload version");
    },
  });
}

export function useRollbackVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      fileId,
      versionUuid,
    }: {
      fileId: string;
      versionUuid: string;
    }) => documentApi.rollbackVersion(fileId, versionUuid),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: documentKeys.versions(variables.fileId),
      });
      await queryClient.invalidateQueries({
        queryKey: documentKeys.fileInfo(variables.fileId),
      });
      toast.success("Version rolled back");
    },
    onError: () => {
      toast.error("Failed to rollback version");
    },
  });
}
