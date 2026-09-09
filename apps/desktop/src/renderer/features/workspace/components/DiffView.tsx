import { useMemo } from "react";
import styled from "styled-components";
import { diffLines } from "diff";

/**
 * Read-only line diff between two versions of a file. Used to review external
 * changes (agent edits) without touching the editor buffer.
 */
export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const changes = useMemo(() => diffLines(oldText, newText), [oldText, newText]);

  return (
    <DiffContainer>
      {changes.map((change, changeIndex) => {
        const lines = change.value.split("\n");
        if (lines[lines.length - 1] === "") {
          lines.pop();
        }
        return lines.map((line, lineIndex) => (
          <DiffLine key={`${changeIndex}-${lineIndex}`} $added={change.added} $removed={change.removed}>
            <DiffMarker>{change.added ? "+" : change.removed ? "-" : " "}</DiffMarker>
            <DiffText>{line}</DiffText>
          </DiffLine>
        ));
      })}
    </DiffContainer>
  );
}

const DiffContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.spaces["4"]} 0;
  background: ${({ theme }) => theme.colors.codeBg};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 13.5px;
  line-height: 1.7;
`;

const DiffLine = styled.div<{ $added?: boolean; $removed?: boolean }>`
  display: flex;
  padding: 0 ${({ theme }) => theme.spaces["4"]};
  background: ${({ theme, $added, $removed }) =>
    $added ? theme.colors.successSoft : $removed ? theme.colors.dangerSoft : "transparent"};
  white-space: pre;
`;

const DiffMarker = styled.span`
  flex: none;
  width: 20px;
  user-select: none;
  color: ${({ theme }) => theme.colors.textDim};
`;

const DiffText = styled.span`
  flex: 1;
  color: ${({ theme }) => theme.colors.codeText};
  word-break: break-all;
`;
