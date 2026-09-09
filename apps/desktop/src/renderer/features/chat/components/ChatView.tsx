import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styled from "styled-components";
import { CheckIcon, CrossIcon, Spinner } from "@renderer/components/icons";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { errorText } from "@renderer/utils/error";
import { clearError, sendMessage } from "../store";
import type { ChatMessage, ToolStep } from "../types/state";

export function ChatView() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { messages, streaming, error } = useAppSelector((state) => state.chat);
  const rootPath = useAppSelector((state) => state.workspace.rootPath);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, streaming]);

  const canSend = input.trim().length > 0 && Boolean(rootPath) && !streaming;

  function handleSend() {
    if (!canSend) return;
    dispatch(sendMessage(input.trim()));
    setInput("");
  }

  return (
    <Root>
      <Messages ref={scrollRef}>
        {messages.length === 0 ? (
          <Welcome>
            <WelcomeTitle>{t("chat.welcomeTitle")}</WelcomeTitle>
            <WelcomeHint>{t("chat.welcomeHint")}</WelcomeHint>
          </Welcome>
        ) : (
          messages.map((message) => <MessageRow key={message.id} message={message} />)
        )}
      </Messages>

      {error && (
        <ErrorBar>
          <ErrorText>{errorText(error)}</ErrorText>
          <ErrorClose onClick={() => dispatch(clearError())}>×</ErrorClose>
        </ErrorBar>
      )}

      <Composer>
        <ComposerBox>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder={rootPath ? t("chat.inputPlaceholder") : t("chat.noFolderYet")}
            rows={1}
          />
          {streaming ? (
            <StopButton onClick={() => void window.pi.abort()}>{t("chat.stop")}</StopButton>
          ) : (
            <SendButton disabled={!canSend} onClick={handleSend}>
              {t("chat.send")}
            </SendButton>
          )}
        </ComposerBox>
      </Composer>
    </Root>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  if (message.role === "user") {
    return (
      <UserRow>
        <UserBubble>{message.text}</UserBubble>
      </UserRow>
    );
  }
  return <AssistantRow message={message} label={t("chat.assistant")} />;
}

function AssistantRow({ message, label }: { message: ChatMessage; label: string }) {
  const { t } = useTranslation();
  const [showThinking, setShowThinking] = useState(false);
  const hasThinking = Boolean(message.thinking && message.thinking.trim().length > 0);

  return (
    <AssistantRowWrap>
      <AssistantLabel>{label}</AssistantLabel>
      <AssistantBody>
        {message.tools && message.tools.length > 0 && (
          <ToolList>
            {message.tools.map((tool) => (
              <ToolChip key={tool.id} $status={tool.status}>
                <ToolIcon $status={tool.status}>
                  {tool.status === "running" ? (
                    <Spinner $size={10} />
                  ) : tool.status === "done" ? (
                    <CheckIcon />
                  ) : (
                    <CrossIcon />
                  )}
                </ToolIcon>
                {tool.name}
                <ToolStatus>
                  {tool.status === "running"
                    ? t("chat.toolRunning")
                    : tool.status === "done"
                      ? t("chat.toolDone")
                      : t("chat.toolError")}
                </ToolStatus>
              </ToolChip>
            ))}
          </ToolList>
        )}

        {hasThinking && (
          <ThinkingBlock>
            <ThinkingToggle onClick={() => setShowThinking((value) => !value)}>
              <span>{t("chat.thinking")}</span>
              <Chevron $open={showThinking} />
            </ThinkingToggle>
            {showThinking && <ThinkingText>{message.thinking}</ThinkingText>}
          </ThinkingBlock>
        )}

        {message.text ? (
          <MarkdownBody>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
          </MarkdownBody>
        ) : message.streaming ? (
          <Caret />
        ) : null}
      </AssistantBody>
    </AssistantRowWrap>
  );
}

const ToolStatus = styled.span`
  flex: none;
  font-size: 11px;
`;

// ───────────────────────── styled ─────────────────────────

const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const Messages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Welcome = styled.div`
  margin: auto;
  text-align: center;
`;

const WelcomeTitle = styled.div`
  color: ${({ theme }) => theme.colors.text};
  font-size: 18px;
  font-weight: 700;
`;

const WelcomeHint = styled.div`
  margin-top: 8px;
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 13.5px;
`;

const ErrorBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 28px 12px;
  padding: 10px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.danger};
  background: ${({ theme }) => theme.colors.dangerSoft};
`;

const ErrorText = styled.span`
  flex: 1;
  color: ${({ theme }) => theme.colors.danger};
  font-size: 13px;
`;

const ErrorClose = styled.button`
  flex: none;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.danger};
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
`;

const Composer = styled.div`
  padding: 14px 28px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const ComposerBox = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 8px 8px 8px 16px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface2};
  transition: border-color ${({ theme }) => theme.transition.fast}, box-shadow ${({ theme }) => theme.transition.fast};

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.accent};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accentSoft};
  }
`;

const Textarea = styled.textarea`
  flex: 1;
  min-height: 24px;
  max-height: 180px;
  padding: 6px 0;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 14.5px;
  line-height: 1.6;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDim};
  }
`;

const SendButton = styled.button`
  flex: none;
  padding: 8px 18px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.accentText};
  background: ${({ theme }) => theme.gradients.accent};
  transition: opacity ${({ theme }) => theme.transition.fast}, transform ${({ theme }) => theme.transition.fast};

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const StopButton = styled.button`
  flex: none;
  padding: 8px 18px;
  border: 1px solid ${({ theme }) => theme.colors.danger};
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.danger};
  background: ${({ theme }) => theme.colors.dangerSoft};
  transition: opacity ${({ theme }) => theme.transition.fast};

  &:hover {
    opacity: 0.85;
  }
`;

const UserRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const UserBubble = styled.div`
  max-width: 72%;
  padding: 10px 16px;
  border-radius: 16px 16px 4px 16px;
  background: ${({ theme }) => theme.colors.accentSoft};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14.5px;
  white-space: pre-wrap;
  word-break: break-word;
`;

const AssistantRowWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 100%;
`;

const AssistantLabel = styled.div`
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const AssistantBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-self: flex-start;
  max-width: 92%;
`;

const ToolList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const ToolChip = styled.span<{ $status: ToolStep["status"] }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius.full};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12px;
`;

const ToolIcon = styled.span<{ $status: ToolStep["status"] }>`
  display: inline-flex;
  align-items: center;
  color: ${({ theme, $status }) =>
    $status === "done" ? theme.colors.success : $status === "error" ? theme.colors.danger : theme.colors.accent};
`;


const ThinkingBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;
`;

const ThinkingToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12.5px;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Chevron = styled.span<{ $open: boolean }>`
  display: inline-flex;
  transition: transform ${({ theme }) => theme.transition.fast};
  transform: ${({ $open }) => ($open ? "rotate(180deg)" : "rotate(0deg)")};

  &::after {
    content: "";
    width: 8px;
    height: 8px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(45deg);
  }
`;

const ThinkingText = styled.div`
  padding: 10px 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-word;
`;

const Caret = styled.span`
  display: inline-block;
  width: 8px;
  height: 16px;
  background: ${({ theme }) => theme.colors.accent};
  border-radius: 2px;
  animation: blink 1s step-end infinite;

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
`;

const MarkdownBody = styled.div`
  color: ${({ theme }) => theme.colors.text};
  font-size: 14.5px;
  line-height: 1.7;
  word-break: break-word;

  & > :first-child {
    margin-top: 0;
  }

  & > :last-child {
    margin-bottom: 0;
  }

  p {
    margin: 8px 0;
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 16px 0 8px;
    color: ${({ theme }) => theme.colors.text};
    font-weight: 700;
    line-height: 1.3;
  }

  h1 {
    font-size: 19px;
  }

  h2 {
    font-size: 17px;
  }

  h3 {
    font-size: 15.5px;
  }

  ul,
  ol {
    margin: 8px 0;
    padding-left: 22px;
  }

  li {
    margin: 3px 0;
  }

  li::marker {
    color: ${({ theme }) => theme.colors.accent};
  }

  code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 0.88em;
    background: ${({ theme }) => theme.colors.surfaceHover};
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 4px;
    padding: 1px 5px;
    color: ${({ theme }) => theme.colors.accent};
  }

  pre {
    margin: 10px 0;
    padding: 14px 16px;
    border-radius: ${({ theme }) => theme.radius.md};
    background: ${({ theme }) => theme.colors.codeBg};
    border: 1px solid ${({ theme }) => theme.colors.border};
    overflow-x: auto;
  }

  pre code {
    background: none;
    border: none;
    padding: 0;
    color: ${({ theme }) => theme.colors.codeText};
    font-size: 13px;
  }

  table {
    border-collapse: collapse;
    margin: 10px 0;
    width: 100%;
    font-size: 13px;
  }

  th,
  td {
    border: 1px solid ${({ theme }) => theme.colors.border};
    padding: 6px 10px;
    text-align: left;
  }

  th {
    background: ${({ theme }) => theme.colors.surface2};
  }

  blockquote {
    margin: 10px 0;
    padding: 8px 14px;
    border-left: 3px solid ${({ theme }) => theme.colors.accent};
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textMuted};
  }

  a {
    color: ${({ theme }) => theme.colors.accent};
  }
`;
