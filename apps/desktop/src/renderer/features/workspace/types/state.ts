export interface FileNode {
  path: string;
  name: string;
  type: "file" | "dir";
  expanded?: boolean;
  loaded?: boolean;
  loading?: boolean;
  children?: string[];
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  /** Content before the last external change (agent edit), for the diff view. */
  previousContent?: string;
  loading?: boolean;
}

export interface State {
  rootPath?: string;
  rootName?: string;
  nodes: Record<string, FileNode>;
  openFiles: OpenFile[];
  activePath?: string;
  error?: string;
}
