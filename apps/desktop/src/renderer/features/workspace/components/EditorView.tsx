import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { editFile, saveFileRequest } from "../store";

interface CursorPosition {
  line: number;
  column: number;
}

function computeCursor(value: string, selectionStart: number): CursorPosition {
  const before = value.slice(0, selectionStart);
  const line = before.split("\n").length;
  const column = selectionStart - before.lastIndexOf("\n");
  return { line, column };
}

export function EditorView() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const activePath = useAppSelector((state) => state.workspace.activePath);
  const file = useAppSelector((state) =>
    state.workspace.openFiles.find((item) => item.path === state.workspace.activePath),
  );
  const gutterRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 });

  const lines = useMemo(() => (file ? file.content.split("\n").length : 0), [file]);

  if (!file || !activePath) {
    return null;
  }

  const openFile = file;
  const dirty = openFile.content !== openFile.savedContent;

  function syncCursor(value: string, selectionStart: number) {
    setCursor(computeCursor(value, selectionStart));
  }

  function handleScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    dispatch(editFile({ path: openFile.path, content: value }));
    syncCursor(value, event.target.selectionStart);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      const element = event.currentTarget;
      const start = element.selectionStart;
      const end = element.selectionEnd;
      const next = `${openFile.content.slice(0, start)}  ${openFile.content.slice(end)}`;
      dispatch(editFile({ path: openFile.path, content: next }));
      requestAnimationFrame(() => {
        element.selectionStart = element.selectionEnd = start + 2;
        element.focus();
      });
      syncCursor(next, start + 2);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (dirty) {
        dispatch(saveFileRequest(openFile.path));
      }
    }
  }

  return (
    <Root>
      <Header>
        <FileName>{file.name}</FileName>
        <Status $dirty={dirty}>{dirty ? t("chat.unsaved") : t("chat.saved")}</Status>
        <SaveButton disabled={!dirty} onClick={() => dispatch(saveFileRequest(file.path))}>
          {t("common.save")}
        </SaveButton>
      </Header>

      <EditorArea>
        <LineGutter ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lines }, (_, index) => (
            <LineNumber key={index}>{index + 1}</LineNumber>
          ))}
        </LineGutter>
        <Editor
          ref={editorRef}
          value={file.content}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => syncCursor(event.currentTarget.value, event.currentTarget.selectionStart)}
          onClick={(event) => syncCursor(event.currentTarget.value, event.currentTarget.selectionStart)}
          onSelect={(event) => syncCursor(event.currentTarget.value, event.currentTarget.selectionStart)}
          spellCheck={false}
          wrap="off"
        />
      </EditorArea>

      <StatusBar>
        <StatusItem>{t("editor.lineCol", { line: cursor.line, column: cursor.column })}</StatusItem>
        <StatusSpacer />
        <StatusItem>{t("editor.lines", { count: lines })}</StatusItem>
        <StatusItem>UTF-8</StatusItem>
      </StatusBar>
    </Root>
  );
}

const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
`;

const FileName = styled.div`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  font-weight: 600;
`;

const Status = styled.span<{ $dirty: boolean }>`
  flex: none;
  font-size: 11.5px;
  color: ${({ theme, $dirty }) => ($dirty ? theme.colors.warning : theme.colors.success)};
`;

const SaveButton = styled.button`
  flex: none;
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.text};
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, opacity ${({ theme }) => theme.transition.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const EditorArea = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  background: ${({ theme }) => theme.colors.codeBg};
`;

const LineGutter = styled.div`
  flex: none;
  width: 56px;
  overflow: hidden;
  padding: 16px 10px 16px 0;
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.codeBg};
  color: ${({ theme }) => theme.colors.textDim};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 13.5px;
  line-height: 1.7;
  text-align: right;
  user-select: none;
`;

const LineNumber = styled.div`
  line-height: 1.7;
`;

const Editor = styled.textarea`
  flex: 1;
  min-width: 0;
  padding: 16px 20px;
  border: none;
  outline: none;
  resize: none;
  overflow: auto;
  background: ${({ theme }) => theme.colors.codeBg};
  color: ${({ theme }) => theme.colors.codeText};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 13.5px;
  line-height: 1.7;
  white-space: pre;
  tab-size: 2;
`;

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 14px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 11.5px;
  user-select: none;
`;

const StatusItem = styled.span`
  flex: none;
`;

const StatusSpacer = styled.div`
  flex: 1;
`;
