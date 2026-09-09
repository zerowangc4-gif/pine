import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { toggleTheme } from "@renderer/store/themeSlice";

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isDark = useAppSelector((state) => state.theme.name === "dark");

  return (
    <Toggle
      title={isDark ? t("theme.light") : t("theme.dark")}
      onClick={() => dispatch(toggleTheme())}
    >
      {isDark ? "☀" : "☾"}
    </Toggle>
  );
}

const Toggle = styled.button`
  flex: none;
  width: 34px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;
