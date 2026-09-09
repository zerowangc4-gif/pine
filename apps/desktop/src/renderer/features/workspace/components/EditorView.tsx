import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { editFile, saveFileRequest } from "../store";

export function EditorView() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const activePath = useAppSelector((state) => state.workspace.activePath);
  const file = useAppSelector((state) =>
    state.workspace.openFiles.find((item) => item.path === state.workspace.activePath),
  );

  if (!file || !activePath) {
    return null;
  }

  const dirty = file.content !== file.savedContent;

  return (
    <Root>
      <Header>
        <FileName>{file.name}</FileName>
        <Status $dirty={dirty}>{dirty ? t("chat.unsaved") : t("chat.saved")}</Status>
        <SaveButton disabled={!dirty} onClick={() => dispatch(saveFileRequest(file.path))}>
          {t("common.save")}
        </SaveButton>
      </Header>
      <Editor
        value={file.content}
        onChange={(event) => dispatch(editFile({ path: file.path, content: event.target.value }))}
        spellCheck={false}
      />
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

const Editor = styled.textarea`
  flex: 1;
  padding: 16px 20px;
  border: none;
  outline: none;
  resize: none;
  background: ${({ theme }) => theme.colors.codeBg};
  color: ${({ theme }) => theme.colors.codeText};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 13.5px;
  line-height: 1.7;
  tab-size: 2;
`;
