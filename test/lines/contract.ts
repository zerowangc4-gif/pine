/**
 * Wire inventory: protocol event maps ↔ socket createSend / createSubscribe keys.
 */

import {
	PROTOCOL_VERSION,
	type ClientToServerEvents,
	type ServerToClientEvents,
} from "@pine/protocol";
import { createSend as createClientSend } from "../../packages/socket-client/src/send.ts";
import { createSubscribe as createServerSubscribe } from "../../packages/socket-server/src/subscribe.ts";
import { expect, section } from "../helpers/harness.ts";

/** socket-client `createSend` method → `ClientToServerEvents` key */
const CLIENT_SEND_TO_EVENT = {
	openSession: "session:open",
	closeSession: "session:close",
	getSessionState: "session:getState",
	prompt: "session:prompt",
	continueRun: "session:continue",
	steer: "session:steer",
	followUp: "session:followUp",
	clearQueue: "session:clearQueue",
	abort: "session:abort",
	requestStop: "session:requestStop",
	reset: "session:reset",
	setMessages: "session:setMessages",
	truncate: "session:truncate",
	compact: "session:compact",
	configure: "session:configure",
	runSkill: "session:runSkill",
	runTemplate: "session:runTemplate",
	reloadResources: "session:reloadResources",
	browseWorkspace: "workspace:browse",
	validateWorkspace: "workspace:validate",
	switchWorkspace: "workspace:switch",
	recentWorkspaces: "workspace:recent",
	approveTool: "tool:approve",
	listSessions: "sessions:list",
	deleteSession: "sessions:delete",
	inspectModel: "model:inspect",
} as const satisfies Record<string, keyof ClientToServerEvents>;

/** socket-server `createSubscribe` method → `ServerToClientEvents` key */
const SERVER_SUBSCRIBE_TO_EVENT = {
	ready: "ready",
	agentEvent: "agent:event",
	sessionState: "session:state",
	sessionRunEnd: "session:runEnd",
	sessionResources: "session:resources",
	sessionCompacted: "session:compacted",
	sessionStopRequested: "session:stopRequested",
	sessionTurnPrepared: "session:turnPrepared",
	sessionClosed: "session:closed",
	sessionWorkspace: "session:workspace",
	toolApprovalRequest: "tool:approvalRequest",
	toolApprovalResolved: "tool:approvalResolved",
	toolResultAdjusted: "tool:resultAdjusted",
	debugPayload: "debug:payload",
	debugResponse: "debug:response",
	log: "log",
} as const satisfies Record<string, keyof ServerToClientEvents>;

function sorted(values: string[]): string {
	return [...values].sort().join(",");
}

export function runContract(): void {
	section("contract · PROTOCOL_VERSION");
	expect(PROTOCOL_VERSION === 4, `PROTOCOL_VERSION is 4 (got ${PROTOCOL_VERSION})`);

	section("contract · ClientToServerEvents ↔ socket-client createSend");
	const clientSend = createClientSend(async () => null as never);
	const sendKeys = Object.keys(clientSend).sort();
	const mappedSendKeys = Object.keys(CLIENT_SEND_TO_EVENT).sort();
	expect(sorted(sendKeys) === sorted(mappedSendKeys), "createSend keys match the inventory map");

	const outboundEvents: (keyof ClientToServerEvents)[] = [
		"session:open",
		"session:close",
		"session:getState",
		"session:prompt",
		"session:continue",
		"session:steer",
		"session:followUp",
		"session:clearQueue",
		"session:abort",
		"session:requestStop",
		"session:reset",
		"session:setMessages",
		"session:truncate",
		"session:compact",
		"session:configure",
		"session:runSkill",
		"session:runTemplate",
		"session:reloadResources",
		"workspace:browse",
		"workspace:validate",
		"workspace:switch",
		"workspace:recent",
		"tool:approve",
		"sessions:list",
		"sessions:delete",
		"model:inspect",
	];

	const mappedEvents = Object.values(CLIENT_SEND_TO_EVENT).sort();
	expect(sorted(mappedEvents) === sorted([...outboundEvents]), "mapped events cover all ClientToServerEvents (26)");
	expect(outboundEvents.length === 26, `26 outbound protocol lines (got ${outboundEvents.length})`);

	for (const [method, event] of Object.entries(CLIENT_SEND_TO_EVENT)) {
		expect(sendKeys.includes(method), `createSend.${method} exists for ${event}`);
	}

	section("contract · ServerToClientEvents ↔ socket-server createSubscribe");
	const serverSubscribe = createServerSubscribe((() => undefined) as never);
	// `raw` is an escape hatch for AgentSession, not a protocol push.
	const subscribeKeys = Object.keys(serverSubscribe).filter((key) => key !== "raw").sort();
	const mappedSubscribeKeys = Object.keys(SERVER_SUBSCRIBE_TO_EVENT).sort();
	expect(sorted(subscribeKeys) === sorted(mappedSubscribeKeys), "createSubscribe keys match the inventory map");
	expect("raw" in serverSubscribe, "createSubscribe also exposes raw emit");

	const inboundEvents: (keyof ServerToClientEvents)[] = [
		"ready",
		"agent:event",
		"session:state",
		"session:runEnd",
		"session:resources",
		"session:compacted",
		"session:stopRequested",
		"session:turnPrepared",
		"session:closed",
		"session:workspace",
		"tool:approvalRequest",
		"tool:approvalResolved",
		"tool:resultAdjusted",
		"debug:payload",
		"debug:response",
		"log",
	];
	const mappedInbound = Object.values(SERVER_SUBSCRIBE_TO_EVENT).sort();
	expect(sorted(mappedInbound) === sorted([...inboundEvents]), "mapped events cover all ServerToClientEvents (16)");
	expect(inboundEvents.length === 16, `16 inbound protocol lines (got ${inboundEvents.length})`);

	for (const [method, event] of Object.entries(SERVER_SUBSCRIBE_TO_EVENT)) {
		expect(subscribeKeys.includes(method), `createSubscribe.${method} exists for ${event}`);
	}
}
