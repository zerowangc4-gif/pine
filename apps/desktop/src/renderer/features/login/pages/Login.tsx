import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Dropdown, type DropdownOption } from "@renderer/components";
import { LanguageSwitcher } from "@renderer/components";
import { ThemeSwitcher } from "@renderer/components";
import { LogoMark, Spinner } from "@renderer/components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { errorText } from "@renderer/utils";
import {
  connectRequest,
  loadProviders,
  selectModel,
  selectProvider,
  setApiKey,
} from "../store";

function formatWindow(t: (key: string, options: Record<string, string>) => string, contextWindow?: number): string {
  if (!contextWindow) return "";
  if (contextWindow >= 1_000_000) {
    return t("login.contextM", { size: (contextWindow / 1_000_000).toFixed(1) });
  }
  return t("login.contextK", { size: `${Math.round(contextWindow / 1000)}` });
}

export function Login() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const {
    providers,
    loadingProviders,
    providersError,
    selectedProvider,
    selectedModel,
    apiKey,
    connecting,
    connected,
    error,
  } = useAppSelector((state) => state.login);

  useEffect(() => {
    dispatch(loadProviders());
  }, [dispatch]);

  useEffect(() => {
    if (connected) {
      navigate("/chat", { replace: true });
    }
  }, [connected, navigate]);

  const currentProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProvider),
    [providers, selectedProvider],
  );

  const providerOptions: DropdownOption[] = useMemo(
    () => providers.map((provider) => ({ value: provider.id, label: provider.name, hint: provider.id })),
    [providers],
  );

  const modelOptions: DropdownOption[] = useMemo(
    () =>
      (currentProvider?.models ?? []).map((model) => ({
        value: model.id,
        label: model.name ?? model.id,
        hint: formatWindow(t, model.contextWindow),
      })),
    [currentProvider, t],
  );

  const [showKey, setShowKey] = useState(false);
  const selectedConfigured = currentProvider?.configured ?? false;
  const canConnect =
    Boolean(selectedProvider) &&
    Boolean(selectedModel) &&
    (apiKey.trim().length > 0 || selectedConfigured) &&
    !connecting;

  return (
    <Page>
      <Glow $position="top" />
      <Glow $position="bottom" />
      <TopBar>
        <ThemeSwitcher />
        <LanguageSwitcher />
      </TopBar>
      <Card>
        <Brand>
          <LogoBox>
            <LogoMark size={22} />
          </LogoBox>
          <BrandText>
            <Title>{t("login.title")}</Title>
            <Subtitle>{t("login.subtitle")}</Subtitle>
          </BrandText>
        </Brand>

        <Form>
          <Field>
            <Label>{t("login.provider")}</Label>
            <Dropdown
              options={providerOptions}
              value={selectedProvider}
              onChange={(value) => dispatch(selectProvider(value))}
              placeholder={loadingProviders ? t("login.providerLoading") : t("login.providerPlaceholder")}
              disabled={loadingProviders}
            />
          </Field>

          <Field>
            <Label>{t("login.model")}</Label>
            <Dropdown
              options={modelOptions}
              value={selectedModel}
              onChange={(value) => dispatch(selectModel(value))}
              placeholder={selectedProvider ? t("login.modelPlaceholder") : t("login.modelRequiresProvider")}
              disabled={!selectedProvider}
            />
          </Field>

          <Field>
            <Label>
              {t("login.apiKey")}
              {selectedConfigured && <ConfiguredBadge>{t("login.configured")}</ConfiguredBadge>}
            </Label>
            <KeyWrap>
              <KeyInput
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => dispatch(setApiKey(event.target.value))}
                placeholder={
                  selectedConfigured
                    ? t("login.configuredKeyPlaceholder")
                    : (currentProvider?.apiKeyLabel ?? t("login.apiKey"))
                }
                autoComplete="off"
                spellCheck={false}
              />
              <KeyToggle type="button" onClick={() => setShowKey((visible) => !visible)}>
                {showKey ? t("login.hide") : t("login.show")}
              </KeyToggle>
            </KeyWrap>
            <Hint>{selectedConfigured ? t("login.configuredHint") : t("login.apiKeyHint")}</Hint>
          </Field>

          {(providersError ?? error) && <ErrorText>{errorText(providersError ?? error)}</ErrorText>}

          <ConnectButton type="button" disabled={!canConnect} onClick={() => dispatch(connectRequest())}>
            {connecting ? <Spinner $size={16} /> : t("login.connect")}
          </ConnectButton>
        </Form>
      </Card>
    </Page>
  );
}

const Page = styled.div`
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: ${({ theme }) => theme.spaces["8"]};
  background: ${({ theme }) => theme.gradients.page};
`;

const TopBar = styled.div`
  position: absolute;
  top: 20px;
  right: 24px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2"]};
`;

const Glow = styled.div<{ $position: "top" | "bottom" }>`
  position: absolute;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.35;
  pointer-events: none;
  background: ${({ theme, $position }) =>
    $position === "top" ? theme.gradients.glowTop : theme.gradients.glowBottom};
  ${({ $position }) =>
    $position === "top" ? "top: -140px; left: -100px;" : "bottom: -140px; right: -100px;"}
`;

const Card = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  padding: ${({ theme }) => theme.spaces["10"]};
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  backdrop-filter: blur(24px);
  box-shadow: ${({ theme }) => theme.shadow.lg};
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["3.5"]};
  margin-bottom: ${({ theme }) => theme.spaces["7"]};
`;

const LogoBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 13px;
  background: ${({ theme }) => theme.gradients.accent};
  box-shadow: 0 8px 24px ${({ theme }) => theme.colors.accentSoft};
`;

const BrandText = styled.div`
  display: flex;
  flex-direction: column;
`;

const Title = styled.h1`
  color: ${({ theme }) => theme.colors.text};
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const Subtitle = styled.p`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13.5px;
`;

const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spaces["5"]};
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spaces["2"]};
`;

const Label = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2"]};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13px;
  font-weight: 600;
`;

const ConfiguredBadge = styled.span`
  padding: ${({ theme }) => theme.spaces["0.5"]} ${({ theme }) => theme.spaces["2"]};
  border-radius: ${({ theme }) => theme.radius.full};
  background: ${({ theme }) => theme.colors.successSoft};
  color: ${({ theme }) => theme.colors.success};
  font-size: 11px;
  font-weight: 600;
`;

const Hint = styled.p`
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12px;
`;

const ErrorText = styled.p`
  padding: ${({ theme }) => theme.spaces["2.5"]} ${({ theme }) => theme.spaces["3.5"]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.danger};
  background: ${({ theme }) => theme.colors.dangerSoft};
  color: ${({ theme }) => theme.colors.danger};
  font-size: 13px;
  line-height: 1.5;
`;

const ConnectButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spaces["2"]};
  width: 100%;
  margin-top: ${({ theme }) => theme.spaces["1.5"]};
  padding: ${({ theme }) => theme.spaces["3"]} ${({ theme }) => theme.spaces["4"]};
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.accentText};
  background: ${({ theme }) => theme.gradients.accent};
  box-shadow: 0 10px 28px ${({ theme }) => theme.colors.accentSoft};
  transition: transform ${({ theme }) => theme.transition.fast}, box-shadow ${({ theme }) => theme.transition.base},
    opacity ${({ theme }) => theme.transition.base};

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 14px 34px ${({ theme }) => theme.colors.accentSoft};
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    box-shadow: none;
  }
`;

const KeyWrap = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2"]};
  padding: ${({ theme }) => theme.spaces["1"]} ${({ theme }) => theme.spaces["1.5"]} ${({ theme }) => theme.spaces["1"]} ${({ theme }) => theme.spaces["4"]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface2};
  transition: border-color ${({ theme }) => theme.transition.fast}, box-shadow ${({ theme }) => theme.transition.fast};

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.accent};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accentSoft};
  }
`;

const KeyInput = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  font-size: 14.5px;
  letter-spacing: 0.02em;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDim};
  }
`;

const KeyToggle = styled.button`
  flex: none;
  padding: ${({ theme }) => theme.spaces["1.5"]} ${({ theme }) => theme.spaces["3"]};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  background: ${({ theme }) => theme.colors.surfaceHover};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12.5px;
  font-weight: 600;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.borderStrong};
    color: ${({ theme }) => theme.colors.text};
  }
`;
