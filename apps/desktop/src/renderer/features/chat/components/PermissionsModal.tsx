import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@renderer/components";
import { ModalButton, SwitchButton, SwitchKnob } from "@renderer/components";
import { ShieldIcon } from "@renderer/components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { BUILTIN_TOOLS, READONLY_TOOLS } from "@shared/types";
import { setActiveToolsRequest } from "../store";
import { TOOL_LABELS } from "./toolLabels";

/**
 * One toggle per built-in tool. Read-only tools (read/grep/find/ls) never ask
 * for permission, so their switch is locked on. Modifying tools run without
 * asking while on; while off, the agent can still attempt them but a review
 * modal appears first (see `ToolPermissionModal`).
 */
const TOOL_KEYS = BUILTIN_TOOLS.map((name) => ({
  name,
  label: TOOL_LABELS[name],
  readOnly: READONLY_TOOLS.includes(name),
}));

export function PermissionsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const activeTools = useAppSelector((state) => state.chat.activeTools);

  function toggle(tool: string, enabled: boolean) {
    if (READONLY_TOOLS.includes(tool)) {
      return;
    }
    const next = enabled
      ? Array.from(new Set([...activeTools, tool]))
      : activeTools.filter((name) => name !== tool);
    dispatch(setActiveToolsRequest(next));
  }

  return (
    <Modal
      title={t("permissions.title")}
      onClose={onClose}
      footer={<ModalButton onClick={onClose}>{t("common.close")}</ModalButton>}
    >
      <Hint>{t("permissions.hint")}</Hint>

      {TOOL_KEYS.map((tool) => {
        const enabled = tool.readOnly || activeTools.includes(tool.name);
        return (
          <ToolRow key={tool.name}>
            <ShieldIcon size={13} />
            <ToolInfo>
              <ToolName>{t(tool.label)}</ToolName>
              {tool.readOnly && <ToolMeta>{t("permissions.alwaysAllowed")}</ToolMeta>}
            </ToolInfo>
            <SwitchButton
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={t(tool.label)}
              $on={enabled}
              disabled={tool.readOnly}
              onClick={() => toggle(tool.name, !enabled)}
            >
              <SwitchKnob $on={enabled} />
            </SwitchButton>
          </ToolRow>
        );
      })}
    </Modal>
  );
}

const Hint = styled.div`
  margin-bottom: ${({ theme }) => theme.spaces["3"]};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12.5px;
  line-height: 1.6;
`;

const ToolRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2.5"]};
  padding: ${({ theme }) => theme.spaces["2.5"]} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.accent};
`;

const ToolInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ToolName = styled.div`
  color: ${({ theme }) => theme.colors.text};
  font-size: 13.5px;
  font-weight: 600;
`;

const ToolMeta = styled.div`
  margin-top: ${({ theme }) => theme.spaces["0.5"]};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 11px;
`;
