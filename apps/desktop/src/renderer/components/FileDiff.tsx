import { useMemo } from "react";
import styled from "styled-components";
import { diffLines } from "diff";
import type { ToolPermissionDiffHunk } from "@shared/types";

/**
 * Reviewable line diff of file changes, used by the tool-permission modal to
 * show exactly what an `edit`/`write` tool call is about to apply.
 */
export function FileDiff({ path, hunks }: { path?: string; hunks: ToolPermissionDiffHunk[] }) {
  return (
    <Container>
      {path && <FilePath>{path}</FilePath>}
      {hunks.map((hunk, index) => (
        <Hunk key={index} oldText={hunk.oldText} newText={hunk.newText} />
      ))}
    </Container>
  );
}

function Hunk({ oldText, newText }: { oldText: string; newText: string }) {
  const changes = useMemo(() => diffLines(oldText, newText), [oldText, newText]);

  return (
    <>
      {changes.map((change, changeIndex) => {
        const lines = change.value.split("\n");
        if (lines[lines.length - 1] === "") {
          lines.pop();
        }
        return lines.map((line, lineIndex) => (
          <Line key={`${changeIndex}-${lineIndex}`} $added={change.added} $removed={change.removed}>
            <Marker>{change.added ? "+" : change.removed ? "-" : " "}</Marker>
            <Text>{line}</Text>
          </Line>
        ));
      })}
    </>
  );
}

const Container = styled.div`
  max-height: 240px;
  overflow: auto;
  margin-top: ${({ theme }) => theme.spaces["2.5"]};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.codeBg};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 12px;
  line-height: 1.6;
`;

const FilePath = styled.div`
  position: sticky;
  top: 0;
  padding: ${({ theme }) => `${theme.spaces["1.5"]} ${theme.spaces["3"]}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.codeHead};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 11.5px;
`;

const Line = styled.div<{ $added?: boolean; $removed?: boolean }>`
  display: flex;
  padding: 0 ${({ theme }) => theme.spaces["3"]};
  background: ${({ theme, $added, $removed }) =>
    $added ? theme.colors.successSoft : $removed ? theme.colors.dangerSoft : "transparent"};
  white-space: pre-wrap;
  word-break: break-all;
`;

const Marker = styled.span`
  flex: none;
  width: 16px;
  user-select: none;
  color: ${({ theme }) => theme.colors.textDim};
`;

const Text = styled.span`
  flex: 1;
  min-width: 0;
  color: ${({ theme }) => theme.colors.codeText};
`;
