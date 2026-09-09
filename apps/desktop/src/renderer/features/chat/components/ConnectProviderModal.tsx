import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Dropdown, type DropdownOption } from "@renderer/components/Dropdown";
import { Modal } from "@renderer/components/Modal";
import { ModalButton, TextInput } from "@renderer/components/ui";
import { Spinner } from "@renderer/components/icons";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { errorText } from "@renderer/utils/error";
import { connectWithKeyRequest } from "@renderer/features/login";

/**
 * Lets the user add an API key for a provider without leaving the chat page.
 * The composer's model dropdown disables providers that lack a key; this modal
 * is how that limitation gets resolved in place.
 */
export function ConnectProviderModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { providers, connecting, error } = useAppSelector((state) => state.login);

  const [provider, setProvider] = useState<string | undefined>(() => {
    const target = providers.find((item) => !item.configured) ?? providers[0];
    return target?.id;
  });
  const [model, setModel] = useState<string | undefined>(undefined);
  const [apiKey, setApiKey] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(undefined);

  const currentProvider = useMemo(
    () => providers.find((item) => item.id === provider),
    [providers, provider],
  );

  const providerOptions: DropdownOption[] = useMemo(
    () =>
      providers.map((item) => ({
        value: item.id,
        label: item.name,
        hint: item.configured ? t("login.configured") : undefined,
      })),
    [providers, t],
  );

  const modelOptions: DropdownOption[] = useMemo(
    () =>
      (currentProvider?.models ?? []).map((item) => ({
        value: item.id,
        label: item.name ?? item.id,
      })),
    [currentProvider],
  );

  // Keep the selected model valid whenever the provider changes.
  useEffect(() => {
    setModel((current) => {
      if (current && currentProvider?.models.some((item) => item.id === current)) {
        return current;
      }
      return currentProvider?.models[0]?.id;
    });
  }, [currentProvider]);

  // Watch the connect attempt: close on success, surface the error on failure.
  useEffect(() => {
    if (!submitted || connecting) return;
    setSubmitted(false);
    if (error) {
      setLocalError(error);
    } else {
      onClose();
    }
  }, [submitted, connecting, error, onClose]);

  const canSubmit = Boolean(provider) && Boolean(model) && !connecting;

  function handleSubmit() {
    if (!provider || !model || connecting) return;
    setLocalError(undefined);
    setSubmitted(true);
    dispatch(connectWithKeyRequest({ provider, model, apiKey: apiKey.trim() }));
  }

  return (
    <Modal
      title={t("chat.connectProvider")}
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>{t("common.cancel")}</ModalButton>
          <ModalButton $primary disabled={!canSubmit} onClick={handleSubmit}>
            {connecting ? <Spinner $size={14} /> : t("login.connect")}
          </ModalButton>
        </>
      }
    >
      <Field>
        <Label>{t("login.provider")}</Label>
        <Dropdown
          options={providerOptions}
          value={provider}
          onChange={(value) => setProvider(value)}
          placeholder={t("login.providerPlaceholder")}
        />
      </Field>

      <Field>
        <Label>{t("login.model")}</Label>
        <Dropdown
          options={modelOptions}
          value={model}
          onChange={(value) => setModel(value)}
          placeholder={provider ? t("login.modelPlaceholder") : t("login.modelRequiresProvider")}
          disabled={!provider}
        />
      </Field>

      <Field>
        <Label>{t("login.apiKey")}</Label>
        <TextInput
          autoFocus
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            currentProvider?.configured
              ? t("login.configuredKeyPlaceholder")
              : (currentProvider?.apiKeyLabel ?? t("login.apiKey"))
          }
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSubmit) handleSubmit();
            if (event.key === "Escape") onClose();
          }}
        />
        <Hint>{t("login.apiKeyHint")}</Hint>
      </Field>

      {localError && <ErrorText>{errorText(localError)}</ErrorText>}
    </Modal>
  );
}

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spaces["2"]};
  margin-bottom: ${({ theme }) => theme.spaces["4"]};
`;

const Label = styled.div`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13px;
  font-weight: 600;
`;

const Hint = styled.p`
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12px;
`;

const ErrorText = styled.div`
  padding: ${({ theme }) => `${theme.spaces["2"]} ${theme.spaces["3"]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.danger};
  background: ${({ theme }) => theme.colors.dangerSoft};
  color: ${({ theme }) => theme.colors.danger};
  font-size: 13px;
`;


