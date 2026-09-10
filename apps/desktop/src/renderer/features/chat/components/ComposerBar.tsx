import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Dropdown, type DropdownOption } from "@renderer/components";
import { Modal } from "@renderer/components";
import { ModalButton, SwitchButton, SwitchKnob, TextInput } from "@renderer/components";
import { DownloadIcon, GearIcon, PlusIcon, ShieldIcon } from "@renderer/components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { formatCost, formatTokens } from "@renderer/utils";
import type { SessionStatsDTO, ThinkingLevel } from "@shared/types";
import { setThinkingLevelRequest, switchModelRequest } from "@renderer/features/login";
import {
  exportSessionRequest,
  getSessionSettingsRequest,
  renameSessionRequest,
  setAutoCompactionRequest,
} from "../store";
import { PermissionsModal } from "./PermissionsModal";
import { ConnectProviderModal } from "./ConnectProviderModal";

export function ComposerBar({ stats }: { stats?: SessionStatsDTO }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { providers, selectedProvider, selectedModel, thinkingLevel } = useAppSelector(
    (state) => state.login,
  );
  const streaming = useAppSelector((state) => state.chat.streaming);
  const { sessions, activeSessionPath, sessionSettings } = useAppSelector((state) => state.chat);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");

  // Only providers with a configured key are listed here; the "+" button
  // opens the connect modal to add keys for everything else.
  const modelOptions: DropdownOption[] = useMemo(
    () =>
      providers
        .filter((provider) => provider.configured)
        .flatMap((provider) =>
          provider.models.map((model) => ({
            value: `${provider.id}::${model.id}`,
            label: model.name ?? model.id,
            group: provider.name,
            hint: model.acceptsImages ? t("chat.visionModel") : undefined,
          })),
        ),
    [providers, t],
  );

  const selectedModelValue =
    selectedProvider && selectedModel ? `${selectedProvider}::${selectedModel}` : undefined;

  const isDeep = thinkingLevel !== "low";
  const activeSession = sessions.find((session) => session.path === activeSessionPath);

  // Full breakdown shown on hover; the chip itself stays compact.
  const statsTitle =
    (stats?.totalMessages ?? 0) > 0
      ? [
          t("chat.messagesCount", { count: stats?.totalMessages ?? 0 }),
          t("chat.inputTokens", { count: formatTokens(stats?.inputTokens ?? 0) }),
          t("chat.outputTokens", { count: formatTokens(stats?.outputTokens ?? 0) }),
          t("chat.cacheTokens", {
            count: formatTokens((stats?.cacheReadTokens ?? 0) + (stats?.cacheWriteTokens ?? 0)),
          }),
          t("chat.cost", { amount: formatCost(stats?.cost ?? 0) }),
        ].join(" · ")
      : undefined;

  function switchMode(level: ThinkingLevel) {
    dispatch(setThinkingLevelRequest(level));
  }

  function openSettings() {
    setSessionName(activeSession?.name ?? activeSession?.firstMessage ?? "");
    dispatch(getSessionSettingsRequest());
    setSettingsOpen(true);
  }

  function submitRename() {
    if (sessionName.trim()) {
      dispatch(renameSessionRequest(sessionName.trim()));
    }
    setSettingsOpen(false);
  }

  return (
    <Root>
      <Left>
        <Dropdown
          options={modelOptions}
          value={selectedModelValue}
          disabled={streaming}
          onChange={(value) => {
            const [provider, model] = value.split("::");
            if (provider && model) {
              dispatch(switchModelRequest({ provider, model }));
            }
          }}
          placeholder={t("chat.model")}
        />
        <GearButton title={t("chat.addConnection")} disabled={streaming} onClick={() => setConnectOpen(true)}>
          <PlusIcon />
        </GearButton>
        <ModeToggle>
          <ModeButton $active={!isDeep} disabled={streaming} onClick={() => switchMode("low")}>
            {t("chat.modeFast")}
          </ModeButton>
          <ModeButton $active={isDeep} disabled={streaming} onClick={() => switchMode("high")}>
            {t("chat.modeDeep")}
          </ModeButton>
        </ModeToggle>
        <GearButton
          title={t("chat.sessionSettings")}
          disabled={!activeSessionPath}
          onClick={openSettings}
        >
          <GearIcon />
        </GearButton>
        <GearButton
          title={t("chat.exportSession")}
          disabled={!activeSessionPath}
          onClick={() => dispatch(exportSessionRequest(t("chat.exportSession")))}
        >
          <DownloadIcon />
        </GearButton>
        <GearButton title={t("permissions.title")} onClick={() => setPermissionsOpen(true)}>
          <ShieldIcon />
        </GearButton>
      </Left>

      {(stats?.totalMessages ?? 0) > 0 && (
        <StatChip title={statsTitle}>
          <span>{t("chat.inputTokens", { count: formatTokens(stats?.inputTokens ?? 0) })}</span>
          <ChipDot>·</ChipDot>
          <span>{t("chat.outputTokens", { count: formatTokens(stats?.outputTokens ?? 0) })}</span>
          <ChipDot>·</ChipDot>
          <ChipCost>{t("chat.cost", { amount: formatCost(stats?.cost ?? 0) })}</ChipCost>
        </StatChip>
      )}

      {settingsOpen && (
        <Modal
          title={t("chat.sessionSettings")}
          onClose={() => setSettingsOpen(false)}
          footer={
            <>
              <ModalButton onClick={() => setSettingsOpen(false)}>{t("common.cancel")}</ModalButton>
              <ModalButton $primary disabled={!sessionName.trim()} onClick={submitRename}>
                {t("common.save")}
              </ModalButton>
            </>
          }
        >
          <SettingsLabel>{t("chat.sessionName")}</SettingsLabel>
          <TextInput
            autoFocus
            value={sessionName}
            onChange={(event) => setSessionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitRename();
              if (event.key === "Escape") setSettingsOpen(false);
            }}
            placeholder={t("chat.sessionNamePlaceholder")}
          />

          <ToggleRow>
            <ToggleInfo>
              <SettingsLabel>{t("chat.autoCompaction")}</SettingsLabel>
              <SettingsHint>{t("chat.autoCompactionHint")}</SettingsHint>
            </ToggleInfo>
            <SwitchButton
              type="button"
              role="switch"
              aria-label={t("chat.autoCompaction")}
              aria-checked={sessionSettings?.autoCompaction ?? false}
              $on={sessionSettings?.autoCompaction ?? false}
              onClick={() => dispatch(setAutoCompactionRequest(!(sessionSettings?.autoCompaction ?? false)))}
            >
              <SwitchKnob $on={sessionSettings?.autoCompaction ?? false} />
            </SwitchButton>
          </ToggleRow>
        </Modal>
      )}

      {permissionsOpen && <PermissionsModal onClose={() => setPermissionsOpen(false)} />}

      {connectOpen && <ConnectProviderModal onClose={() => setConnectOpen(false)} />}
    </Root>
  );
}

const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spaces["3"]};
  margin-top: ${({ theme }) => theme.spaces["3"]};
  padding-top: ${({ theme }) => theme.spaces["2.5"]};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const Left = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2.5"]};
  min-width: 0;

  & > :first-child {
    width: 240px;
  }
`;

const ModeToggle = styled.div`
  display: inline-flex;
  padding: ${({ theme }) => theme.spaces["0.5"]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface2};
`;

const ModeButton = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => `${theme.spaces["1.5"]} ${theme.spaces["3"]}`};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme, $active }) => ($active ? theme.colors.accentSoft : "transparent")};
  color: ${({ theme, $active }) => ($active ? theme.colors.text : theme.colors.textDim)};
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.text};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const GearButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 30px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.textDim};
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const StatChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["1.5"]};
  flex: none;
  padding: ${({ theme }) => `${theme.spaces["1"]} ${theme.spaces["2.5"]}`};
  border-radius: ${({ theme }) => theme.radius.full};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12px;
  white-space: nowrap;
`;

const ChipDot = styled.span`
  color: ${({ theme }) => theme.colors.borderStrong};
`;

const ChipCost = styled.span`
  color: ${({ theme }) => theme.colors.text};
  font-weight: 600;
`;

const SettingsLabel = styled.div`
  margin-bottom: ${({ theme }) => theme.spaces["2"]};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13px;
  font-weight: 600;
`;

const SettingsHint = styled.p`
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12px;
  line-height: 1.5;
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spaces["3"]};
  margin-top: ${({ theme }) => theme.spaces["4"]};
`;

const ToggleInfo = styled.div`
  flex: 1;
  min-width: 0;

  & ${SettingsLabel} {
    margin-bottom: ${({ theme }) => theme.spaces["1"]};
  }
`;


