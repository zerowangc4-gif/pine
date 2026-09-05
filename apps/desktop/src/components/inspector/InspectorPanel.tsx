/**
 * The inspector: a tabbed pane for everything that is not the conversation.
 *
 * Collapsed by default. It is a debugging surface, so it should be there when
 * wanted and out of the way otherwise.
 */

import styled from "styled-components";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { type InspectorTab, selectInspectorTab, uiActions } from "../../store/slices/ui.ts";
import { IconButton } from "../primitives/Button.tsx";
import { Row, ScrollArea, Spacer, Text } from "../primitives/Surface.tsx";
import { EventsTab, PayloadsTab } from "./DiagnosticsTabs.tsx";
import { ResourcesTab } from "./ResourcesTab.tsx";
import { SessionsTab } from "./SessionsTab.tsx";
import { StateTab } from "./StateTab.tsx";

const Frame = styled.aside`
	display: flex;
	flex-direction: column;
	flex: 0 0 auto;
	width: ${({ theme }) => theme.layout.inspectorWidth};
	border-left: 1px solid ${({ theme }) => theme.colors.border};
	background: ${({ theme }) => theme.colors.surface};
	min-height: 0;
`;

const TabBar = styled(Row)`
	flex: 0 0 auto;
	padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
	border-bottom: 1px solid ${({ theme }) => theme.colors.border};
	gap: ${({ theme }) => theme.space[1]};
	overflow-x: auto;
`;

const Tab = styled.button<{ $active: boolean }>`
	padding: ${({ theme }) => `${theme.space[1]} ${theme.space[2]}`};
	border: none;
	border-radius: ${({ theme }) => theme.radius.md};
	background: ${({ theme, $active }) => ($active ? theme.colors.accent : "transparent")};
	color: ${({ theme, $active }) => ($active ? theme.colors.textInverted : theme.colors.textMuted)};
	font-size: ${({ theme }) => theme.fontSize.sm};
	font-weight: ${({ theme }) => theme.fontWeight.medium};
	white-space: nowrap;
	cursor: pointer;

	&:hover {
		background: ${({ theme, $active }) => ($active ? theme.colors.accentHover : theme.colors.hover)};
		color: ${({ theme, $active }) => ($active ? theme.colors.textInverted : theme.colors.text)};
	}
`;

const TABS: InspectorTab[] = ["state", "resources", "sessions", "events", "payloads"];

export function InspectorPanel() {
	const t = useTranslate();
	const dispatch = useAppDispatch();
	const active = useAppSelector(selectInspectorTab);

	const labels: Record<InspectorTab, string> = {
		state: t("inspector.tab.state"),
		resources: t("inspector.tab.resources"),
		sessions: t("inspector.tab.sessions"),
		events: t("inspector.tab.events"),
		payloads: t("inspector.tab.payloads"),
	};

	return (
		<Frame>
			<TabBar>
				{TABS.map((tab) => (
					<Tab
						key={tab}
						type="button"
						$active={tab === active}
						onClick={() => dispatch(uiActions.setInspectorTab(tab))}
					>
						{labels[tab]}
					</Tab>
				))}
				<Spacer />
				<IconButton
					type="button"
					aria-label={t("app.panel.hide")}
					onClick={() => dispatch(uiActions.toggleInspector())}
				>
					×
				</IconButton>
			</TabBar>

			<ScrollArea $padding={4}>
				{active === "state" ? <StateTab /> : null}
				{active === "resources" ? <ResourcesTab /> : null}
				{active === "sessions" ? <SessionsTab /> : null}
				{active === "events" ? <EventsTab /> : null}
				{active === "payloads" ? <PayloadsTab /> : null}
			</ScrollArea>
		</Frame>
	);
}

/** Collapsed rail, so the inspector can be brought back without a menu. */
export function InspectorRail() {
	const t = useTranslate();
	const dispatch = useAppDispatch();

	return (
		<CollapsedRail>
			<IconButton
				type="button"
				aria-label={t("app.panel.show")}
				title={t("inspector.title")}
				onClick={() => dispatch(uiActions.toggleInspector())}
			>
				‹
			</IconButton>
			<Text $size="xs" $tone="faint">
				{t("inspector.title")}
			</Text>
		</CollapsedRail>
	);
}

const CollapsedRail = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: ${({ theme }) => theme.space[2]};
	flex: 0 0 auto;
	width: 32px;
	padding: ${({ theme }) => `${theme.space[3]} 0`};
	border-left: 1px solid ${({ theme }) => theme.colors.border};
	background: ${({ theme }) => theme.colors.surface};

	/* Vertical label: the rail is only 32px wide. */
	& > span {
		writing-mode: vertical-rl;
		letter-spacing: 0.08em;
	}
`;
