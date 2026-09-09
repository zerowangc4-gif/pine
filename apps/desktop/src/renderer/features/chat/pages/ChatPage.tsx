import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { LanguageSwitcher } from "@renderer/components/LanguageSwitcher";
import { ThemeSwitcher } from "@renderer/components/ThemeSwitcher";
import { ChatIcon, MaximizeIcon, PanelLeftIcon } from "@renderer/components/icons";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { setSidebarWidth, toggleSidebar } from "@renderer/store/layoutSlice";
import {
  EditorView,
  FileExplorer,
  closeFile,
  refreshTreeRequest,
  setActivePath,
} from "@renderer/features/workspace";
import { getActiveModelRequest, loadProviders } from "@renderer/features/login";
import { ChatView } from "../components/ChatView";
import { SessionsPanel } from "../components/SessionsPanel";
import {
  agentStarted,
  assistantEnded,
  assistantStarted,
  chatError,
  getActiveToolsRequest,
  getSessionStatsRequest,
  listSessionsRequest,
  messageUsageReceived,
  sessionStatsReceived,
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
  const { sidebarWidth, sidebarVisible } = useAppSelector((state) => state.layout);

  useEffect(() => {
    dispatch(listSessionsRequest());
    dispatch(loadProviders());
    dispatch(getActiveModelRequest());
    dispatch(getSessionStatsRequest());
    dispatch(getActiveToolsRequest());
  }, [dispatch]);

  useEffect(() => {
    window.pi.onFilesChanged(() => dispatch(refreshTreeRequest()));
  }, [dispatch]);

  // VSCode-like: refresh the explorer when the window regains focus, in case
  // the file watcher missed changes made while the app was in the background.
  useEffect(() => {
    const onFocus = () => dispatch(refreshTreeRequest());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [dispatch]);

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
        case "message_usage":
          dispatch(messageUsageReceived(event.usage));
          break;
        case "tool_start":
          dispatch(toolStarted(event.toolName));
          break;
        case "tool_end":
          dispatch(toolEnded({ name: event.toolName, isError: event.isError }));
          break;
        case "settled":
          dispatch(settled());
          // The conversation was just persisted; refresh the session list and stats.
          dispatch(listSessionsRequest());
          dispatch(getSessionStatsRequest());
          break;
        case "session_stats":
          dispatch(sessionStatsReceived(event.stats));
          break;
        case "error":
          dispatch(chatError(event.message));
          break;
      }
    });
  }, [dispatch]);

  return (
    <Layout>
      {sidebarVisible && (
        <>
          <Sidebar $width={sidebarWidth}>
            <ExplorerSlot>
              <FileExplorer />
            </ExplorerSlot>
            <SessionsSlot>
              <SessionsPanel />
            </SessionsSlot>
          </Sidebar>
          <ResizeHandle
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                dispatch(setSidebarWidth(event.clientX));
              }
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
        </>
      )}
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
          <HeaderIconButton
            title={sidebarVisible ? t("layout.fullscreen") : t("layout.showSidebar")}
            onClick={() => dispatch(toggleSidebar())}
          >
            {sidebarVisible ? <MaximizeIcon /> : <PanelLeftIcon />}
          </HeaderIconButton>
          <ThemeSwitcher />
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

const Sidebar = styled.aside<{ $width: number }>`
  flex: none;
  width: ${({ $width }) => $width}px;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const ResizeHandle = styled.div`
  flex: none;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
  background: transparent;
  transition: background ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.accent};
  }
`;

const ExplorerSlot = styled.div`
  flex: 1;
  min-height: 0;
`;

const SessionsSlot = styled.div`
  flex: none;
  height: 224px;
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
  gap: ${({ theme }) => theme.spaces["0.5"]};
  padding: ${({ theme }) => theme.spaces["1.5"]} ${({ theme }) => theme.spaces["2.5"]} 0;
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
  gap: ${({ theme }) => theme.spaces["1.5"]};
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["3.5"]};
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
  margin-left: ${({ theme }) => theme.spaces["0.5"]};
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

const HeaderIconButton = styled.button`
  flex: none;
  width: 34px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.textMuted};
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Content = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.bgDeep};
`;
