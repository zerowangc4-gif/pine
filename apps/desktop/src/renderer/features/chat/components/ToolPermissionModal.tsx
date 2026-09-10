import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { FileDiff, Modal, ModalButton, ShieldIcon } from "@renderer/components";
import { SHELL_TOOLS } from "@shared/types";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { toolPermissionResolved } from "../store";
import { ShellCommand } from "./ShellCommand";

/**
 * Blocking permission prompt shown when the agent tries to run a tool the user
 * has disabled. The agent run stays paused in the main process until Allow or
 * Deny is chosen.
 *
 * File-modifying tools (`edit`/`write`) show a reviewable diff; shell tools
 * (`bash`/`powershell`) show the exact command, collapsed by default with a
 * copy/expand affordance so the user never approves blindly.
 */
export function ToolPermissionModal() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const request = useAppSelector((state) => state.chat.pendingPermissions[0]);

  if (!request) {
    return null;
  }

  const label = request.toolName;
  const isShell = SHELL_TOOLS.includes(request.toolName);

  function respond(allowed: boolean) {
    void window.pi.respondToolPermission(request!.requestId, allowed);
    dispatch(toolPermissionResolved(request!.requestId));
  }

  return (
    <Modal
      title={t("permissions.toolRequestTitle")}
      wide={Boolean(request.diff)}
      onClose={() => respond(false)}
      footer={
        <>
          <ModalButton onClick={() => respond(false)}>{t("permissions.deny")}</ModalButton>
          <ModalButton $primary onClick={() => respond(true)}>
            {t("permissions.allow")}
          </ModalButton>
        </>
      }
    >
      <Body>
        <IconWrap>
          <ShieldIcon size={18} />
        </IconWrap>
        <BodyContent>
          {request.diff ? (
            <>
              <Text>
                {t("permissions.toolRequestBody", { tool: label, summary: request.diff.path })}
              </Text>
              <FileDiff hunks={request.diff.hunks} />
            </>
          ) : isShell && request.summary ? (
            <>
              <Text>{t("permissions.toolRequestShell", { tool: label })}</Text>
              <ShellCommand command={request.summary} />
            </>
          ) : request.summary ? (
            <Text>{t("permissions.toolRequestBody", { tool: label, summary: request.summary })}</Text>
          ) : (
            <Text>{t("permissions.toolRequestBodyGeneric", { tool: label })}</Text>
          )}
        </BodyContent>
      </Body>
    </Modal>
  );
}

const Body = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spaces["3"]};
`;

const BodyContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const IconWrap = styled.div`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.accentSoft};
  color: ${({ theme }) => theme.colors.accent};
`;

const Text = styled.div`
  color: ${({ theme }) => theme.colors.text};
  font-size: 13.5px;
  line-height: 1.6;
  word-break: break-word;
`;
