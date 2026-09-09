import { useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@renderer/components/Modal";
import { ChatIcon, PlusIcon, Spinner, TrashIcon } from "@renderer/components/icons";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { errorText } from "@renderer/utils/error";
import type { SessionInfo } from "@shared/types";
import {
  clearSessionError,
  deleteSessionRequest,
  loadSessionRequest,
  newSessionRequest,
} from "../store";

function formatTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function SessionsPanel() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { sessions, sessionsLoading, activeSessionPath, sessionError } = useAppSelector(
    (state) => state.chat,
  );
  const [pendingDelete, setPendingDelete] = useState<SessionInfo | undefined>();

  function handleLoad(session: SessionInfo) {
    if (session.path !== activeSessionPath) {
      dispatch(loadSessionRequest(session.path));
    }
  }

  function handleDelete() {
    if (pendingDelete) {
      dispatch(deleteSessionRequest(pendingDelete.path));
      setPendingDelete(undefined);
    }
  }

  return (
    <Root>
      <Header>
        <Title>
          <ChatIcon size={13} />
          {t("chat.sessions")}
        </Title>
        <Actions>
          <NewButton onClick={() => dispatch(newSessionRequest())}>
            <PlusIcon size={12} />
            {t("chat.newSession")}
          </NewButton>
        </Actions>
      </Header>

      <Body>
        {sessionsLoading && sessions.length === 0 ? (
          <Centered>
            <Spinner $size={14} />
          </Centered>
        ) : sessions.length === 0 ? (
          <Empty>
            <EmptyText>{t("chat.noSessions")}</EmptyText>
            <NewButton onClick={() => dispatch(newSessionRequest())}>
              <PlusIcon size={12} />
              {t("chat.newSession")}
            </NewButton>
          </Empty>
        ) : (
          sessions.map((session) => (
            <SessionRow
              key={session.path}
              $active={session.path === activeSessionPath}
              onClick={() => handleLoad(session)}
            >
              <SessionMain>
                <SessionName>{session.name || session.firstMessage || t("chat.untitledSession")}</SessionName>
                <SessionMeta>
                  {t("chat.sessionMessages", { count: session.messageCount })}
                  <Dot>·</Dot>
                  {formatTime(session.modified, i18n.language)}
                </SessionMeta>
              </SessionMain>
              <DeleteButton
                title={t("chat.deleteSession")}
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingDelete(session);
                }}
              >
                <TrashIcon />
              </DeleteButton>
            </SessionRow>
          ))
        )}
      </Body>

      {sessionError && (
        <ErrorBar>
          <ErrorText>{errorText(sessionError)}</ErrorText>
          <ErrorClose onClick={() => dispatch(clearSessionError())}>×</ErrorClose>
        </ErrorBar>
      )}

      {pendingDelete && (
        <Modal
          title={t("chat.deleteSession")}
          onClose={() => setPendingDelete(undefined)}
          footer={
            <>
              <ModalButton onClick={() => setPendingDelete(undefined)}>{t("common.cancel")}</ModalButton>
              <ModalButton $danger onClick={handleDelete}>
                {t("common.delete")}
              </ModalButton>
            </>
          }
        >
          <ConfirmText>
            {t("chat.deleteSessionConfirm", {
              name: pendingDelete.name || pendingDelete.firstMessage || t("chat.untitledSession"),
            })}
          </ConfirmText>
        </Modal>
      )}
    </Root>
  );
}

// ───────────────────────── styled ─────────────────────────

const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spaces["2.5"]} ${({ theme }) => theme.spaces["3.5"]};
`;

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["1.5"]};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textDim};
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["0.5"]};
`;

const NewButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["1"]};
  padding: ${({ theme }) => `${theme.spaces["1"]} ${theme.spaces["2"]}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["2"]};
`;

const Centered = styled.div`
  display: flex;
  justify-content: center;
  padding: ${({ theme }) => theme.spaces["4"]};
`;

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2.5"]};
  padding: ${({ theme }) => theme.spaces["4"]};
  text-align: center;
`;

const EmptyText = styled.div`
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12.5px;
`;

const SessionRow = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["1.5"]};
  padding: ${({ theme }) => theme.spaces["1.5"]} ${({ theme }) => theme.spaces["2.5"]};
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  color: ${({ theme, $active }) => ($active ? theme.colors.text : theme.colors.textMuted)};
  background: ${({ theme, $active }) => ($active ? theme.colors.accentSoft : "transparent")};
  transition: background ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme, $active }) => ($active ? theme.colors.accentSoft : theme.colors.surfaceHover)};
  }
`;

const SessionMain = styled.div`
  flex: 1;
  min-width: 0;
`;

const SessionName = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
`;

const SessionMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["1"]};
  margin-top: ${({ theme }) => theme.spaces["0.5"]};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 11px;
`;

const Dot = styled.span`
  opacity: 0.7;
`;

const DeleteButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textDim};
  cursor: pointer;
  opacity: 0;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast},
    opacity ${({ theme }) => theme.transition.fast};

  ${SessionRow}:hover & {
    opacity: 1;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.dangerSoft};
    color: ${({ theme }) => theme.colors.danger};
  }
`;

const ErrorBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2"]};
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["3"]};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.dangerSoft};
`;

const ErrorText = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.danger};
  font-size: 12px;
`;

const ErrorClose = styled.button`
  flex: none;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.danger};
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
`;

const ModalButton = styled.button<{ $danger?: boolean }>`
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["4"]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme, $danger }) => ($danger ? "transparent" : theme.colors.border)};
  background: ${({ theme, $danger }) => ($danger ? theme.colors.danger : theme.colors.surface2)};
  color: ${({ theme, $danger }) => ($danger ? theme.colors.accentText : theme.colors.text)};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity ${({ theme }) => theme.transition.fast};

  &:hover {
    opacity: 0.88;
  }
`;

const ConfirmText = styled.div`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13.5px;
  line-height: 1.6;
  word-break: break-word;
`;
