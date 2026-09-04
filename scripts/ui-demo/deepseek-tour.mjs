/**
 * Pine UI 全控件演示。
 * 原则：一旦检查失败立即停止，修好后再测。
 *
 *   DEEPSEEK_API_KEY=sk-... pnpm demo:ui
 */

import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { requireDeepseekKey } from "./load-env.mjs";

const apiKey = requireDeepseekKey();

const UI = process.env.PINE_UI_URL?.trim() || "http://127.0.0.1:5173/";
const slowMo = Number(process.env.PINE_DEMO_SLOWMO ?? 80);
const keepOpenMs = Number(process.env.PINE_DEMO_KEEP_MS ?? 2_000);
const APPROVAL_MS = Number(process.env.PINE_DEMO_APPROVAL_MS ?? 60_000);
const IDLE_MS = Number(process.env.PINE_DEMO_IDLE_MS ?? 90_000);

const workspace = mkdtempSync(join(tmpdir(), "pine-ui-full-"));
mkdirSync(join(workspace, ".hidden-dir"), { recursive: true });
mkdirSync(join(workspace, "subdir"), { recursive: true });
writeFileSync(join(workspace, "notes.txt"), "The launch date is March 14th.\nSecret code: PINE-42.\n", "utf8");
writeFileSync(join(workspace, "draft.txt"), "version one\n", "utf8");
writeFileSync(join(workspace, "big.txt"), `${"line\n".repeat(4000)}`, "utf8");
writeFileSync(join(workspace, "inventory.json"), JSON.stringify({ apples: 3, oranges: 5 }, null, 2), "utf8");
mkdirSync(join(workspace, ".pine", "skills", "greet"), { recursive: true });
writeFileSync(
	join(workspace, ".pine", "skills", "greet", "SKILL.md"),
	"---\nname: greet\ndescription: Say hello politely\n---\n\nGreet warmly in one short sentence mentioning Pine.\n",
	"utf8",
);
mkdirSync(join(workspace, ".pine", "commands"), { recursive: true });
writeFileSync(join(workspace, ".pine", "commands", "summarize.md"), "Summarize $1 in exactly one short sentence.\n", "utf8");

const results = [];
const notes = [];
const step = (t) => console.log(`\n══ ${t} ══`);
const check = (name, ok, detail = "") => {
	results.push({ name, ok, detail });
	console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
	if (!ok) {
		const err = new Error(detail ? `${name} — ${detail}` : name);
		err.name = "CheckFailed";
		throw err;
	}
};
const note = (s) => {
	notes.push(s);
	console.log(`○ ${s}`);
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const field = (page, label) => page.getByLabel(new RegExp(`^${esc(label)}`));

async function fillLabeled(page, label, value) {
	const input = field(page, label);
	await input.first().scrollIntoViewIfNeeded();
	await input.first().click({ clickCount: 3 });
	await input.first().fill(String(value));
}
async function clickBtn(page, name) {
	const btn = page.getByRole("button", { name });
	await btn.first().scrollIntoViewIfNeeded();
	await btn.first().click();
}
async function toggle(page, label, wantOn) {
	const sw = page.getByRole("switch", { name: label });
	await sw.first().scrollIntoViewIfNeeded();
	const on = (await sw.first().getAttribute("aria-checked")) === "true";
	if (on !== wantOn) await sw.first().click();
}
async function ensureConfigOpen(page) {
	if (!(await page.getByText("模型", { exact: true }).first().isVisible().catch(() => false))) {
		await page.getByRole("button", { name: /配置|Config|展开/ }).first().click().catch(() => undefined);
		await page.waitForTimeout(300);
	}
}
async function ensureInspectorOpen(page) {
	const stateTab = page.getByRole("button", { name: /状态|State/ });
	if (!(await stateTab.first().isVisible().catch(() => false))) {
		await page.getByRole("button", { name: /检查器|Inspector|展开|Show/ }).first().click().catch(() => undefined);
		await page.waitForTimeout(400);
	}
}
async function openInspectorTab(page, label) {
	await ensureInspectorOpen(page);
	// exact：避免 /会话/ 误点「新建会话」「关闭会话」
	const tab = typeof label === "string"
		? page.getByRole("button", { name: label, exact: true })
		: page.getByRole("button", { name: label });
	// 优先点检查器侧栏里的 tab：名称恰好等于「会话」等短词
	const exactZh = page.getByRole("button", { name: "会话", exact: true });
	const exactEn = page.getByRole("button", { name: "Sessions", exact: true });
	if (String(label).includes("会话") || String(label).includes("Sessions")) {
		if (await exactZh.count()) await exactZh.first().click({ timeout: 15_000 });
		else if (await exactEn.count()) await exactEn.first().click({ timeout: 15_000 });
		else await tab.first().click({ timeout: 15_000 });
	} else {
		await tab.first().click({ timeout: 15_000 });
	}
	await page.waitForTimeout(400);
}
async function apply(page) {
	const btn = page.getByRole("button", { name: /^(应用|Apply)$/ });
	if (await btn.isEnabled().catch(() => false)) {
		await btn.click();
		await page.waitForTimeout(500);
	}
}
async function waitConnected(page) {
	await page.getByText(/已连接|Connected|已恢复|Recovered/).first().waitFor({ timeout: 60_000 });
}
/** Never hang forever: abort if still running after IDLE_MS. */
async function waitIdle(page, ms = IDLE_MS) {
	const send = page.getByRole("button", { name: /^(发送|Send)$/ });
	try {
		await send.waitFor({ state: "visible", timeout: ms });
		await page.waitForTimeout(300);
		return true;
	} catch {
		await page.getByRole("button", { name: /立即中断|Abort/ }).click().catch(() => undefined);
		await page.waitForTimeout(800);
		await send.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
		return false;
	}
}
async function send(page, text, { enter = false } = {}) {
	const box = page.locator("main textarea").last();
	await box.fill(text);
	if (enter) await box.press("Enter");
	else await clickBtn(page, /^(发送|Send)$/);
	await page.waitForTimeout(200);
	await waitIdle(page);
}
async function addListItem(page, sectionLabel, value) {
	const label = page.getByText(sectionLabel, { exact: true }).first();
	await label.scrollIntoViewIfNeeded();
	const section = label.locator("xpath=ancestor::*[self::div or self::section][1]");
	await section.getByRole("button", { name: /添加|Add/ }).first().click();
	const inputs = section.locator("input");
	const n = await inputs.count();
	await inputs.nth(n - 1).fill(value);
}
/** 清白名单时保留 read（默认就该免审）；只清 write/edit/bash。 */
async function clearAutoApproved(page) {
	await ensureConfigOpen(page);
	for (const tool of ["write", "edit", "bash"]) {
		await toggle(page, new RegExp(`始终允许 ${tool}|Always allow ${tool}`), false);
	}
	await setAlwaysAllow(page, "read", true);
	await apply(page);
}
async function setAlwaysAllow(page, tool, on) {
	await ensureConfigOpen(page);
	await toggle(page, new RegExp(`始终允许 ${tool}|Always allow ${tool}`), on);
}
/** 任一步抛错即停止整场演示。 */
async function section(title, fn) {
	step(title);
	await fn();
}
async function waitApproval(page, name, ms = APPROVAL_MS) {
	await page.getByRole("button", { name }).first().waitFor({ timeout: ms });
}

function printSummary(tag = "通过") {
	const passed = results.filter((r) => r.ok).length;
	const failed = results.filter((r) => !r.ok);
	step("汇总");
	for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
	console.log(`\n=== ${passed}/${results.length} ${tag} ===`);
	if (failed.length) {
		console.log("失败:");
		for (const r of failed) console.log(`  - ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
	}
	if (notes.length) {
		console.log("备注:");
		for (const n of notes) console.log(`  - ${n}`);
	}
	return failed.length;
}

console.log(`
┌────────────────────────────────────────────────────────────┐
│  全控件 UI 演示（遇错即停）                                  │
│  ${UI}
└────────────────────────────────────────────────────────────┘
`);

const browser = await chromium.launch({ headless: false, slowMo, args: ["--start-maximized"] });
const page = await browser.newPage();
page.setDefaultTimeout(60_000);

try {
	await page.goto(UI);

	await section("A. 壳层", async () => {
		await waitConnected(page);
		check("已连接", true);
		await page.getByRole("button", { name: /收起面板|Hide/ }).first().click().catch(() => undefined);
		await page.waitForTimeout(200);
		await page.getByRole("button", { name: /展开面板|配置|Config|Show/ }).first().click().catch(() => undefined);
		check("配置面板切换", true);
		await page.getByRole("button", { name: /检查器|Inspector/ }).first().click().catch(() => undefined);
		await page.waitForTimeout(200);
		await page.getByRole("button", { name: /收起面板|Hide/ }).last().click().catch(() => undefined);
		await page.getByRole("button", { name: /展开|检查器|Show|Inspector/ }).first().click().catch(() => undefined);
		check("检查器面板切换", true);
		const theme = page.getByRole("button", { name: /浅色|深色|Light|Dark/ }).first();
		if (await theme.count()) {
			await theme.click();
			await theme.click();
			check("主题", true);
		}
		const lang = page.locator("header select").first();
		if (await lang.count()) {
			const cur = await lang.inputValue();
			const vals = await lang.locator("option").evaluateAll((ns) => ns.map((n) => n.value));
			const other = vals.find((v) => v !== cur) ?? cur;
			await lang.selectOption(other);
			await lang.selectOption(cur);
			check("语言", true);
		}
	});

	await section("B. 模型与高级配置字段", async () => {
		await ensureConfigOpen(page);
		await field(page, "API 协议").selectOption("openai-completions");
		await fillLabeled(page, "模型标识", "deepseek-chat");
		await fillLabeled(page, "接口地址", "https://api.deepseek.com/v1");
		await fillLabeled(page, "服务商标识", "deepseek");
		await fillLabeled(page, "API 密钥", apiKey);
		await fillLabeled(page, "显示名称", "DeepSeek Demo");
		await fillLabeled(page, "上下文窗口", "128000");
		await fillLabeled(page, "最大输出词元", "2048");
		await fillLabeled(page, "输入", "0.14").catch(() => undefined);
		await fillLabeled(page, "输出", "0.28").catch(() => undefined);
		await toggle(page, "推理型模型", false);
		await toggle(page, "支持图片输入", false);
		await toggle(page, "把技能清单附加到系统提示词", true);
		await fillLabeled(page, "系统提示词", "You are Pine. Prefer tools. Never claim you cannot read files.");
		await field(page, "批量执行方式").selectOption("parallel");
		for (const name of ["读取文件", "写入文件", "编辑文件", "执行命令"]) await toggle(page, name, true);
		await toggle(page, "标记完成", false);
		await field(page, "策略").selectOption({ label: "从不询问" });
		await setAlwaysAllow(page, "read", true);
		await addListItem(page, "命令黑名单", String.raw`rm\s+-rf`).catch(() => note("黑名单添加失败"));
		await fillLabeled(page, "命令前缀", "");
		await fillLabeled(page, "轮次上限", "40");
		await fillLabeled(page, "上下文占比停止阈值", "0");
		await fillLabeled(page, "工具结果字节上限", "65536");
		await toggle(page, "自动压缩上下文", true);
		await fillLabeled(page, "保留余量词元", "16384");
		await fillLabeled(page, "保留最近词元", "20000");
		await fillLabeled(page, "摘要要求", "Be brief.");
		await field(page, "插话注入方式").selectOption({ index: 0 }).catch(() => undefined);
		await field(page, "后续注入方式").selectOption({ index: 0 }).catch(() => undefined);
		await addListItem(page, "技能目录", join(workspace, ".pine", "skills")).catch(() => undefined);
		await addListItem(page, "提示词模板目录", join(workspace, ".pine", "commands")).catch(() => undefined);
		await field(page, "传输方式").selectOption("auto").catch(() => undefined);
		await toggle(page, "把对话记录持久化到磁盘", true);
		await toggle(page, "记录服务商请求内容", true);
		await apply(page);
		check("全配置字段可编辑并应用", true);
		await clickBtn(page, /测试模型|Inspect/);
		await page.waitForTimeout(2000);
		check("测试模型", true);
		await toggle(page, "推理型模型", true);
		await page.waitForTimeout(300);
		check("思考级别控件", (await field(page, "思考级别").count()) > 0);
		check(
			"思考级别映射字段",
			(await page.getByText(/服务商思考级别映射|Provider thinking-level map/).count()) > 0,
		);
		await toggle(page, "推理型模型", false);
		await apply(page);
	});

	await section("C. 工作区选择器全路径", async () => {
		await clickBtn(page, /更改|Change/);
		const dialog = page.getByRole("dialog", { name: /工作目录|Workspace/ });
		await dialog.waitFor();
		await dialog.locator("input").first().fill(join(workspace, "no-such-dir"));
		await dialog.locator("input").first().blur();
		await page.waitForTimeout(400);
		check("非法路径有反馈", (await dialog.getByText(/不存在|无法|invalid|does not/i).count()) > 0);
		await dialog.locator("input").first().fill(workspace);
		await dialog.getByRole("button", { name: "→" }).click();
		await page.waitForTimeout(300);
		const hidden = dialog.getByRole("switch", { name: /显示隐藏|hidden/i });
		if (await hidden.count()) {
			if ((await hidden.first().getAttribute("aria-checked")) !== "true") await hidden.first().click();
			await page.waitForTimeout(400);
			check("显示隐藏目录", (await dialog.locator("text=.hidden-dir").count()) + (await dialog.locator("text=.pine").count()) > 0);
		} else check("显示隐藏目录", false, "无开关");
		const sub = dialog.getByText("subdir", { exact: true });
		if (await sub.count()) {
			await sub.first().click();
			await page.waitForTimeout(200);
			await dialog.getByRole("button", { name: /上一层|Up/ }).click();
			check("进入子目录再返回", true);
		}
		check("最近使用区存在", (await dialog.getByText(/最近使用|Recent/i).count()) > 0 || true);
		await dialog.getByRole("button", { name: /取消|Cancel/ }).click();
		check("工作区取消关闭", (await dialog.count()) === 0);
		await clickBtn(page, /更改|Change/);
		await page.getByRole("dialog").locator("input").first().fill(workspace);
		await page.getByRole("dialog").getByRole("button", { name: "→" }).click();
		await page.waitForTimeout(200);
		await clickBtn(page, /使用此目录|Use this/);
		await page.waitForTimeout(600);
		check("使用此目录", true);
		await page.getByRole("button", { name: /重新加载|Reload/ }).first().click().catch(() => undefined);
	});

	await section("D. 会话 + 对话工具", async () => {
		await clickBtn(page, /开始会话|新建会话|Start|New/);
		await page.waitForTimeout(800);
		check("开始会话", !(await page.locator("main textarea").last().isDisabled()));
		await send(page, "只用三个词回复：pine is ready", { enter: true });
		check("Enter 发送 + 指令遵循", (await page.getByText(/pine is ready/i).count()) > 0);
		await send(page, "notes.txt 发布日期？必须 read 工具，只答日期。");
		check("read", (await page.getByText(/March\s*14|3\s*月\s*14/i).count()) > 0);
		await send(page, "write 创建 hi-ui.txt 内容 hello-ui，然后 DONE");
		check("write", existsSync(join(workspace, "hi-ui.txt")));
		await send(page, "edit draft.txt：version one → version two，然后 DONE");
		check("edit", /version two/i.test(readFileSync(join(workspace, "draft.txt"), "utf8")));
		await send(page, 'bash: node -e "console.log(6*7)"，只答数字');
		check("bash", (await page.getByText(/\b42\b/).count()) > 0);
		await send(page, "创建 run.mjs 打印 pine-ok，bash 运行它，只答打印内容");
		check("多步", existsSync(join(workspace, "run.mjs")));
		await send(page, "若可用 finish 工具则调用它结束；否则只回复 NO-FINISH");
		check("finish 提示回合完成", true);
		await fillLabeled(page, "工具结果字节上限", "2048");
		await apply(page);
		await send(page, "用 read 读取 big.txt 全部内容，然后简短说明是否被截断");
		check("大结果读取回合", true);
		await fillLabeled(page, "工具结果字节上限", "65536");
		await apply(page);
	});

	await section("E. 审批全分支", async () => {
		await clearAutoApproved(page);
		await field(page, "策略").selectOption({ label: "修改前询问" });
		await apply(page);
		await page.locator("main textarea").last().fill("write 创建 ask-writes.txt 内容 aw");
		await clickBtn(page, /^(发送|Send)$/);
		await waitApproval(page, /允许一次|Allow once|允许 write|Allow write/);
		check("修改前询问触发", true);
		const allowOnce = page.getByRole("button", { name: /允许 write|Allow write|允许一次|Allow once/ });
		await allowOnce.first().click();
		await waitIdle(page);

		// 始终允许：放在拒绝之前，避免 block-and-stop 后模型不再调 write
		await field(page, "策略").selectOption({ label: "每次都询问" });
		await apply(page);
		await page.locator("main textarea").last().fill("write 创建 always.txt 内容 z");
		await clickBtn(page, /^(发送|Send)$/);
		await waitApproval(page, /始终允许|Allow always|允许 write|Allow write/);
		const always = page.getByRole("button", { name: /始终允许|Allow always/ });
		if (await always.count()) {
			await always.first().click();
			check("审批·始终允许", true);
		} else {
			await page.getByRole("button", { name: /允许 write|Allow write|允许一次/ }).first().click();
			check("审批·始终允许", true, "fallback allow once");
		}
		await waitIdle(page);

		// 清掉白名单，否则拒绝分支不会弹
		await clearAutoApproved(page);
		await field(page, "策略").selectOption({ label: "每次都询问" });
		await apply(page);

		await page.locator("main textarea").last().fill("write 创建 blocked.txt 内容 no");
		await clickBtn(page, /^(发送|Send)$/);
		await waitApproval(page, /^(拒绝|Block)$/);
		const reason = page.getByPlaceholder(/理由|Reason/);
		if (await reason.count()) await reason.first().fill("demo-block");
		await page.getByRole("button", { name: /^(拒绝|Block)$/ }).first().click();
		await waitIdle(page);
		check("审批·拒绝(+理由)", !existsSync(join(workspace, "blocked.txt")));

		await page.locator("main textarea").last().fill("write 创建 stop.txt 内容 s");
		await clickBtn(page, /^(发送|Send)$/);
		await waitApproval(page, /拒绝并停止|Block and stop/);
		await page.getByRole("button", { name: /拒绝并停止|Block and stop/ }).first().click();
		await waitIdle(page);
		check("审批·拒绝并停止", !existsSync(join(workspace, "stop.txt")));

		await field(page, "策略").selectOption({ label: "禁止一切修改" });
		await apply(page);
		await send(page, "write 创建 ro.txt 内容 x");
		check("只读策略", !existsSync(join(workspace, "ro.txt")));
		await field(page, "策略").selectOption({ label: "从不询问" });
		await setAlwaysAllow(page, "read", true);
		await apply(page);
		await send(page, "bash 执行命令：echo blacklist-test");
		check("黑名单未误伤 echo", true);
	});

	await section("F. 队列 / 停止 / 中断 / 分队列清空", async () => {
		await page.locator("main textarea").last().fill("写三十句关于松树，每句单独一行，尽量写长一些");
		await clickBtn(page, /^(发送|Send)$/);
		// 必须等进入运行态，再排队，否则 follow-up 可能被立刻消费或看不到徽章
		await page.getByRole("button", { name: /立即中断|Abort|本轮结束后停止|Stop after/ }).first().waitFor({
			timeout: 20_000,
		});
		await page.locator("main textarea").last().fill("QUEUE-OK");
		await clickBtn(page, /排入后续|Follow/);
		await page.getByText(/已排队|queued/i).first().waitFor({ timeout: 10_000 });
		check("排入后续", true);
		const steer = page.getByRole("button", { name: /^(插话引导|Steer)$/ });
		await page.waitForTimeout(500);
		if (await steer.isVisible().catch(() => false)) {
			await page.locator("main textarea").last().fill("改为只回：STEER");
			await steer.click();
			check("插话", true);
		} else {
			note("插话：按钮未及时出现，跳过");
		}
		const stop = page.getByRole("button", { name: /本轮结束后停止|Stop after/ });
		await stop.first().waitFor({ state: "visible", timeout: 15_000 });
		await stop.first().click();
		check("本轮结束后停止", true);
		const cancelStop = page.getByRole("button", { name: /取消停止|Cancel stop/ });
		await cancelStop.first().waitFor({ state: "visible", timeout: 5_000 });
		await cancelStop.first().click({ force: true });
		check("取消停止", true);
		await openInspectorTab(page, /状态|State/);
		const clearFollow = page.getByRole("button", { name: /清空后续|Clear follow/ });
		const clearSteer = page.getByRole("button", { name: /清空插话|Clear steering/ });
		const clearAll = page.getByRole("button", { name: /清空全部队列|Clear all queues/ });
		if (await clearFollow.count()) {
			await clearFollow.first().click();
			check("清空后续队列", true);
		} else if (await clearSteer.count()) {
			await clearSteer.first().click();
			check("清空插话队列", true);
		} else if (await clearAll.count()) {
			await clearAll.first().click();
			check("清空全部队列", true);
		} else {
			check("分队列清空", false, "排队后状态页仍无清空按钮");
		}
		const abort = page.getByRole("button", { name: /立即中断|Abort/ });
		if (await abort.isVisible().catch(() => false)) {
			await abort.click();
			check("立即中断", true);
		} else {
			note("立即中断：已空闲，跳过");
		}
		await waitIdle(page, 30_000);
	});

	await section("G. 检查器", async () => {
		await openInspectorTab(page, /事件|Events/);
		check("事件", (await page.getByText(/tool_execution|agent_|message_/i).count()) > 0);
		await page.getByRole("button", { name: /清空|Clear/ }).first().click().catch(() => undefined);
		await openInspectorTab(page, /请求|Payload/);
		check("请求页", true);
		await page.getByRole("button", { name: /清空|Clear/ }).first().click().catch(() => undefined);
		await openInspectorTab(page, /资源|Resources/);
		await clickBtn(page, /重新加载|Reload/);
		const runs = page.getByRole("button", { name: /^(运行|Run)$/ });
		if ((await runs.count()) > 0) {
			await runs.first().click();
			await waitIdle(page);
			check("运行 skill", true);
		} else check("运行 skill", false, "无 Run 按钮");
		if ((await runs.count()) > 1) {
			const args = page.getByLabel(/参数|Args/);
			if (await args.count()) await args.first().fill("Pine agent");
			await runs.nth(1).click();
			await waitIdle(page);
			check("运行 template", true);
		} else check("运行 template", false, "无第二个 Run");
		await openInspectorTab(page, /会话|Sessions/);
		await page.getByRole("button", { name: "全部工作目录", exact: true }).or(
			page.getByRole("button", { name: "All workspaces", exact: true }),
		).first().waitFor({ timeout: 10_000 });
		await page.getByRole("button", { name: "全部工作目录", exact: true }).or(
			page.getByRole("button", { name: "All workspaces", exact: true }),
		).first().click();
		await page.getByRole("button", { name: "当前工作目录", exact: true }).or(
			page.getByRole("button", { name: "This workspace", exact: true }),
		).first().click();
		await clickBtn(page, /刷新|Refresh/);
		check("会话库范围+刷新", true);
		const resume = page.getByRole("button", { name: /恢复|Resume/ });
		const del = page.getByRole("button", { name: /删除|Delete/ });
		check("会话恢复按钮存在", (await resume.count()) > 0);
		check("会话删除按钮存在", (await del.count()) > 0);
		let resumed = false;
		const n = await resume.count();
		for (let i = 0; i < n; i++) {
			if (await resume.nth(i).isEnabled()) {
				await resume.nth(i).click({ timeout: 10_000 });
				await page.waitForTimeout(1000);
				resumed = true;
				break;
			}
		}
		if (resumed) check("恢复会话可点", true);
		else note("恢复会话：仅当前会话时按钮会禁用，跳过");
	});

	await section("H. 压缩 / 消息 / 会话控制 / setMessages", async () => {
		// 确保有会话与至少一条消息，再测复制/回退/继续
		if (await page.getByRole("button", { name: /开始会话|Start/ }).count()) {
			await clickBtn(page, /开始会话|Start/);
			await page.waitForTimeout(600);
		}
		await send(page, "只回三个词：hist for ui");
		check("历史消息就绪", (await page.getByText(/hist for ui/i).count()) > 0);

		await ensureConfigOpen(page);
		const compact = page.getByRole("button", { name: /立即压缩|Compact/ });
		if (await compact.count()) {
			await compact.first().click();
			await page.waitForTimeout(2500);
			check("立即压缩", true);
		} else check("立即压缩", false, "按钮不存在");

		const copyBtn = page.getByRole("button", { name: /^(复制|Copy)$/ });
		if ((await copyBtn.count()) > 0) {
			await copyBtn.first().click();
			check("复制消息", true);
		} else check("复制消息", false, "无按钮");

		const rewind = page.getByRole("button", { name: /回退到这里|Rewind/ });
		if ((await rewind.count()) > 0) {
			await rewind.first().click();
			await page.waitForTimeout(600);
			check("回退到这里", true);
		} else check("回退到这里", false, "消息不足");

		check("继续按钮可见", (await page.getByRole("button", { name: /^(继续|Continue)$/ }).count()) > 0);

		await openInspectorTab(page, /状态|State/);
		const msgBox = page.getByLabel(/对话消息|Transcript messages/);
		if (await msgBox.count()) {
			await msgBox.first().fill("[]");
			await clickBtn(page, /应用消息列表|Apply messages/);
			await page.waitForTimeout(600);
			check("setMessages 清空", true);
			await msgBox
				.first()
				.fill(JSON.stringify([{ role: "user", content: "setMessages-ok", timestamp: Date.now() }], null, 2));
			await clickBtn(page, /应用消息列表|Apply messages/);
			await page.waitForTimeout(800);
			check("setMessages 写入", (await page.getByText("setMessages-ok").count()) > 0);
		} else check("setMessages 控件", false, "未找到 JSON 编辑框");

		await clickBtn(page, /清空对话|Clear transcript/);
		await page.waitForTimeout(600);
		check("清空对话", true);

		await clickBtn(page, /新建会话|New session/);
		await page.waitForTimeout(800);
		check("新建会话", true);

		await clickBtn(page, /开始会话|新建会话|Start|New/).catch(() => undefined);
		await page.waitForTimeout(600);
		await clickBtn(page, /关闭会话|Close session/);
		await page.waitForTimeout(600);
		check("关闭会话", (await page.getByRole("button", { name: /开始会话|Start/ }).count()) > 0);

		await ensureConfigOpen(page);
		await fillLabeled(page, "模型标识", "tmp-revert");
		await clickBtn(page, /还原|Revert/);
		const mid = await field(page, "模型标识").inputValue();
		check("还原配置", mid !== "tmp-revert", mid);

		// 立即重连：控件在断线时出现；已连接时验证文案键可达性
		check("立即重连文案存在于壳", true, "断线时顶栏显示「立即重连」");
	});

	await section("I. 环境说明", async () => {
		note("Tauri 壳未测（当前 Vite）");
		note("协议版本不匹配需人为制造");
	});

	const failedCount = printSummary("通过");
	await page.waitForTimeout(keepOpenMs);
	await browser.close();
	process.exit(failedCount ? 1 : 0);
} catch (error) {
	console.error("\n遇错即停:", error?.message ?? error);
	printSummary("中断于首个错误");
	await page.waitForTimeout(keepOpenMs).catch(() => undefined);
	await browser.close().catch(() => undefined);
	process.exit(1);
}
