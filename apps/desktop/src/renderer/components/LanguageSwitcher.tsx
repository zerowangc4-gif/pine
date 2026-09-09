import { useTranslation } from "react-i18next";
import styled from "styled-components";

const Toggle = styled.button`
  flex: none;
  padding: ${({ theme }) => `${theme.spaces["1.5"]} ${theme.spaces["3"]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isChinese = i18n.language.startsWith("zh");
  return (
    <Toggle onClick={() => void i18n.changeLanguage(isChinese ? "en-US" : "zh-CN")}>
      {isChinese ? "EN" : "中文"}
    </Toggle>
  );
}
