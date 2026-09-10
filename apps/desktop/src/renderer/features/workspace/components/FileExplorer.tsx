import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@renderer/components";
import { ModalButton } from "@renderer/components";
import {
  ChevronRightIcon,
  CollapseAllIcon,
  CopyIcon,
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  PencilIcon,
  RevealIcon,
  Spinner,
  TrashIcon,
} from "@renderer/components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { errorText } from "@renderer/utils";
import { basename, relativePath } from "@renderer/utils";
import {
  clearWorkspaceError,
  collapseAll,
  createFileRequest,
  createFolderRequest,
  deleteEntryRequest,
  loadDirRequest,
  openFileRequest,
  openFolderRequest,
  renameEntryRequest,
  toggleDir,
} from "../store";
import type { FileNode } from "../types/state";

type ModalKind = "createFile" | "createFolder" | "rename" | "delete";

interface MenuState {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
  isRoot: boolean;
}

interface ModalState {
  kind: ModalKind;
  dirPath?: string;
  targetPath?: string;
  initialName?: string;
}

export function FileExplorer() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { rootPath, rootName, nodes, error } = useAppSelector((state) => state.workspace);
  const [menu, setMenu] = useState<MenuState | undefined>();
  const [modal, setModal] = useState<ModalState | undefined>();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!menu) return;
    function close(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-context-menu]")) {
        setMenu(undefined);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const rootNode = rootPath ? nodes[rootPath] : undefined;

  function openModal(modalState: ModalState, initialName = "") {
    setModal(modalState);
    setName(initialName);
  }

  function closeModal() {
    setModal(undefined);
    setName("");
  }

  function submitModal() {
    if (!modal) return;
    if (modal.kind === "createFile" && modal.dirPath) {
      dispatch(createFileRequest({ dirPath: modal.dirPath, name: name.trim() }));
    } else if (modal.kind === "createFolder" && modal.dirPath) {
      dispatch(createFolderRequest({ dirPath: modal.dirPath, name: name.trim() }));
    } else if (modal.kind === "rename" && modal.targetPath) {
      dispatch(renameEntryRequest({ path: modal.targetPath, name: name.trim() }));
    } else if (modal.kind === "delete" && modal.targetPath) {
      dispatch(deleteEntryRequest(modal.targetPath));
    }
    closeModal();
  }

  function copyText(text: string) {
    void window.pi.copyText(text);
  }

  const modalTitle = modal
    ? modal.kind === "createFile"
      ? t("files.newFile")
      : modal.kind === "createFolder"
        ? t("files.newFolder")
        : modal.kind === "rename"
          ? t("files.rename")
          : t("files.delete")
    : "";

  return (
    <Root>
      <Body
        onContextMenu={(event) => {
          if (!rootPath) return;
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, path: rootPath, isDir: true, isRoot: true });
        }}
      >
        {!rootPath ? (
          <EmptyState>
            <EmptyText>{t("files.noFolder")}</EmptyText>
            <EmptyHint>{t("files.openFolderHint")}</EmptyHint>
            <OpenFolderButton onClick={() => dispatch(openFolderRequest(t("files.openFolder")))}>
              {t("files.openFolder")}
            </OpenFolderButton>
          </EmptyState>
        ) : rootNode ? (
          <Tree>
            <TreeNode
              node={rootNode}
              depth={0}
              label={rootName ?? rootNode.name}
              isRoot
              onMenu={setMenu}
            />
          </Tree>
        ) : (
          <TreeHint>{t("common.loading")}</TreeHint>
        )}
      </Body>

      {error && (
        <ErrorBar>
          <ErrorText>{errorText(error)}</ErrorText>
          <ErrorClose onClick={() => dispatch(clearWorkspaceError())}>×</ErrorClose>
        </ErrorBar>
      )}

      {menu && (
        <ContextMenu
          data-context-menu
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {menu.isDir && (
            <>
              <ContextItem
                onClick={() => {
                  openModal({ kind: "createFile", dirPath: menu.path });
                  setMenu(undefined);
                }}
              >
                <FilePlusIcon />
                {t("files.newFile")}
              </ContextItem>
              <ContextItem
                onClick={() => {
                  openModal({ kind: "createFolder", dirPath: menu.path });
                  setMenu(undefined);
                }}
              >
                <FolderPlusIcon />
                {t("files.newFolder")}
              </ContextItem>
              <ContextDivider />
            </>
          )}
          {!menu.isDir && (
            <ContextItem
              onClick={() => {
                dispatch(openFileRequest(menu.path));
                setMenu(undefined);
              }}
            >
              <FileIcon />
              {t("files.open")}
            </ContextItem>
          )}
          {!menu.isRoot && (
            <>
              <ContextItem
                onClick={() => {
                  openModal({ kind: "rename", targetPath: menu.path, initialName: basename(menu.path) });
                  setMenu(undefined);
                }}
              >
                <PencilIcon />
                {t("files.rename")}
              </ContextItem>
            </>
          )}
          <ContextItem
            onClick={() => {
              copyText(menu.path);
              setMenu(undefined);
            }}
          >
            <CopyIcon />
            {t("files.copyPath")}
          </ContextItem>
          {rootPath && !menu.isRoot && (
            <ContextItem
              onClick={() => {
                copyText(relativePath(rootPath, menu.path));
                setMenu(undefined);
              }}
            >
              <CopyIcon />
              {t("files.copyRelativePath")}
            </ContextItem>
          )}
          <ContextItem
            onClick={() => {
              void window.pi.executeFile({ intent: "reveal", path: menu.path });
              setMenu(undefined);
            }}
          >
            <RevealIcon />
            {t("files.reveal")}
          </ContextItem>
          {menu.isRoot && (
            <>
              <ContextDivider />
              <ContextItem
                onClick={() => {
                  dispatch(collapseAll());
                  setMenu(undefined);
                }}
              >
                <CollapseAllIcon />
                {t("files.collapseAll")}
              </ContextItem>
            </>
          )}
          {!menu.isRoot && (
            <>
              <ContextDivider />
              <DangerItem
                onClick={() => {
                  openModal({ kind: "delete", targetPath: menu.path, initialName: basename(menu.path) });
                  setMenu(undefined);
                }}
              >
                <TrashIcon />
                {t("files.delete")}
              </DangerItem>
            </>
          )}
        </ContextMenu>
      )}

      {modal && (
        <Modal
          title={modalTitle}
          onClose={closeModal}
          footer={
            <>
              <ModalButton onClick={closeModal}>{t("common.cancel")}</ModalButton>
              <ModalButton
                $primary={modal.kind !== "delete"}
                $danger={modal.kind === "delete"}
                disabled={modal.kind !== "delete" && !name.trim()}
                onClick={submitModal}
              >
                {modal.kind === "delete" ? t("common.delete") : t("common.confirm")}
              </ModalButton>
            </>
          }
        >
          {modal.kind === "delete" ? (
            <ConfirmText>{t("files.deleteConfirm", { name: modal.initialName ?? "" })}</ConfirmText>
          ) : (
            <NameInput
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitModal();
                if (event.key === "Escape") closeModal();
              }}
              placeholder={
                modal.kind === "rename"
                  ? t("files.renamePlaceholder")
                  : modal.kind === "createFile"
                    ? t("files.fileNamePlaceholder")
                    : t("files.folderNamePlaceholder")
              }
            />
          )}
        </Modal>
      )}
    </Root>
  );
}

function TreeNode({
  node,
  depth,
  label,
  isRoot = false,
  onMenu,
}: {
  node: FileNode;
  depth: number;
  label: string;
  isRoot?: boolean;
  onMenu: (menu: MenuState) => void;
}) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((state) => state.workspace.nodes);
  const activePath = useAppSelector((state) => state.workspace.activePath);
  const isDir = node.type === "dir";
  const expanded = Boolean(node.expanded);

  function handleClick() {
    if (isDir) {
      dispatch(toggleDir(node.path));
      if (!node.loaded && !node.loading) {
        dispatch(loadDirRequest(node.path));
      }
    } else {
      dispatch(openFileRequest(node.path));
    }
  }

  return (
    <div>
      <Row
        $depth={depth}
        $active={activePath === node.path}
        onClick={handleClick}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onMenu({ x: event.clientX, y: event.clientY, path: node.path, isDir, isRoot });
        }}
      >
        {isDir ? (
          <Chevron $expanded={expanded}>
            <ChevronRightIcon />
          </Chevron>
        ) : (
          <ChevronSpace />
        )}
        {isDir ? (expanded ? <FolderOpenIcon /> : <FolderIcon />) : <FileIcon />}
        <Name>{label}</Name>
        {node.loading && <Spinner $size={10} />}
      </Row>
      {isDir && expanded && (
        <Children>
          {(node.children ?? []).map((childPath) => {
            const child = nodes[childPath];
            if (!child) return null;
            return <TreeNode key={childPath} node={child} depth={depth + 1} label={child.name} onMenu={onMenu} />;
          })}
        </Children>
      )}
    </div>
  );
}

// ───────────────────────── styled ─────────────────────────

const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
`;

const Body = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: ${({ theme }) => theme.spaces["1.5"]} 0;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2"]};
  padding: ${({ theme }) => theme.spaces["10"]} ${({ theme }) => theme.spaces["5"]};
  text-align: center;
`;

const EmptyText = styled.div`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13.5px;
`;

const EmptyHint = styled.div`
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12px;
  margin-bottom: ${({ theme }) => theme.spaces["2"]};
`;

const OpenFolderButton = styled.button`
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["4"]};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`;

const Tree = styled.div`
  display: flex;
  flex-direction: column;
`;

const TreeHint = styled.div`
  padding: ${({ theme }) => theme.spaces["4"]};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 13px;
  text-align: center;
`;

const Children = styled.div`
  display: flex;
  flex-direction: column;
`;

const Row = styled.div<{ $depth: number; $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["1.5"]};
  padding: ${({ theme }) => theme.spaces["1"]} ${({ theme }) => theme.spaces["2"]};
  padding-left: ${({ $depth }) => 8 + $depth * 14}px;
  cursor: pointer;
  user-select: none;
  color: ${({ theme, $active }) => ($active ? theme.colors.text : theme.colors.textMuted)};
  background: ${({ theme, $active }) => ($active ? theme.colors.accentSoft : "transparent")};
  transition: background ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme, $active }) => ($active ? theme.colors.accentSoft : theme.colors.surfaceHover)};
  }
`;

const Chevron = styled.span<{ $expanded: boolean }>`
  display: inline-flex;
  flex: none;
  color: ${({ theme }) => theme.colors.textDim};
  transition: transform ${({ theme }) => theme.transition.fast};
  transform: ${({ $expanded }) => ($expanded ? "rotate(90deg)" : "rotate(0deg)")};
`;

const ChevronSpace = styled.span`
  width: 10px;
  flex: none;
`;

const Name = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
`;

const ErrorBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2"]};
  padding: ${({ theme }) => theme.spaces["2.5"]} ${({ theme }) => theme.spaces["3"]};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.dangerSoft};
`;

const ErrorText = styled.span`
  flex: 1;
  min-width: 0;
  color: ${({ theme }) => theme.colors.danger};
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ErrorClose = styled.button`
  flex: none;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.danger};
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
`;

const ContextMenu = styled.div`
  position: fixed;
  z-index: ${({ theme }) => theme.z.dropdown};
  min-width: 184px;
  padding: ${({ theme }) => theme.spaces["1.5"]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  box-shadow: ${({ theme }) => theme.shadow.md};
`;

const ContextItem = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2"]};
  width: 100%;
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["3"]};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const DangerItem = styled(ContextItem)`
  &:hover {
    background: ${({ theme }) => theme.colors.dangerSoft};
    color: ${({ theme }) => theme.colors.danger};
  }
`;

const ContextDivider = styled.div`
  height: 1px;
  margin: ${({ theme }) => theme.spaces["1"]} 0;
  background: ${({ theme }) => theme.colors.border};
`;

const NameInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.spaces["2.5"]} ${({ theme }) => theme.spaces["3.5"]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  outline: none;
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDim};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accentSoft};
  }
`;



const ConfirmText = styled.div`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13.5px;
  line-height: 1.6;
  word-break: break-word;
`;
