import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@renderer/components";
import { ModalButton } from "@renderer/components";
import { ShieldIcon } from "@renderer/components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { toolPermissionResolved } from "../store";
import type { ToolPermissionRequest } from "@shared/types";

/**
 * Blocking permission prompt shown when the agent tries to run a tool the user
 * has disabled. The agent run stays paused in the main process until Allow or
 * Deny is chosen.
 */
export function ToolPermissionModal() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const request = useAppSelector((state) => state.chat.pendingPermissions[0]);

  if (!request) {
    return null;
  }

  function respond(allowed: boolean) {
    void window.pi.respondToolPermission(request!.requestId, allowed);
    dispatch(toolPermissionResolved());
  }

  return (
    <Modal
      title={t("permissions.toolRequestTitle")}
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
        <Text>{renderBody(t, request)}</Text>
      </Body>
    </Modal>
  );
}

function renderBody(t: (key: string, options?: Record<string, string>) => string, request: ToolPermissionRequest): string {
  return t("permissions.toolRequestBody", { tool: request.toolName, summary: request.summary });
}

const Body = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spaces["3"]};
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
