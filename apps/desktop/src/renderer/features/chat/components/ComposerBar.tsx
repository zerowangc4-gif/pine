import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Dropdown, type DropdownOption } from "@renderer/components/Dropdown";
import { Modal } from "@renderer/components/Modal";
import { GearIcon, ShieldIcon, SparkleIcon } from "@renderer/components/icons";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { formatCost, formatTokens } from "@renderer/utils/format";
import type { ThinkingLevel } from "@shared/types";
import { setThinkingLevelRequest, switchModelRequest } from "@renderer/features/login";
import type { SessionStatsDTO } from "@shared/types";
import {
  getSessionSettingsRequest,
  renameSessionRequest,
  setAutoCompactionRequest,
} from "../store";
import { SkillsModal } from "./SkillsModal";
import { PermissionsModal } from "./PermissionsModal";

export function ComposerBar({ stats }: { stats?: SessionStatsDTO }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { providers, selectedProvider, selectedModel, thinkingLevel } = useAppSelector(
    (state) => state.login,
  );
  const streaming = useAppSelector((state) => state.chat.streaming);
  const { sessions, activeSessionPath, sessionSettings } = useAppSelector((state) => state.chat);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");

  // Only providers that already have a usable API key are selectable here.
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
        <GearButton title={t("skills.title")} onClick={() => setSkillsOpen(true)}>
          <SparkleIcon />
        </GearButton>
        <GearButton title={t("permissions.title")} onClick={() => setPermissionsOpen(true)}>
          <ShieldIcon />
        </GearButton>
      </Left>

      <Stats>
        <StatItem>{t("chat.messagesCount", { count: stats?.totalMessages ?? 0 })}</StatItem>
        <StatDivider />
        <StatItem>{t("chat.inputTokens", { count: formatTokens(stats?.inputTokens ?? 0) })}</StatItem>
        <StatDivider />
        <StatItem>{t("chat.outputTokens", { count: formatTokens(stats?.outputTokens ?? 0) })}</StatItem>
        <StatDivider />
        <StatItem>
          {t("chat.cacheTokens", {
            count: formatTokens((stats?.cacheReadTokens ?? 0) + (stats?.cacheWriteTokens ?? 0)),
          })}
        </StatItem>
        <StatDivider />
        <StatItem>{t("chat.cost", { amount: formatCost(stats?.cost ?? 0) })}</StatItem>
      </Stats>

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
          <SettingsInput
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
              aria-checked={sessionSettings?.autoCompaction ?? false}
              $on={sessionSettings?.autoCompaction ?? false}
              onClick={() => dispatch(setAutoCompactionRequest(!(sessionSettings?.autoCompaction ?? false)))}
            >
              <SwitchKnob $on={sessionSettings?.autoCompaction ?? false} />
            </SwitchButton>
          </ToggleRow>
        </Modal>
      )}

      {skillsOpen && <SkillsModal onClose={() => setSkillsOpen(false)} />}

      {permissionsOpen && <PermissionsModal onClose={() => setPermissionsOpen(false)} />}
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

const Stats = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2.5"]};
  flex: none;
`;

const StatItem = styled.span`
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12px;
  white-space: nowrap;
`;

const StatDivider = styled.span`
  width: 1px;
  height: 14px;
  background: ${({ theme }) => theme.colors.border};
`;

const SettingsLabel = styled.div`
  margin-bottom: ${({ theme }) => theme.spaces["2"]};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13px;
  font-weight: 600;
`;

const SettingsInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => `${theme.spaces["2.5"]} ${theme.spaces["3.5"]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  outline: none;
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDim};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accentSoft};
  }
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

const SwitchButton = styled.button<{ $on: boolean }>`
  flex: none;
  position: relative;
  width: 42px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: ${({ theme }) => theme.radius.full};
  background: ${({ theme, $on }) => ($on ? theme.colors.accent : theme.colors.borderStrong)};
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast};
`;

const SwitchKnob = styled.span<{ $on: boolean }>`
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.accentText};
  transition: transform ${({ theme }) => theme.transition.fast};
  transform: ${({ $on }) => ($on ? "translateX(18px)" : "none")};
`;

const ModalButton = styled.button<{ $primary?: boolean }>`
  padding: ${({ theme }) => `${theme.spaces["2"]} ${theme.spaces["4"]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme, $primary }) => ($primary ? "transparent" : theme.colors.border)};
  background: ${({ theme, $primary }) => ($primary ? theme.gradients.accent : theme.colors.surface2)};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity ${({ theme }) => theme.transition.fast};

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;
