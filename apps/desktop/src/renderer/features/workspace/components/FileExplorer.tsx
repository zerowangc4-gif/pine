import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@renderer/components/Modal";
import {
  ChevronRightIcon,
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  Spinner,
} from "@renderer/components/icons";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { errorText } from "@renderer/utils/error";
import {
  clearWorkspaceError,
  createFileRequest,
  createFolderRequest,
  loadDirRequest,
  openFileRequest,
  openFolderRequest,
  toggleDir,
} from "../store";
import type { FileNode } from "../types/state";

type EntryKind = "file" | "folder";

interface MenuState {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

interface ModalState {
  kind: EntryKind;
  dirPath: string;
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
    function close() {
      setMenu(undefined);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const rootNode = rootPath ? nodes[rootPath] : undefined;

  function openCreateModal(kind: EntryKind, dirPath: string) {
    setModal({ kind, dirPath });
    setName("");
  }

  function submitCreate() {
    if (!modal || !name.trim()) return;
    if (modal.kind === "file") {
      dispatch(createFileRequest({ dirPath: modal.dirPath, name: name.trim() }));
    } else {
      dispatch(createFolderRequest({ dirPath: modal.dirPath, name: name.trim() }));
    }
    setModal(undefined);
  }

  return (
    <Root>
      <Header>
        <HeaderTitle>{t("files.explorer")}</HeaderTitle>
        <Actions>
          <ActionButton title={t("files.openFolder")} onClick={() => dispatch(openFolderRequest(t("files.openFolder")))}>
            <FolderOpenIcon />
          </ActionButton>
          {rootPath && (
            <>
              <ActionButton title={t("files.newFile")} onClick={() => openCreateModal("file", rootPath)}>
                <FilePlusIcon />
              </ActionButton>
              <ActionButton title={t("files.newFolder")} onClick={() => openCreateModal("folder", rootPath)}>
                <FolderPlusIcon />
              </ActionButton>
            </>
          )}
        </Actions>
      </Header>

      <Body>
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
            <TreeNode node={rootNode} depth={0} label={rootName ?? rootNode.name} onMenu={setMenu} />
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
        <ContextMenu style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          {menu.isDir && (
            <>
              <ContextItem
                onClick={() => {
                  openCreateModal("file", menu.path);
                  setMenu(undefined);
                }}
              >
                {t("files.newFile")}
              </ContextItem>
              <ContextItem
                onClick={() => {
                  openCreateModal("folder", menu.path);
                  setMenu(undefined);
                }}
              >
                {t("files.newFolder")}
              </ContextItem>
              <ContextDivider />
            </>
          )}
          <ContextItem
            onClick={() => {
              dispatch(openFileRequest(menu.path));
              setMenu(undefined);
            }}
          >
            {t("files.open")}
          </ContextItem>
        </ContextMenu>
      )}

      {modal && (
        <Modal
          title={modal.kind === "file" ? t("files.newFile") : t("files.newFolder")}
          onClose={() => setModal(undefined)}
          footer={
            <>
              <ModalButton onClick={() => setModal(undefined)}>{t("common.cancel")}</ModalButton>
              <ModalButton $primary disabled={!name.trim()} onClick={submitCreate}>
                {t("common.confirm")}
              </ModalButton>
            </>
          }
        >
          <NameInput
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitCreate();
              if (event.key === "Escape") setModal(undefined);
            }}
            placeholder={modal.kind === "file" ? t("files.fileNamePlaceholder") : t("files.folderNamePlaceholder")}
          />
        </Modal>
      )}
    </Root>
  );
}

function TreeNode({
  node,
  depth,
  label,
  onMenu,
}: {
  node: FileNode;
  depth: number;
  label: string;
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
          onMenu({ x: event.clientX, y: event.clientY, path: node.path, isDir });
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

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const HeaderTitle = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textDim};
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textDim};
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Body = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 0;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  text-align: center;
`;

const EmptyText = styled.div`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13.5px;
`;

const EmptyHint = styled.div`
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12px;
  margin-bottom: 8px;
`;

const OpenFolderButton = styled.button`
  padding: 8px 16px;
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
  padding: 16px;
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
  gap: 6px;
  padding: 4px 8px;
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
  gap: 8px;
  padding: 10px 12px;
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
  min-width: 160px;
  padding: 6px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  box-shadow: ${({ theme }) => theme.shadow.md};
`;

const ContextItem = styled.button`
  display: block;
  width: 100%;
  padding: 8px 12px;
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

const ContextDivider = styled.div`
  height: 1px;
  margin: 5px 0;
  background: ${({ theme }) => theme.colors.border};
`;

const NameInput = styled.input`
  width: 100%;
  padding: 10px 14px;
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

const ModalButton = styled.button<{ $primary?: boolean }>`
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme, $primary }) => ($primary ? "transparent" : theme.colors.border)};
  background: ${({ theme, $primary }) => ($primary ? theme.gradients.accent : theme.colors.surface2)};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity ${({ theme }) => theme.transition.fast};

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;
