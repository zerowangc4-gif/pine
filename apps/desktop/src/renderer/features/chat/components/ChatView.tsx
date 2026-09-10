import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styled from "styled-components";
import { CheckIcon, CopyIcon, CrossIcon, FileDiff, ImageIcon, Spinner } from "@renderer/components";
import { useAppDispatch, useAppSelector } from "@renderer/store/hooks";
import { errorText } from "@renderer/utils";
import { formatCost } from "@renderer/utils";
import type { ChatImage } from "@shared/types";
import { openFolderRequest } from "@renderer/features/workspace";
import { ComposerBar } from "./ComposerBar";
import { ToolPermissionModal } from "./ToolPermissionModal";
import { clearError, sendMessage } from "../store";
import type { ChatMessage, ToolStep } from "../types/state";

function readImageFile(file: File): Promise<ChatImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const match = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(String(reader.result));
      if (match) {
        resolve({ mimeType: match[1], data: match[2] });
      } else {
        reject(new Error("Unsupported image"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function imageFiles(list: FileList | null): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
}

export function ChatView() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { messages, streaming, error, sessionStats } = useAppSelector((state) => state.chat);
  const rootPath = useAppSelector((state) => state.workspace.rootPath);
  const { providers, selectedProvider, selectedModel } = useAppSelector((state) => state.login);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<ChatImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pasteMenu, setPasteMenu] = useState<{ x: number; y: number } | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const acceptsImages = useMemo(() => {
    const provider = providers.find((item) => item.id === selectedProvider);
    return provider?.models.find((item) => item.id === selectedModel)?.acceptsImages ?? false;
  }, [providers, selectedProvider, selectedModel]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, streaming]);

  // Grow the single-line composer to fit its content, capped at 180px.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [input]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottom.current = distanceFromBottom < 40;
  }

  useEffect(() => {
    if (!pasteMenu) return;
    function close(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-paste-menu]")) {
        setPasteMenu(undefined);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pasteMenu]);

  const hasText = input.trim().length > 0;
  const hasInput = hasText || images.length > 0;
  const canSend = hasInput && Boolean(rootPath) && !streaming;

  async function addImageFiles(files: File[]) {
    if (files.length === 0) return;
    const next = await Promise.all(files.map(readImageFile));
    setImages((previous) => [...previous, ...next]);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = imageFiles(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    void addImageFiles(files);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    void addImageFiles(imageFiles(event.target.files));
    event.target.value = "";
  }

  function hasImageFiles(event: React.DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  function handleDragOver(event: React.DragEvent) {
    if (!acceptsImages || !hasImageFiles(event)) return;
    event.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    if (event.currentTarget === event.target) {
      setDragging(false);
    }
  }

  function handleDrop(event: React.DragEvent) {
    if (!acceptsImages || !hasImageFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    void addImageFiles(imageFiles(event.dataTransfer.files));
  }

  function handleComposerContextMenu(event: React.MouseEvent) {
    if (!acceptsImages) return;
    event.preventDefault();
    setPasteMenu({ x: event.clientX, y: event.clientY });
  }

  async function pasteImageFromClipboard() {
    setPasteMenu(undefined);
    const image = await window.pi.readClipboardImage();
    if (image) {
      setImages((previous) => [...previous, image]);
    }
  }

  function handleSend(streamingBehavior?: "steer" | "followUp") {
    if (streaming) {
      if (!streamingBehavior || !hasInput) return;
      dispatch(sendMessage({ text: input.trim(), images, streamingBehavior }));
    } else {
      if (!canSend) return;
      dispatch(sendMessage({ text: input.trim(), images }));
    }
    setInput("");
    setImages([]);
    stickToBottom.current = true;
  }

  return (
    <Root
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Messages ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <Welcome>
            <WelcomeTitle>{t("chat.welcomeTitle")}</WelcomeTitle>
            <WelcomeHint>{rootPath ? t("chat.welcomeHintReady") : t("chat.welcomeHint")}</WelcomeHint>
            {!rootPath && (
              <WelcomeAction onClick={() => dispatch(openFolderRequest(t("files.openFolder")))}>
                {t("files.openFolder")}
              </WelcomeAction>
            )}
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
        {images.length > 0 && (
          <ImageStrip>
            {images.map((image, index) => (
              <Thumb key={`${index}-${image.mimeType}`}>
                <ThumbImg src={`data:${image.mimeType};base64,${image.data}`} alt="" />
                <ThumbRemove
                  title={t("chat.removeImage")}
                  onClick={() => setImages((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                >
                  ×
                </ThumbRemove>
              </Thumb>
            ))}
          </ImageStrip>
        )}
        <ComposerBox onContextMenu={handleComposerContextMenu}>
          <AttachButton
            type="button"
            disabled={!acceptsImages || streaming}
            title={acceptsImages ? t("chat.attachImage") : t("chat.noImageSupport")}
            onClick={() => fileRef.current?.click()}
          >
            <ImageIcon />
          </AttachButton>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFileChange} />
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend(streaming ? "followUp" : undefined);
              }
            }}
            placeholder={rootPath ? t("chat.inputPlaceholder") : t("chat.noFolderYet")}
            rows={1}
          />
          {streaming ? (
            <>
              <FollowUpButton
                disabled={!hasInput}
                title={t("chat.followUpHint")}
                onClick={() => handleSend("followUp")}
              >
                {t("chat.followUp")}
              </FollowUpButton>
              <SteerButton
                disabled={!hasInput}
                title={t("chat.steerHint")}
                onClick={() => handleSend("steer")}
              >
                {t("chat.steer")}
              </SteerButton>
              <StopButton onClick={() => void window.pi.abort()}>{t("chat.stop")}</StopButton>
            </>
          ) : (
            <SendButton disabled={!canSend} onClick={() => handleSend()}>
              {t("chat.send")}
            </SendButton>
          )}
        </ComposerBox>
        <ComposerBar stats={sessionStats} />
      </Composer>

      {dragging && <DropOverlay>{t("chat.dropImages")}</DropOverlay>}

      {pasteMenu && (
        <PasteMenu data-paste-menu style={{ left: pasteMenu.x, top: pasteMenu.y }} onClick={(event) => event.stopPropagation()}>
          <PasteMenuItem onClick={() => void pasteImageFromClipboard()}>
            <ImageIcon />
            {t("chat.pasteImage")}
          </PasteMenuItem>
        </PasteMenu>
      )}

      <ToolPermissionModal />
    </Root>
  );
}

function CopyMessageButton({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <CopyButton
      type="button"
      title={t("chat.copyMessage")}
      aria-label={t("chat.copyMessage")}
      onClick={() => void window.pi.copyText(text)}
    >
      <CopyIcon size={13} />
    </CopyButton>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  if (message.role === "user") {
    return (
      <UserRow>
        <CopyMessageButton text={message.text} />
        <UserBubble>
          {message.images && message.images.length > 0 && (
            <UserImages>
              {message.images.map((image, index) => (
                <UserImage key={index} src={`data:${image.mimeType};base64,${image.data}`} alt="" />
              ))}
            </UserImages>
          )}
          {message.text}
        </UserBubble>
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
      <LabelRow>
        <AssistantLabel>{label}</AssistantLabel>
        <CopyMessageButton text={message.text} />
      </LabelRow>
      <AssistantBody>
        {message.tools && message.tools.length > 0 && (
          <ToolList>
            {message.tools.map((tool) => (
              <ToolItem key={tool.id}>
                <ToolChip $status={tool.status}>
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
                {tool.summary && (
                  <ToolDetail $command={tool.name === "bash" || tool.name === "powershell"}>
                    {tool.summary}
                  </ToolDetail>
                )}
                {tool.diff && <FileDiff path={tool.diff.path} hunks={tool.diff.hunks} />}
              </ToolItem>
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

        {message.usage && message.usage.cost > 0 && (
          <UsageLine>
            {t("chat.perMessageUsage", {
              input: message.usage.inputTokens,
              output: message.usage.outputTokens,
              cost: formatCost(message.usage.cost),
            })}
          </UsageLine>
        )}
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
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const DropOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: ${({ theme }) => theme.z.dropdown};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.bg};
  border: 2px dashed ${({ theme }) => theme.colors.accent};
  color: ${({ theme }) => theme.colors.accent};
  font-size: 15px;
  font-weight: 600;
  pointer-events: none;
`;

const PasteMenu = styled.div`
  position: fixed;
  z-index: ${({ theme }) => theme.z.dropdown};
  min-width: 150px;
  padding: ${({ theme }) => theme.spaces["1.5"]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  box-shadow: ${({ theme }) => theme.shadow.md};
`;

const PasteMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2"]};
  width: 100%;
  padding: ${({ theme }) => `${theme.spaces["2"]} ${theme.spaces["3"]}`};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Messages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spaces["6"]} ${({ theme }) => theme.spaces["7"]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spaces["5"]};
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
  margin-top: ${({ theme }) => theme.spaces["2"]};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 13.5px;
`;

const WelcomeAction = styled.button`
  margin-top: ${({ theme }) => theme.spaces["5"]};
  padding: ${({ theme }) => `${theme.spaces["2.5"]} ${theme.spaces["5"]}`};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, border-color ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    border-color: ${({ theme }) => theme.colors.accent};
  }
`;

const ErrorBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2.5"]};
  margin: 0 ${({ theme }) => theme.spaces["7"]} ${({ theme }) => theme.spaces["3"]};
  padding: ${({ theme }) => theme.spaces["2.5"]} ${({ theme }) => theme.spaces["3.5"]};
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
  padding: ${({ theme }) => theme.spaces["3.5"]} ${({ theme }) => theme.spaces["7"]} ${({ theme }) => theme.spaces["5"]};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const ImageStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spaces["2"]};
  margin-bottom: ${({ theme }) => theme.spaces["2.5"]};
`;

const Thumb = styled.div`
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const ThumbImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const ThumbRemove = styled.button`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: ${({ theme }) => theme.colors.danger};
    color: ${({ theme }) => theme.colors.accentText};
  }
`;

const AttachButton = styled.button`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textDim};
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
`;

const ComposerBox = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spaces["2.5"]};
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["4"]};
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
  padding: ${({ theme }) => theme.spaces["1.5"]} 0;
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
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["4"]};
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
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["4"]};
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

const FollowUpButton = styled.button`
  flex: none;
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["3.5"]};
  border: 1px solid ${({ theme }) => theme.colors.accent};
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.accent};
  background: ${({ theme }) => theme.colors.accentSoft};

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const SteerButton = styled(FollowUpButton)`
  border-color: ${({ theme }) => theme.colors.warning};
  color: ${({ theme }) => theme.colors.warning};
  background: transparent;
`;

const CopyButton = styled.button`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.textDim};
  cursor: pointer;
  opacity: 0.55;
  transition: background ${({ theme }) => theme.transition.fast}, color ${({ theme }) => theme.transition.fast},
    opacity ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
    opacity: 1;
  }
`;

const UserRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spaces["2"]};
`;

const UserBubble = styled.div`
  max-width: 72%;
  padding: ${({ theme }) => theme.spaces["2.5"]} ${({ theme }) => theme.spaces["4"]};
  border-radius: 16px 16px 4px 16px;
  background: ${({ theme }) => theme.colors.accentSoft};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14.5px;
  white-space: pre-wrap;
  word-break: break-word;
`;

const UserImages = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spaces["2"]};
  margin-bottom: ${({ theme }) => theme.spaces["2"]};
`;

const UserImage = styled.img`
  max-width: 200px;
  max-height: 200px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const AssistantRowWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spaces["1.5"]};
  max-width: 100%;
`;

const LabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2"]};
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
  gap: ${({ theme }) => theme.spaces["2.5"]};
  align-self: flex-start;
  max-width: 92%;
`;

const ToolList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spaces["2"]};
`;

const ToolItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spaces["1.5"]};
  max-width: 100%;
`;

const ToolDetail = styled.div<{ $command?: boolean }>`
  max-width: 100%;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};

  ${({ theme, $command }) =>
    $command
      ? `
    padding: ${theme.spaces["2"]} ${theme.spaces["3"]};
    border: 1px solid ${theme.colors.border};
    border-radius: ${theme.radius.sm};
    background: ${theme.colors.codeBg};
    color: ${theme.colors.codeText};
    font-family: ${theme.font.mono};
    white-space: pre-wrap;
    word-break: break-all;
  `
      : ""}
`;

const ToolChip = styled.span<{ $status: ToolStep["status"] }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["1.5"]};
  padding: ${({ theme }) => theme.spaces["1"]} ${({ theme }) => theme.spaces["2.5"]};
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
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["3"]};
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
  padding: ${({ theme }) => theme.spaces["2.5"]} ${({ theme }) => theme.spaces["3"]};
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

const UsageLine = styled.div`
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 11.5px;
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
    margin: ${({ theme }) => theme.spaces["2"]} 0;
  }

  h1,
  h2,
  h3,
  h4 {
    margin: ${({ theme }) => theme.spaces["4"]} 0 ${({ theme }) => theme.spaces["2"]};
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
    margin: ${({ theme }) => theme.spaces["2"]} 0;
    padding-left: 22px;
  }

  li {
    margin: ${({ theme }) => theme.spaces["0.5"]} 0;
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
    padding: ${({ theme }) => theme.spaces["0"]} ${({ theme }) => theme.spaces["1"]};
    color: ${({ theme }) => theme.colors.accent};
  }

  pre {
    margin: ${({ theme }) => theme.spaces["2.5"]} 0;
    padding: ${({ theme }) => theme.spaces["3.5"]} ${({ theme }) => theme.spaces["4"]};
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
    margin: ${({ theme }) => theme.spaces["2.5"]} 0;
    width: 100%;
    font-size: 13px;
  }

  th,
  td {
    border: 1px solid ${({ theme }) => theme.colors.border};
    padding: ${({ theme }) => theme.spaces["1.5"]} ${({ theme }) => theme.spaces["2.5"]};
    text-align: left;
  }

  th {
    background: ${({ theme }) => theme.colors.surface2};
  }

  blockquote {
    margin: ${({ theme }) => theme.spaces["2.5"]} 0;
    padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["3.5"]};
    border-left: 3px solid ${({ theme }) => theme.colors.accent};
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textMuted};
  }

  a {
    color: ${({ theme }) => theme.colors.accent};
  }
`;
