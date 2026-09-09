import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@renderer/components/Modal";
import { ModalButton, TextInput } from "@renderer/components/ui";
import { SparkleIcon } from "@renderer/components/icons";
import { errorText } from "@renderer/utils/error";
import type { SkillInfo } from "@shared/types";

export function SkillsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSkills(await window.pi.listSkills());
    } catch {
      setError("error.operationFailed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName || !trimmedDescription) return;
    try {
      const result = await window.pi.createSkill(trimmedName, trimmedDescription);
      if (result.ok) {
        setName("");
        setDescription("");
        setCreating(false);
        void load();
      } else {
        setError(result.error ?? "error.operationFailed");
      }
    } catch {
      setError("error.operationFailed");
    }
  }

  const canCreate = name.trim().length > 0 && description.trim().length > 0;

  return (
    <Modal
      title={t("skills.title")}
      onClose={onClose}
      wide
      footer={
        creating ? (
          <>
            <ModalButton onClick={() => setCreating(false)}>{t("common.cancel")}</ModalButton>
            <ModalButton $primary disabled={!canCreate} onClick={() => void create()}>
              {t("skills.create")}
            </ModalButton>
          </>
        ) : (
          <ModalButton $primary onClick={() => setCreating(true)}>
            {t("skills.new")}
          </ModalButton>
        )
      }
    >
      {error && <ErrorText>{errorText(error)}</ErrorText>}

      {creating ? (
        <Form>
          <Label>{t("skills.name")}</Label>
          <TextInput
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("skills.namePlaceholder")}
          />
          <Label>{t("skills.description")}</Label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("skills.descriptionPlaceholder")}
            rows={6}
          />
        </Form>
      ) : loading ? (
        <Hint>{t("common.loading")}</Hint>
      ) : skills.length === 0 ? (
        <Hint>{t("skills.empty")}</Hint>
      ) : (
        <>
          {skills.map((skill) => (
            <SkillRow key={skill.filePath}>
              <SparkleIcon size={13} />
              <SkillMain>
                <SkillName>{skill.name}</SkillName>
                <SkillDesc>{skill.description}</SkillDesc>
              </SkillMain>
            </SkillRow>
          ))}
          <Hint>{t("skills.hint")}</Hint>
        </>
      )}
    </Modal>
  );
}

const SkillRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spaces["2.5"]};
  padding: ${({ theme }) => theme.spaces["2.5"]} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.accent};
`;

const SkillMain = styled.div`
  min-width: 0;
`;

const SkillName = styled.div`
  color: ${({ theme }) => theme.colors.text};
  font-size: 13.5px;
  font-weight: 600;
`;

const SkillDesc = styled.div`
  margin-top: ${({ theme }) => theme.spaces["1"]};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12.5px;
  line-height: 1.5;
  word-break: break-word;
`;

const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spaces["2"]};
`;

const Label = styled.div`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13px;
  font-weight: 600;
`;

const Textarea = styled.textarea`
  padding: ${({ theme }) => `${theme.spaces["2.5"]} ${theme.spaces["3.5"]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  outline: none;
  resize: vertical;
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  font-family: inherit;

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accentSoft};
  }
`;

const Hint = styled.div`
  padding: ${({ theme }) => theme.spaces["3"]} 0;
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12.5px;
  line-height: 1.6;
`;

const ErrorText = styled.div`
  margin-bottom: ${({ theme }) => theme.spaces["2.5"]};
  padding: ${({ theme }) => `${theme.spaces["2"]} ${theme.spaces["3"]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.danger};
  background: ${({ theme }) => theme.colors.dangerSoft};
  color: ${({ theme }) => theme.colors.danger};
  font-size: 13px;
`;


