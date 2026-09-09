import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Dropdown, type DropdownOption } from "@renderer/components/Dropdown";
import { Modal } from "@renderer/components/Modal";
import { GearIcon } from "@renderer/components/icons";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import type { ThinkingLevel } from "@shared/types";
import { setThinkingLevelRequest, switchModelRequest } from "@renderer/features/login";
import type { SessionStatsDTO } from "@shared/types";
import { renameSessionRequest } from "../store";

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

function formatCost(value: number): string {
  if (value <= 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function ComposerBar({ stats }: { stats?: SessionStatsDTO }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { providers, selectedProvider, selectedModel, thinkingLevel } = useAppSelector(
    (state) => state.login,
  );
  const streaming = useAppSelector((state) => state.chat.streaming);
  const { sessions, activeSessionPath } = useAppSelector((state) => state.chat);

  const [settingsOpen, setSettingsOpen] = useState(false);
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
            hint: provider.name,
          })),
        ),
    [providers],
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
      </Left>

      <Stats>
        {stats && (
          <>
            <StatItem>{t("chat.messagesCount", { count: stats.totalMessages })}</StatItem>
            <StatDivider />
            <StatItem
              title={t("chat.tokensDetail", { input: stats.inputTokens, output: stats.outputTokens })}
            >
              {t("chat.tokens", { count: formatTokens(stats.tokens) })}
            </StatItem>
            <StatDivider />
            <StatItem>{t("chat.cost", { amount: formatCost(stats.cost) })}</StatItem>
          </>
        )}
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
        </Modal>
      )}
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
