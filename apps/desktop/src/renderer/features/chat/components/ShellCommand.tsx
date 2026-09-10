import { useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { ChevronRightIcon, CopyIcon } from "@renderer/components";

/**
 * A shell command shown in the chat timeline and in the permission modal.
 *
 * Collapsed by default so a long command doesn't spam the timeline; the copy
 * button always works and the chevron reveals the full text. The command is
 * first-class review data now — hiding it led to blind approval, which is the
 * bigger safety risk.
 */
export function ShellCommand({ command }: { command: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <ShellBlock>
      <ShellLine>
        <ShellPrefix>$</ShellPrefix>
        <ShellCode $expanded={expanded}>{command}</ShellCode>
        <ShellActions>
          <ShellButton
            type="button"
            title={t("chat.copyCommand")}
            aria-label={t("chat.copyCommand")}
            onClick={() => void window.pi.copyText(command)}
          >
            <CopyIcon size={12} />
          </ShellButton>
          <ShellButton
            type="button"
            title={expanded ? t("chat.collapseCommand") : t("chat.expandCommand")}
            aria-label={expanded ? t("chat.collapseCommand") : t("chat.expandCommand")}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronWrap $expanded={expanded}>
              <ChevronRightIcon size={10} />
            </ChevronWrap>
          </ShellButton>
        </ShellActions>
      </ShellLine>
    </ShellBlock>
  );
}

const ShellBlock = styled.div`
  max-width: 100%;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.codeBg};
  overflow: hidden;
`;

const ShellLine = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spaces["2"]};
  padding: ${({ theme }) => `${theme.spaces["2"]} ${theme.spaces["2.5"]}`};
`;

const ShellPrefix = styled.span`
  flex: none;
  color: ${({ theme }) => theme.colors.accent};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 12px;
  line-height: 1.5;
  user-select: none;
`;

const ShellCode = styled.pre<{ $expanded: boolean }>`
  flex: 1;
  min-width: 0;
  margin: 0;
  color: ${({ theme }) => theme.colors.codeText};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 12px;
  line-height: 1.5;
  white-space: ${({ $expanded }) => ($expanded ? "pre-wrap" : "nowrap")};
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
`;

const ShellActions = styled.div`
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["1"]};
`;

const ShellButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textDim};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const ChevronWrap = styled.span<{ $expanded: boolean }>`
  display: inline-flex;
  transition: transform ${({ theme }) => theme.transition.fast};
  transform: ${({ $expanded }) => ($expanded ? "rotate(90deg)" : "rotate(0deg)")};
`;
