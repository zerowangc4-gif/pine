import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { LanguageSwitcher } from "@renderer/components/LanguageSwitcher";
import { ChatIcon } from "@renderer/components/icons";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { EditorView, FileExplorer } from "@renderer/features/workspace";
import { closeFile, setActivePath } from "@renderer/features/workspace";
import { ChatView } from "../components/ChatView";
import {
  agentStarted,
  assistantEnded,
  assistantStarted,
  chatError,
  settled,
  textDelta,
  thinkingDelta,
  toolEnded,
  toolStarted,
} from "../store";

export function ChatPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { openFiles, activePath } = useAppSelector((state) => state.workspace);

  useEffect(() => {
    window.pi.onChatEvent((event) => {
      switch (event.type) {
        case "agent_start":
          dispatch(agentStarted());
          break;
        case "assistant_start":
          dispatch(assistantStarted());
          break;
        case "text_delta":
          dispatch(textDelta(event.delta));
          break;
        case "thinking_delta":
          dispatch(thinkingDelta(event.delta));
          break;
        case "assistant_end":
          dispatch(assistantEnded());
          break;
        case "tool_start":
          dispatch(toolStarted(event.toolName));
          break;
        case "tool_end":
          dispatch(toolEnded({ name: event.toolName, isError: event.isError }));
          break;
        case "settled":
          dispatch(settled());
          break;
        case "error":
          dispatch(chatError(event.message));
          break;
      }
    });
  }, [dispatch]);

  return (
    <Layout>
      <Sidebar>
        <FileExplorer />
      </Sidebar>
      <Main>
        <TabBar>
          <Tab $active={activePath === undefined} onClick={() => dispatch(setActivePath(undefined))}>
            <ChatIcon size={14} />
            {t("chat.tab")}
          </Tab>
          {openFiles.map((file) => (
            <Tab
              key={file.path}
              $active={activePath === file.path}
              onClick={() => dispatch(setActivePath(file.path))}
            >
              <TabName>{file.name}</TabName>
              {file.content !== file.savedContent && <DirtyDot />}
              <TabClose
                onClick={(event) => {
                  event.stopPropagation();
                  dispatch(closeFile(file.path));
                }}
              >
                ×
              </TabClose>
            </Tab>
          ))}
          <TabSpacer />
          <LanguageSwitcher />
        </TabBar>
        <Content>{activePath ? <EditorView /> : <ChatView />}</Content>
      </Main>
    </Layout>
  );
}

const Layout = styled.div`
  display: flex;
  height: 100vh;
  background: ${({ theme }) => theme.colors.bgDeep};
`;

const Sidebar = styled.aside`
  flex: none;
  width: 264px;
  height: 100%;
`;

const Main = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const TabBar = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Tab = styled.div<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.radius.md} ${({ theme }) => theme.radius.md} 0 0;
  font-size: 13px;
  color: ${({ theme, $active }) => ($active ? theme.colors.text : theme.colors.textDim)};
  background: ${({ theme, $active }) => ($active ? theme.colors.surface2 : "transparent")};
  border-bottom: 2px solid ${({ theme, $active }) => ($active ? theme.colors.accent : "transparent")};
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: color ${({ theme }) => theme.transition.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;


const TabName = styled.span`
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DirtyDot = styled.span`
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.warning};
`;

const TabClose = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 2px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 15px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const TabSpacer = styled.div`
  flex: 1;
`;

const Content = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.bgDeep};
`;
