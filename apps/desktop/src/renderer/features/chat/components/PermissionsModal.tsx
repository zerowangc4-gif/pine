import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@renderer/components";
import { ModalButton, SwitchButton, SwitchKnob } from "@renderer/components";
import { ShieldIcon } from "@renderer/components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { setActiveToolsRequest } from "../store";

const TOOL_KEYS = [
  { name: "bash", label: "permissions.bash" },
  { name: "edit", label: "permissions.edit" },
  { name: "write", label: "permissions.write" },
] as const;

export function PermissionsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const activeTools = useAppSelector((state) => state.chat.activeTools);

  function toggle(tool: string, enabled: boolean) {
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

      <ToolRow>
        <ShieldIcon size={13} />
        <ToolInfo>
          <ToolName>{t("permissions.read")}</ToolName>
        </ToolInfo>
        <ReadBadge>{t("permissions.alwaysOn")}</ReadBadge>
      </ToolRow>

      {TOOL_KEYS.map((tool) => {
        const enabled = activeTools.includes(tool.name);
        return (
          <ToolRow key={tool.name}>
            <ShieldIcon size={13} />
            <ToolInfo>
              <ToolName>{t(tool.label)}</ToolName>
            </ToolInfo>
            <SwitchButton
              type="button"
              role="switch"
              aria-checked={enabled}
              $on={enabled}
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

const ReadBadge = styled.span`
  flex: none;
  padding: ${({ theme }) => `${theme.spaces["1"]} ${theme.spaces["2"]}`};
  border-radius: ${({ theme }) => theme.radius.full};
  background: ${({ theme }) => theme.colors.successSoft};
  color: ${({ theme }) => theme.colors.success};
  font-size: 11.5px;
  font-weight: 600;
`;


